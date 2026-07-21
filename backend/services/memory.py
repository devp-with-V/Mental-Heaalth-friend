"""
Memory manager — handles short-term (sliding window) and long-term (DB-stored facts) memory.
"""
from typing import List, Dict
from sqlalchemy.orm import Session
from datetime import datetime
from models.db_models import Message, UserMemory, Conversation
from schemas.pydantic_models import MessageOut


def get_conversation_history(
    conversation_id: int,
    db: Session,
    max_messages: int = 30,
) -> List[Dict[str, str]]:
    """
    Fetch recent messages from a conversation as a list of {role, content} dicts.
    Used as context for the model.
    """
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(max_messages)
        .all()
    )
    # Return in chronological order
    messages.reverse()
    return [{"role": m.role, "content": m.content} for m in messages]


def save_message(
    conversation_id: int,
    role: str,
    content: str,
    db: Session,
    token_count: int = 0,
) -> Message:
    """Save a single message to the database."""
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        token_count=token_count,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def get_or_create_conversation(
    user_id: int,
    conversation_id: int | None,
    first_message: str,
    db: Session,
) -> Conversation:
    """Get existing conversation or create a new one with an auto-generated title."""
    if conversation_id:
        conv = db.query(Conversation).filter(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        ).first()
        if conv:
            # Update the updated_at timestamp
            conv.updated_at = datetime.utcnow()
            db.commit()
            return conv

    # Auto-generate a title from the first message (first 60 chars)
    title = first_message[:60] + ("..." if len(first_message) > 60 else "")
    conv = Conversation(user_id=user_id, title=title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def get_user_memories(user_id: int, db: Session) -> List[UserMemory]:
    """Fetch all long-term memories for a user."""
    return (
        db.query(UserMemory)
        .filter(UserMemory.user_id == user_id)
        .order_by(UserMemory.last_used_at.desc().nullslast())
        .limit(10)
        .all()
    )


def save_memory(user_id: int, fact_text: str, db: Session) -> UserMemory:
    """Add a new long-term fact about a user."""
    mem = UserMemory(user_id=user_id, fact_text=fact_text)
    db.add(mem)
    db.commit()
    db.refresh(mem)
    return mem
