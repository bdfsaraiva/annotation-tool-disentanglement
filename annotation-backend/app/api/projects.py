"""
Annotator-facing endpoints for projects, chat rooms, messages, completions, and read status.

All routes in this module are mounted under the ``/projects`` prefix and are
accessible to any authenticated user (admins or annotators), with access-control
logic applied inside each handler:

- **Project listing / detail** — admins see all; annotators see only assigned projects.
- **User assignment** — admin-only (enforced inline, not via a dependency).
- **Chat rooms / messages** — only accessible to users assigned to the parent project.
- **Annotations** — Pillar 1 isolation: annotators see their own annotations only;
  admins see all annotations for the room.
- **Completion** — per-annotator flag; GET returns a virtual ``is_completed=False``
  record if none exists rather than 404.
- **Read status** — per-annotator, per-message flags; GET returns the current map,
  PUT accepts a batch update.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy import select

from ..database import get_db
from ..models import User, Project, ProjectAssignment, ChatMessage, ChatRoom
from ..schemas import (
    Project as ProjectSchema,
    ProjectCreate,
    User as UserSchema,
    ProjectList,
    MessageList,
    ChatRoom as ChatRoomSchema,
    ChatMessage as ChatMessageSchema,
    Annotation as AnnotationSchema,
    ChatRoomCompletion as ChatRoomCompletionSchema,
    ChatRoomCompletionUpdate as ChatRoomCompletionUpdateSchema,
    MessageReadStatusBatchUpdate,
    MessageReadStatusResponse,
)
from ..auth import get_current_user, get_current_admin_user
from ..dependencies import verify_project_access
from .. import crud

router = APIRouter()

# Admin-only project creation is handled in api/admin.py; this router does not
# expose a creation endpoint to avoid duplication.

@router.get("/", response_model=ProjectList)
async def list_user_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> ProjectList:
    """
    Return a list of projects visible to the current user.

    Admins receive all projects.  Regular annotators receive only the projects
    to which they have been explicitly assigned via a ``ProjectAssignment`` row.

    Returns:
        A ``ProjectList`` wrapper containing the matching ``Project`` objects.

    Raises:
        HTTPException: 500 for unexpected database errors.
    """
    try:
        if current_user.is_admin:
            # Admins can see all projects
            projects = db.query(Project).all()
        else:
            # Regular users only see assigned projects
            projects = (
                db.query(Project)
                .join(ProjectAssignment)
                .filter(ProjectAssignment.user_id == current_user.id)
                .all()
            )
        
        return ProjectList(projects=projects)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list projects: {str(e)}"
        )

@router.get("/{project_id}", response_model=ProjectSchema)
async def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Project:
    """
    Retrieve a single project by its primary key.

    Access control is applied inline: non-admin users receive a 403 if they
    do not have a ``ProjectAssignment`` for the requested project.

    Args:
        project_id: Primary key of the project.

    Returns:
        The ``Project`` object.

    Raises:
        HTTPException: 404 if the project does not exist.
        HTTPException: 403 if the user is not assigned to the project.
        HTTPException: 500 for unexpected database errors.
    """
    try:
        # First check if project exists
        project = db.query(Project).filter(Project.id == project_id).first()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        # Check access
        if not current_user.is_admin:
            assignment = (
                db.query(ProjectAssignment)
                .filter(
                    ProjectAssignment.project_id == project_id,
                    ProjectAssignment.user_id == current_user.id
                )
                .first()
            )
            
            if not assignment:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to access this project"
                )
        
        return project
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project: {str(e)}"
        )

@router.post("/{project_id}/assign/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def assign_user_to_project(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> None:
    """
    Grant a user access to a project by creating a ``ProjectAssignment`` row.

    This operation is idempotent: if the user is already assigned, the endpoint
    returns 204 without raising an error.

    Args:
        project_id: Primary key of the target project.
        user_id: Primary key of the user to assign.
        current_user: Authenticated user making the request.

    Raises:
        HTTPException: 403 if the requesting user is not an admin.
        HTTPException: 404 if the project or user does not exist.
        HTTPException: 500 for unexpected database errors.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can assign users to projects"
        )
    
    try:
        # Check if project exists
        project = db.query(Project).filter(Project.id == project_id).first()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        # Check if user exists
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Check if assignment already exists
        assignment = (
            db.query(ProjectAssignment)
            .filter(
                ProjectAssignment.project_id == project_id,
                ProjectAssignment.user_id == user_id
            )
            .first()
        )
        
        if assignment:
            return  # Already assigned
        
        # Create assignment
        assignment = ProjectAssignment(project_id=project_id, user_id=user_id)
        db.add(assignment)
        db.commit()
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign user to project: {str(e)}"
        )

