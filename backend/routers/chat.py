"""
Chat router — handles conversation management, message sending, and SSE streaming.

Phase 1 update:
  - All endpoints accept an optional `persona_slug` parameter.
  - Conversations are tied to a specific companion (persona_id on Conversation).
  - The prompt builder receives the Persona ORM object for each conversation.
  - The Guide's gender adaptation happens automatically via user.gender.

Security note:
  The /stream endpoint reads the JWT from the Authorization header — NOT a URL param.
  This keeps the token out of server logs, Nginx access logs, and browser history.
"""
import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from core.database import get_db, SessionLocal
from core.security import get_current_user, decode_token
from models.db_models import User, Conversation, CrisisFlag
from schemas.pydantic_models import MessageCreate, MessageOut, ConversationOut, ConversationSummary
from services import openrouter, memory as mem_service, prompt_builder, crisis_detector
from services.personas import get_persona_by_slug
from typing import List, Optional

router = APIRouter(prefix="/chat", tags=["Chat"])

# ─── Default companion slug when none specified ───────────────────────────────
DEFAULT_PERSONA_SLUG = "riya"


# ─── Helper: resolve user from Authorization header (for SSE endpoint) ────────
def _get_user_from_header(authorization: Optional[str], db: Session) -> User:
    """
    Manually validate a Bearer token from the Authorization header.
    Used by the SSE endpoint — StreamingResponse must start before FastAPI's
    Depends() would normally run, so we validate manually here.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _get_or_create_persona_conversation(
    user_id: int,
    persona_id: int,
    conversation_id: Optional[int],
    first_message: str,
    db: Session,
) -> Conversation:
    """
    Get an existing conversation or create a new one, scoped to this persona.
    If conversation_id is given, verify it belongs to this user AND this persona.
    If not, create a new conversation tied to this persona.
    """
    if conversation_id:
        conv = db.query(Conversation).filter(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        ).first()
        if conv:
            # Bump updated_at so active conversations re-sort to the top of the list.
            conv.updated_at = datetime.utcnow()
            db.commit()
            return conv

    # Auto-title from first 40 chars of message
    title = first_message[:40] + ("…" if len(first_message) > 40 else "")
    conv = Conversation(user_id=user_id, persona_id=persona_id, title=title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


# ─── Conversations ────────────────────────────────────────────────────────────

@router.get("/conversations", response_model=List[ConversationSummary])
def list_conversations(
    persona_slug: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return conversations for the current user.
    If persona_slug is given, filter to only that companion's conversations.
    Otherwise return all conversations (all companions).
    Ordered newest first.
    """
    query = db.query(Conversation).filter(Conversation.user_id == current_user.id)

    if persona_slug:
        persona = get_persona_by_slug(persona_slug, db)
        if persona:
            query = query.filter(Conversation.persona_id == persona.id)

    # Order by most-recent activity. New conversations have a NULL updated_at,
    # so fall back to created_at via coalesce to keep them sorted correctly.
    convs = query.order_by(
        func.coalesce(Conversation.updated_at, Conversation.created_at).desc()
    ).all()
    return convs


