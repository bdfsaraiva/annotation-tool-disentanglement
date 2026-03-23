from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.orm import Session, aliased
from typing import List, Optional
import io
import os
import json
from datetime import datetime

from .. import crud, models, schemas
from ..dependencies import get_db
from ..auth import get_current_admin_user, get_password_hash, validate_password_strength
from ..config import get_settings
from ..utils.csv_utils import (
    import_chat_messages,
    validate_csv_format,
    import_annotations_from_csv,
    validate_annotations_csv_format,
    preview_chat_messages,
    preview_annotations_from_csv,
)
from ..utils.filename_utils import sanitize_filename
from ..utils.upload_limits import enforce_max_upload_size, enforce_max_rows
from fastapi.responses import Response, JSONResponse
import zipfile

router = APIRouter()
settings = get_settings()

@router.get("/users", response_model=List[schemas.User])
async def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """List all users (admin only)"""
    return crud.get_users(db)

@router.post("/users", response_model=schemas.User)
async def create_user(
    user_data: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Create a new user (admin only)"""
    # Check if user exists
    existing_user = crud.get_user_by_username(db, user_data.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Create user with hashed password
    try:
        validate_password_strength(user_data.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    hashed_password = get_password_hash(user_data.password)
    new_user = crud.create_user(db, user_data, hashed_password)
    return new_user

@router.put("/users/{user_id}", response_model=schemas.User)
async def update_user(
    user_id: int,
    updates: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Update a user (admin only)"""
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if updates.username:
        existing_user = crud.get_user_by_username(db, updates.username)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already registered"
            )

    hashed_password = None
    if updates.password:
        try:
            validate_password_strength(updates.password)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        hashed_password = get_password_hash(updates.password)

    updated_user = crud.update_user(db, user, updates, hashed_password)
    return updated_user

