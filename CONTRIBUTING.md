# Contributing

Thank you for your interest in contributing to this project!

## Ways to Contribute

- **Report bugs** — open a [bug report](../../issues/new?template=bug_report.md)
- **Request features** — open a [feature request](../../issues/new?template=feature_request.md)
- **Submit pull requests** — fix bugs, add features, improve docs

## Development Setup

### Backend

```bash
cd annotation-backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Run tests:

```bash
pytest --cov=app -v
```

### Frontend

```bash
cd annotation_ui
npm install
npm start          # dev server on port 3721
npm test           # Vitest unit tests
npm run build      # production build
```

### Docker (recommended)

```bash
cp .env.example .env
docker compose up -d --build
```

## Pull Request Guidelines

1. Fork the repo and create a branch from `main`
2. Write or update tests for your changes
3. Ensure all CI checks pass
4. Open a PR with a clear description using the PR template

## Code Style

**Backend** — Python 3.11+, formatted with `black`, linted with `ruff`:

```bash
black annotation-backend/
ruff check annotation-backend/
```

**Frontend** — React + Vite; ESLint is configured in `package.json`.

## Commit Messages

Use the imperative mood, e.g.:

```
Add CSV import preview endpoint
Fix thread color assignment for >12 threads
Update Alembic migration for adjacency pairs
```

## Licence

By contributing you agree that your contributions will be licensed under the [MIT Licence](LICENSE).
