"""
Rate limiting middleware for MindMate.

Strategy:
- Free tier users: 50 messages per day
- Premium users:   unlimited
- Rate limits are tracked per-user in Redis with 24-hour TTL.
- Only /chat/stream and /chat/send endpoints are rate-limited.
- All other endpoints (auth, mood, health) are unrestricted.
- Returns 429 Too Many Requests with a clear JSON error when limit is hit.
"""
import json
from datetime import date
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from jose import JWTError, jwt
from core.config import settings
from core.redis_client import redis_client

# ─── Config ──────────────────────────────────────────────────────────────────
# Matched by suffix so this stays correct regardless of the router mount prefix
# (routes are actually served under /api, e.g. /api/chat/send).
RATE_LIMITED_SUFFIXES = ("/chat/send", "/chat/stream")

FREE_TIER_DAILY_LIMIT = 50       # messages per day for free users
PREMIUM_TIER_DAILY_LIMIT = 9999  # effectively unlimited


def _get_daily_key(user_id: int) -> str:
    """Redis key scoped to user + calendar day (UTC)."""
    today = date.today().isoformat()  # e.g. "2026-06-22"
    return f"ratelimit:daily:{user_id}:{today}"


def _extract_user_id_from_token(authorization: str | None) -> int | None:
    """
    Parse the JWT from the Authorization header and return the user ID.
    Returns None if the header is missing or the token is invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        sub = payload.get("sub")
        if sub and payload.get("type") == "access":
            return int(sub)
    except (JWTError, ValueError):
        pass
    return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Starlette middleware that enforces per-user daily message quotas.
    Reads subscription_tier directly from the JWT claim to avoid a DB lookup
    on every request (the tier is embedded by the auth router at login).
    Falls back to 'free' if no tier claim exists.
    """

    async def dispatch(self, request: Request, call_next):
        # Only rate-limit specific chat endpoints (suffix match tolerates the /api prefix)
        if not request.url.path.endswith(RATE_LIMITED_SUFFIXES):
            return await call_next(request)

        # Skip OPTIONS (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Extract user identity from Authorization header
        authorization = request.headers.get("Authorization")
        user_id = _extract_user_id_from_token(authorization)

        if user_id is None:
            # Let the endpoint handle unauthenticated requests (will 401 itself)
            return await call_next(request)

        # Determine limit based on subscription tier stored in JWT
        token = authorization.removeprefix("Bearer ").strip()
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            tier = payload.get("tier", "free")
        except JWTError:
            tier = "free"

        daily_limit = PREMIUM_TIER_DAILY_LIMIT if tier == "premium" else FREE_TIER_DAILY_LIMIT

        # Check and increment Redis counter
        try:
            key = _get_daily_key(user_id)
            count = redis_client.incr(key)
            # Set TTL on first increment (key expires at end of calendar day + buffer)
            if count == 1:
                redis_client.expire(key, 86400 + 3600)  # 25-hour TTL

            if count > daily_limit:
                return Response(
                    content=json.dumps({
                        "detail": (
                            f"Daily message limit reached ({daily_limit} messages). "
                            "Upgrade to Premium for unlimited conversations. 💙"
                        ),
                        "limit": daily_limit,
                        "used": count - 1,
                        "upgrade_url": "/pricing",
                    }),
                    status_code=429,
                    media_type="application/json",
                )
        except Exception:
            # If Redis is down, allow the request through (fail-open)
            # Log this in production monitoring
            pass

        return await call_next(request)
