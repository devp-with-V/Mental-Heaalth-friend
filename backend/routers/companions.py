"""
Personas router — exposes companion information and per-companion conversation lists.

Endpoints:
  GET  /companions/               → List all active companions
  GET  /companions/{slug}         → Detail for a single companion
  GET  /companions/{slug}/conversations → Conversations the user has with this companion
  POST /companions/{slug}/new     → Start a new conversation with this companion

Design note:
  All companions are available to all users. Users can have separate conversation
  threads with each companion. There is no "primary" companion selection.
  The companion for a conversation is stored as persona_id on the Conversation model.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from core.security import get_current_user
from models.db_models import User, Conversation
from schemas.pydantic_models import PersonaOut, ConversationSummary
from services.personas import get_all_personas, get_persona_by_slug

router = APIRouter(prefix="/companions", tags=["Companions"])


@router.get("", response_model=List[PersonaOut])
def list_companions(db: Session = Depends(get_db)):
    """
    Return all active companions.
    Does not require authentication — companion list is public.
    The UI shows this on the home/chat selection screen.
    """
    personas = get_all_personas(db)
    return personas


@router.get("/{slug}", response_model=PersonaOut)
def get_companion(slug: str, db: Session = Depends(get_db)):
    """Get detailed info for a single companion by slug."""
    persona = get_persona_by_slug(slug, db)
    if not persona:
        raise HTTPException(status_code=404, detail=f"Companion '{slug}' not found")
    return persona


@router.get("/{slug}/conversations", response_model=List[ConversationSummary])
def get_companion_conversations(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return all conversations this user has with a specific companion.
    Ordered newest first.
    Used by the frontend to show conversation history per companion.
    """
    persona = get_persona_by_slug(slug, db)
    if not persona:
        raise HTTPException(status_code=404, detail=f"Companion '{slug}' not found")

    convs = (
        db.query(Conversation)
        .filter(
            Conversation.user_id == current_user.id,
            Conversation.persona_id == persona.id,
        )
        .order_by(Conversation.updated_at.desc().nullslast())
        .all()
    )
    return convs
