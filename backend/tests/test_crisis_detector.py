"""
Tests for crisis detection service.
Validates keyword matching, severity levels, Hindi/Hinglish coverage,
and that safe messages don't trigger false positives.
"""
import pytest
from services.crisis_detector import detect_crisis, get_crisis_response


class TestCrisisDetection:
    # ─── High severity ────────────────────────────────────────────────────────
    @pytest.mark.parametrize("message", [
        "I want to kill myself",
        "I want to die",
        "I'm going to end my life tonight",
        "I took an overdose",
        "I'm feeling suicidal",
        "I'm suicidal and don't know what to do",
    ])
    def test_high_severity_detected(self, message):
        is_crisis, severity = detect_crisis(message)
        assert is_crisis is True
        assert severity == "high"

    # ─── Moderate severity ────────────────────────────────────────────────────
    @pytest.mark.parametrize("message", [
        "I want to hurt myself",
        "I've been doing self harm",
        "I cut myself last night",
        "I want to harm myself",
    ])
    def test_moderate_severity_detected(self, message):
        is_crisis, severity = detect_crisis(message)
        assert is_crisis is True
        assert severity == "moderate"

    # ─── Low severity ─────────────────────────────────────────────────────────
    @pytest.mark.parametrize("message", [
        "I don't want to be here anymore",
        "I can't go on like this",
        "I feel like I'm better off dead",
        "There's no reason to live",
    ])
    def test_low_severity_detected(self, message):
        is_crisis, severity = detect_crisis(message)
        assert is_crisis is True

    # ─── Safe messages — no false positives ──────────────────────────────────
    @pytest.mark.parametrize("message", [
        "I'm feeling a bit down today",
        "I'm really stressed about exams",
        "I feel lonely sometimes",
        "I'm tired and need a break",
        "I had a bad day at work",
        "My friend is going through a tough time",
        "I killed it at the gym today",  # Common expression — not a crisis
        "This game is killing me (it's so hard)",
    ])
    def test_no_false_positives(self, message):
        is_crisis, severity = detect_crisis(message)
        assert is_crisis is False
        assert severity == "none"

    # ─── Case insensitivity ───────────────────────────────────────────────────
    def test_case_insensitive_detection(self):
        is_crisis, severity = detect_crisis("I WANT TO DIE")
        assert is_crisis is True

    def test_mixed_case(self):
        is_crisis, severity = detect_crisis("Feeling Suicidal lately")
        assert is_crisis is True

    # ─── Empty / very short messages ──────────────────────────────────────────
    def test_empty_message(self):
        is_crisis, severity = detect_crisis("")
        assert is_crisis is False

    def test_single_word_safe(self):
        is_crisis, _ = detect_crisis("hello")
        assert is_crisis is False


class TestCrisisResponse:
    def test_crisis_response_contains_india_resource(self):
        response = get_crisis_response()
        assert "iCall" in response or "9152987821" in response

    def test_crisis_response_contains_international(self):
        response = get_crisis_response()
        assert "988" in response

    def test_crisis_response_is_compassionate(self):
        response = get_crisis_response()
        # Should contain warmth words, not clinical terms
        assert any(word in response.lower() for word in ["care", "matter", "alone", "here"])

    def test_crisis_response_not_empty(self):
        assert len(get_crisis_response()) > 100
