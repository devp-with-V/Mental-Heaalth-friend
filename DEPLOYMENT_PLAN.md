# MindMate — Path to a Deployable Preview (+ Payments)

_Assessment & phased implementation plan. Written 2026-07-22._

## What this app is

A mental-health companion chatbot:

- **Backend** — FastAPI, SQLAlchemy + Alembic, JWT auth, per-user rate limiting (Redis, fails open),
  4 seeded personas (Riya / Arjun / Alex / The Guide), SSE token streaming via OpenRouter,
  crisis-keyword detection with India-specific helplines, long-term memory extraction into `user_memory`,
  mood logging.
- **Frontend** — Next.js 15 (App Router) + Tailwind. Three-panel chat UI, streaming via `fetch()`
  (Authorization header, not EventSource), mood modal, profile page. Talks to backend through a
  Next.js rewrite (`/api/* → BACKEND_URL`).
- **Infra** — `docker-compose` with Postgres + Redis + both services.

> Note: the README describes a "React + Vite" frontend, but the actual frontend is **Next.js**.
> Leftover `dist/` and `.vite/` folders are stale Vite artifacts. README is out of date.

---

## Severity-ranked gap list

### P0 — Blocks a safe public deploy (do first)

1. **Secrets committed to git.** `backend/.env` is tracked and contains the real
   `OPENROUTER_API_KEY`, `SECRET_KEY`, and DB password. There is **no `.gitignore`**.
   - Rotate the OpenRouter key and generate a fresh `SECRET_KEY`
     (`python -c "import secrets; print(secrets.token_hex(32))"`).
   - `git rm --cached backend/.env` and add a proper `.gitignore`.
   - If this repo was ever pushed to a public remote, purge history (`git filter-repo`) — otherwise
     the old key stays exposed forever in history.
2. **Repo hygiene / no `.gitignore`.** `__pycache__/`, `.next/`, `dist/`, `.vite/`,
   `*.db` (`mindmate.db`, `test_mindmate.db`) are all tracked. Add `.gitignore`, untrack them.
   SQLite files are pointless here — the app targets Postgres.
3. **`OPENROUTER_MODEL=openrouter/free`** in `.env` is not a valid model id. The `.env.example`
   default (`mistralai/mistral-7b-instruct:free`) is correct. A bad model id = every chat 400s.
   Verify the current free model slug on OpenRouter before deploy (free model names change).

### P1 — Needed for the preview to actually work end-to-end

4. **Conversation history not wired in the UI** (this is the "history saving feature not added yet"
   from your last commit). The backend persists messages and exposes
   `GET /chat/conversations` + `GET /chat/history/{id}`, and `lib/api.ts` has the client methods,
   but `app/chat/page.tsx` never calls them — the middle "threads" panel and reopening old
   conversations don't exist yet. Ground truth is saved; the frontend just doesn't read it back.
5. **CORS for production.** `CORS_ORIGINS` is localhost-only. The deployed frontend origin must be
   added. Also the `/chat/stream` response hardcodes `Access-Control-Allow-Origin: *` while the
   app runs with `allow_credentials=True` — inconsistent; since the frontend proxies through a
   Next.js rewrite (same-origin) this mostly doesn't bite, but clean it up.
6. **Backend Dockerfile runs `uvicorn --reload`** — a dev flag. Remove it for the deployed image
   and add `--workers` / a proper start command.

### P2 — Correctness bugs (cheap fixes, worth doing)

7. **`/chat/send` background task will crash.** It calls
   `_extract_memories_async(user_id, content, response, db)` with 4 args, but the function takes 3
   (and opens its own session). Silent because it's fire-and-forget. The `/stream` path calls it
   correctly. Fix the signature or the call. (Frontend only uses `/stream`, so low user impact.)
8. **Refresh endpoint drops the `tier` claim.** `POST /auth/refresh` mints a new access token from
   `{"sub": ...}` only; `create_access_token` re-adds `tier="free"` by default, so a premium user
   silently downgrades to free after a token refresh. Matters once payments exist (see Phase 5).
9. **`Conversation.updated_at` has no `server_default`** — it's null until first update, and the
   conversation list orders by `updated_at desc nullslast`, so brand-new conversations sort last.
   Add a default or order by `created_at`.
10. **`oauth2_scheme` tokenUrl is `/auth/login`** but the real route is `/api/auth/login`. Only
    affects the Swagger "Authorize" button, not the app.

### P3 — Nice-to-have before charging money

