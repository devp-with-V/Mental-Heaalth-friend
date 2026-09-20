"""
MindMate — FastAPI application entry point.

Production notes:
- Database tables are managed by Alembic migrations (NOT create_all).
  Run `alembic upgrade head` before starting the server.
- Rate limiting is applied per-user via Redis middleware.
- SSE streaming uses Authorization header (not URL query param).
- Personas are seeded on startup (idempotent — safe to run every boot).

Phase 1 changes:
- /companions router added for companion browsing
- Persona seed runs on startup
- PATCH /auth/me for profile updates
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from routers import auth, chat, mood, companions
from middleware.rate_limit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup / shutdown lifecycle manager.
    Seeds personas on every startup (idempotent).
    """
    # ── Startup ──────────────────────────────────────────────────────────────
    try:
        from core.database import SessionLocal
        from services.personas import seed_personas
        db = SessionLocal()
        seed_personas(db)
        db.close()
        print("[SUCCESS] Personas seeded successfully")
    except Exception as e:
        # Don't crash the server if seeding fails — log and continue
        print(f"[WARNING] Persona seeding failed (non-fatal): {e}")

    yield  # Server is running

    # ── Shutdown ─────────────────────────────────────────────────────────────
    # (nothing to clean up yet)


app = FastAPI(
    title=settings.APP_NAME,
    description="MindMate — Your mental health companion API",
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Rate Limiting Middleware ─────────────────────────────────────────────────
# Applied after CORS so preflight OPTIONS requests are not rate-limited.
app.add_middleware(RateLimitMiddleware)

# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(mood.router, prefix="/api")
app.include_router(companions.router, prefix="/api")


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "app": settings.APP_NAME, "message": "MindMate API is running 💙"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}


@app.get("/api/health", tags=["Health"])
def api_health():
    """Health check accessible through the /api rewrite proxy."""
    return {"status": "healthy"}
