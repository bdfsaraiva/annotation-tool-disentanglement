"""
Authentication endpoints: login, token refresh, registration, and current-user lookup.

All endpoints in this module live under the ``/auth`` URL prefix.  The module
applies a shared ``RateLimiter`` instance to the token and refresh endpoints to
limit brute-force attempts on the credential flow.

Endpoints:
- ``POST /auth/token``   — exchange username/password for access + refresh tokens
- ``POST /auth/refresh`` — exchange a refresh token for a new token pair
- ``POST /auth/register`` — create a new user account
- ``GET  /auth/me``      — return the authenticated user's profile
"""
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

# Rate limiter shared by the login and refresh endpoints.  The window and
# request-count thresholds come from the application settings so they can be
# adjusted per environment without code changes.
auth_rate_limiter = RateLimiter(
    settings.AUTH_RATE_LIMIT_REQUESTS,
    settings.AUTH_RATE_LIMIT_WINDOW_SECONDS
)


class TokenResponse(Token):
    """
    Extended OAuth2 token response that adds a refresh token and expiry hint.

    Inherits ``access_token`` and ``token_type`` from the base ``Token`` schema.
    """

    refresh_token: str
    """Long-lived token that can be exchanged for a new access token."""
    expires_in: int
    """Access-token lifetime expressed in **seconds** (for client convenience)."""


@router.post("/token", response_model=TokenResponse)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
) -> TokenResponse:
    """
    Exchange username and password credentials for an access/refresh token pair.

    The endpoint is rate-limited to prevent brute-force attacks.  A deliberate
    generic error message ("Incorrect username or password") is returned whether
    the username does not exist or the password is wrong, to avoid user
    enumeration.

    Args:
        request: The raw HTTP request, used to extract the client IP for rate
            limiting.
        form_data: Standard OAuth2 password grant body (``username`` +
            ``password`` form fields).
        db: Database session injected by FastAPI.

    Returns:
        A ``TokenResponse`` containing a short-lived access token, a long-lived
        refresh token, and the access-token expiry in seconds.

    Raises:
        HTTPException: 429 if the rate limit is exceeded.
        HTTPException: 401 if the credentials are invalid.
    """
    enforce_rate_limit(request, auth_rate_limiter, scope="auth")

    user = db.query(User).filter(User.username == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Issue a short-lived access token using the configured expiry window.
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )

    # Issue a long-lived refresh token so the client can silently renew the
    # access token without prompting the user to log in again.
    refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_token = create_refresh_token(
        data={"sub": user.username},
        expires_delta=refresh_token_expires
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        # Convert minutes → seconds for the standard OAuth2 ``expires_in`` field.
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db)
) -> TokenResponse:
    """
    Exchange a valid refresh token for a new access/refresh token pair.

    The refresh token is validated (signature, expiry, and ``"type":"refresh"``
    claim) by the ``refresh_access_token`` helper before new tokens are issued.
    Both old tokens are discarded; the client should store the newly returned
    pair.

    Args:
        request: Raw HTTP request used for rate limiting.
        payload: JSON body containing the ``refresh_token`` string.
        db: Database session injected by FastAPI.

    Returns:
        A new ``TokenResponse`` with fresh access and refresh tokens.

    Raises:
        HTTPException: 429 if the rate limit is exceeded.
        HTTPException: 401 if the refresh token is invalid, expired, or of the
            wrong type.
    """
    enforce_rate_limit(request, auth_rate_limiter, scope="auth")
    token_data = await refresh_access_token(refresh_token=payload.refresh_token, db=db)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": token_data["sub"]},
        expires_delta=access_token_expires
    )

    refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    new_refresh_token = create_refresh_token(
        data={"sub": token_data["sub"]},
        expires_delta=refresh_token_expires
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/register", response_model=UserSchema)
async def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db)
) -> User:
    """
    Create a new user account.

    The password is validated against the configured policy before being hashed
    and stored.  Usernames must be unique across the platform.

    Args:
        user_data: ``UserCreate`` payload with ``username``, ``password``, and
            optional ``is_admin`` flag.
        db: Database session injected by FastAPI.

    Returns:
        The newly created ``User`` ORM object serialised as a ``UserSchema``.

    Raises:
        HTTPException: 400 if the username is already taken.
        HTTPException: 400 if the password does not meet the policy requirements.
        HTTPException: 500 if the database commit fails for an unexpected reason.
    """
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Validate policy before hashing so the error message is clear.
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
async def read_users_me(current_user: User = Depends(get_current_user)) -> User:
    """
    Return the profile of the currently authenticated user.

    Args:
        current_user: The authenticated ``User`` resolved from the Bearer token.

    Returns:
        The ``User`` ORM object serialised as a ``UserSchema``.
    """
    return current_user 
