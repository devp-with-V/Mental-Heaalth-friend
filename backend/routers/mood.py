from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from core.database import get_db
from core.security import get_current_user
from models.db_models import User, MoodLog
from schemas.pydantic_models import MoodLogCreate, MoodLogOut

router = APIRouter(prefix="/mood", tags=["Mood"])

EMOTION_SUGGESTIONS = {
    (1, 3): ["overwhelmed", "devastated", "hopeless", "crying"],
    (3, 5): ["anxious", "sad", "lonely", "drained", "numb"],
    (5, 7): ["okay", "neutral", "tired", "meh", "uncertain"],
    (7, 9): ["good", "hopeful", "calm", "relieved", "grateful"],
    (9, 11): ["amazing", "happy", "excited", "energized", "great"],
}


@router.post("/log", response_model=MoodLogOut, status_code=201)
def log_mood(
    payload: MoodLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not (1.0 <= payload.mood_score <= 10.0):
        raise HTTPException(status_code=400, detail="mood_score must be between 1.0 and 10.0")

    log = MoodLog(
        user_id=current_user.id,
        mood_score=payload.mood_score,
        emotion_tag=payload.emotion_tag,
        note=payload.note,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/history", response_model=List[MoodLogOut])
def get_mood_history(
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(MoodLog)
        .filter(MoodLog.user_id == current_user.id)
        .order_by(MoodLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return logs


@router.get("/suggestions")
def get_emotion_suggestions(score: float):
    """Given a mood score, return suggested emotion tags."""
    if not (1.0 <= score <= 10.0):
        raise HTTPException(status_code=400, detail="score must be between 1 and 10")

    for (low, high), tags in EMOTION_SUGGESTIONS.items():
        if low <= score < high:
            return {"suggestions": tags}
    return {"suggestions": ["okay"]}
