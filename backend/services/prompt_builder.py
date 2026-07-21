"""
Prompt builder — assembles the full system prompt + conversation context
that gets sent to the AI model on each request.

Phase 1 update:
- Persona-driven system prompts (each companion has their own speaking style)
- The Guide persona adapts its gender to match the user
- Language detection still injected per-message
- Memory injection unchanged
"""
from typing import List, Dict, Optional
from models.db_models import User, UserMemory, Persona
from services.language_detector import detect_language, get_language_instruction


# ─── India cultural context (shared across all personas) ─────────────────────
INDIA_CULTURAL_CONTEXT = """
## Cultural Awareness:
You understand that many users face specific pressures common in India:
- Intense academic pressure (board exams, JEE, NEET, CAT)
- Career expectations from family (engineering, medicine, government jobs)
- Joint family dynamics and complex family relationships
- Social stigma around mental health — many users have never talked to anyone before
- Arranged marriage dynamics and relationship pressures

Reference Indian culture naturally when relevant (chai, cricket, festivals)
but never stereotype. Treat each person as an individual.
"""

# ─── Universal rules for all companions ──────────────────────────────────────
UNIVERSAL_RULES = """
## What you never do:
- Diagnose medical or psychological conditions.
- Suggest specific medications.
- Give legal or financial advice.
- Pretend you have personal experiences you don't have.
- Ignore or minimize what they're feeling.
- Give robotic, generic responses.
- Break character or mention that you are an AI model unless directly asked.

## Crisis situations:
If the user expresses suicidal thoughts or intent to harm themselves, respond with deep compassion
and gently encourage them to call a crisis line. Do this like a concerned friend would.
Crisis resources: iCall India: 9152987821 | Vandrevala Foundation: 1860-2662-345 (24/7) | 988 (US)
"""


def _build_guide_gender_line(user_gender: str) -> str:
    """
    Returns the gender identity line for The Guide persona.
    The Guide presents as the same gender as the user so it feels like
    an older sibling of the same gender — more relatable for sensitive topics.
    """
    gender_map = {
        "male": "You are presenting as male in this conversation — like an older brother or male friend.",
        "female": "You are presenting as female in this conversation — like an older sister or female friend.",
        "prefer_not_to_say": "You are presenting as gender-neutral in this conversation.",
    }
    return gender_map.get(user_gender, gender_map["prefer_not_to_say"])


def _build_few_shot_section(persona: Persona, persona_name: str) -> str:
    """Build the few-shot examples section from the persona's stored examples."""
    if not persona.example_responses:
        return ""

    lines = ["\n## Example conversations (for tone reference only):\n"]
    for ex in persona.example_responses[:3]:
        lines.append(f"User: {ex['user']}")
        lines.append(f"{persona_name}: {ex['assistant']}\n")

    return "\n".join(lines)


def build_system_prompt(
    user: User,
    memories: List[UserMemory],
    latest_user_message: str = "",
    persona: Optional[Persona] = None,
) -> str:
    """
    Build the complete system prompt for a conversation.

    Args:
        user: The authenticated User ORM object
        memories: List of long-term UserMemory facts for this user
        latest_user_message: The user's latest message (used for language detection)
        persona: The Persona ORM object for this conversation (None = legacy / default Riya)
    """
    # ─── Resolve persona identity ─────────────────────────────────────────────
    if persona:
        persona_name = persona.display_name
        speaking_style = persona.speaking_style
        is_guide = persona.is_gender_adaptive
    else:
        # Legacy / default: use Riya's identity inline
        persona_name = "Riya"
        speaking_style = """You are Riya — a warm, genuine Indian woman who is deeply caring and easy to talk to.
You speak like you're texting your best friend — casually, warmly, always with care.
You validate feelings without lecturing. You use emojis naturally, not excessively."""
        is_guide = False

    # ─── Guide gender adaptation ──────────────────────────────────────────────
    guide_gender_line = ""
    if is_guide:
        user_gender = getattr(user, "gender", "prefer_not_to_say") or "prefer_not_to_say"
        guide_gender_line = f"\n## Your identity in this conversation:\n{_build_guide_gender_line(user_gender)}\n"

    # ─── Memory section ───────────────────────────────────────────────────────
    memory_section = ""
    if memories:
        facts = "\n".join(f"- {m.fact_text}" for m in memories[:10])
        memory_section = f"""
## What you remember about {user.name}:
{facts}

Use these naturally — don't dump them all at once. Weave them in when relevant.
"""

    # ─── Language detection ───────────────────────────────────────────────────
    detected_lang = detect_language(latest_user_message) if latest_user_message else "en"
    language_instruction = get_language_instruction(detected_lang)

    # ─── Few-shot examples ────────────────────────────────────────────────────
    few_shot_section = ""
    if persona:
        few_shot_section = _build_few_shot_section(persona, persona_name)

    # ─── Assemble full prompt ─────────────────────────────────────────────────
    system_prompt = f"""{speaking_style}

You are talking with {user.name}.
{guide_gender_line}
{UNIVERSAL_RULES}
{INDIA_CULTURAL_CONTEXT}
{language_instruction}
{memory_section}
{few_shot_section}
"""
    return system_prompt.strip()


def build_messages(
    system_prompt: str,
    conversation_history: List[Dict[str, str]],
    new_user_message: str,
    max_history: int = 20,
) -> List[Dict[str, str]]:
    """
    Assemble the full messages list to send to the model.
    Keeps a sliding window of the last `max_history` messages.
    """
    messages = [{"role": "system", "content": system_prompt}]

    # Sliding window — most recent messages
    recent_history = conversation_history[-max_history:]
    messages.extend(recent_history)

    # Add the new user message
    messages.append({"role": "user", "content": new_user_message})

    return messages
