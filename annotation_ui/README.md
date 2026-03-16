# Annotation UI

Web interface for chat annotation and inter-annotator agreement (IAA).

## Setup
```bash
cd annotation_ui
npm install
```

## Configure .env
```bash
cp .env.example .env
```

Edit .env if the backend runs on another machine:
```env
REACT_APP_API_URL=http://192.168.1.100:8000
```

## Run locally
```bash
npm start
```

The UI will be available at http://localhost:3721

## Docker
From the repository root:
```bash
docker compose up -d --build
```

## Notes
- The frontend expects the backend API at REACT_APP_API_URL
- If you change .env, restart the dev server
