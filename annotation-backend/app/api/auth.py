from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from ..database import get_db
from ..models import User
from ..schemas import Token, UserCreate, User as UserSchema, RefreshTokenRequest
from ..auth import (
    verify_password,
    create_access_token,
    create_refresh_token,
    get_password_hash,
    get_current_user,
    refresh_access_token,
    validate_password_strength,
)
from ..config import get_settings
from ..utils.rate_limit import RateLimiter, enforce_rate_limit

settings = get_settings()
router = APIRouter()
auth_rate_limiter = RateLimiter(
    settings.AUTH_RATE_LIMIT_REQUESTS,
    settings.AUTH_RATE_LIMIT_WINDOW_SECONDS
)

class TokenResponse(Token):
    refresh_token: str
    expires_in: int

@router.post("/token", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    request: Request
):
    enforce_rate_limit(request, auth_rate_limiter, scope="auth")
    # Find user by username
    user = db.query(User).filter(User.username == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    
    # Create refresh token
    refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_token = create_refresh_token(
        data={"sub": user.username},
        expires_delta=refresh_token_expires
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
    request: Request
):
    enforce_rate_limit(request, auth_rate_limiter, scope="auth")
    token_data = await refresh_access_token(refresh_token=payload.refresh_token, db=db)
    # Create new access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": token_data["sub"]},
        expires_delta=access_token_expires
    )
    
    # Create new refresh token
    refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_token = create_refresh_token(
        data={"sub": token_data["sub"]},
        expires_delta=refresh_token_expires
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

@router.post("/register", response_model=UserSchema)
async def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    # Check if user already exists
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Create new user
    try:
        validate_password_strength(user_data.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        hashed_password=hashed_password,
        is_admin=user_data.is_admin
    )
    
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}"
        )

@router.get("/me", response_model=UserSchema)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user 
