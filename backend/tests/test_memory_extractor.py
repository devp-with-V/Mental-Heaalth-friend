"""
Tests for memory extractor service.
Uses mocked AI calls so no OpenRouter API key is needed.
"""
import pytest
from unittest.mock import AsyncMock, patch
from services.memory_extractor import (
    _parse_facts,
    _is_duplicate,
    extract_and_store_memories,
)


class TestParseFacts:
    def test_parse_clean_json_array(self):
        result = _parse_facts('["User has anxiety", "User works night shifts"]')
        assert result == ["User has anxiety", "User works night shifts"]

    def test_parse_json_embedded_in_text(self):
        result = _parse_facts('Sure! Here are the facts: ["User has a dog named Bruno"]. Done.')
        assert result == ["User has a dog named Bruno"]

    def test_parse_empty_array(self):
        result = _parse_facts("[]")
        assert result == []

    def test_parse_invalid_json(self):
        result = _parse_facts("I couldn't find any facts.")
        assert result == []

    def test_parse_filters_non_strings(self):
        result = _parse_facts('[42, "User likes chai", null]')
        assert result == ["User likes chai"]

    def test_parse_malformed_json(self):
        result = _parse_facts("[unclosed array")
        assert result == []


class TestIsDuplicate:
    def test_exact_duplicate(self):
        existing = ["user has anxiety and trouble sleeping"]
        assert _is_duplicate("User has anxiety and trouble sleeping", existing) is True

    def test_similar_fact(self):
        existing = ["user has trouble sleeping with anxiety"]
        assert _is_duplicate("User has anxiety trouble sleeping", existing) is True

    def test_different_fact(self):
        existing = ["user works as a software engineer"]
        assert _is_duplicate("User has a dog named Bruno", existing) is False

    def test_empty_existing(self):
        assert _is_duplicate("User likes coffee", []) is False

    def test_very_short_fact_not_deduplicated(self):
        # Short facts (< 3 words) are not checked for duplication
        existing = ["user likes tea"]
        assert _is_duplicate("User", existing) is False


class TestExtractAndStoreMemories:
    @pytest.mark.asyncio
    async def test_extracts_and_stores_new_facts(self, db):
        """End-to-end test: model returns facts, they get stored in DB."""
        from models.db_models import User, UserMemory
        from core.security import hash_password

        # Create a test user
        user = User(
            email="memtest@test.com",
            password_hash=hash_password("pass"),
            name="Mem Test",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        mock_response = '["User has anxiety", "User works night shifts"]'

        with patch("services.memory_extractor.chat_completion", new=AsyncMock(return_value=mock_response)):
            stored = await extract_and_store_memories(
                user_id=user.id,
                user_message="I've been struggling with anxiety and I work the night shift",
                bot_response="That sounds exhausting — when do you usually sleep?",
                db=db,
            )

        assert len(stored) == 2
        assert "User has anxiety" in stored

        # Verify they're in the DB
        memories = db.query(UserMemory).filter(UserMemory.user_id == user.id).all()
        assert len(memories) == 2

    @pytest.mark.asyncio
    async def test_skips_very_short_messages(self, db):
        """Short user messages should not trigger extraction."""
        from models.db_models import User, UserMemory
        from core.security import hash_password

        user = User(email="shortmsg@test.com", password_hash=hash_password("pass"), name="Short")
        db.add(user)
        db.commit()

        stored = await extract_and_store_memories(
            user_id=user.id,
            user_message="hi",
            bot_response="Hey! How are you?",
            db=db,
        )
        assert stored == []

    @pytest.mark.asyncio
    async def test_deduplicates_existing_facts(self, db):
        """If a very similar fact already exists, it should not be re-stored."""
        from models.db_models import User, UserMemory
        from core.security import hash_password

        user = User(email="dedup@test.com", password_hash=hash_password("pass"), name="Dedup")
        db.add(user)
        db.commit()
        db.refresh(user)

        # Pre-insert a memory
        existing = UserMemory(user_id=user.id, fact_text="User has anxiety and trouble sleeping")
        db.add(existing)
        db.commit()

        # Model returns a duplicate
        mock_response = '["User has anxiety and trouble sleeping"]'

        with patch("services.memory_extractor.chat_completion", new=AsyncMock(return_value=mock_response)):
            stored = await extract_and_store_memories(
                user_id=user.id,
                user_message="My anxiety keeps me up at night and I cannot sleep at all",
                bot_response="That sounds really hard.",
                db=db,
            )

        assert stored == []

    @pytest.mark.asyncio
    async def test_handles_model_failure_gracefully(self, db):
        """If the AI call fails, extraction should return empty without crashing."""
        from models.db_models import User
        from core.security import hash_password

        user = User(email="failtest@test.com", password_hash=hash_password("pass"), name="Fail")
        db.add(user)
        db.commit()

        with patch("services.memory_extractor.chat_completion", new=AsyncMock(side_effect=Exception("API error"))):
            stored = await extract_and_store_memories(
                user_id=user.id,
                user_message="I've been having a very rough time with stress at work",
                bot_response="I hear you, that sounds exhausting.",
                db=db,
            )

        assert stored == []
