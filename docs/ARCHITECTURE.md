# Architecture

## High-level
- annotation_ui: React SPA for annotators and admins
- annotation-backend: FastAPI API + SQLAlchemy ORM + Alembic migrations
- conversion_tools: utilities to import Excel data into the API
- data/: persisted SQLite database (default)

## Data flow
1) Admin creates a project and chat rooms
2) Chat messages imported from CSV or Excel conversion tools
3) Annotators label threads or adjacency pairs
4) Exports generate JSON (disentanglement) or TXT/ZIP (adjacency pairs)

## Key tables
- users
- projects
- project_assignments
- chat_rooms
- chat_messages
- annotations
- adjacency_pairs
- chat_room_completions

## API layers
- app/api: request routing and validation
- app/crud: database access and aggregation
- app/models: SQLAlchemy models
- app/schemas: Pydantic models
