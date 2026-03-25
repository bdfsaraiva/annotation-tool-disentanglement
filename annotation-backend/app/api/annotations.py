"""
Disentanglement annotation endpoints.

This module defines two ``APIRouter`` instances that are registered separately
in ``main.py`` (and ``api/__init__.py``):

- **message_annotation_router** — CRUD for a single message's annotations.
  Prefix: ``/projects/{project_id}/messages/{message_id}/annotations``

- **project_annotation_router** — project-level helpers (e.g. "my annotations").
  Prefix: ``/projects/{project_id}/annotations``

Annotation isolation (Pillar 1) is enforced in every GET handler: annotators
receive only their own annotations; admins receive all annotations for the scope.

Ownership checks on DELETE prevent annotators from deleting peers' annotations;
admins may delete any annotation.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from ..database import get_db
from ..auth import get_current_user
from ..dependencies import verify_project_access
from ..models import User, Annotation, ChatMessage, Project, ProjectAssignment, ChatRoom
from ..schemas import Annotation as AnnotationSchema, AnnotationCreate, AnnotationList

# CRUD routes scoped to a single message.
message_annotation_router = APIRouter(
    prefix="/projects/{project_id}/messages/{message_id}/annotations",
    tags=["annotations"]
)

# Aggregate routes at the project level (e.g., "fetch all my annotations").
project_annotation_router = APIRouter(
    prefix="/projects/{project_id}/annotations",
    tags=["annotations"]
)

@project_annotation_router.get("/my")
def get_my_annotations(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
) -> List[dict]:
    """
    Return all disentanglement annotations made by the current user in a project.

    Results are enriched with chat-room and message context (name, turn ID, and
    a truncated message preview) so the caller does not need additional requests
    to display a useful summary.

    Args:
        project_id: Primary key of the project to query.

    Returns:
        A list of annotation dicts, each augmented with ``chat_room_id``,
        ``chat_room_name``, ``message_turn_id``, and ``message_text`` (truncated
        to 100 characters if longer).

    Raises:
        HTTPException: 403 if the user is not assigned to the project.
    """
    # Join in one query to avoid N+1 lookups for room/message context.
    annotations = db.query(
        Annotation,
        User.username.label('annotator_username'),
        ChatRoom.id.label('chat_room_id'),
        ChatRoom.name.label('chat_room_name'),
        ChatMessage.turn_id.label('message_turn_id'),
        ChatMessage.turn_text.label('message_text')
    ).join(
        User, Annotation.annotator_id == User.id
    ).join(
        ChatMessage, Annotation.message_id == ChatMessage.id
    ).join(
        ChatRoom, ChatMessage.chat_room_id == ChatRoom.id
    ).filter(
        Annotation.project_id == project_id,
        Annotation.annotator_id == current_user.id
    ).order_by(ChatRoom.name, Annotation.created_at).all()
    
    result = []
    for annotation, annotator_username, chat_room_id, chat_room_name, message_turn_id, message_text in annotations:
        annotation_dict = annotation.__dict__.copy()
        # Remove the SQLAlchemy instance state marker before returning.
        annotation_dict.pop('_sa_instance_state', None)

        annotation_dict['annotator_username'] = annotator_username
        annotation_dict['chat_room_id'] = chat_room_id
        annotation_dict['chat_room_name'] = chat_room_name
        annotation_dict['message_turn_id'] = message_turn_id
        # Truncate long messages to keep the response payload small.
        annotation_dict['message_text'] = (
            message_text[:100] + "..." if len(message_text) > 100 else message_text
        )

        result.append(annotation_dict)

    return result

@message_annotation_router.get("/", response_model=List[AnnotationSchema])
def get_message_annotations(
    project_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
) -> List[dict]:
    """
    Return all annotations for a single message.

    **Annotation isolation (Pillar 1)**: regular annotators receive only their
    own annotation for the message; admins receive all annotators' annotations.

    Args:
        project_id: Primary key of the project (used to validate ownership of
            the message via its parent chat room).
        message_id: Primary key of the message.

    Returns:
        List of annotation dicts including ``annotator_username``.

    Raises:
        HTTPException: 404 if the message does not belong to the project.
        HTTPException: 403 if the user is not assigned to the project.
    """
    message = db.query(ChatMessage).filter(
        ChatMessage.id == message_id,
        ChatMessage.chat_room.has(project_id=project_id)
    ).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    query = db.query(
        Annotation,
        User.username.label('annotator_username')
    ).join(
        User, Annotation.annotator_id == User.id
    ).filter(
        Annotation.message_id == message_id
    )

    # Apply isolation filter for non-admin users.
    if not current_user.is_admin:
        query = query.filter(Annotation.annotator_id == current_user.id)

    annotations = query.all()

    result = []
    for annotation, annotator_username in annotations:
        annotation_dict = annotation.__dict__
        annotation_dict['annotator_username'] = annotator_username
        result.append(annotation_dict)

    return result

@message_annotation_router.post("/", response_model=AnnotationSchema)
def create_annotation(
    project_id: int,
    message_id: int,
    annotation: AnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
) -> dict:
    """
    Create a disentanglement annotation (thread assignment) for a message.

    The unique constraint ``(message_id, annotator_id)`` allows at most one
    annotation per message per annotator.  Attempting to annotate a message
    twice returns a 400 rather than overwriting the existing annotation; the
    client should use a PUT/PATCH workflow instead.

    Args:
        project_id: Primary key of the parent project.
        message_id: Primary key of the message to annotate.
        annotation: ``AnnotationCreate`` body with the ``thread_id`` label.

    Returns:
        The newly created annotation dict including ``annotator_username``.

    Raises:
        HTTPException: 404 if the message does not belong to the project.
        HTTPException: 400 if the current user has already annotated this message.
        HTTPException: 403 if the user is not assigned to the project.
    """
    message = db.query(ChatMessage).filter(
        ChatMessage.id == message_id,
        ChatMessage.chat_room.has(project_id=project_id)
    ).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Enforce the one-annotation-per-message-per-annotator constraint early
    # to return a helpful error before hitting the database unique constraint.
    existing_annotation = db.query(Annotation).filter(
        Annotation.message_id == message_id,
        Annotation.annotator_id == current_user.id
    ).first()

    if existing_annotation:
        raise HTTPException(
            status_code=400,
            detail="You have already annotated this message"
        )

    db_annotation = Annotation(
        message_id=message_id,
        annotator_id=current_user.id,
        project_id=project_id,
        thread_id=annotation.thread_id,
        created_at=datetime.utcnow()
    )

    db.add(db_annotation)
    db.commit()
    db.refresh(db_annotation)

    # Attach the username so the response matches the AnnotationSchema shape
    # (which includes annotator_username as a computed field).
    annotation_dict = db_annotation.__dict__
    annotation_dict['annotator_username'] = current_user.username

    return annotation_dict

@message_annotation_router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_annotation(
    project_id: int,
    message_id: int,
    annotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
) -> None:
    """
    Delete a disentanglement annotation.

    An annotator can only delete their own annotations.  Admins can delete any
    annotation within a project they have access to.

    Args:
        project_id: Primary key of the parent project.
        message_id: Primary key of the annotated message.
        annotation_id: Primary key of the annotation to delete.

    Returns:
        204 No Content on success.

    Raises:
        HTTPException: 404 if the message does not belong to the project or the
            annotation does not exist.
        HTTPException: 403 if the user is not assigned to the project, or is a
            non-admin trying to delete another annotator's annotation.
    """
    message = db.query(ChatMessage).filter(
        ChatMessage.id == message_id,
        ChatMessage.chat_room.has(project_id=project_id)
    ).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    annotation = db.query(Annotation).filter(
        Annotation.id == annotation_id,
        Annotation.message_id == message_id,
        Annotation.project_id == project_id
    ).first()

    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    # Ownership check: annotators may only delete their own annotations.
    if annotation.annotator_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to delete this annotation"
        )

    db.delete(annotation)
    db.commit()

    return None
