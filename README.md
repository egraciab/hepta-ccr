# HEPTA CCR (Call Center Reporter)

A complete MVP dashboard for call center CDR analytics.

## Stack
- Backend: Node.js + Express
- Frontend: Vanilla HTML + Bootstrap 5 + Chart.js
- DB: PostgreSQL
- Containers: Docker Compose

## Run
```bash
docker compose up --build
```

## Services
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000
- PgAdmin: http://localhost:5050

## API
- `GET /api/cdr` with optional filters: `startDate`, `endDate`, `agent`, `status`
- `GET /api/stats` with same filters
- `POST /api/cdr/mock` body: `{ "count": 100 }`
