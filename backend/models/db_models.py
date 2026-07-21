from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(100), nullable=False)

    # Gender is used by The Guide persona to adopt the same gender as the user
    # Values: "male" | "female" | "prefer_not_to_say" (default)
    gender = Column(String(30), default="prefer_not_to_say")

    # Phase 0 additions
    subscription_tier = Column(String(20), default="free")  # "free" | "premium"
    preferred_language = Column(String(10), default="en")   # "en" | "hi" etc.


    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
    mood_logs = relationship("MoodLog", back_populates="user", cascade="all, delete-orphan")
    memories = relationship("UserMemory", back_populates="user", cascade="all, delete-orphan")
    crisis_flags = relationship("CrisisFlag", back_populates="user", cascade="all, delete-orphan")


class Persona(Base):
    """
    Defines a companion character. Stored in DB so personas can evolve
    without code changes. Seeded at startup via seed_personas().

    All 4 personas are available to every user simultaneously.
    Users have separate conversation threads per persona.
    """
    __tablename__ = "personas"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(50), unique=True, nullable=False)   # "riya" | "arjun" | "alex" | "guide"
    display_name = Column(String(100), nullable=False)        # "Riya" | "Arjun" | "Alex"
    tagline = Column(String(250), nullable=True)              # Short description shown in UI
    archetype = Column(String(50), nullable=False)            # "friend_f" | "friend_m" | "neutral" | "guide"
    avatar_emoji = Column(String(10), default="💙")           # Emoji used as avatar placeholder

    # Full system prompt section injected per-persona
    speaking_style = Column(Text, nullable=False)

    # Few-shot examples specific to this persona's voice
    example_responses = Column(JSON, nullable=True)

    # Whether this persona adapts to user gender (The Guide)
    is_gender_adaptive = Column(Boolean, default=False)

    # For future premium gating (all free for now)
    is_premium = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    conversations = relationship("Conversation", back_populates="persona")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Phase 1: Each conversation is tied to one companion
    # NULL = legacy conversation (no persona assigned)
    persona_id = Column(Integer, ForeignKey("personas.id", ondelete="SET NULL"), nullable=True)

    title = Column(String(200), default="New Conversation")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="conversations")
    persona = relationship("Persona", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # "user" | "assistant" | "system"
    content = Column(Text, nullable=False)
    token_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    crisis_flags = relationship("CrisisFlag", back_populates="message")


class UserMemory(Base):
    """Long-term facts about a user, injected into future sessions."""
    __tablename__ = "user_memory"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    fact_text = Column(Text, nullable=False)  # e.g. "User works night shifts"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="memories")


class MoodLog(Base):
    __tablename__ = "mood_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mood_score = Column(Float, nullable=False)   # 1.0 to 10.0
    emotion_tag = Column(String(50), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="mood_logs")


class CrisisFlag(Base):
    """Tracks messages that triggered crisis detection keywords."""
    __tablename__ = "crisis_flags"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=True)
    severity = Column(String(20), default="moderate")  # "low" | "moderate" | "high"
    flagged_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved = Column(Boolean, default=False)

    # Relationships
    user = relationship("User", back_populates="crisis_flags")
    message = relationship("Message", back_populates="crisis_flags")