@router.get("/projects", response_model=List[schemas.Project])
async def list_all_projects(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """List all projects (admin only)"""
    return crud.get_projects(db)

@router.post("/projects", response_model=schemas.Project)
async def create_project(
    project_data: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Create a new project (admin only)"""
    if project_data.annotation_type == "adjacency_pairs" and not project_data.relation_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Adjacency pair projects must define at least one relation type"
        )
    return crud.create_project(db, project_data)

@router.get("/projects/{project_id}", response_model=schemas.Project)
async def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Get a specific project (admin only)"""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return project

@router.put("/projects/{project_id}", response_model=schemas.Project)
async def update_project(
    project_id: int,
    updates: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Update project metadata (admin only)"""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    if updates.relation_types is not None:
        target_annotation_type = updates.annotation_type or project.annotation_type
        if target_annotation_type == "adjacency_pairs" and not updates.relation_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Adjacency pair projects must define at least one relation type"
            )
    return crud.update_project(db, project, updates)

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    """Delete a user (admin only)"""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    crud.delete_user(db, user)

@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Delete a project (admin only)"""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    crud.delete_project(db, project)

@router.post("/projects/{project_id}/import-chat-room-csv/preview", response_model=schemas.CSVPreviewResponse)
async def preview_chat_room_csv(
    project_id: int,
    file: UploadFile = File(...),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Preview a CSV file before importing a chat room (admin only)."""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV and have a filename"
        )

    safe_filename = sanitize_filename(os.path.basename(file.filename))
    temp_file_path = f"uploads/preview_{safe_filename}"
    try:
        contents = await file.read()
        enforce_max_upload_size(len(contents), settings.MAX_UPLOAD_MB, "CSV upload")
        os.makedirs("uploads", exist_ok=True)
        with open(temp_file_path, "wb") as f:
            f.write(contents)

        validate_csv_format(temp_file_path)
        total_rows, preview_rows, warnings = preview_chat_messages(temp_file_path, limit)
        enforce_max_rows(total_rows, settings.MAX_IMPORT_ROWS, "CSV messages")

        return schemas.CSVPreviewResponse(
            total_rows=total_rows,
            preview_rows=preview_rows,
            warnings=warnings
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing CSV file: {str(e)}"
        )
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@router.post("/projects/{project_id}/import-chat-room-csv", response_model=schemas.ChatRoomImportResponse)
async def create_chat_room_and_import_csv(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Create a new chat room from a CSV filename and import its content (admin only)"""
    # Check project exists
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV and have a filename"
        )

    # Save uploaded file temporarily
    safe_filename = sanitize_filename(os.path.basename(file.filename))
    temp_file_path = f"uploads/{safe_filename}"
    new_chat_room = None
    try:
        contents = await file.read()
        enforce_max_upload_size(len(contents), settings.MAX_UPLOAD_MB, "CSV upload")
        os.makedirs("uploads", exist_ok=True)
        with open(temp_file_path, "wb") as f:
            f.write(contents)
        
        # Validate CSV format first
        validate_csv_format(temp_file_path)
        
        # Import messages using our simple utility
        messages = import_chat_messages(temp_file_path)
        enforce_max_rows(len(messages), settings.MAX_IMPORT_ROWS, "CSV messages")
        existing_turns = {m["turn_id"] for m in messages if m.get("turn_id")}

        # Create chat room using filename (remove extension)
        chat_room_name = os.path.splitext(file.filename)[0]
        chat_room_create_schema = schemas.ChatRoomCreate(name=chat_room_name, project_id=project_id)
        new_chat_room = crud.create_chat_room(db, chat_room=chat_room_create_schema)
        
        # Import messages to database
        imported_count = 0
        skipped_count = 0
        errors = []
        warnings = []
        
        for message in messages:
            try:
                # Create message schema
                message_schema = schemas.ChatMessageCreate(
                    turn_id=message['turn_id'],
                    user_id=message['user_id'],
                    turn_text=message['turn_text'],
                    reply_to_turn=message.get('reply_to_turn')
                )
                
                # Check for existing message
                existing = crud.get_chat_message_by_turn_id(db, new_chat_room.id, message['turn_id'])
                if existing:
                    skipped_count += 1
                    warnings.append(f"Message with turn_id {message['turn_id']} already exists")
                    continue
                
                # Validate reply_to_turn if present
                reply_to_turn = message.get('reply_to_turn')
                if reply_to_turn and reply_to_turn not in existing_turns:
                    warnings.append(
                        f"Message {message['turn_id']} references missing reply_to_turn {reply_to_turn}; cleared."
                    )
                    message_schema.reply_to_turn = None
                
                # Create message
                crud.create_chat_message(db, message=message_schema, chat_room_id=new_chat_room.id)
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Error importing message {message.get('turn_id', 'unknown')}: {str(e)}")
                skipped_count += 1
        
        # Commit all changes
        db.commit()
        
        return schemas.ChatRoomImportResponse(
            chat_room=new_chat_room,
            import_details=schemas.CSVImportResponse(
                total_messages=len(messages),
                imported_count=imported_count,
                skipped_count=skipped_count,
                errors=errors,
                warnings=warnings
            )
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        if new_chat_room is not None:
            try:
                db.delete(new_chat_room)
                db.commit()
            except Exception:
                db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing CSV file: {str(e)}"
        )
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@router.put("/chat-rooms/{chat_room_id}", response_model=schemas.ChatRoom)
async def update_chat_room(
    chat_room_id: int,
    updates: schemas.ChatRoomUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Update a chat room (admin only)."""
    chat_room = crud.get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found"
        )
    if updates.name is not None:
        existing = db.query(models.ChatRoom).filter(
            models.ChatRoom.project_id == chat_room.project_id,
            models.ChatRoom.name == updates.name,
            models.ChatRoom.id != chat_room_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chat room name already exists in this project"
            )
    return crud.update_chat_room(db, chat_room, updates)

@router.delete("/chat-rooms/{chat_room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_room(
    chat_room_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Delete a chat room (admin only)."""
    chat_room = crud.get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found"
        )
    crud.delete_chat_room(db, chat_room)

@router.get(
    "/chat-rooms/{chat_room_id}/completion-summary",
    response_model=schemas.ChatRoomCompletionSummary
)
async def get_chat_room_completion_summary(
    chat_room_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Get manual completion summary for a chat room (admin only)."""
    return crud.get_chat_room_completion_summary(db, chat_room_id)

@router.get(
    "/chat-rooms/{chat_room_id}/adjacency-status",
    response_model=schemas.AdjacencyPairsStatus
)
async def get_adjacency_pairs_status(
    chat_room_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Get adjacency pairs status for a chat room (admin only)."""
    return crud.get_adjacency_pairs_status(db, chat_room_id)

# --- Remove or comment out old endpoints --- 

# @router.post("/projects/{project_id}/chat-rooms", response_model=schemas.ChatRoom)
# async def create_chat_room(...): ... # Keep implementation commented for reference if needed

# @router.post("/chat-rooms/{chat_room_id}/import-csv", response_model=schemas.CSVImportResponse)
# async def import_chat_csv(...): ... # Keep implementation commented for reference if needed

# Existing delete endpoints etc remain unchanged

# PHASE 2: ANNOTATION IMPORT ENDPOINT

@router.post("/chat-rooms/{chat_room_id}/import-annotations", response_model=schemas.AnnotationImportResponse)
async def import_annotations_for_chat_room(
    chat_room_id: int,
    user_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """
    Import annotations from CSV and assign them to a specific user (admin only).
    PHASE 2: This implements the attributed import functionality from the action plan.
    
    Args:
        chat_room_id: ID of the chat room to import annotations for
        user_id: ID of the user to whom these annotations belong
        file: CSV file containing turn_id and thread_id columns
    """
    # Validate chat room exists
    chat_room = crud.get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found"
        )
    
    # Validate user exists
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV"
        )
    
    # Save uploaded file temporarily
    safe_filename = sanitize_filename(os.path.basename(file.filename))
    temp_file_path = f"uploads/annotations_{safe_filename}"
    try:
        contents = await file.read()
        enforce_max_upload_size(len(contents), settings.MAX_UPLOAD_MB, "CSV upload")
        os.makedirs("uploads", exist_ok=True)
        with open(temp_file_path, "wb") as f:
            f.write(contents)
        
        # Validate CSV format for annotations
        validate_annotations_csv_format(temp_file_path)
        
        # Import annotations from CSV
        annotations_data = import_annotations_from_csv(temp_file_path)
        enforce_max_rows(len(annotations_data), settings.MAX_IMPORT_ROWS, "Annotations")
        
        # Import annotations to database with attribution
        imported_count, skipped_count, errors = crud.import_annotations_for_chat_room(
            db=db,
            chat_room_id=chat_room_id,
            annotator_id=user_id,
            project_id=chat_room.project_id,
            annotations_data=annotations_data
        )
        
        return schemas.AnnotationImportResponse(
            chat_room_id=chat_room_id,
            annotator_id=user_id,
            annotator_username=user.username,
            total_annotations=len(annotations_data),
            imported_count=imported_count,
            skipped_count=skipped_count,
            errors=errors
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing annotation CSV file: {str(e)}"
        )
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@router.post("/chat-rooms/{chat_room_id}/import-annotations/preview", response_model=schemas.AnnotationPreviewResponse)
async def preview_annotations_for_chat_room(
    chat_room_id: int,
    file: UploadFile = File(...),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Preview an annotations CSV before importing (admin only)."""
    chat_room = crud.get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found"
        )
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV"
        )

    safe_filename = sanitize_filename(os.path.basename(file.filename))
    temp_file_path = f"uploads/preview_annotations_{safe_filename}"
    try:
        contents = await file.read()
        enforce_max_upload_size(len(contents), settings.MAX_UPLOAD_MB, "CSV upload")
        os.makedirs("uploads", exist_ok=True)
        with open(temp_file_path, "wb") as f:
            f.write(contents)

        validate_annotations_csv_format(temp_file_path)
        total_rows, preview_rows = preview_annotations_from_csv(temp_file_path, limit)
        enforce_max_rows(total_rows, settings.MAX_IMPORT_ROWS, "Annotations")

        return schemas.AnnotationPreviewResponse(
            total_rows=total_rows,
            preview_rows=preview_rows
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing annotation CSV file: {str(e)}"
        )
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

# PHASE 3: AGGREGATED ANNOTATIONS FOR ANALYSIS

@router.get("/chat-rooms/{chat_room_id}/aggregated-annotations", response_model=schemas.AggregatedAnnotationsResponse)
async def get_aggregated_annotations(
    chat_room_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """
    Get aggregated annotations for a chat room (admin only).
    PHASE 3: This provides the foundation for IAA analysis by showing all annotations
    organized by message, making concordance and discordance immediately visible.
    """
    # Validate chat room exists
    chat_room = crud.get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found"
        )
    
    # Get aggregated data
    aggregated_data = crud.get_aggregated_annotations_for_chat_room(db, chat_room_id)
    
    # Calculate statistics
    total_messages = len(aggregated_data)
    annotated_messages = len([msg for msg in aggregated_data if msg["annotations"]])
    
    # Get unique annotators
    all_annotators = set()
    for message in aggregated_data:
        for annotation in message["annotations"]:
            all_annotators.add(annotation["annotator_username"])
    
    annotators = sorted(list(all_annotators))
    
    return schemas.AggregatedAnnotationsResponse(
        chat_room_id=chat_room_id,
        messages=aggregated_data,
        total_messages=total_messages,
        annotated_messages=annotated_messages,
        total_annotators=len(annotators),
        annotators=annotators
    )

# PHASE 4: BATCH ANNOTATION IMPORT ENDPOINT

@router.post("/chat-rooms/{chat_room_id}/import-batch-annotations", response_model=schemas.BatchAnnotationImportResponse)
async def import_batch_annotations(
    chat_room_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """
    Import batch annotations from JSON file (admin only).
    PHASE 4: This implements the batch import functionality for multiple annotators.
    
    This endpoint accepts a JSON file containing structured batch annotation data
    with multiple annotators and their annotations. It will:
    1. Validate the JSON structure against the expected schema
    2. Create users if they don't exist (based on username)
    3. Import all annotations for each annotator
    4. Return detailed statistics about the import operation
    
    Args:
        chat_room_id: ID of the chat room to import annotations for
        file: JSON file containing batch annotation data
    
    Returns:
        BatchAnnotationImportResponse with detailed import statistics
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.json'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a JSON file"
        )
    
    # Validate chat room exists
    chat_room = crud.get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found"
        )
    
    # Save uploaded file temporarily
    safe_filename = sanitize_filename(os.path.basename(file.filename))
    temp_file_path = f"uploads/batch_annotations_{safe_filename}"
    try:
        contents = await file.read()
        enforce_max_upload_size(len(contents), settings.MAX_UPLOAD_MB, "JSON upload")
        os.makedirs("uploads", exist_ok=True)
        with open(temp_file_path, "wb") as f:
            f.write(contents)
        
        # Parse and validate JSON
        try:
            with open(temp_file_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid JSON format: {str(e)}"
            )
        
        # Validate against Pydantic schema
        try:
            batch_data = schemas.BatchAnnotationImport(**json_data)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid batch annotation format: {str(e)}"
            )

        total_annotations = sum(len(a.annotations) for a in batch_data.annotators)
        enforce_max_rows(total_annotations, settings.MAX_IMPORT_ROWS, "Batch annotations")
        
        # Validate that the batch metadata matches the requested chat room
        if batch_data.batch_metadata.chat_room_id != chat_room_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Chat room ID mismatch: JSON contains {batch_data.batch_metadata.chat_room_id}, but endpoint expects {chat_room_id}"
            )
        
        # Validate that the project matches
        if batch_data.batch_metadata.project_id != chat_room.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Project ID mismatch: JSON contains {batch_data.batch_metadata.project_id}, but chat room belongs to project {chat_room.project_id}"
            )
        
        # Import batch annotations
        result = crud.import_batch_annotations_for_chat_room(
            db=db,
            chat_room_id=chat_room_id,
            project_id=chat_room.project_id,
            batch_data=batch_data
        )
        
        return result
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing batch annotation file: {str(e)}"
        )
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@router.post("/chat-rooms/{chat_room_id}/import-batch-annotations/preview", response_model=schemas.BatchAnnotationPreviewResponse)
async def preview_batch_annotations(
    chat_room_id: int,
    file: UploadFile = File(...),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """Preview a batch annotations JSON file before importing (admin only)."""
    if not file.filename or not file.filename.lower().endswith('.json'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a JSON file"
        )

    chat_room = crud.get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat room not found"
        )

    safe_filename = sanitize_filename(os.path.basename(file.filename))
    temp_file_path = f"uploads/preview_batch_{safe_filename}"
    try:
        contents = await file.read()
        enforce_max_upload_size(len(contents), settings.MAX_UPLOAD_MB, "JSON upload")
        os.makedirs("uploads", exist_ok=True)
        with open(temp_file_path, "wb") as f:
            f.write(contents)

        try:
            with open(temp_file_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid JSON format: {str(e)}"
            )

        try:
            batch_data = schemas.BatchAnnotationImport(**json_data)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid batch annotation format: {str(e)}"
            )

        if batch_data.batch_metadata.chat_room_id != chat_room_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Chat room ID mismatch: JSON contains {batch_data.batch_metadata.chat_room_id}, but endpoint expects {chat_room_id}"
            )
        if batch_data.batch_metadata.project_id != chat_room.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Project ID mismatch: JSON contains {batch_data.batch_metadata.project_id}, but chat room belongs to project {chat_room.project_id}"
            )

        total_annotations = sum(len(a.annotations) for a in batch_data.annotators)
        enforce_max_rows(total_annotations, settings.MAX_IMPORT_ROWS, "Batch annotations")

        preview_annotators = []
        for annotator in batch_data.annotators[:limit]:
            preview_annotators.append(
                schemas.BatchAnnotationPreviewAnnotator(
                    annotator_username=annotator.annotator_username,
                    annotator_name=annotator.annotator_name,
                    annotations_count=len(annotator.annotations)
                )
            )

        return schemas.BatchAnnotationPreviewResponse(
            chat_room_id=chat_room_id,
            project_id=chat_room.project_id,
            total_annotators=len(batch_data.annotators),
            total_annotations=total_annotations,
            preview_annotators=preview_annotators
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing batch annotation file: {str(e)}"
        )
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

