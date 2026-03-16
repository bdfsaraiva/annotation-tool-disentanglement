# Annotation Backend System

Backend for text annotation tasks, including chat disentanglement and adjacency pairs.

## Features
- User authentication and authorization
- Project and chat room management
- CSV import for chat rooms
- Chat disentanglement annotations
- Adjacency pairs annotations
- IAA analysis for disentanglement
- RESTful API with FastAPI
- SQLite database (default)

## Setup
```bash
cd annotation-backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## Configuration
Create a .env in the repository root or in annotation-backend (for local dev):
```env
DATABASE_URL=sqlite:///./data/app.db
SECRET_KEY=change-me-min-32-chars
FIRST_ADMIN_USERNAME=admin
FIRST_ADMIN_PASSWORD=admin
SERVER_IP=localhost
FRONTEND_PORT=3721
```

## Run the server
```bash
uvicorn app.main:app --reload
```

The API will be available at:
- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs

## Core endpoints
Authentication:
- POST /auth/token
- POST /auth/refresh
- GET /auth/me

Admin:
- GET /admin/users
- POST /admin/users
- DELETE /admin/users/{user_id}
- GET /admin/projects
- POST /admin/projects
- PUT /admin/projects/{project_id}
- DELETE /admin/projects/{project_id}

Projects:
- GET /projects
- GET /projects/{project_id}
- GET /projects/{project_id}/users
- POST /projects/{project_id}/assign/{user_id}
- DELETE /projects/{project_id}/assign/{user_id}
- GET /projects/{project_id}/chat-rooms
- GET /projects/{project_id}/chat-rooms/{room_id}

Chat rooms and annotations:
- GET /projects/{project_id}/chat-rooms/{room_id}/messages
- GET /projects/{project_id}/chat-rooms/{room_id}/annotations
- POST /projects/{project_id}/messages/{message_id}/annotations
- DELETE /projects/{project_id}/messages/{message_id}/annotations/{annotation_id}

Adjacency pairs:
- GET /projects/{project_id}/chat-rooms/{room_id}/adjacency-pairs
- POST /projects/{project_id}/chat-rooms/{room_id}/adjacency-pairs
- DELETE /projects/{project_id}/chat-rooms/{room_id}/adjacency-pairs/{pair_id}
- POST /projects/{project_id}/chat-rooms/{room_id}/adjacency-pairs/import

## Data import format (CSV)
Required columns:
- turn_id
- user_id
- turn_text
- reply_to_turn
