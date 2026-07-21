"""
Tests for rate limiting middleware.
Validates that free users are limited to FREE_TIER_DAILY_LIMIT messages/day
and that 429 responses contain the correct structure.

Note: These tests mock Redis to control the counter values without needing
a real Redis instance.
"""
import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from middleware.rate_limit import (
    FREE_TIER_DAILY_LIMIT,
    PREMIUM_TIER_DAILY_LIMIT,
    _get_daily_key,
    _extract_user_id_from_token,
)
from core.security import create_access_token


class TestRateLimitHelpers:
    def test_daily_key_format(self):
        key = _get_daily_key(42)
        assert key.startswith("ratelimit:daily:42:")
        assert len(key) > 20  # Includes date

    def test_extract_user_id_valid_token(self):
        token = create_access_token({"sub": "99", "tier": "free"})
        user_id = _extract_user_id_from_token(f"Bearer {token}")
        assert user_id == 99

    def test_extract_user_id_missing_header(self):
        assert _extract_user_id_from_token(None) is None
        assert _extract_user_id_from_token("") is None

    def test_extract_user_id_bad_token(self):
        assert _extract_user_id_from_token("Bearer totally.bad.token") is None

    def test_extract_user_id_no_bearer_prefix(self):
        token = create_access_token({"sub": "5"})
        # Missing "Bearer " prefix
        assert _extract_user_id_from_token(token) is None


class TestRateLimitEnforcement:
    def test_free_user_within_limit_passes(self, client, auth_headers):
        """Requests below the limit should pass through (not get 429)."""
        with patch("core.redis_client.redis_client") as mock_redis, \
             patch("services.openrouter.chat_completion", new=AsyncMock(return_value="Hi there!")):
            mock_redis.incr.return_value = 1
            mock_redis.expire.return_value = True
            resp = client.post("/chat/send",
                json={"content": "hello"},
                headers=auth_headers
            )
            assert resp.status_code != 429

    def test_free_user_over_limit_gets_429(self, client, auth_headers):
        """Requests over the daily limit should return 429 before hitting the AI."""
        with patch("middleware.rate_limit.redis_client") as mock_redis:
            mock_redis.incr.return_value = FREE_TIER_DAILY_LIMIT + 1
            mock_redis.expire.return_value = True
            resp = client.post("/chat/send",
                json={"content": "hello"},
                headers=auth_headers
            )
            assert resp.status_code == 429
            data = resp.json()
            assert "limit" in data
            assert data["limit"] == FREE_TIER_DAILY_LIMIT
            assert "upgrade_url" in data

    def test_non_chat_endpoint_not_rate_limited(self, client, auth_headers):
        """Mood endpoint should never return 429 from rate limiting."""
        with patch("core.redis_client.redis_client") as mock_redis:
            mock_redis.incr.return_value = 9999
            resp = client.get("/mood/history", headers=auth_headers)
            assert resp.status_code != 429

    def test_health_endpoint_not_rate_limited(self, client):
        """Health check should never be rate limited."""
        with patch("core.redis_client.redis_client") as mock_redis:
            mock_redis.incr.return_value = 9999
            resp = client.get("/health")
            assert resp.status_code == 200

    def test_rate_limit_response_structure(self, client, auth_headers):
        """429 response should have a clear user-facing message."""
        with patch("middleware.rate_limit.redis_client") as mock_redis:
            mock_redis.incr.return_value = FREE_TIER_DAILY_LIMIT + 5
            mock_redis.expire.return_value = True
            resp = client.post("/chat/send",
                json={"content": "test"},
                headers=auth_headers
            )
            assert resp.status_code == 429
            body = resp.json()
            assert "detail" in body
            assert "💙" in body["detail"]  # Warm, not robotic

    def test_redis_failure_fails_open(self, client, auth_headers):
        """If Redis is unavailable, requests should still go through (fail-open)."""
        with patch("core.redis_client.redis_client") as mock_redis, \
             patch("services.openrouter.chat_completion", new=AsyncMock(return_value="Hello!")):
            mock_redis.incr.side_effect = Exception("Redis connection refused")
            resp = client.post("/chat/send",
                json={"content": "hello"},
                headers=auth_headers
            )
            # Should NOT return 429 — fail open
            assert resp.status_code != 429
