from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import secrets
from core.database import get_db
from core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token, get_current_user
)
from models.db_models import User
from schemas.pydantic_models import (
    UserRegister, UserLogin, ClerkLogin, Token, TokenRefresh, UserOut, UserUpdate
)
from services import clerk

router = APIRouter(prefix="/auth", tags=["Auth"])

VALID_GENDERS = {"male", "female", "prefer_not_to_say"}


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    gender = payload.gender if payload.gender in VALID_GENDERS else "prefer_not_to_say"

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        gender=gender,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token_data = {"sub": str(user.id), "tier": user.subscription_tier or "free"}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/clerk-login", response_model=Token)
async def clerk_login(payload: ClerkLogin, db: Session = Depends(get_db)):
    """
    Hybrid flow: Verifies the Clerk session token, fetches the user's email/name from Clerk,
    and returns a standard custom JWT for the rest of the application.
    """
    clerk_sub = await clerk.verify_clerk_token(payload.clerk_token)
    
    # Fetch details from Clerk
    clerk_user_data = await clerk.get_clerk_user(clerk_sub)
    
    email = ""
    # Clerk users can have multiple emails; grab the primary one
    primary_email_id = clerk_user_data.get("primary_email_address_id")
    for email_obj in clerk_user_data.get("email_addresses", []):
        if email_obj.get("id") == primary_email_id:
            email = email_obj.get("email_address")
            break
            
    if not email:
        raise HTTPException(status_code=400, detail="Clerk user has no primary email")
        
    # See if user exists in our DB
    user = db.query(User).filter(User.email == email).first()
    
    if not user:
        # Create a new user (with a dummy secure password since they use Google/Clerk)
        name = clerk_user_data.get("first_name", "") or clerk_user_data.get("username", "") or email.split("@")[0]
        
        user = User(
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            name=name,
            gender="prefer_not_to_say",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
    # Generate our custom JWT
    token_data = {"sub": str(user.id), "tier": user.subscription_tier or "free"}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
def refresh_token(payload: TokenRefresh, db: Session = Depends(get_db)):
    data = decode_token(payload.refresh_token)
    if data.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = data.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Look up the user's current tier so a refresh never silently downgrades a
    # premium account back to "free" (create_access_token defaults tier to free).
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    token_data = {"sub": user_id, "tier": user.subscription_tier or "free"}
    access_token = create_access_token(token_data)
    refresh_token_new = create_refresh_token({"sub": user_id})
    return Token(access_token=access_token, refresh_token=refresh_token_new)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile fields (name, gender, preferred_language)."""
    if payload.name is not None:
        current_user.name = payload.name

    if payload.gender is not None:
        if payload.gender not in VALID_GENDERS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid gender value. Must be one of: {', '.join(VALID_GENDERS)}"
            )
        current_user.gender = payload.gender

    if payload.preferred_language is not None:
        current_user.preferred_language = payload.preferred_language

    db.commit()
    db.refresh(current_user)
    return current_user
