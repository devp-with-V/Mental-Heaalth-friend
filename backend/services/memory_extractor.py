"""
Memory Extractor Service.

After each conversation exchange, this service calls a lightweight AI model
to extract any meaningful new facts about the user from the conversation.
These facts are stored in the user_memory table and injected into future
sessions so the bot remembers the user across conversations.

Design decisions:
- Uses a cheap/fast model (e.g. Mistral-7B free or GPT-4o-mini) for extraction
  rather than the main chat model to keep costs low.
- Deduplicates before saving: if a very similar fact already exists, skip it.
- Limits memory per user to 50 facts (oldest removed when exceeded).
- Extraction runs as a fire-and-forget background task — never blocks the user.
"""
import json
import re
from typing import List
from sqlalchemy.orm import Session
from models.db_models import UserMemory
from services.openrouter import chat_completion
from datetime import datetime


# ─── Extraction prompt ────────────────────────────────────────────────────────

EXTRACTION_SYSTEM_PROMPT = """You are a memory extraction assistant. Your job is to read a short
conversation snippet and extract any NEW factual information about the USER (not the AI assistant)
that would be useful to remember in future conversations.

Rules:
- Extract facts about the USER only (their life, feelings, situation, preferences, relationships).
- Only extract things that are likely to be relevant long-term (not just today's mood).
- Each fact must be a short, standalone sentence starting with "User".
- Return a JSON array of strings. Return an empty array [] if nothing is worth remembering.
- Maximum 3 facts per exchange.
- Do NOT extract: generic emotions (too vague), things the bot said, crisis keywords.

Examples of GOOD facts:
["User has anxiety and trouble sleeping", "User works night shifts", "User has a sister named Priya"]

Examples of BAD facts (too vague or temporary):
["User is feeling sad today", "User said hello", "User wants to talk"]

Return ONLY a valid JSON array. No other text."""


EXTRACTION_USER_TEMPLATE = """Extract memorable facts from this conversation snippet:

User: {user_message}
Assistant: {bot_response}

Return a JSON array of facts about the user."""


MAX_MEMORIES_PER_USER = 50
SIMILARITY_THRESHOLD = 0.6  # Simple word overlap threshold for deduplication


# ─── Main extraction function ─────────────────────────────────────────────────

async def extract_and_store_memories(
    user_id: int,
    user_message: str,
    bot_response: str,
    db: Session,
) -> List[str]:
    """
    Extract facts from a conversation exchange and store novel ones in the DB.

    Returns the list of newly stored fact strings (useful for testing).
    """
    # Skip very short or trivial messages
    if len(user_message.strip()) < 20:
        return []

    raw_facts = await _call_extraction_model(user_message, bot_response)
    if not raw_facts:
        return []

    # Fetch existing memories for deduplication
    existing_memories = (
        db.query(UserMemory)
        .filter(UserMemory.user_id == user_id)
        .all()
    )
    existing_texts = [m.fact_text.lower() for m in existing_memories]

    stored = []
    for fact in raw_facts:
        fact = fact.strip()
        if not fact or len(fact) < 10:
            continue
        if not fact.lower().startswith("user"):
            # Enforce the format — prefix if missing
            fact = f"User {fact[0].lower()}{fact[1:]}"

        # Deduplicate: skip if very similar fact already exists
        if _is_duplicate(fact, existing_texts):
            continue

        # Prune oldest memories if limit exceeded
        if len(existing_memories) >= MAX_MEMORIES_PER_USER:
            oldest = min(existing_memories, key=lambda m: m.created_at or datetime.min)
            db.delete(oldest)
            existing_memories.remove(oldest)

        # Save new memory
        new_memory = UserMemory(user_id=user_id, fact_text=fact)
        db.add(new_memory)
        existing_texts.append(fact.lower())
        existing_memories.append(new_memory)
        stored.append(fact)

    if stored:
        db.commit()

    return stored


# ─── Private helpers ──────────────────────────────────────────────────────────

async def _call_extraction_model(user_message: str, bot_response: str) -> List[str]:
    """Call the AI model for memory extraction. Returns list of fact strings."""
    messages = [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": EXTRACTION_USER_TEMPLATE.format(
                user_message=user_message[:500],   # Truncate to save tokens
                bot_response=bot_response[:300],
            ),
        },
    ]
    try:
        response = await chat_completion(messages)
        return _parse_facts(response)
    except Exception:
        return []


def _parse_facts(response: str) -> List[str]:
    """
    Parse a JSON array from the model's response.
    Handles cases where the model includes extra text around the JSON.
    """
    # Try to find a JSON array in the response
    match = re.search(r'\[.*?\]', response, re.DOTALL)
    if not match:
        return []
    try:
        facts = json.loads(match.group())
        if isinstance(facts, list):
            return [f for f in facts if isinstance(f, str)]
    except (json.JSONDecodeError, ValueError):
        pass
    return []


def _is_duplicate(new_fact: str, existing_texts: List[str]) -> bool:
    """
    Simple word-overlap deduplication.
    Returns True if the new fact is too similar to any existing fact.
    """
    new_words = set(new_fact.lower().split())
    if len(new_words) < 3:
        return False

    for existing in existing_texts:
        existing_words = set(existing.split())
        if not existing_words:
            continue
        overlap = len(new_words & existing_words) / max(len(new_words), len(existing_words))
        if overlap >= SIMILARITY_THRESHOLD:
            return True
    return False
