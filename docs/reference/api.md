# REST API

LACE exposes a versioned REST API at `/api/v1/`. Interactive documentation (Swagger UI) is available at `http://localhost:8000/docs` when the backend is running.

All endpoints that modify state require a valid JWT access token in the `Authorization: Bearer <token>` header.

---

## Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Obtain access token and set refresh-token cookie |
| `POST` | `/api/v1/auth/logout` | Revoke the refresh-token cookie |
| `POST` | `/api/v1/auth/refresh` | Exchange refresh-token cookie for a new access token |

### Login

```http
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded

username=admin&password=secret
```

**Response**

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

!!! note
    The refresh token is stored in an `httpOnly` cookie and is not visible in the response body.

---

## Administration

All `/admin/` endpoints require an admin account.

### Users

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/admin/users` | List all users |
| `POST` | `/api/v1/admin/users` | Create a new user |
| `DELETE` | `/api/v1/admin/users/{user_id}` | Delete a user |

### Projects

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/admin/projects` | List all projects |
| `POST` | `/api/v1/admin/projects` | Create a project |
| `GET` | `/api/v1/admin/projects/{project_id}` | Get project details |
| `PUT` | `/api/v1/admin/projects/{project_id}` | Update project metadata |
| `DELETE` | `/api/v1/admin/projects/{project_id}` | Delete a project |

### Annotator Assignment

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/admin/projects/{project_id}/assignments` | Assign an annotator to a project |
| `DELETE` | `/api/v1/admin/projects/{project_id}/assignments/{user_id}` | Remove an annotator from a project |

### Import & Export

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/admin/projects/{project_id}/import/preview` | Parse a CSV file and return a preview (no DB write) |
| `POST` | `/api/v1/admin/projects/{project_id}/import/commit` | Commit a previewed import to the database |
| `GET` | `/api/v1/admin/projects/{project_id}/export` | Export annotations (JSON for disentanglement, ZIP for adjacency pairs) |

---

## Annotations

Annotation endpoints are available to any authenticated user assigned to the project.

### Disentanglement

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/annotations/rooms/{room_id}` | Get all messages and annotations for a room |
| `PUT` | `/api/v1/annotations/rooms/{room_id}/messages/{message_id}` | Set thread assignment for a message |

### Adjacency Pairs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/annotations/rooms/{room_id}/pairs` | Get all adjacency pairs for a room |
| `POST` | `/api/v1/annotations/rooms/{room_id}/pairs` | Create a new adjacency pair |
| `DELETE` | `/api/v1/annotations/rooms/{room_id}/pairs/{pair_id}` | Delete an adjacency pair |

### Per-Turn Read Status (Adjacency Pairs)

Tracks which turns an annotator has reviewed. Stored server-side per annotator per project.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/projects/{project_id}/chat-rooms/{room_id}/read-status` | Get read/unread state for all turns in a room |
| `PUT` | `/api/v1/projects/{project_id}/chat-rooms/{room_id}/read-status` | Batch-update read/unread state for one or more turns |

### Room Completion

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/annotations/rooms/{room_id}/complete` | Mark a room as completed |
| `DELETE` | `/api/v1/annotations/rooms/{room_id}/complete` | Unmark a room as completed |

---

## Inter-Annotator Agreement

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/admin/projects/{project_id}/iaa` | Compute pairwise IAA matrix for all annotators |
| `GET` | `/api/v1/admin/chat-rooms/{room_id}/read-status-summary` | Per-turn read-status summary across all annotators (admin only) |

**IAA response** — pairwise matrix per annotator pair. For disentanglement: macro-averaged F1 after optimal thread alignment. For adjacency pairs: LinkF1, TypeAcc, and Combined IAA = α × LinkF1 + (1 − α) × TypeAcc, where α is the project-level weight saved via `PUT /api/v1/admin/projects/{project_id}`.

The IAA α weight can be updated by sending `{ "iaa_alpha": 0.8 }` to `PUT /api/v1/admin/projects/{project_id}`.

---

## Error Responses

All errors follow a standard envelope:

```json
{
  "detail": "Human-readable error message"
}
```

| Status | Meaning |
|---|---|
| `400` | Validation error or malformed request |
| `401` | Missing or invalid access token |
| `403` | Authenticated but insufficient permissions |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate user, duplicate annotation) |
| `429` | Rate limit exceeded (auth endpoints) |
