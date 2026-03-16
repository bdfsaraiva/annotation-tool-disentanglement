from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import csv
import io

from ..database import get_db
from ..auth import get_current_user
from ..dependencies import verify_project_access
from ..models import User, AdjacencyPair, ChatMessage, ChatRoom, Project
from ..schemas import AdjacencyPair as AdjacencyPairSchema, AdjacencyPairCreate
from .. import crud

router = APIRouter(
    prefix="/projects/{project_id}/chat-rooms/{room_id}/adjacency-pairs",
    tags=["adjacency pairs"]
)

def _serialize_pair(pair: AdjacencyPair, annotator_username: str) -> AdjacencyPairSchema:
    return AdjacencyPairSchema(
        id=pair.id,
        from_message_id=pair.from_message_id,
        to_message_id=pair.to_message_id,
        annotator_id=pair.annotator_id,
        annotator_username=annotator_username,
        project_id=pair.project_id,
        relation_type=pair.relation_type,
        created_at=pair.created_at,
        updated_at=pair.updated_at
    )

def _ensure_project_mode(project: Project) -> None:
    if project.annotation_type != "adjacency_pairs":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This project is not configured for adjacency pair annotation"
        )

@router.get("/", response_model=List[AdjacencyPairSchema])
def list_adjacency_pairs(
    project_id: int,
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _ensure_project_mode(project)

    chat_room = db.query(ChatRoom).filter(
        ChatRoom.id == room_id,
        ChatRoom.project_id == project_id
    ).first()
    if not chat_room:
        raise HTTPException(status_code=404, detail="Chat room not found in this project")

    if current_user.is_admin:
        pairs_data = crud.get_all_adjacency_pairs_for_chat_room_admin(db, chat_room_id=room_id)
    else:
        pairs_data = crud.get_adjacency_pairs_for_chat_room_by_annotator(
            db, chat_room_id=room_id, annotator_id=current_user.id
        )

    return [_serialize_pair(pair, annotator_username) for pair, annotator_username in pairs_data]

@router.post("/", response_model=AdjacencyPairSchema)
def create_adjacency_pair(
    project_id: int,
    room_id: int,
    pair: AdjacencyPairCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _ensure_project_mode(project)

    if not project.relation_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No relation types configured for this project"
        )
    if pair.relation_type not in project.relation_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid relation type for this project"
        )
    if pair.from_message_id == pair.to_message_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create a relation from a message to itself"
        )

    # Verify both messages exist and belong to this chat room
    from_message = db.query(ChatMessage).filter(
        ChatMessage.id == pair.from_message_id,
        ChatMessage.chat_room_id == room_id
    ).first()
    to_message = db.query(ChatMessage).filter(
        ChatMessage.id == pair.to_message_id,
        ChatMessage.chat_room_id == room_id
    ).first()
    if not from_message or not to_message:
        raise HTTPException(status_code=404, detail="One or both messages not found in this chat room")

    existing = db.query(AdjacencyPair).filter(
        AdjacencyPair.from_message_id == pair.from_message_id,
        AdjacencyPair.to_message_id == pair.to_message_id,
        AdjacencyPair.annotator_id == current_user.id
    ).first()

    if existing:
        existing.relation_type = pair.relation_type
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return _serialize_pair(existing, current_user.username)

    db_pair = AdjacencyPair(
        from_message_id=pair.from_message_id,
        to_message_id=pair.to_message_id,
        annotator_id=current_user.id,
        project_id=project_id,
        relation_type=pair.relation_type,
        created_at=datetime.utcnow()
    )
    db.add(db_pair)
    db.commit()
    db.refresh(db_pair)
    return _serialize_pair(db_pair, current_user.username)

