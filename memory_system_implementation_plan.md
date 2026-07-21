# Memory & Conversation Continuation — Implementation Plan

## 0. Context & Goal

Current state: each personality has one-time/session-only memory. No persistence across sessions, no cross-conversation recall.

Target state:
1. Full conversation history persisted (Postgres) → user can reopen any old conversation and it replays correctly.
2. Long-term "memory" of facts/preferences per user, isolated per user (and optionally per personality), retrieved via vector similarity and injected into context — this is what makes the model "feel" like it remembers someone after months.
3. Token-efficient context construction so cost stays low on OpenRouter, especially on free-tier models with small context windows.
4. A safe, separate aggregate-analytics path over the same vector store, for product insight (what topics users struggle with most) without exposing individual identities.

Two systems, kept architecturally separate:
- **Transcript store (Postgres)** — ground truth, exact replay, already exists.
- **Fact store (Vector DB)** — derived, lossy, periodically regenerated, used for long-term recall + analytics.

---

## 1. Transcript Store (Postgres) — conversation continuation

You already have Postgres running, so this is mostly schema + retrieval logic.

### 1.1 Schema

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    personality_id TEXT NOT NULL,
    title TEXT,                      -- auto-generated summary title for UI list
    created_at TIMESTAMPTZ DEFAULT now(),
    last_active_at TIMESTAMPTZ DEFAULT now(),
    last_summarized_at TIMESTAMPTZ,  -- tracks rolling-summary checkpoint, see §3
    rolling_summary TEXT             -- compressed older context, see §3
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    token_count INT,                 -- store at write time, avoids re-tokenizing later
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_user ON conversations(user_id, last_active_at DESC);
```

### 1.2 Flow per incoming message

1. Load `conversation` row (or create one if new).
2. Pull messages for that `conversation_id`, ordered by `created_at`.
3. Build the request to OpenRouter (see §4 for exact assembly logic — this is where summary + window + retrieved facts get combined).
4. Send request → get reply.
5. Insert both the new user message and the assistant reply into `messages`.
6. Update `last_active_at`.
7. Async/background: check if rolling summarization or fact-extraction thresholds are hit (see §3, §2.3).

### 1.3 Reopening an old conversation

No special logic needed beyond normal load — since everything is in Postgres, opening a 3-month-old `conversation_id` just replays its `rolling_summary` + recent messages exactly like a live one. This is the part that was already "free" once persistence exists.

---

## 2. Fact Store (Vector DB) — cross-conversation memory

Use **ChromaDB** (you already know it well from VectorImg.ai / Vector Space Explorer — directly reusable skillset).

### 2.1 Single collection, metadata-partitioned

Do **not** create a DB-per-user. One collection, filtered at query time:

```python
collection.add(
    documents=[fact_text],          # de-identified, see §2.4
    embeddings=[embedding],
    metadatas=[{
        "user_id": user_id,
        "personality_id": personality_id,   # decide: shared or per-personality memory (see §2.2)
        "conversation_id": conversation_id,
        "created_at": timestamp.isoformat(),
        "topic_tags": ["exam_stress"]        # optional, helps analytics later
    }],
    ids=[fact_id]
)
```

Retrieval — **always filtered, no exceptions**:

```python
def get_relevant_facts(user_id: str, query_text: str, personality_id: str | None, k: int = 5):
    where = {"user_id": user_id}
    if personality_id:
        where["personality_id"] = personality_id
    return collection.query(
        query_embeddings=[embed(query_text)],
        n_results=k,
        where=where
    )
