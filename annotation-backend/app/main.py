"""
Application entry point for the LACE annotation platform.

Responsibilities:
- Instantiate the ``FastAPI`` application with title, description, and version
  metadata (exposed in the auto-generated OpenAPI / Swagger docs).
- Register all ``APIRouter`` sub-modules under their URL prefixes and tags.
- Configure Cross-Origin Resource Sharing (CORS) using the list of allowed
  origins from ``Settings.CORS_ORIGINS``.
- Provide the ``startup_event`` hook that seeds the database with the first
  admin account when the server boots for the first time.

Database schema migrations are handled externally by **Alembic** and are *not*
driven by ``Base.metadata.create_all``; that call is intentionally absent here.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import uvicorn
from sqlalchemy import select

from .config import get_settings
from .database import engine, Base, SessionLocal
from .models import User
from .api import auth, admin, projects, message_annotation_router, project_annotation_router
from .api.adjacency_pairs import router as adjacency_pairs_router
from .auth import get_password_hash, validate_password_strength

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

settings = get_settings()


def create_first_admin() -> None:
    """
    Seed the database with the initial admin user on first boot.

    Reads ``FIRST_ADMIN_USERNAME`` and ``FIRST_ADMIN_PASSWORD`` from the
    application settings (populated via environment variables or ``.env``).
    If either value is empty the function logs a warning and returns without
    doing anything — this allows the server to start in environments that
    manage admin accounts externally.

    The password is validated against the configured policy before being
    hashed; if it fails, the error is logged and re-raised so the server
    start-up fails loudly rather than silently skipping admin creation.

    This function is idempotent: if a user with the configured username
    already exists, no changes are made.

    Raises:
        ValueError: If the configured password does not satisfy the policy.
        Exception: Re-raises any unexpected database errors after rolling back
            the transaction.
    """
    if not settings.FIRST_ADMIN_USERNAME or not settings.FIRST_ADMIN_PASSWORD:
        logger.warning("First admin credentials not configured; skipping creation.")
        return
    db = SessionLocal()
    try:
        # Skip creation if the admin user already exists (idempotent boot).
        admin = db.query(User).filter(User.username == settings.FIRST_ADMIN_USERNAME).first()
        if not admin:
            # Validate before hashing so a misconfigured password fails fast.
            try:
                validate_password_strength(settings.FIRST_ADMIN_PASSWORD)
            except ValueError as e:
                logger.error(f"First admin password invalid: {e}")
                raise
            hashed_password = get_password_hash(settings.FIRST_ADMIN_PASSWORD)
            admin = User(
                username=settings.FIRST_ADMIN_USERNAME,
                hashed_password=hashed_password,
                is_admin=True
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
    except Exception as e:
        logger.error(f"Error creating first admin: {e}")
        db.rollback()
        raise
    finally:
        db.close()


app = FastAPI(
    title="LACE — Labelling Adjacency and Conversation Entanglement",
    description="Backend API for LACE, a multi-annotator platform for chat disentanglement and adjacency pair annotation.",
    version="1.0.0"
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# CORS is required so the React SPA (served from a different origin during
# development, and potentially a different subdomain in production) can call
# the API without browser same-origin policy blocking the requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,  # Needed for cookie-based flows; harmless with Bearer tokens.
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Router registration
# ---------------------------------------------------------------------------

# Each router is mounted at its canonical prefix and assigned a tag that
# groups related endpoints together in the Swagger UI.
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
# The annotation routers are registered without an extra prefix because their
# route paths already include the full hierarchy
# (e.g. /projects/{project_id}/rooms/{room_id}/messages/{msg_id}/annotation).
app.include_router(message_annotation_router, tags=["annotations"])
app.include_router(project_annotation_router, tags=["annotations"])
app.include_router(adjacency_pairs_router)


@app.on_event("startup")
def startup_event() -> None:
    """
    FastAPI startup hook: seed the first admin account.

    Called automatically by FastAPI once before the server begins accepting
    requests.  Schema creation / migration is intentionally left to Alembic
    and is *not* triggered here.
    """
    create_first_admin()


@app.get("/")
def root() -> dict:
    """
    Health-check / discovery endpoint.

    Returns:
        A dict with the API name, version string, and a pointer to the
        interactive Swagger documentation URL.
    """
    return {
        "name": "Annotation Tool Backend",
        "version": "1.0.0",
        "docs_url": "/docs",
        # "redoc_url": "/redoc"
    }


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
