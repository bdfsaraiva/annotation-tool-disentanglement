# LACE

[![Backend Tests](https://github.com/bdfsaraiva/LACE/actions/workflows/backend-tests.yml/badge.svg)](https://github.com/bdfsaraiva/LACE/actions/workflows/backend-tests.yml)
[![Frontend Build](https://github.com/bdfsaraiva/LACE/actions/workflows/frontend-build.yml/badge.svg)](https://github.com/bdfsaraiva/LACE/actions/workflows/frontend-build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/bdfsaraiva/LACE/blob/main/LICENSE)

**LACE** (*Labelling Adjacency and Conversation Entanglement*) is a full-stack web application for managing multi-annotator projects focused on conversational analysis.

It supports two annotation modes:

- **Chat Disentanglement** — group conversation turns into coherent threads
- **Adjacency Pairs** — draw directed, typed links between turns

Designed for computational linguistics research requiring rigorous inter-annotator agreement (IAA) measurement.

![Admin Dashboard](screenshots/admin_dashboard.png)

---

## Features

| Feature | Description |
|---|---|
| **Multi-project** | Manage independent annotation projects with different types and settings |
| **Multi-annotator** | Assign multiple annotators per project; track individual progress |
| **Chat Disentanglement** | Assign turns to threads using colour-coded labels |
| **Adjacency Pairs** | Draw directed relation links with typed labels via drag or right-click |
| **CSV Import** | Import chat rooms from CSV with row-level preview and validation |
| **JSON/ZIP Export** | Export annotations per room or per annotator |
| **IAA Analysis** | Pairwise inter-annotator agreement (thread-aligned F1 for disentanglement; α × LinkF1 + (1−α) × TypeAcc for adjacency pairs) |
| **Admin Dashboard** | Full project, user, and chat-room lifecycle management |
| **REST API** | OpenAPI/Swagger interface at `/docs` |

---

## Quickstart (Docker)

**Requirements**: Docker ≥ 24, Docker Compose ≥ 2.

```bash
git clone https://github.com/bdfsaraiva/LACE.git
cd LACE
cp .env.example .env   # edit FIRST_ADMIN_USERNAME / FIRST_ADMIN_PASSWORD
docker compose up -d --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3721 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |

The first admin account is created automatically from the `FIRST_ADMIN_USERNAME` and `FIRST_ADMIN_PASSWORD` values in `.env`.

---

## Further Reading

- [Admin Walkthrough](user-guide/admin.md) — create a project, import a corpus, assign annotators
- [Annotator Walkthrough](user-guide/annotator.md) — annotate a chat room and mark it complete
- [Exporting Results](user-guide/export.md) — download annotations and IAA scores
- [REST API](reference/api.md) — endpoint reference
- [Data Format](reference/data-format.md) — CSV input and export formats
- [Configuration](reference/configuration.md) — all environment variables
- [Architecture](development/architecture.md) — system design and database schema