```

**Hard rule:** this `get_relevant_facts` function is the *only* code path allowed to read from the fact store for live chat use. No other function should call `collection.query` directly. This makes the isolation boundary auditable in one place instead of scattered across the codebase.

### 2.2 Decide: shared memory across personalities, or per-personality?

Two options — pick one deliberately, don't default by accident:
- **Shared**: career-coach persona can see facts learned by the breakup-support persona. More continuity, less privacy compartmentalization.
- **Isolated per personality**: each persona only knows what was shared with it. Better privacy boundary, more natural for a support app where users may want separation (e.g., venting to "venting buddy" persona shouldn't surface in "study coach" persona).

Recommendation for a support-companion product: **isolate by default**, with the option for the user to explicitly opt a personality into "shared context" if they want continuity across personas. This avoids a personality surfacing something sensitive a user told a different persona, which could feel invasive.

### 2.3 Fact extraction pipeline (background job)

Triggered at end of conversation, or every N turns within a long-running one:

1. Take the last batch of raw messages (since last extraction).
2. Send to a **cheap/small model** (not your main personality model) with a prompt like:
   > "Extract durable facts, preferences, or recurring concerns from this exchange. Output as short, de-identified statements. Omit anything that's just small talk. One fact per line."
3. Embed each extracted fact, store via the function in §2.1.
4. Mark extraction checkpoint (e.g., `last_extracted_message_id` on the conversation row) so you don't reprocess the same messages twice.

This keeps the fact-store small and high-signal instead of dumping every raw message in as a vector (which would be expensive and noisy).

### 2.4 De-identification at extraction time

Since this is a mental-health-adjacent product, bake this in from day one rather than retrofitting:
- Prompt the extraction model to phrase facts as themes, not verbatim quotes or identifying details: e.g. store `"user experiencing academic stress around exams"` not `"I literally want to give up on VIT, my mom keeps comparing me to my cousin"`.
- Never store names, locations, or other direct identifiers inside `documents` text — `user_id` in metadata is enough to keep it linkable to the right account without the text itself being identifying.

---

## 3. Rolling Summarization (controls transcript-side token growth)

Independent of the fact store — this is about keeping the *live* context window small as a single conversation grows long.

Threshold-based, not reactive:
- Every ~15–20 turns, fire a background job:
  1. Take all messages older than the current "keep verbatim" window.
  2. Send to the cheap model: "Summarize this conversation so far in under 200 words, preserving emotional context and any concrete facts/decisions."
  3. Replace `conversations.rolling_summary` with the new summary (merge with prior summary if one exists).
  4. Mark those older messages as "summarized" (keep them in Postgres for audit/export, but stop sending them raw to the model).

Context sent to the model per turn becomes:
```
[rolling_summary]  +  [last ~10-15 raw messages]  +  [new user message]
```

This bounds your token usage regardless of how long a single conversation runs.

---

## 4. Per-Turn Context Assembly (the actual function that hits OpenRouter)

```python
def build_messages_for_request(user_id, conversation_id, personality_id, new_user_msg):
    convo = get_conversation(conversation_id)
    recent_msgs = get_recent_messages(conversation_id, limit=12)
    relevant_facts = get_relevant_facts(user_id, new_user_msg, personality_id, k=5)

    system_prompt = build_system_prompt(
        personality_base_prompt=PERSONALITY_PROMPTS[personality_id],
        long_term_facts=relevant_facts,
        rolling_summary=convo.rolling_summary
    )

    messages = [{"role": "system", "content": system_prompt}]
    messages += [{"role": m.role, "content": m.content} for m in recent_msgs]
    messages.append({"role": "user", "content": new_user_msg})
    return messages
```

Keep `PERSONALITY_PROMPTS` lean (a few hundred tokens each, not pages) — it gets sent every single turn, so bloat here is pure recurring cost.

---

## 5. Token Budgeting / Cost Control on OpenRouter Free Tier

- Count tokens **before** sending (tiktoken as an approximation is fine even for non-OpenAI models) so you can trim proactively instead of hitting a context-length error.
- Use a separate, cheaper/smaller model for: fact extraction (§2.3), rolling summarization (§3), and conversation title generation. Reserve your main "personality" model calls strictly for user-facing turns.
- Set a hard cap on `recent_msgs` window size + `k` for fact retrieval — don't let either grow unbounded.
- Log `token_count` per message at write time (already in schema, §1.1) so you can monitor average cost per conversation over time without recomputing.

---

## 6. Aggregate Analytics Path (separate from live retrieval)

A second, clearly separated function — **never shares a code path with `get_relevant_facts`**:

```python
def run_topic_analysis():
    all_facts = collection.get(include=["embeddings", "metadatas"])  # no user_id filter
    embeddings = all_facts["embeddings"]
    clusters = hdbscan.fit_predict(umap.fit_transform(embeddings))
    # inspect cluster sizes/centroids -> recurring themes across all users
```

- This reuses your existing UMAP/HDBSCAN pipeline from Vector Space Explorer directly.
- Run on a schedule (e.g. weekly), not live, and ideally by a separate process/service account with read-only access to the collection.
- Output should be cluster-level (counts, representative de-identified fact examples, growth over time) — never a report that resolves back to a specific `user_id`.
- Optional: tag clusters with topic labels to track trend changes over time (e.g., "academic stress" cluster growing 20% month over month → signal to refine that personality's prompt).

**Access boundary, explicit:** live chat retrieval = always `user_id`-filtered, called only from `get_relevant_facts`. Analytics = never `user_id`-filtered, called only from `run_topic_analysis`, ideally on different credentials. Don't let one function do both jobs.

---

## 7. Build Order (phased)

| Phase | Deliverable |
|---|---|
| 1 | Postgres schema (§1.1) + save/load every message. Fixes "reopen old conversation" immediately. |
| 2 | Context assembly function (§4) using only Postgres data (no vector memory yet) — verify continuation works end-to-end. |
| 3 | Rolling summarization job (§3) — needed once conversations get long, prevents token blowup. |
| 4 | ChromaDB fact store + extraction pipeline (§2.1–2.3) — adds true cross-conversation memory. |
| 5 | De-identification pass on extraction prompts (§2.4) — do before any real user data flows in, not after. |
| 6 | Token budgeting / cheap-model routing (§5) — cost cleanup pass. |
| 7 | Analytics pipeline (§6) — once you have enough volume in the fact store to cluster meaningfully. |

---

## 8. Open Decisions for You

- Shared vs. per-personality long-term memory (§2.2) — affects schema (`personality_id` filter on/off) and UX (should probably be user-visible/configurable).
- Retention policy: do you ever delete facts/messages? (Useful to decide before storing anything sensitive — also affects whatever privacy disclosure you give users.)
- Which model to use for extraction/summarization — pick something cheap and fast; doesn't need to be your conversational model.