@router.delete("/{project_id}/assign/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user_from_project(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> None:
    """
    Revoke a user's access to a project by deleting their ``ProjectAssignment``.

    If the user is not currently assigned the request is silently ignored (no
    error is raised) so DELETE is safe to call idempotently.

    Args:
        project_id: Primary key of the project.
        user_id: Primary key of the user to unassign.
        current_user: Authenticated user making the request.

    Raises:
        HTTPException: 403 if the requesting user is not an admin.
        HTTPException: 500 for unexpected database errors.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can remove users from projects"
        )
    
    try:
        # Find assignment
        assignment = (
            db.query(ProjectAssignment)
            .filter(
                ProjectAssignment.project_id == project_id,
                ProjectAssignment.user_id == user_id
            )
            .first()
        )
        
        if assignment:
            db.delete(assignment)
            db.commit()
            
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove user from project: {str(e)}"
        )

@router.get("/{project_id}/users", response_model=List[UserSchema])
async def get_project_users(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[User]:
    """
    Return all users assigned to a project.

    Both admins and project members can call this endpoint, but non-members
    receive a 403.

    Args:
        project_id: Primary key of the project.

    Returns:
        List of ``User`` objects for every annotator assigned to the project.

    Raises:
        HTTPException: 404 if the project does not exist.
        HTTPException: 403 if the user is not assigned to the project.
        HTTPException: 500 for unexpected database errors.
    """
    try:
        # First check if project exists and user has access
        project = db.query(Project).filter(Project.id == project_id).first()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        # Check access if not admin
        if not current_user.is_admin:
            assignment = (
                db.query(ProjectAssignment)
                .filter(
                    ProjectAssignment.project_id == project_id,
                    ProjectAssignment.user_id == current_user.id
                )
                .first()
            )
            
            if not assignment:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to access this project"
                )
        
        # Get all users assigned to the project
        users = (
            db.query(User)
            .join(ProjectAssignment)
            .filter(ProjectAssignment.project_id == project_id)
            .all()
        )
        
        return users
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project users: {str(e)}"
        )

# === Chat Room and Message Endpoints (Moved from chat.py) ===

# Note: Using the existing 'router' instance from projects.py
# The prefix from chat.py was /projects/{project_id}/chat-rooms

@router.get("/{project_id}/chat-rooms", response_model=List[ChatRoomSchema], tags=["chat rooms"])
def get_project_chat_rooms(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[ChatRoom]:
    """
    Return all chat rooms in a project.

    Access is verified by checking whether the user is assigned to the project.
    The 404/403 distinction is preserved: if the project does not exist the
    response is 404; if it exists but the user has no assignment the response
    is 403.

    Args:
        project_id: Primary key of the project.

    Returns:
        List of ``ChatRoom`` objects belonging to the project.

    Raises:
        HTTPException: 404 if the project does not exist.
        HTTPException: 403 if the user is not assigned to the project.
    """
    # Filter by assignment for non-admin users in a single query to avoid a
    # separate lookup for the common (authorised) case.
    project_query = db.query(Project).filter(Project.id == project_id)
    if not current_user.is_admin:
        project_query = project_query.filter(Project.assignments.any(user_id=current_user.id))

    project = project_query.first()

    if not project:
        # Re-check existence without access constraint to return 404 vs 403.
        project_exists = db.query(Project.id).filter(Project.id == project_id).first()
        if not project_exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this project")

    # Get all chat rooms in the project
    chat_rooms = db.query(ChatRoom).filter(
        ChatRoom.project_id == project_id
    ).all()
    
    return chat_rooms

@router.get("/{project_id}/chat-rooms/{room_id}", response_model=ChatRoomSchema, tags=["chat rooms"])
def get_chat_room(
    project_id: int,
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> ChatRoom:
    """
    Retrieve a single chat room by ID within a project.

    The chat room is validated to belong to the specified project (preventing
    cross-project access via URL manipulation).

    Args:
        project_id: Primary key of the parent project.
        room_id: Primary key of the chat room.

    Returns:
        The ``ChatRoom`` object.

    Raises:
        HTTPException: 404 if the project or chat room does not exist in the
            expected project scope.
        HTTPException: 403 if the user is not assigned to the project.
    """
    project_query = db.query(Project).filter(Project.id == project_id)
    if not current_user.is_admin:
        project_query = project_query.filter(Project.assignments.any(user_id=current_user.id))
    
    project = project_query.first()

    if not project:
        project_exists = db.query(Project.id).filter(Project.id == project_id).first()
        if not project_exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this project")

    # Get the chat room
    chat_room = db.query(ChatRoom).filter(
        ChatRoom.id == room_id,
        ChatRoom.project_id == project_id # Ensure room belongs to the specified project path
    ).first()
    
    if not chat_room:
        raise HTTPException(status_code=404, detail=f"Chat room with id {room_id} not found in project {project_id}")
    
    return chat_room

@router.get("/{project_id}/chat-rooms/{room_id}/messages", response_model=MessageList, tags=["chat rooms"])
def get_chat_messages(
    project_id: int,
    room_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> MessageList:
    """
    Return a paginated list of messages from a chat room.

    Messages are ordered by their database ID (which preserves import order).
    The ``total`` field in the response allows the client to implement
    cursor-based pagination without an additional count request.

    Args:
        project_id: Primary key of the parent project.
        room_id: Primary key of the chat room.
        skip: Number of messages to skip (offset for pagination).
        limit: Maximum number of messages to return per page.

    Returns:
        ``MessageList`` with ``messages`` and ``total`` fields.

    Raises:
        HTTPException: 404 if the project or chat room does not exist.
        HTTPException: 403 if the user is not assigned to the project.
    """
    project_query = db.query(Project).filter(Project.id == project_id)
    if not current_user.is_admin:
        project_query = project_query.filter(Project.assignments.any(user_id=current_user.id))
    
    project = project_query.first()

    if not project:
        project_exists = db.query(Project.id).filter(Project.id == project_id).first()
        if not project_exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this project")

    # Get the chat room (verify it belongs to the project)
    chat_room = db.query(ChatRoom.id).filter(
        ChatRoom.id == room_id,
        ChatRoom.project_id == project_id
    ).first()
    
    if not chat_room:
        raise HTTPException(status_code=404, detail=f"Chat room with id {room_id} not found in project {project_id}")
    
    # Get messages from the specific chat room
    base_query = db.query(ChatMessage).filter(
        ChatMessage.chat_room_id == room_id
    )
    total = base_query.count()
    messages = base_query.order_by(ChatMessage.id).offset(skip).limit(limit).all()
    
    return MessageList(messages=messages, total=total)

@router.get("/{project_id}/chat-rooms/{room_id}/annotations", response_model=List[AnnotationSchema], tags=["annotations"])
def get_chat_room_annotations(
    project_id: int,
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
) -> List[dict]:
    """
    Return disentanglement annotations for a chat room.

    **Annotation isolation (Pillar 1)**: regular annotators receive only their
    own annotations so they cannot be influenced by peers' decisions.  Admins
    receive all annotations for every annotator in the room.

    The ``verify_project_access`` dependency enforces that the user is assigned
    to the project before any annotation data is returned.

    Args:
        project_id: Primary key of the parent project.
        room_id: Primary key of the chat room.

    Returns:
        A list of ``Annotation`` dicts (including ``annotator_username``,
        which is joined from the ``users`` table).

    Raises:
        HTTPException: 404 if the chat room does not belong to this project.
        HTTPException: 403 if the user is not assigned to the project
            (raised by ``verify_project_access``).
    """
    # verify_project_access already checked assignment; confirm the room is
    # actually in this project to guard against cross-project path manipulation.
    chat_room = db.query(ChatRoom).filter(
        ChatRoom.id == room_id,
        ChatRoom.project_id == project_id
    ).first()

    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found in this project"
        )

    if current_user.is_admin:
        annotations_data = crud.get_all_annotations_for_chat_room_admin(db, chat_room_id=room_id)
    else:
        # Annotators can only see their own annotations.
        annotations_data = crud.get_annotations_for_chat_room_by_annotator(
            db, chat_room_id=room_id, annotator_id=current_user.id
        )

    # The CRUD functions return (Annotation, annotator_username) tuples; merge
    # the username into the dict representation expected by the response schema.
    result = []
    for annotation, annotator_username in annotations_data:
        annotation_dict = annotation.__dict__
        annotation_dict['annotator_username'] = annotator_username
        result.append(annotation_dict)

    return result

@router.get(
    "/{project_id}/chat-rooms/{room_id}/completion",
    response_model=ChatRoomCompletionSchema,
    tags=["chat rooms"]
)
def get_chat_room_completion(
    project_id: int,
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
) -> ChatRoomCompletionSchema:
    """
    Return the current annotator's completion flag for a chat room.

    If the annotator has never explicitly set a completion flag, a virtual
    record with ``is_completed=False`` is returned rather than a 404, so the
    client always receives a valid response shape.

    Args:
        project_id: Primary key of the parent project.
        room_id: Primary key of the chat room.

    Returns:
        ``ChatRoomCompletion`` with the annotator's current flag value.

    Raises:
        HTTPException: 404 if the room does not belong to the project.
    """
    chat_room = db.query(ChatRoom).filter(
        ChatRoom.id == room_id,
        ChatRoom.project_id == project_id
    ).first()
    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found in this project"
        )

    completion = crud.get_chat_room_completion(db, room_id, current_user.id)
    if completion:
        return completion

    return ChatRoomCompletionSchema(
        chat_room_id=room_id,
        annotator_id=current_user.id,
        project_id=project_id,
        is_completed=False,
        updated_at=None
    )

@router.put(
    "/{project_id}/chat-rooms/{room_id}/completion",
    response_model=ChatRoomCompletionSchema,
    tags=["chat rooms"]
)
def update_chat_room_completion(
    project_id: int,
    room_id: int,
    payload: ChatRoomCompletionUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
) -> ChatRoomCompletionSchema:
    """
    Set or clear the current annotator's completion flag for a chat room.

    The underlying CRUD function performs an upsert: the row is created on the
    first call and updated on subsequent calls, so this endpoint is idempotent.

    Args:
        project_id: Primary key of the parent project.
        room_id: Primary key of the chat room.
        payload: ``ChatRoomCompletionUpdate`` body with ``is_completed`` bool.

    Returns:
        The updated ``ChatRoomCompletion`` record.

    Raises:
        HTTPException: 404 if the room does not belong to the project.
    """
    chat_room = db.query(ChatRoom).filter(
        ChatRoom.id == room_id,
        ChatRoom.project_id == project_id
    ).first()
    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found in this project"
        )

    completion = crud.upsert_chat_room_completion(
        db=db,
        chat_room_id=room_id,
        project_id=project_id,
        annotator_id=current_user.id,
        is_completed=payload.is_completed
    )
    return completion


@router.get(
    "/{project_id}/chat-rooms/{room_id}/read-status",
    response_model=List[MessageReadStatusResponse],
    tags=["chat rooms"]
)
def get_read_status(
    project_id: int,
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
) -> List[MessageReadStatusResponse]:
    """
    Return the current annotator's read/unread flags for all messages in a room.

    Only messages that have been explicitly flagged are returned; messages with
    no flag row are implicitly ``is_read=False`` on the client.

    Args:
        project_id: Primary key of the parent project.
        room_id: Primary key of the chat room.

    Returns:
        List of ``MessageReadStatusResponse`` objects (one per flagged message).

    Raises:
        HTTPException: 404 if the chat room does not belong to the project.
    """
    chat_room = db.query(ChatRoom).filter(
        ChatRoom.id == room_id,
        ChatRoom.project_id == project_id
    ).first()
    if not chat_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat room not found")
    status_map = crud.get_read_status_for_room(db, room_id, current_user.id)
    return [
        MessageReadStatusResponse(message_id=mid, is_read=is_read)
        for mid, is_read in status_map.items()
    ]


@router.put(
    "/{project_id}/chat-rooms/{room_id}/read-status",
    status_code=204,
    tags=["chat rooms"]
)
def update_read_status(
    project_id: int,
    room_id: int,
    payload: MessageReadStatusBatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
) -> None:
    """
    Batch-update read/unread flags for multiple messages in a single request.

    Each item in ``payload.statuses`` specifies a ``message_id`` and its new
    ``is_read`` value.  The underlying CRUD function performs upserts, so
    calling this endpoint is always safe regardless of whether a flag row
    already exists.

    Args:
        project_id: Primary key of the parent project.
        room_id: Primary key of the chat room.
        payload: ``MessageReadStatusBatchUpdate`` body with a list of
            ``{message_id, is_read}`` items.

    Returns:
        204 No Content on success.

    Raises:
        HTTPException: 404 if the chat room does not belong to the project.
    """
    chat_room = db.query(ChatRoom).filter(
        ChatRoom.id == room_id,
        ChatRoom.project_id == project_id
    ).first()
    if not chat_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat room not found")
    crud.batch_upsert_read_status(
        db=db,
        room_id=room_id,
        project_id=project_id,
        annotator_id=current_user.id,
        statuses=[{"message_id": s.message_id, "is_read": s.is_read} for s in payload.statuses],
    )
    return None