11. Password strength / email validation is minimal. Add basic rules.
12. No structured logging or error tracking (Sentry free tier is easy).
13. `README` is stale (Vite vs Next). Rewrite once the stack settles.
14. No tests for chat streaming or personas UI; existing pytest suite covers auth/mood/crisis/etc.

---

## Recommended free hosting stack

| Piece | Host (free tier) | Notes |
|---|---|---|
| Frontend (Next.js) | **Vercel** | Native Next.js, zero-config, generous free tier. |
| Backend (FastAPI) | **Render** (or Railway) | Free web service; sleeps on idle (~50s cold start). |
| Postgres | **Render Postgres** / **Neon** | Neon has a durable free tier; Render free DB expires after 90 days. |
| Redis | **Upstash** (free) or **skip** | Rate limiter fails open, so Redis is optional for preview. |
| LLM | **OpenRouter free models** | Already integrated. |

Simplest path: **Vercel (frontend) + Render (backend + Postgres), Redis omitted for preview.**
Set the frontend's `BACKEND_URL` env var to the Render backend URL so the `/api` rewrite proxies to it.

---

## Phased implementation plan

### Phase 0 — Secure & clean the repo (P0) — ~30 min
- Add root `.gitignore` (`.env`, `__pycache__/`, `*.db`, `.next/`, `dist/`, `.vite/`, `node_modules/`, `venv/`).
- `git rm --cached` the tracked secrets/artifacts.
- Rotate OpenRouter key + regenerate `SECRET_KEY`.
- Fix `OPENROUTER_MODEL` to a valid free slug and confirm a chat works locally.
- **Gate:** fresh clone + `.env` from example runs locally; no secrets in `git ls-files`.

### Phase 1 — Finish conversation history in the UI (P1) — ~half day
- On chat mount, `companionsApi` + `chatApi.listConversations(activeSlug)` → render thread list in the middle panel.
- Clicking a thread → `chatApi.getHistory(id)` → hydrate messages, set `activeConvId`.
- "New Conversation" resets `activeConvId` to null.
- Fix `updated_at` default (bug #9) so ordering is correct.
- **Gate:** send messages, reload page, reopen an old thread, see it replay.

### Phase 2 — Fix correctness bugs (P2) — ~1 hr
- Bug #7 (`_extract_memories_async` arg mismatch), #8 (tier on refresh), #5 (CORS), #6 (Dockerfile `--reload`).
- **Gate:** `pytest` green; refresh keeps tier; memory extraction runs without error.

### Phase 3 — Deploy the preview (P1) — ~half day
- Push clean repo to GitHub.
- Render: create Postgres + backend web service; set env vars; run `alembic upgrade head` (release command); seed runs on startup.
- Vercel: import repo, set `BACKEND_URL`, deploy.
- Add the Vercel domain to `CORS_ORIGINS`.
- **Gate:** register → login → chat with all 4 personas → history persists, from the public URL.

### Phase 4 — Pre-launch polish (P3) — ~1 day
- Sentry (free), stronger validation, rewrite README, basic rate-limit tuning, privacy/crisis disclaimer text in UI (important for a mental-health product).

### Phase 5 — Payments (Razorpay) — ~1–2 days
Razorpay is the right pick for an India-first product (UPI, cards, netbanking; free to integrate, ~2% per txn).
- **Model:** `subscription_tier` already exists on `User`. Decide free-vs-premium boundary
  (e.g. free = N messages/day or 1 persona; premium = unlimited + all personas). Persona model
  already has an `is_premium` flag — wire the gate to it.
- **Backend:** `/payments/create-order` (Razorpay order), `/payments/verify` (HMAC signature check —
  never trust the client), `/payments/webhook` (source of truth: on `payment.captured` set
  `subscription_tier="premium"` + expiry). Store `razorpay_order_id`/`payment_id`.
- **Frontend:** Razorpay Checkout.js on an upgrade page; on success call verify; refresh token so the
  new tier lands in the JWT (depends on bug #8 being fixed).
- **Enforcement:** middleware/route guard checks tier before premium chat/personas.
- Test mode first (Razorpay test keys), then live after KYC.
- **Gate:** test-mode payment flips a user to premium via webhook and unlocks gated features.

---

## Suggested order to execute
Phase 0 → 1 → 2 → 3 (you have a live preview here) → 4 → 5.
Phases 0–3 get you a working public preview. Payments (5) layer on cleanly afterward because the
tier scaffolding is already in the data model.
