from sqlalchemy.orm import Session, Query
from typing import List, Optional, Tuple
from . import models, schemas
from fastapi import HTTPException
import numpy as np
from scipy.optimize import linear_sum_assignment
from itertools import combinations
from datetime import datetime
import secrets

# User CRUD operations
def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.username == username).first()

def get_users(db: Session, skip: int = 0, limit: int = 100) -> List[models.User]:
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate, hashed_password: str) -> models.User:
    db_user = models.User(
        username=user.username,
        hashed_password=hashed_password,
        is_admin=user.is_admin
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def delete_user(db: Session, user: models.User) -> None:
    """Delete a user from the database."""
    db.delete(user)
    db.commit()

def update_user(db: Session, user: models.User, updates: schemas.UserUpdate, hashed_password: Optional[str] = None) -> models.User:
    if updates.username is not None:
        user.username = updates.username
    if updates.is_admin is not None:
        user.is_admin = updates.is_admin
    if hashed_password is not None:
        user.hashed_password = hashed_password
    db.commit()
    db.refresh(user)
    return user

# Project CRUD operations
def get_project(db: Session, project_id: int) -> Optional[models.Project]:
    return db.query(models.Project).filter(models.Project.id == project_id).first()

def get_projects(db: Session, skip: int = 0, limit: int = 100) -> List[models.Project]:
    return db.query(models.Project).offset(skip).limit(limit).all()

def create_project(db: Session, project: schemas.ProjectCreate) -> models.Project:
    db_project = models.Project(
        name=project.name,
        description=project.description,
        annotation_type=project.annotation_type,
        relation_types=project.relation_types
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def update_project(db: Session, project: models.Project, updates: schemas.ProjectUpdate) -> models.Project:
    if updates.name is not None:
        project.name = updates.name
    if updates.description is not None:
        project.description = updates.description
    if updates.annotation_type is not None:
        project.annotation_type = updates.annotation_type
    if updates.relation_types is not None:
        project.relation_types = updates.relation_types
    db.commit()
    db.refresh(project)
    return project

def delete_project(db: Session, project: models.Project) -> None:
    """Delete a project from the database."""
    db.delete(project)
    db.commit()

# ChatRoom CRUD operations
def get_chat_room(db: Session, chat_room_id: int) -> Optional[models.ChatRoom]:
    return db.query(models.ChatRoom).filter(models.ChatRoom.id == chat_room_id).first()

def get_chat_rooms_by_project(db: Session, project_id: int, skip: int = 0, limit: int = 100) -> List[models.ChatRoom]:
    return db.query(models.ChatRoom).filter(models.ChatRoom.project_id == project_id).offset(skip).limit(limit).all()

def create_chat_room(db: Session, chat_room: schemas.ChatRoomCreate) -> models.ChatRoom:
    db_chat_room = models.ChatRoom(
        name=chat_room.name,
        description=chat_room.description,
        project_id=chat_room.project_id
    )
    db.add(db_chat_room)
    db.commit()
    db.refresh(db_chat_room)
    return db_chat_room

def update_chat_room(db: Session, chat_room: models.ChatRoom, updates: schemas.ChatRoomUpdate) -> models.ChatRoom:
    if updates.name is not None:
        chat_room.name = updates.name
    if updates.description is not None:
        chat_room.description = updates.description
    db.commit()
    db.refresh(chat_room)
    return chat_room

def delete_chat_room(db: Session, chat_room: models.ChatRoom) -> None:
    """Delete a chat room from the database."""
    db.delete(chat_room)
    db.commit()

def get_annotations_for_chat_room(
    db: Session, chat_room_id: int
) -> List[Tuple[models.Annotation, str]]:
    """
    Fetches all annotations for a given chat room, returning a tuple
    of the Annotation object and the annotator's username.
    """
    return (
        db.query(models.Annotation, models.User.username)
        .join(models.ChatMessage, models.Annotation.message_id == models.ChatMessage.id)
        .join(models.User, models.Annotation.annotator_id == models.User.id)
        .filter(models.ChatMessage.chat_room_id == chat_room_id)
        .all()
    )

# NEW FUNCTIONS FOR PHASE 1: ANNOTATION ISOLATION

def get_annotations_for_chat_room_by_annotator(
    db: Session, chat_room_id: int, annotator_id: int
) -> List[Tuple[models.Annotation, str]]:
    """
    Fetches annotations for a given chat room filtered by a specific annotator.
    This ensures annotators only see their own annotations (Pillar 1).
    Returns a tuple of the Annotation object and the annotator's username.
    """
    return (
        db.query(models.Annotation, models.User.username)
        .join(models.ChatMessage, models.Annotation.message_id == models.ChatMessage.id)
        .join(models.User, models.Annotation.annotator_id == models.User.id)
        .filter(
            models.ChatMessage.chat_room_id == chat_room_id,
            models.Annotation.annotator_id == annotator_id
        )
        .all()
    )

def get_all_annotations_for_chat_room_admin(
    db: Session, chat_room_id: int
) -> List[Tuple[models.Annotation, str]]:
    """
    Fetches ALL annotations for a given chat room (admin-only function).
    This allows administrators to see annotations from all users (Pillar 1).
    Returns a tuple of the Annotation object and the annotator's username.
    """
    return (
        db.query(models.Annotation, models.User.username)
        .join(models.ChatMessage, models.Annotation.message_id == models.ChatMessage.id)
        .join(models.User, models.Annotation.annotator_id == models.User.id)
        .filter(models.ChatMessage.chat_room_id == chat_room_id)
        .all()
    )

# ChatMessage CRUD operations
def get_chat_message(db: Session, message_id: int) -> Optional[models.ChatMessage]:
    return db.query(models.ChatMessage).filter(models.ChatMessage.id == message_id).first()

def get_chat_messages_by_room(db: Session, chat_room_id: int, skip: int = 0, limit: int = 100) -> List[models.ChatMessage]:
    return db.query(models.ChatMessage).filter(models.ChatMessage.chat_room_id == chat_room_id).offset(skip).limit(limit).all()

def create_chat_message(db: Session, message: schemas.ChatMessageCreate, chat_room_id: int) -> models.ChatMessage:
    db_message = models.ChatMessage(
        turn_id=message.turn_id,
        user_id=message.user_id,
        turn_text=message.turn_text,
        reply_to_turn=message.reply_to_turn,
        chat_room_id=chat_room_id
    )
    db.add(db_message)
    db.flush()
    db.refresh(db_message)
    return db_message

def get_chat_message_by_turn_id(db: Session, chat_room_id: int, turn_id: str) -> Optional[models.ChatMessage]:
    """Get a chat message by its turn_id within a specific chat room."""
    return db.query(models.ChatMessage).filter(
        models.ChatMessage.chat_room_id == chat_room_id,
        models.ChatMessage.turn_id == turn_id
    ).first()

# Annotation CRUD operations
def get_annotation(db: Session, annotation_id: int) -> Optional[models.Annotation]:
    return db.query(models.Annotation).filter(models.Annotation.id == annotation_id).first()

def get_annotations_by_message(db: Session, message_id: int) -> List[models.Annotation]:
    return db.query(models.Annotation).filter(models.Annotation.message_id == message_id).all()

def get_annotations_by_annotator(db: Session, annotator_id: int) -> List[models.Annotation]:
    return db.query(models.Annotation).filter(models.Annotation.annotator_id == annotator_id).all()

def create_annotation(
    db: Session,
    annotation: schemas.AnnotationCreate,
    annotator_id: Optional[int] = None,
    project_id: Optional[int] = None
) -> models.Annotation:
    resolved_annotator_id = annotator_id or getattr(annotation, "annotator_id", None)
    resolved_project_id = project_id or getattr(annotation, "project_id", None)
    if resolved_annotator_id is None or resolved_project_id is None:
        raise HTTPException(status_code=400, detail="Missing annotator_id or project_id")
    db_annotation = models.Annotation(
        message_id=annotation.message_id,
        annotator_id=resolved_annotator_id,
        project_id=resolved_project_id,
        thread_id=annotation.thread_id
    )
    db.add(db_annotation)
    db.commit()
    db.refresh(db_annotation)
    return db_annotation

# Adjacency Pair CRUD operations
def get_adjacency_pair(db: Session, pair_id: int) -> Optional[models.AdjacencyPair]:
    return db.query(models.AdjacencyPair).filter(models.AdjacencyPair.id == pair_id).first()

def get_adjacency_pairs_for_chat_room_by_annotator(
    db: Session, chat_room_id: int, annotator_id: int
) -> List[Tuple[models.AdjacencyPair, str]]:
    return (
        db.query(models.AdjacencyPair, models.User.username)
        .join(models.ChatMessage, models.AdjacencyPair.from_message_id == models.ChatMessage.id)
        .join(models.User, models.AdjacencyPair.annotator_id == models.User.id)
        .filter(
            models.ChatMessage.chat_room_id == chat_room_id,
            models.AdjacencyPair.annotator_id == annotator_id
        )
        .all()
    )

def get_all_adjacency_pairs_for_chat_room_admin(
    db: Session, chat_room_id: int
) -> List[Tuple[models.AdjacencyPair, str]]:
    return (
        db.query(models.AdjacencyPair, models.User.username)
        .join(models.ChatMessage, models.AdjacencyPair.from_message_id == models.ChatMessage.id)
        .join(models.User, models.AdjacencyPair.annotator_id == models.User.id)
        .filter(models.ChatMessage.chat_room_id == chat_room_id)
        .all()
    )

# Chat Room Completion CRUD operations
def get_chat_room_completion(
    db: Session, chat_room_id: int, annotator_id: int
) -> Optional[models.ChatRoomCompletion]:
    return db.query(models.ChatRoomCompletion).filter(
        models.ChatRoomCompletion.chat_room_id == chat_room_id,
        models.ChatRoomCompletion.annotator_id == annotator_id
    ).first()

def upsert_chat_room_completion(
    db: Session,
    chat_room_id: int,
    project_id: int,
    annotator_id: int,
    is_completed: bool
) -> models.ChatRoomCompletion:
    completion = get_chat_room_completion(db, chat_room_id, annotator_id)
    if completion:
        completion.is_completed = is_completed
        completion.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(completion)
        return completion

    completion = models.ChatRoomCompletion(
        chat_room_id=chat_room_id,
        annotator_id=annotator_id,
        project_id=project_id,
        is_completed=is_completed,
        created_at=datetime.utcnow()
    )
    db.add(completion)
    db.commit()
    db.refresh(completion)
    return completion

def get_chat_room_completion_summary(
    db: Session, chat_room_id: int
) -> schemas.ChatRoomCompletionSummary:
    chat_room = get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(status_code=404, detail="Chat room not found")

    assigned_users = (
        db.query(models.User)
        .join(models.ProjectAssignment, models.User.id == models.ProjectAssignment.user_id)
        .filter(models.ProjectAssignment.project_id == chat_room.project_id)
        .all()
    )
    total_assigned = len(assigned_users)

    completed_users = (
        db.query(models.User)
        .join(models.ProjectAssignment, models.User.id == models.ProjectAssignment.user_id)
        .join(
            models.ChatRoomCompletion,
            (models.ChatRoomCompletion.annotator_id == models.User.id) &
            (models.ChatRoomCompletion.chat_room_id == chat_room_id)
        )
        .filter(
            models.ProjectAssignment.project_id == chat_room.project_id,
            models.ChatRoomCompletion.is_completed == True
        )
        .all()
    )

    completed_annotators = [
        schemas.AnnotatorInfo(id=user.id, username=user.username)
        for user in completed_users
    ]

    return schemas.ChatRoomCompletionSummary(
        chat_room_id=chat_room_id,
        total_assigned=total_assigned,
        completed_count=len(completed_annotators),
        completed_annotators=completed_annotators
    )

def get_adjacency_pairs_status(
    db: Session, chat_room_id: int
) -> schemas.AdjacencyPairsStatus:
    chat_room = get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(status_code=404, detail="Chat room not found")

    summary = get_chat_room_completion_summary(db, chat_room_id)
    has_relations = (
        db.query(models.AdjacencyPair.id)
        .join(models.ChatMessage, models.AdjacencyPair.from_message_id == models.ChatMessage.id)
        .filter(models.ChatMessage.chat_room_id == chat_room_id)
        .first()
        is not None
    )

    if summary.total_assigned > 0 and summary.completed_count == summary.total_assigned:
        status = "Completed"
    elif has_relations:
        status = "Started"
    else:
        status = "NotStarted"

    return schemas.AdjacencyPairsStatus(
        chat_room_id=chat_room_id,
        status=status,
        total_assigned=summary.total_assigned,
        completed_count=summary.completed_count,
        has_relations=has_relations
    )

# ProjectAssignment CRUD operations
def get_project_assignment(db: Session, assignment_id: int) -> Optional[models.ProjectAssignment]:
    return db.query(models.ProjectAssignment).filter(models.ProjectAssignment.id == assignment_id).first()

def get_project_assignments_by_user(db: Session, user_id: int) -> List[models.ProjectAssignment]:
    return db.query(models.ProjectAssignment).filter(models.ProjectAssignment.user_id == user_id).all()

def get_project_assignments_by_project(db: Session, project_id: int) -> List[models.ProjectAssignment]:
    return db.query(models.ProjectAssignment).filter(models.ProjectAssignment.project_id == project_id).all()

# Removed create_project_assignment function as it's unused and caused an import error
# Assignment creation is handled directly in the admin endpoint.

# PHASE 2: IMPORT ANNOTATIONS WITH ATTRIBUTION

def import_annotations_for_chat_room(
    db: Session, 
    chat_room_id: int, 
    annotator_id: int, 
    project_id: int,
    annotations_data: List[dict]
) -> Tuple[int, int, List[str]]:
    """
    Import annotations for a chat room and assign them to a specific annotator.
    
    Args:
        db: Database session
        chat_room_id: ID of the chat room
        annotator_id: ID of the user who made these annotations
        project_id: ID of the project
        annotations_data: List of dicts with 'turn_id' and 'thread_id'
    
    Returns:
        Tuple of (imported_count, skipped_count, errors)
    """
    imported_count = 0
    skipped_count = 0
    errors = []
    
    for annotation_data in annotations_data:
        try:
            turn_id = annotation_data.get('turn_id')
            thread_id = annotation_data.get('thread_id')
            
            if not turn_id or not thread_id:
                errors.append(f"Missing turn_id or thread_id in annotation data: {annotation_data}")
                skipped_count += 1
                continue
            
            # Find the message by turn_id in this chat room
            message = get_chat_message_by_turn_id(db, chat_room_id, turn_id)
            if not message:
                errors.append(f"Message with turn_id '{turn_id}' not found in chat room {chat_room_id}")
                skipped_count += 1
                continue
            
            # Check if annotation already exists for this message and annotator
            existing_annotation = db.query(models.Annotation).filter(
                models.Annotation.message_id == message.id,
                models.Annotation.annotator_id == annotator_id
            ).first()
            
            if existing_annotation:
                # Update existing annotation
                existing_annotation.thread_id = thread_id
                imported_count += 1
            else:
                # Create new annotation
                new_annotation = models.Annotation(
                    message_id=message.id,
                    annotator_id=annotator_id,
                    project_id=project_id,
                    thread_id=thread_id
                )
                db.add(new_annotation)
                imported_count += 1
                
        except Exception as e:
            errors.append(f"Error processing annotation for turn_id '{annotation_data.get('turn_id')}': {str(e)}")
            skipped_count += 1
    
    db.commit()
    return imported_count, skipped_count, errors

# PHASE 3: AGGREGATION FOR IAA ANALYSIS

def get_aggregated_annotations_for_chat_room(
    db: Session, chat_room_id: int
) -> List[dict]:
    """
    Get aggregated annotations for a chat room, organized by message.
    This is used by administrators to analyze concordance between annotators.
    
    Returns a list of dictionaries, each representing a message with all its annotations:
    [
        {
            "message_id": 1,
            "message_text": "Hello everyone!",
            "turn_id": "T001",
            "user_id": "user123",
            "annotations": [
                {"annotator_id": 10, "annotator_username": "fabio", "thread_id": "T0"},
                {"annotator_id": 12, "annotator_username": "ana", "thread_id": "T0"}
            ]
        },
        ...
    ]
    """
    # Get all messages in the chat room with their annotations
    results = (
        db.query(
            models.ChatMessage.id.label('message_id'),
            models.ChatMessage.turn_text.label('message_text'),
            models.ChatMessage.turn_id,
            models.ChatMessage.user_id,
            models.Annotation.id.label('annotation_id'),
            models.Annotation.annotator_id,
            models.Annotation.thread_id,
            models.User.username.label('annotator_username')
        )
        .outerjoin(models.Annotation, models.ChatMessage.id == models.Annotation.message_id)
        .outerjoin(models.User, models.Annotation.annotator_id == models.User.id)
        .filter(models.ChatMessage.chat_room_id == chat_room_id)
        .order_by(models.ChatMessage.id)
        .all()
    )
    
    # Group results by message
    messages_dict = {}
    for result in results:
        message_id = result.message_id
        
        if message_id not in messages_dict:
            messages_dict[message_id] = {
                "message_id": message_id,
                "message_text": result.message_text,
                "turn_id": result.turn_id,
                "user_id": result.user_id,
                "annotations": []
            }
        
        # Add annotation if it exists
        if result.annotation_id:
            messages_dict[message_id]["annotations"].append({
                "annotator_id": result.annotator_id,
                "annotator_username": result.annotator_username,
                "thread_id": result.thread_id
            })
    
    # Convert to list and sort by message_id
    aggregated_data = list(messages_dict.values())
    aggregated_data.sort(key=lambda x: x["message_id"])
    
    return aggregated_data

# PHASE 4: BATCH ANNOTATION IMPORT

def import_batch_annotations_for_chat_room(
    db: Session,
    chat_room_id: int,
    project_id: int,
    batch_data: schemas.BatchAnnotationImport
) -> schemas.BatchAnnotationImportResponse:
    """
    Import batch annotations from multiple annotators for a chat room.
    
    This function processes a structured batch import containing multiple annotators
    and their annotations. It will:
    1. Create users if they don't exist
    2. Import all annotations for each annotator
    3. Handle errors gracefully and continue processing
    4. Return detailed statistics about the import
    
    Args:
        db: Database session
        chat_room_id: ID of the chat room
        project_id: ID of the project
        batch_data: Structured batch annotation data
    
    Returns:
        BatchAnnotationImportResponse with detailed import statistics
    """
    global_errors = []
    results = []
    total_annotations_processed = 0
    total_imported = 0
    total_skipped = 0
    
    # Verify chat room exists and belongs to project
    chat_room = get_chat_room(db, chat_room_id)
    if not chat_room:
        global_errors.append(f"Chat room {chat_room_id} not found")
        return schemas.BatchAnnotationImportResponse(
            message="Import failed: Chat room not found",
            chat_room_id=chat_room_id,
            total_annotators=0,
            total_annotations_processed=0,
            total_imported=0,
            total_skipped=0,
            results=[],
            global_errors=global_errors
        )
    
    if chat_room.project_id != project_id:
        global_errors.append(f"Chat room {chat_room_id} does not belong to project {project_id}")
        return schemas.BatchAnnotationImportResponse(
            message="Import failed: Chat room project mismatch",
            chat_room_id=chat_room_id,
            total_annotators=0,
            total_annotations_processed=0,
            total_imported=0,
            total_skipped=0,
            results=[],
            global_errors=global_errors
        )
    
    # Process each annotator
    for annotator_data in batch_data.annotators:
        user = None
        annotator_errors = []
        imported_count = 0
        skipped_count = 0
        
        try:
            # Get or create user
            user = get_user_by_username(db, annotator_data.annotator_username)
            if not user:
                # Create new user with default password (they'll need to reset it)
                from app.auth import get_password_hash
                temporary_password = secrets.token_urlsafe(16)
                hashed_password = get_password_hash(temporary_password)
                user_create = schemas.UserCreate(
                    username=annotator_data.annotator_username,
                    password=temporary_password,
                    is_admin=False
                )
                user = create_user(db, user_create, hashed_password)
                annotator_errors.append(
                    f"User '{annotator_data.annotator_username}' created with a temporary password; reset required."
                )
                
            # Convert annotations to the format expected by import_annotations_for_chat_room
            annotations_data = [
                {
                    'turn_id': ann.turn_id,
                    'thread_id': ann.thread_id
                }
                for ann in annotator_data.annotations
            ]
            
            total_annotations_processed += len(annotations_data)
            
            # Import annotations for this annotator
            imported, skipped, errors = import_annotations_for_chat_room(
                db=db,
                chat_room_id=chat_room_id,
                annotator_id=user.id,
                project_id=project_id,
                annotations_data=annotations_data
            )
            
            imported_count = imported
            skipped_count = skipped
            annotator_errors.extend(errors)
            
            total_imported += imported_count
            total_skipped += skipped_count
            
        except Exception as e:
            error_msg = f"Failed to process annotator {annotator_data.annotator_username}: {str(e)}"
            annotator_errors.append(error_msg)
            global_errors.append(error_msg)
            skipped_count = len(annotator_data.annotations)
            total_skipped += skipped_count
        
        # Add result for this annotator
        results.append(schemas.BatchAnnotationResult(
            annotator_username=annotator_data.annotator_username,
            annotator_name=annotator_data.annotator_name,
            user_id=user.id if user else -1,
            imported_count=imported_count,
            skipped_count=skipped_count,
            errors=annotator_errors
        ))
    
    # Determine overall message
    if global_errors:
        if total_imported > 0:
            message = f"Import completed with {len(global_errors)} error(s). {total_imported} annotations imported successfully."
        else:
            message = f"Import failed with {len(global_errors)} error(s). No annotations were imported."
    else:
        message = f"Batch import completed successfully. {total_imported} annotations imported from {len(batch_data.annotators)} annotators."
    
    return schemas.BatchAnnotationImportResponse(
        message=message,
        chat_room_id=chat_room_id,
        total_annotators=len(batch_data.annotators),
        total_annotations_processed=total_annotations_processed,
        total_imported=total_imported,
        total_skipped=total_skipped,
        results=results,
        global_errors=global_errors
    )

# PHASE 5: INTER-ANNOTATOR AGREEMENT (IAA) FUNCTIONS

def _calculate_one_to_one_accuracy(annot1: List[str], annot2: List[str]) -> float:
    """
    Computes the one-to-one accuracy metric for two lists of annotations.
    This metric finds the optimal matching between thread labels from two annotators
    and calculates the percentage of messages that align based on this matching.

    Parameters:
    annot1: A list of thread identifiers (e.g., strings) from the first annotator.
    annot2: A list of thread identifiers from the second annotator. Must be the same length as annot1.

    Returns:
    A float representing the accuracy score (0-100).
    """
    # Ensure annotations are of the same length
    assert len(annot1) == len(annot2), "Annotation lists must have the same length."
    
    if len(annot1) == 0:
        return 0.0

    # Create a contingency matrix to store the overlap between thread labels
    unique_labels1 = sorted(list(set(annot1)))
    unique_labels2 = sorted(list(set(annot2)))
    
    label_map1 = {label: i for i, label in enumerate(unique_labels1)}
    label_map2 = {label: i for i, label in enumerate(unique_labels2)}

    # Initialize a zero matrix for counting overlaps
    overlap_matrix = np.zeros((len(unique_labels1), len(unique_labels2)), dtype=int)

    # Populate the overlap matrix
    for i in range(len(annot1)):
        idx1 = label_map1[annot1[i]]
        idx2 = label_map2[annot2[i]]
        overlap_matrix[idx1, idx2] += 1

    # Apply the Hungarian algorithm to find the optimal matching.
    # We negate the matrix because the algorithm finds the minimum cost assignment,
    # and we want to maximize the overlap.
    row_ind, col_ind = linear_sum_assignment(-overlap_matrix)

    # Calculate total overlap by summing the values at the optimal matching positions
    total_overlap = overlap_matrix[row_ind, col_ind].sum()

    # Calculate one-to-one accuracy as the percentage of the total messages
    accuracy = (total_overlap / len(annot1)) * 100 if len(annot1) > 0 else 0

    return accuracy


def get_chat_room_iaa_analysis(db: Session, chat_room_id: int) -> Optional[schemas.ChatRoomIAA]:
    """
    Calculates and returns the Inter-Annotator Agreement (IAA) analysis for a chat room.
    
    This function now supports partial analysis:
    1. Verifies the chat room exists
    2. Identifies annotators who have completed annotating all messages
    3. If 2+ annotators have completed work, calculates IAA for that subset
    4. Returns analysis with clear status and annotator information
    
    Args:
        db: Database session
        chat_room_id: ID of the chat room to analyze
        
    Returns:
        ChatRoomIAA schema with analysis (complete, partial, or insufficient data)
    """
    # Get chat room
    chat_room = get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    # Get all messages in the chat room
    messages = get_chat_messages_by_room(db, chat_room_id, skip=0, limit=10000)
    message_count = len(messages)
    
    if message_count == 0:
        raise HTTPException(status_code=400, detail="Chat room has no messages")
    
    # Get all users assigned to this project (potential annotators)
    assigned_users = (
        db.query(models.User)
        .join(models.ProjectAssignment, models.User.id == models.ProjectAssignment.user_id)
        .filter(models.ProjectAssignment.project_id == chat_room.project_id)
        .all()
    )
    
    # Get all annotations for this chat room with annotator information
    annotations_query = (
        db.query(models.Annotation, models.User.username, models.ChatMessage.turn_id)
        .join(models.ChatMessage, models.Annotation.message_id == models.ChatMessage.id)
        .join(models.User, models.Annotation.annotator_id == models.User.id)
        .filter(models.ChatMessage.chat_room_id == chat_room_id)
        .order_by(models.ChatMessage.id, models.Annotation.annotator_id)
        .all()
    )
    
    # Group annotations by annotator
    annotator_data = {}
    for annotation, username, turn_id in annotations_query:
        annotator_id = annotation.annotator_id
        if annotator_id not in annotator_data:
            annotator_data[annotator_id] = {
                'username': username,
                'annotations': {}
            }
        annotator_data[annotator_id]['annotations'][annotation.message_id] = annotation.thread_id
    
    # Identify completed and pending annotators
    completed_annotators = []
    pending_annotators = []
    
    for user in assigned_users:
        if user.id in annotator_data:
            # Check if this annotator has annotated all messages
            if len(annotator_data[user.id]['annotations']) == message_count:
                completed_annotators.append(schemas.AnnotatorInfo(id=user.id, username=user.username))
            else:
                pending_annotators.append(schemas.AnnotatorInfo(id=user.id, username=user.username))
        else:
            # User hasn't started annotating
            pending_annotators.append(schemas.AnnotatorInfo(id=user.id, username=user.username))
    
    # Determine analysis status
    completed_count = len(completed_annotators)
    total_assigned = len(assigned_users)
    
    if completed_count < 2:
        # Not enough completed annotators for analysis
        return schemas.ChatRoomIAA(
            chat_room_id=chat_room_id,
            chat_room_name=chat_room.name,
            message_count=message_count,
            analysis_status="NotEnoughData",
            total_annotators_assigned=total_assigned,
            completed_annotators=completed_annotators,
            pending_annotators=pending_annotators,
            pairwise_accuracies=[]
        )
    
    # We have enough completed annotators - calculate IAA for completed subset
    analysis_status = "Complete" if completed_count == total_assigned else "Partial"
    
    # Create ordered annotation lists for completed annotators only
    message_ids = [msg.id for msg in messages]
    completed_annotator_lists = {}
    
    for completed_annotator in completed_annotators:
        annotator_id = completed_annotator.id
        completed_annotator_lists[annotator_id] = {
            'username': completed_annotator.username,
            'annotations': [annotator_data[annotator_id]['annotations'][msg_id] for msg_id in message_ids]
        }
    
    # Calculate pairwise accuracies for completed annotators
    pairwise_accuracies = []
    completed_annotator_ids = list(completed_annotator_lists.keys())
    
    for annotator_1_id, annotator_2_id in combinations(completed_annotator_ids, 2):
        annot1 = completed_annotator_lists[annotator_1_id]['annotations']
        annot2 = completed_annotator_lists[annotator_2_id]['annotations']
        
        accuracy = _calculate_one_to_one_accuracy(annot1, annot2)
        
        pairwise_accuracies.append(schemas.PairwiseAccuracy(
            annotator_1_id=annotator_1_id,
            annotator_2_id=annotator_2_id,
            annotator_1_username=completed_annotator_lists[annotator_1_id]['username'],
            annotator_2_username=completed_annotator_lists[annotator_2_id]['username'],
            accuracy=accuracy
        ))
    
    return schemas.ChatRoomIAA(
        chat_room_id=chat_room_id,
        chat_room_name=chat_room.name,
        message_count=message_count,
        analysis_status=analysis_status,
        total_annotators_assigned=total_assigned,
        completed_annotators=completed_annotators,
        pending_annotators=pending_annotators,
        pairwise_accuracies=pairwise_accuracies
    )


# EXPORT FUNCTIONALITY

def export_chat_room_data(db: Session, chat_room_id: int) -> dict:
    """
    Export all annotated data from a chat room into a structured format.
    
    Returns a dictionary containing:
    - Chat room metadata
    - All messages with their annotations from all annotators
    
    Args:
        db: Database session
        chat_room_id: ID of the chat room to export
        
    Returns:
        Dictionary with the export data structure
    """
    # Get chat room
    chat_room = get_chat_room(db, chat_room_id)
    if not chat_room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    # Get all messages in the chat room (ordered by ID for consistency)
    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.chat_room_id == chat_room_id
    ).order_by(models.ChatMessage.id).all()
    
    # Get all annotations for this chat room with annotator information
    annotations_query = (
        db.query(models.Annotation, models.User.username)
        .join(models.ChatMessage, models.Annotation.message_id == models.ChatMessage.id)
        .join(models.User, models.Annotation.annotator_id == models.User.id)
        .filter(models.ChatMessage.chat_room_id == chat_room_id)
        .order_by(models.ChatMessage.id, models.Annotation.annotator_id)
        .all()
    )
    
    # Group annotations by message ID
    annotations_by_message = {}
    for annotation, annotator_username in annotations_query:
        message_id = annotation.message_id
        if message_id not in annotations_by_message:
            annotations_by_message[message_id] = []
        
        annotations_by_message[message_id].append({
            "id": annotation.id,
            "thread_id": annotation.thread_id,
            "annotator_username": annotator_username,
            "created_at": annotation.created_at.isoformat(),
            "updated_at": annotation.updated_at.isoformat() if annotation.updated_at else None
        })
    
    # Get project assignment information for completion analysis
    assigned_users = (
        db.query(models.User)
        .join(models.ProjectAssignment, models.User.id == models.ProjectAssignment.user_id)
        .filter(models.ProjectAssignment.project_id == chat_room.project_id)
        .all()
    )
    
    # Calculate completion statistics
    total_messages = len(messages)
    total_annotators = len(assigned_users)
    
    # Count completed annotators (those who annotated all messages)
    annotator_completion = {}
    for annotation, annotator_username in annotations_query:
        annotator_id = annotation.annotator_id
        if annotator_id not in annotator_completion:
            annotator_completion[annotator_id] = set()
        annotator_completion[annotator_id].add(annotation.message_id)
    
    completed_annotators = sum(1 for message_set in annotator_completion.values() 
                              if len(message_set) == total_messages)
    
    # Calculate completion percentage
    completion_percentage = (completed_annotators / total_annotators * 100) if total_annotators > 0 else 0
    
    # Determine completion status
    if completed_annotators == total_annotators and total_annotators > 0:
        completion_status = "COMPLETE"
    elif completed_annotators >= 2:
        completion_status = "PARTIAL"
    else:
        completion_status = "INSUFFICIENT"
    
    # Count annotated messages
    annotated_messages = len(annotations_by_message)
    
    # Build the export structure with enhanced metadata
    export_data = {
        "export_metadata": {
            "chat_room_id": chat_room.id,
            "chat_room_name": chat_room.name,
            "project_id": chat_room.project_id,
            "export_timestamp": datetime.now().isoformat(),
            "completion_status": completion_status,
            "completion_percentage": round(completion_percentage, 1),
            "total_annotators": total_annotators,
            "completed_annotators": completed_annotators,
            "total_messages": total_messages,
            "annotated_messages": annotated_messages,
            "annotation_coverage": round((annotated_messages / total_messages * 100), 1) if total_messages > 0 else 0
        },
        "data": {
            "messages": []
        }
    }
    
    # Add messages with their annotations
    for message in messages:
        message_data = {
            "id": message.id,
            "turn_id": message.turn_id,
            "user_id": message.user_id,
            "turn_text": message.turn_text,
            "reply_to_turn": message.reply_to_turn,
            "created_at": message.created_at.isoformat(),
            "annotations": annotations_by_message.get(message.id, [])
        }
        export_data["data"]["messages"].append(message_data)
    
    return export_data
