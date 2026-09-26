from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime


# ─── Auth Schemas ───────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    # Gender is optional at registration — user can update it from profile
    # Used by The Guide persona to adapt its identity to match the user's gender
    gender: Optional[str] = "prefer_not_to_say"


class UserLogin(BaseModel):
    email: EmailStr
    password: str




class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    gender: str = "prefer_not_to_say"
    subscription_tier: str = "free"
    preferred_language: str = "en"
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """For updating user profile fields."""
    name: Optional[str] = None
    gender: Optional[str] = None
    preferred_language: Optional[str] = None


# ─── Persona Schemas ──────────────────────────────────────────────────────────

class PersonaOut(BaseModel):
    """Public-facing persona data shown in UI companion list."""
    id: int
    slug: str
    display_name: str
    tagline: Optional[str]
    archetype: str
    avatar_emoji: str
    is_gender_adaptive: bool
    is_premium: bool
    sort_order: int

    class Config:
        from_attributes = True


class PersonaDetail(PersonaOut):
    """Extended persona info including example conversations."""
    example_responses: Optional[Any] = None

    class Config:
        from_attributes = True


# ─── Chat Schemas ────────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str
    conversation_id: Optional[int] = None   # None = start a new conversation
    persona_slug: Optional[str] = None      # Which companion to talk to (default: "riya")


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    id: int
    title: str
    persona_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    messages: List[MessageOut] = []

    class Config:
        from_attributes = True


class ConversationSummary(BaseModel):
    id: int
    title: str
    persona_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Mood Schemas ────────────────────────────────────────────────────────────

class MoodLogCreate(BaseModel):
    mood_score: float  # 1.0 - 10.0
    emotion_tag: Optional[str] = None
    note: Optional[str] = None


class MoodLogOut(BaseModel):
    id: int
    mood_score: float
    emotion_tag: Optional[str]
    note: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