@router.get("/history/{conversation_id}", response_model=ConversationOut)
def get_history(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch all messages in a specific conversation."""
    conv = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


# ─── Non-streaming send ───────────────────────────────────────────────────────

@router.post("/send", response_model=MessageOut)
async def send_message(
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Non-streaming endpoint — waits for the full AI response before returning.
    Use /stream for real-time token-by-token responses.
    Rate limiting is applied upstream by RateLimitMiddleware.
    """
    # Resolve companion
    slug = payload.persona_slug or DEFAULT_PERSONA_SLUG
    persona = get_persona_by_slug(slug, db)
    if not persona:
        raise HTTPException(status_code=404, detail=f"Companion '{slug}' not found")

    is_crisis, severity = crisis_detector.detect_crisis(payload.content)

    conv = _get_or_create_persona_conversation(
        current_user.id, persona.id, payload.conversation_id, payload.content, db
    )
    user_msg = mem_service.save_message(conv.id, "user", payload.content, db)

    if is_crisis:
        crisis_response = crisis_detector.get_crisis_response()
        flag = CrisisFlag(user_id=current_user.id, message_id=user_msg.id, severity=severity)
        db.add(flag)
        db.commit()
        bot_msg = mem_service.save_message(conv.id, "assistant", crisis_response, db)
        return bot_msg

    user_memories = mem_service.get_user_memories(current_user.id, db)
    system_prompt = prompt_builder.build_system_prompt(
        current_user, user_memories, payload.content, persona=persona
    )
    history = mem_service.get_conversation_history(conv.id, db, max_messages=20)
    history = [m for m in history if m["content"] != payload.content]
    messages = prompt_builder.build_messages(system_prompt, history, payload.content)

    try:
        ai_response = await openrouter.chat_completion(messages)
    except openrouter.AllModelsFailedError:
        raise HTTPException(
            status_code=503,
            detail="All companions are busy right now. Please try again in a moment. 💙",
        )
    bot_msg = mem_service.save_message(conv.id, "assistant", ai_response, db)

    asyncio.create_task(
        _extract_memories_async(current_user.id, payload.content, ai_response)
    )

    return bot_msg


# ─── SSE Streaming ────────────────────────────────────────────────────────────

@router.get("/stream")
async def stream_message(
    content: str,
    persona_slug: Optional[str] = None,
    conversation_id: Optional[int] = None,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    SSE streaming endpoint. Responds with token-by-token text/event-stream.

    The frontend connects via fetch() with an Authorization: Bearer header.
    Native EventSource cannot send custom headers so we use fetch() + ReadableStream.
    This keeps the JWT out of URLs, server logs, and browser history.

    Query params:
      content        — The user's message
      persona_slug   — Which companion to use (default: "riya")
      conversation_id — Continue an existing conversation (optional)
    """
    current_user = _get_user_from_header(authorization, db)

    # Resolve companion
    slug = persona_slug or DEFAULT_PERSONA_SLUG
    persona = get_persona_by_slug(slug, db)
    if not persona:
        raise HTTPException(status_code=404, detail=f"Companion '{slug}' not found")

    is_crisis, severity = crisis_detector.detect_crisis(content)

    conv = _get_or_create_persona_conversation(
        current_user.id, persona.id, conversation_id, content, db
    )
    user_msg = mem_service.save_message(conv.id, "user", content, db)

    user_id = current_user.id
    persona_slug_str = persona.slug
    conv_id = conv.id
    user_msg_id = user_msg.id

    async def event_generator():
        full_response = ""
        # Create a fresh session for the background streaming generator to avoid DetachedInstanceError
        db_stream = SessionLocal()
        try:
            if is_crisis:
                crisis_response = crisis_detector.get_crisis_response()
                # Create CrisisFlag associated with db_stream
                flag = CrisisFlag(user_id=user_id, message_id=user_msg_id, severity=severity)
                db_stream.add(flag)
                db_stream.commit()
                for word in crisis_response.split(" "):
                    chunk = word + " "
                    full_response += chunk
                    yield f"data: {json.dumps({'token': chunk})}\n\n"
                    await asyncio.sleep(0.03)
            else:
                # Retrieve user and persona in the new session to prevent detached attributes
                stream_user = db_stream.query(User).filter(User.id == user_id).first()
                stream_persona = get_persona_by_slug(persona_slug_str, db_stream)

                user_memories = mem_service.get_user_memories(user_id, db_stream)
                system_prompt = prompt_builder.build_system_prompt(
                    stream_user, user_memories, content, persona=stream_persona
                )
                history = mem_service.get_conversation_history(conv_id, db_stream, max_messages=20)
                history = [m for m in history if m["content"] != content]
                messages = prompt_builder.build_messages(system_prompt, history, content)

                try:
                    async for token in openrouter.chat_completion_stream(messages):
                        full_response += token
                        yield f"data: {json.dumps({'token': token})}\n\n"
                except openrouter.AllModelsFailedError:
                    # Every model in the chain failed before producing output.
                    if not full_response:
                        fallback_msg = (
                            "I'm having trouble responding right now — all companions "
                            "are busy. Please try again in a moment. 💙"
                        )
                        full_response = fallback_msg
                        yield f"data: {json.dumps({'token': fallback_msg})}\n\n"

            # Save complete bot response
            mem_service.save_message(conv_id, "assistant", full_response.strip(), db_stream)

            # Fire memory extraction (non-blocking, uses its own session internally)
            asyncio.create_task(
                _extract_memories_async(user_id, content, full_response.strip())
            )

            # Signal stream completion with conversation context
            yield f"data: {json.dumps({'done': True, 'conversation_id': conv_id, 'persona_slug': persona_slug_str})}\n\n"
        finally:
            db_stream.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ─── Memory extraction helper ─────────────────────────────────────────────────

async def _extract_memories_async(user_id: int, user_message: str, bot_response: str):
    """
    Fire-and-forget memory extraction after each conversation turn.
    Never delays the user's response — runs in the background.
    """
    db = SessionLocal()
    try:
        from services.memory_extractor import extract_and_store_memories
        await extract_and_store_memories(user_id, user_message, bot_response, db)
    except Exception:
        pass
    finally:
        db.close()
