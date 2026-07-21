"""
Tests for language detection service.
"""
import pytest
from services.language_detector import detect_language, get_language_instruction


class TestDetectLanguage:
    # ─── English ─────────────────────────────────────────────────────────────
    @pytest.mark.parametrize("message", [
        "I'm feeling really stressed today",
        "Hey, how are you doing?",
        "I had a rough week at work",
        "I can't sleep because of anxiety",
    ])
    def test_detects_english(self, message):
        assert detect_language(message) == "en"

    # ─── Devanagari Hindi ─────────────────────────────────────────────────────
    @pytest.mark.parametrize("message", [
        "मुझे बहुत तनाव हो रहा है",
        "आज का दिन बहुत खराब था",
        "मैं बहुत परेशान हूं",
    ])
    def test_detects_devanagari_hindi(self, message):
        assert detect_language(message) == "hi"

    # ─── Hinglish ────────────────────────────────────────────────────────────
    @pytest.mark.parametrize("message", [
        "yaar main bahut stressed hun",
        "bhai kuch samajh nahi aa raha",
        "yeh kya ho raha hai mujhe nahi pata",
        "kal se bahut bura feel ho raha hai",
    ])
    def test_detects_hinglish(self, message):
        assert detect_language(message) == "hinglish"

    # ─── Edge cases ───────────────────────────────────────────────────────────
    def test_empty_string_defaults_to_english(self):
        assert detect_language("") == "en"

    def test_very_short_string_defaults_to_english(self):
        assert detect_language("hi") == "en"

    def test_single_hindi_word_in_english_stays_english(self):
        # One Hindi word in an otherwise English message shouldn't flip it
        result = detect_language("I'm feeling bahut tired")
        # Only 1 marker word — should not trigger Hinglish
        assert result == "en"


class TestLanguageInstruction:
    def test_hindi_instruction_contains_devanagari_reference(self):
        instruction = get_language_instruction("hi")
        assert "Hindi" in instruction
        assert "Devanagari" in instruction

    def test_hinglish_instruction_contains_example(self):
        instruction = get_language_instruction("hinglish")
        assert "Hinglish" in instruction
        assert len(instruction) > 50

    def test_english_instruction_is_empty(self):
        # No special instruction needed for English
        assert get_language_instruction("en") == ""
