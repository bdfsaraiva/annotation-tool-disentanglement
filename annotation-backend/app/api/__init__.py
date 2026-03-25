"""
Public surface of the ``api`` sub-package.

This module re-exports every ``APIRouter`` defined across the child modules so
that ``main.py`` can import them with a single ``from .api import ...``
statement.  It also assembles a composite ``api_router`` that can be mounted
as a single unit — useful for testing or alternative deployment layouts.

Sub-modules:
- ``auth``            — login, token refresh, registration, /me
- ``admin``           — admin-only CRUD for users, projects, rooms, imports, IAA
- ``projects``        — annotator-facing project, room, message, completion routes
- ``annotations``     — per-message disentanglement annotation CRUD
- ``adjacency_pairs`` — adjacency-pair CRUD and CSV import
"""
from fastapi import APIRouter
from . import auth, admin, projects
from .annotations import message_annotation_router, project_annotation_router
from .adjacency_pairs import router as adjacency_pairs_router

# Composite router — mirrors the structure used in main.py; can be mounted
# wholesale in integration tests with a single ``app.include_router(api_router)``.
api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects", "chat rooms"])
api_router.include_router(message_annotation_router, tags=["annotations"])
api_router.include_router(project_annotation_router, tags=["annotations"])
api_router.include_router(adjacency_pairs_router, tags=["adjacency pairs"])

__all__ = [
    "auth", 
    "admin", 
    "projects", 
    "message_annotation_router",
    "project_annotation_router",
    "adjacency_pairs_router",
] 
