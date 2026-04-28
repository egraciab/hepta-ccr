# HEPTA CCR - Admin Dashboard Edition

Production-grade Call Center Reporter with AdminLTE-inspired layout, authentication, and operations modules.

## Stack
- Backend: Node.js + Express
- Frontend: Vanilla JS + Bootstrap 5 + Chart.js + Bootstrap Icons
- Database: PostgreSQL
- Deployment: Docker Compose

## Run
```bash
docker compose up --build
```

## Default credentials
- Email: `admin@hepta.local`
- Password: `admin123`

## Service URLs
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000
- PgAdmin: http://localhost:5050

## Main API
- Auth: `POST /api/auth/login`, `POST /api/auth/register` (admin only)
- CDR: `GET /api/cdr` (pagination/sorting/filters), `POST /api/cdr/mock`
- Dashboard stats: `GET /api/stats`
- Agents CRUD: `/api/agents`
- Users admin: `/api/users`
- Import CSV: `POST /api/import/cdr`
- Export CSV: `GET /api/export/cdr`
- Settings: `GET /api/settings`, `PUT /api/settings`
