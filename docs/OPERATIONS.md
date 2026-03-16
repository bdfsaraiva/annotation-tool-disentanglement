# Operations

## Environment
Use .env at repo root for Docker or local dev. Required values:
- DATABASE_URL
- CORS_ORIGINS
- SECRET_KEY (min 32 chars)
- REACT_APP_API_URL

Optional values:
- FIRST_ADMIN_USERNAME
- FIRST_ADMIN_PASSWORD

Optional security/limits:
- PASSWORD_MIN_LENGTH
- PASSWORD_REQUIRE_DIGIT
- PASSWORD_REQUIRE_LETTER
- AUTH_RATE_LIMIT_REQUESTS
- AUTH_RATE_LIMIT_WINDOW_SECONDS
- MAX_UPLOAD_MB
- MAX_IMPORT_ROWS

## Docker build and run
```bash
cp .env.example .env
docker compose up -d --build
```

## Health checks
- Backend: http://localhost:8000/
- API docs: http://localhost:8000/docs
- Frontend: http://localhost:3721

## Logs
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## Database reset
```bash
docker compose down -v
Remove-Item -Recurse -Force .\data\
docker compose up -d --build
```
