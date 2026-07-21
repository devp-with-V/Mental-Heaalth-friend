"""
Language detection service for MindMate.

Detects whether the user is writing in English, Hindi, or Hinglish (Roman Hindi),
and returns instructions that can be injected into the system prompt so the bot
responds in the same language/style as the user.

Currently supported detection modes:
- 'en'      → Pure English
- 'hi'      → Devanagari Hindi
- 'hinglish' → Roman-script Hindi/English mix (detected heuristically)
"""
from typing import Literal

Language = Literal["en", "hi", "hinglish"]

# Common Hinglish / Hindi Roman-script words that signal the user is writing in Hindi
_HINDI_ROMAN_MARKERS = {
    "yaar", "bhai", "dost", "haan", "nahi", "kya", "hua", "mujhe", "mera",
    "tera", "apna", "sab", "kuch", "bahut", "achha", "thoda", "abhi", "phir",
    "matlab", "sunao", "bata", "kar", "tha", "thi", "ek", "hai", "ho", "hun",
    "raha", "rahi", "rhe", "tho", "yeh", "woh", "aur", "lekin", "toh", "kyun",
    "kaise", "kitna", "bohot", "stress", "pareshaan", "dil", "zindagi", "kal",
    "aaj", "kal", "sach", "jhuth", "pyaar", "ghar", "kaam",
}

# Devanagari Unicode range
_DEVANAGARI_RANGE_START = 0x0900
_DEVANAGARI_RANGE_END = 0x097F


def detect_language(text: str) -> Language:
    """
    Detect the primary language of a user message.

    Returns:
        'hi'       — if Devanagari script is found
        'hinglish' — if Roman-script Hindi markers are detected
        'en'       — otherwise (default)
    """
    if not text or len(text.strip()) < 3:
        return "en"

    # Check for Devanagari characters
    devanagari_chars = sum(
        1 for ch in text if _DEVANAGARI_RANGE_START <= ord(ch) <= _DEVANAGARI_RANGE_END
    )
    if devanagari_chars > 2:
        return "hi"

    # Check for Hinglish markers in Roman script
    words = set(text.lower().split())
    hindi_word_count = len(words & _HINDI_ROMAN_MARKERS)
    # If 2+ Hindi words found in the message, classify as Hinglish
    if hindi_word_count >= 2:
        return "hinglish"

    return "en"


def get_language_instruction(language: Language) -> str:
    """
    Returns a system prompt instruction telling the bot how to respond
    based on the detected language.
    """
    if language == "hi":
        return (
            "\n## Language:\n"
            "The user is writing in Hindi (Devanagari script). "
            "Please respond entirely in Hindi using Devanagari script. "
            "Keep your tone warm and natural — like a close friend texting in Hindi.\n"
        )
    if language == "hinglish":
        return (
            "\n## Language:\n"
            "The user is writing in Hinglish (a mix of Hindi and English in Roman script). "
            "Please respond in the same Hinglish style — match their natural tone. "
            "For example, if they write 'yaar main bahut stressed hun', "
            "respond naturally in the same style like 'arre yaar, bol kya hua?'\n"
        )
    return ""  # English — no special instruction needed
