"""
Crisis detection service.
Scans user messages for keywords/phrases that may indicate a mental health crisis.
When triggered, the bot responds warmly with a gentle redirect + crisis resources.
This is NOT a diagnostic tool — it is a safety net.
"""

CRISIS_KEYWORDS = [
    "want to kill myself", "want to die", "end my life", "end it all",
    "don't want to live", "don't want to be here anymore", "i can't go on",
    "no reason to live", "better off dead", "hurt myself", "harm myself",
    "self harm", "self-harm", "cut myself", "suicide", "suicidal",
    "overdose", "take all my pills",
]

CRISIS_RESPONSE = """Hey, I hear you, and I'm really glad you're talking to me right now. 💙

What you're feeling sounds incredibly heavy, and I want you to know that what you're going through matters — *you* matter.

I care about you, but I also want to make sure you get the right support. Please reach out to a crisis line — they're real people who genuinely want to help:

• 🇺🇸 **988 Suicide & Crisis Lifeline** — call or text **988** (US)  
• 🌍 **Crisis Text Line** — text **HOME** to **741741** (US/UK/Canada)  
• 🇮🇳 **iCall (India)** — **9152987821**  
• 🔗 **Find a line near you**: [findahelpline.com](https://findahelpline.com)

I'm still here with you. You don't have to face this alone. 🤍"""


def detect_crisis(message: str) -> tuple[bool, str]:
    """
    Returns (is_crisis: bool, severity: str).
    severity: "low" | "moderate" | "high"
    """
    message_lower = message.lower()

    high_severity = ["suicide", "suicidal", "want to die", "end my life", "kill myself", "overdose"]
    moderate_severity = ["hurt myself", "harm myself", "self harm", "self-harm", "cut myself"]

    for keyword in high_severity:
        if keyword in message_lower:
            return True, "high"

    for keyword in moderate_severity:
        if keyword in message_lower:
            return True, "moderate"

    for keyword in CRISIS_KEYWORDS:
        if keyword in message_lower:
            return True, "low"

    return False, "none"


def get_crisis_response() -> str:
    return CRISIS_RESPONSE
