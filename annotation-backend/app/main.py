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


def create_first_admin():
    """Create the first admin user if it doesn't exist."""
    if not settings.FIRST_ADMIN_USERNAME or not settings.FIRST_ADMIN_PASSWORD:
        logger.warning("First admin credentials not configured; skipping creation.")
        return
    db = SessionLocal()
    try:
        # Check if admin exists
        admin = db.query(User).filter(User.username == settings.FIRST_ADMIN_USERNAME).first()
        if not admin:
            # Create admin user
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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(message_annotation_router, tags=["annotations"])
app.include_router(project_annotation_router, tags=["annotations"])
app.include_router(adjacency_pairs_router)


@app.on_event("startup")
def startup_event():
    """Create first admin on startup. Schema is managed by Alembic migrations."""
    create_first_admin()


@app.get("/")
def root():
    """Root endpoint that returns API information."""
    return {
        "name": "Annotation Tool Backend",
        "version": "1.0.0",
        "docs_url": "/docs",
        # "redoc_url": "/redoc"
    }


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