# PHASE 5: INTER-ANNOTATOR AGREEMENT (IAA) ENDPOINT

@router.get(
    "/chat-rooms/{chat_room_id}/iaa",
    response_model=schemas.ChatRoomIAA,
    summary="Get Inter-Annotator Agreement for a Chat Room",
)
async def get_iaa_for_chat_room(
    chat_room_id: int,
    alpha: Optional[float] = Query(None, ge=0.0, le=1.0, description="Override project iaa_alpha for this request"),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """
    Calculates and returns the IAA analysis for a specific chat room.

    For adjacency_pairs projects uses LinkF1 × (α + (1-α) × TypeAcc).
    Pass `alpha` to preview a different weighting without saving it.
    """
    return crud.get_chat_room_iaa_analysis(db=db, chat_room_id=chat_room_id, alpha_override=alpha)


# EXPORT FUNCTIONALITY

@router.get("/chat-rooms/{chat_room_id}/export")
async def export_chat_room_data(
    chat_room_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """
    Export all annotated data from a chat room as a downloadable JSON file.
    
    This endpoint generates a structured JSON file containing:
    - Chat room metadata (ID, name, project ID)
    - All messages with their complete text and metadata
    - All annotations from all annotators for each message
    
    Args:
        chat_room_id: ID of the chat room to export
    
    Returns:
        JSON file download with the complete annotated data
    
    Raises:
        HTTPException: 404 if chat room not found
    """
    # Get the export data
    export_data = crud.export_chat_room_data(db=db, chat_room_id=chat_room_id)
    
    # Extract metadata for filename generation
    metadata = export_data["export_metadata"]
    chat_room_name = sanitize_filename(metadata["chat_room_name"])
    completion_status = metadata["completion_status"]
    completion_percentage = metadata["completion_percentage"]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Create filename based on completion status
    if completion_status == "COMPLETE":
        filename = f"chatroom_{chat_room_id}_{chat_room_name}_COMPLETE_{timestamp}.json"
    elif completion_status == "PARTIAL":
        filename = f"chatroom_{chat_room_id}_{chat_room_name}_PARTIAL_{completion_percentage}pct_{timestamp}.json"
    else:
        filename = f"chatroom_{chat_room_id}_{chat_room_name}_INSUFFICIENT_{timestamp}.json"
    
    # Return as downloadable JSON file
    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

@router.get("/chat-rooms/{chat_room_id}/export-adjacency-pairs")
async def export_adjacency_pairs(
    chat_room_id: int,
    annotator_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin_user)
):
    """
    Export adjacency pairs as a plain text file with one link per line.
    Format: turnA,turnB,relation_type
    """
    chat_room = crud.get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat room not found")

    project = crud.get_project(db, chat_room.project_id)
    if not project or project.annotation_type != "adjacency_pairs":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This chat room does not belong to an adjacency pairs project"
        )

    annotator_username = None
    if annotator_id is not None:
        user = crud.get_user(db, annotator_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotator not found")
        annotator_username = user.username

    FromMessage = aliased(models.ChatMessage)
    ToMessage = aliased(models.ChatMessage)

    safe_room_name = sanitize_filename(chat_room.name)
    if annotator_id is not None:
        query = (
            db.query(models.AdjacencyPair, FromMessage.turn_id, ToMessage.turn_id)
            .join(FromMessage, models.AdjacencyPair.from_message_id == FromMessage.id)
            .join(ToMessage, models.AdjacencyPair.to_message_id == ToMessage.id)
            .filter(FromMessage.chat_room_id == chat_room_id)
            .filter(ToMessage.chat_room_id == chat_room_id)
            .filter(models.AdjacencyPair.annotator_id == annotator_id)
        )

        pairs = query.order_by(models.AdjacencyPair.id).all()
        lines = [f"{from_turn},{to_turn},{pair.relation_type}" for pair, from_turn, to_turn in pairs]
        content = "\n".join(lines)

        safe_annotator = sanitize_filename(annotator_username or f"user_{annotator_id}")
        filename = f"{safe_room_name}-{safe_annotator}.txt"
        return Response(
            content=content,
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    # Export all annotators as a zip with one txt per annotator
    User = aliased(models.User)
    assigned_users = (
        db.query(models.User)
        .join(models.ProjectAssignment, models.User.id == models.ProjectAssignment.user_id)
        .filter(models.ProjectAssignment.project_id == chat_room.project_id)
        .all()
    )
    if not assigned_users:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No annotators assigned to this project")

    query = (
        db.query(models.AdjacencyPair, FromMessage.turn_id, ToMessage.turn_id)
        .join(FromMessage, models.AdjacencyPair.from_message_id == FromMessage.id)
        .join(ToMessage, models.AdjacencyPair.to_message_id == ToMessage.id)
        .filter(FromMessage.chat_room_id == chat_room_id)
        .filter(ToMessage.chat_room_id == chat_room_id)
    )

    pairs = query.order_by(models.AdjacencyPair.annotator_id, models.AdjacencyPair.id).all()

    grouped_by_user = {}
    for pair, from_turn, to_turn in pairs:
        if pair.annotator_id not in grouped_by_user:
            grouped_by_user[pair.annotator_id] = []
        grouped_by_user[pair.annotator_id].append(f"{from_turn},{to_turn},{pair.relation_type}")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for user in assigned_users:
            safe_annotator = sanitize_filename(user.username or f"user_{user.id}")
            fname = f"{safe_room_name}-{safe_annotator}.txt"
            lines = grouped_by_user.get(user.id, [])
            zf.writestr(fname, "\n".join(lines))

    zip_name = f"{safe_room_name}-all.zip"
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={zip_name}"}
    )
