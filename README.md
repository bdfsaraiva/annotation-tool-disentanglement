# Annotation Tool for Chat Disentanglement and Adjacency Pairs

Full-stack web app to manage annotation projects, assign annotators, and collect:
- Chat disentanglement annotations (thread grouping)
- Adjacency pairs (directed links between turns + relation type)

## Features
- Admin dashboard: projects, users, chat rooms, exports
- Annotator UI: fast turn annotation and linking
- Import chat rooms from CSV
- Export annotations (JSON) and adjacency pairs (TXT/ZIP)
- Built-in IAA analysis for disentanglement

## Architecture
- Backend: FastAPI + SQLAlchemy + Alembic
- Frontend: React
- Database: SQLite (default)

## Quickstart (Docker)
```bash
cp .env.example .env
docker compose up -d --build
```

Open:
- Frontend: http://localhost:3721
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

Default admin:
- admin / admin

## Local development
Backend:
```bash
cd annotation-backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:
```bash
cd annotation_ui
npm install
npm start
```

## Configuration
The main required setting is SERVER_IP in .env:
- Local: SERVER_IP=localhost
- LAN: SERVER_IP=192.168.1.100

This controls the frontend API URL and backend CORS.

## Docs
- docs/ARCHITECTURE.md
- docs/OPERATIONS.md

## Repository layout
```
annotation-backend/     FastAPI backend + Alembic migrations
annotation_ui/          React frontend
conversion_tools/       Excel import utilities
docker-compose.yml
```

## License
MIT License. See LICENSE.

## Citation
See CITATION.cff.