@router.delete("/{pair_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_adjacency_pair(
    project_id: int,
    room_id: int,
    pair_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
):
    pair = crud.get_adjacency_pair(db, pair_id)
    if not pair:
        raise HTTPException(status_code=404, detail="Adjacency pair not found")

    if pair.project_id != project_id:
        raise HTTPException(status_code=404, detail="Adjacency pair not found in this project")

    from_message = db.query(ChatMessage).filter(
        ChatMessage.id == pair.from_message_id,
        ChatMessage.chat_room_id == room_id
    ).first()
    to_message = db.query(ChatMessage).filter(
        ChatMessage.id == pair.to_message_id,
        ChatMessage.chat_room_id == room_id
    ).first()
    if not from_message or not to_message:
        raise HTTPException(status_code=404, detail="Adjacency pair not found in this chat room")

    if pair.annotator_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions to delete this relation")

    db.delete(pair)
    db.commit()
    return None


@router.post("/import")
def import_adjacency_pairs(
    project_id: int,
    room_id: int,
    file: UploadFile = File(...),
    mode: str = Query("merge", pattern="^(merge|replace)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(verify_project_access)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _ensure_project_mode(project)

    chat_room = db.query(ChatRoom).filter(
        ChatRoom.id == room_id,
        ChatRoom.project_id == project_id
    ).first()
    if not chat_room:
        raise HTTPException(status_code=404, detail="Chat room not found in this project")

    if not project.relation_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No relation types configured for this project"
        )

    content = file.file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    if not text.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    messages = db.query(ChatMessage).filter(ChatMessage.chat_room_id == room_id).all()
    turn_to_message = {str(msg.turn_id): msg for msg in messages}
    message_ids = [msg.id for msg in messages]

    if mode == "replace" and message_ids:
        db.query(AdjacencyPair).filter(
            AdjacencyPair.annotator_id == current_user.id,
            AdjacencyPair.from_message_id.in_(message_ids),
            AdjacencyPair.to_message_id.in_(message_ids)
        ).delete(synchronize_session=False)
        db.commit()

    imported_count = 0
    skipped_count = 0
    errors = []
    now = datetime.utcnow()

    reader = csv.reader(io.StringIO(text))
    for line_number, row in enumerate(reader, start=1):
        if not row or all(not cell.strip() for cell in row):
            continue
        if len(row) < 3:
            errors.append(f"Line {line_number}: expected 3 columns (turnA,turnB,relation_type)")
            skipped_count += 1
            continue

        from_turn = row[0].strip()
        to_turn = row[1].strip()
        relation_type = row[2].strip()

        if not from_turn or not to_turn or not relation_type:
            errors.append(f"Line {line_number}: missing required values")
            skipped_count += 1
            continue

        if relation_type not in project.relation_types:
            errors.append(f"Line {line_number}: invalid relation type '{relation_type}'")
            skipped_count += 1
            continue

        from_message = turn_to_message.get(from_turn)
        to_message = turn_to_message.get(to_turn)
        if not from_message or not to_message:
            errors.append(f"Line {line_number}: turn_id not found in this chat room")
            skipped_count += 1
            continue

        if from_message.id == to_message.id:
            errors.append(f"Line {line_number}: cannot link a turn to itself")
            skipped_count += 1
            continue

        existing = db.query(AdjacencyPair).filter(
            AdjacencyPair.from_message_id == from_message.id,
            AdjacencyPair.to_message_id == to_message.id,
            AdjacencyPair.annotator_id == current_user.id
        ).first()

        if existing:
            existing.relation_type = relation_type
            existing.updated_at = now
            imported_count += 1
            continue

        db.add(AdjacencyPair(
            from_message_id=from_message.id,
            to_message_id=to_message.id,
            annotator_id=current_user.id,
            project_id=project_id,
            relation_type=relation_type,
            created_at=now
        ))
        imported_count += 1

    db.commit()
    if imported_count == 0:
        message = "No relations matched the chat room turns."
    else:
        message = f"{imported_count} relations imported."
    return {
        "message": message,
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "errors": errors
    }
