from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    username: str = Field(..., min_length=3)

class UserCreate(UserBase):
    password: str
    is_admin: bool = False

class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3)
    password: Optional[str] = None
    is_admin: Optional[bool] = None

class User(UserBase):
    id: int
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Project Schemas
class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    annotation_type: str = Field(default="disentanglement")
    relation_types: List[str] = Field(default_factory=list)

class ProjectCreate(ProjectBase):
    pass

class Project(ProjectBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ProjectList(BaseModel):
    projects: List[Project]

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    annotation_type: Optional[str] = None
    relation_types: Optional[List[str]] = None

# Chat Room Schemas
class ChatRoomBase(BaseModel):
    name: str
    description: Optional[str] = None

class ChatRoomCreate(ChatRoomBase):
    project_id: int

class ChatRoomUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None

class ChatRoom(ChatRoomBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ChatRoomList(BaseModel):
    chat_rooms: List[ChatRoom]

# Message Schemas
class ChatMessageBase(BaseModel):
    turn_id: str
    user_id: str
    turn_text: str
    reply_to_turn: Optional[str] = None

class ChatMessageCreate(ChatMessageBase):
    pass

class ChatMessage(ChatMessageBase):
    id: int
    chat_room_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MessageList(BaseModel):
    messages: List[ChatMessage]
    total: int

# Annotation Schemas
class AnnotationBase(BaseModel):
    message_id: int
    thread_id: str = Field(..., min_length=1, max_length=50)

class AnnotationCreate(AnnotationBase):
    pass

class Annotation(AnnotationBase):
    id: int
    annotator_id: int
    annotator_username: str
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AnnotationList(BaseModel):
    annotations: List[Annotation]

# Adjacency Pair Schemas
class AdjacencyPairBase(BaseModel):
    from_message_id: int
    to_message_id: int
    relation_type: str = Field(..., min_length=1, max_length=100)

class AdjacencyPairCreate(AdjacencyPairBase):
    pass

class AdjacencyPair(AdjacencyPairBase):
    id: int
    annotator_id: int
    annotator_username: str
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Chat Room Completion Schemas
class ChatRoomCompletionUpdate(BaseModel):
    is_completed: bool

class ChatRoomCompletion(BaseModel):
    chat_room_id: int
    annotator_id: int
    project_id: int
    is_completed: bool
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Authentication Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class TokenData(BaseModel):
    username: Optional[str] = None

class CSVImportResponse(BaseModel):
    message: str = "Import completed"
    total_messages: int
    imported_count: int
    skipped_count: int
    errors: List[str] = []
    warnings: List[str] = []

# New schema for combined chat room creation and import
class ChatRoomImportResponse(BaseModel):
    chat_room: ChatRoom  # Details of the created chat room
    import_details: CSVImportResponse # Import statistics

# PHASE 2: ANNOTATION IMPORT SCHEMAS

class AnnotationImportResponse(BaseModel):
    message: str = "Annotation import completed"
    chat_room_id: int
    annotator_id: int
    annotator_username: str
    total_annotations: int
    imported_count: int
    skipped_count: int
    errors: List[str] = []

# PHASE 3: AGGREGATED ANNOTATION ANALYSIS SCHEMAS

class AnnotationDetail(BaseModel):
    annotator_id: int
    annotator_username: str
    thread_id: str

class AggregatedMessageAnnotations(BaseModel):
    message_id: int
    message_text: str
    turn_id: str
    user_id: str
    annotations: List[AnnotationDetail]

class AggregatedAnnotationsResponse(BaseModel):
    chat_room_id: int
    messages: List[AggregatedMessageAnnotations]
    total_messages: int
    annotated_messages: int
    total_annotators: int
    annotators: List[str]  # List of annotator usernames

# PHASE 4: BATCH ANNOTATION IMPORT SCHEMAS

class BatchAnnotationItem(BaseModel):
    turn_id: str
    thread_id: str

class BatchAnnotatorMetadata(BaseModel):
    tool_used: Optional[str] = None
    source_file: Optional[str] = None
    total_annotations: Optional[int] = None
    experience_level: Optional[str] = None
    notes: Optional[str] = None

class BatchAnnotator(BaseModel):
    annotator_username: str = Field(..., min_length=3)
    annotator_name: str
    annotator_metadata: Optional[BatchAnnotatorMetadata] = None
    annotations: List[BatchAnnotationItem]

class BatchMetadata(BaseModel):
    project_id: int
    chat_room_id: int
    import_description: Optional[str] = None
    import_timestamp: str
    created_by: Optional[str] = None
    source_files: Optional[List[str]] = None

class BatchAnnotationImport(BaseModel):
    batch_metadata: BatchMetadata
    annotators: List[BatchAnnotator]

class BatchAnnotationResult(BaseModel):
    annotator_username: str
    annotator_name: str
    user_id: int
    imported_count: int
    skipped_count: int
    errors: List[str] = []

class BatchAnnotationImportResponse(BaseModel):
    message: str = "Batch annotation import completed"
    chat_room_id: int
    total_annotators: int
    total_annotations_processed: int
    total_imported: int
    total_skipped: int
    results: List[BatchAnnotationResult]
    global_errors: List[str] = []

# PHASE 5: INTER-ANNOTATOR AGREEMENT (IAA) SCHEMAS

class PairwiseAccuracy(BaseModel):
    """Represents the one-to-one accuracy score between two annotators."""
    annotator_1_id: int
    annotator_2_id: int
    annotator_1_username: str
    annotator_2_username: str
    accuracy: float

class AnnotatorInfo(BaseModel):
    """Information about an annotator."""
    id: int
    username: str

class ChatRoomCompletionSummary(BaseModel):
    chat_room_id: int
    total_assigned: int
    completed_count: int
    completed_annotators: List[AnnotatorInfo]

class AdjacencyPairsStatus(BaseModel):
    chat_room_id: int
    status: str
    total_assigned: int
    completed_count: int
    has_relations: bool

class ChatRoomIAA(BaseModel):
    """Holds the complete IAA analysis for a single chat room."""
    chat_room_id: int
    chat_room_name: str
    message_count: int
    
    # New fields for clarity and partial analysis support
    analysis_status: str  # "Complete", "Partial", "NotEnoughData"
    
    total_annotators_assigned: int
    completed_annotators: List[AnnotatorInfo]
    pending_annotators: List[AnnotatorInfo]
    
    # Calculation is now based on completed_annotators
    pairwise_accuracies: List[PairwiseAccuracy] 
