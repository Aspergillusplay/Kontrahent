# Kontrahent.sk

Kontrahent.sk is a full-stack app for monitoring Slovak business counterparties.
It helps users track financial and legal risk signals (debts, bankruptcy/liquidation indicators, court-related events) and receive alerts via Telegram and Web Push.

## What this project includes

- Public company search and browse (FinStat + local cache + registry fallback).
- Company detail pages with risk score, debt summary, financial indicators, history, and charts.
- Authenticated watchlist per user (Supabase Auth + RLS-protected data).
- Alert center with read/unread tracking.
- Notification channels: Telegram bot messages and Web Push (VAPID).
- Frontend i18n with runtime language switch (English and Slovak).
- Background jobs: daily debt-source synchronization and nightly watchlist monitoring.

## Repository structure

```text
kontrahent/
|-- backend/                # NestJS API
|-- frontend/               # Next.js 14 app (App Router, PWA)
|-- supabase/               # SQL schema files
|   |-- schema.sql
|   `-- schema_sync_tables.sql
|-- docker-compose.yml
|-- DATA_SOURCES.md
`-- package.json            # Root helper scripts
```

## Tech stack

- Backend: NestJS, TypeScript, Supabase JS, Axios, Cheerio, Nodemon (dev runner)
- Frontend: Next.js 14, React 18, Tailwind CSS, Recharts, next-pwa, custom i18n layer (EN/SK)
- Database/Auth: Supabase (PostgreSQL + Auth + RLS)
- Notifications: Telegram Bot API, Web Push (`web-push`)
- Scheduling: `@nestjs/schedule` (cron jobs)

## Prerequisites

- Node.js 20+ (recommended)
- npm 10+
- Supabase project (URL + keys)
- Optional: Docker Desktop 4+ (for containerized full stack)

## 1. Install dependencies

From repository root:

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

## 2. Configure Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql`.
3. Run `supabase/schema_sync_tables.sql`.
4. In Supabase Auth settings, add local redirect URL `http://localhost:3000/auth/callback`.
5. If you want Google OAuth login, enable Google provider in Supabase Auth.

## 3. Configure environment variables

### Backend

Copy file:

```bash
cp backend/.env.example backend/.env
```

PowerShell alternative:

```powershell
Copy-Item backend/.env.example backend/.env
```

Required for normal operation:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL` (default local frontend URL)

Important optional variables:

- `PORT` (default `3001`)
- `EKOSYSTEM_API_BASE`, `EKOSYSTEM_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_POLLING_ENABLED`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
- `REDIS_URL` (currently optional in runtime path)

### Frontend

Copy file:

```bash
cp frontend/.env.local.example frontend/.env.local
```

PowerShell alternative:

```powershell
Copy-Item frontend/.env.local.example frontend/.env.local
```

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` (for local backend: `http://localhost:3001`)
- `NEXT_PUBLIC_SITE_URL` (for local frontend: `http://localhost:3000`)

## 4. Run the project

Use two terminals:

```bash
# Terminal 1
npm --prefix backend run start:dev

# Terminal 2
npm --prefix frontend run dev
```

Or use root helper scripts:

```bash
npm run start:dev:backend
npm run start:dev:frontend
```

Backend `start:dev` now uses `nodemon` with TypeScript execution (`ts-node`) and automatic restart on file changes.

The root `npm run start:dev` still starts backend only.

## Run with Docker (full stack)

The repository now includes a fully configured Docker setup for:

- `frontend` (Next.js dev server with hot reload)
- `backend` (NestJS dev server with hot reload)
- `redis` (local Redis service)

### Docker prerequisites

1. Create env files (if not already created):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

PowerShell alternative:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.local.example frontend/.env.local
```

2. Verify these local values:

| File | Variable | Recommended local value |
|---|---|---|
| `backend/.env` | `FRONTEND_URL` | `http://localhost:3000` |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | `http://localhost:3001` |
| `frontend/.env.local` | `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |

If default ports are already occupied, override host ports at runtime:

```bash
BACKEND_PORT=3101 FRONTEND_PORT=3100 REDIS_PORT=6380 docker compose up --build
```

PowerShell alternative:

```powershell
$env:BACKEND_PORT='3101'
$env:FRONTEND_PORT='3100'
$env:REDIS_PORT='6380'
docker compose up --build
```

### Start containers

```bash
docker compose up --build
```

### Open app

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Swagger (dev only): `http://localhost:3001/api/docs`
- Redis: `localhost:6379`

If you overrode ports, use your custom values instead.

### Useful Docker commands

```bash
# Stop and remove containers
docker compose down

# Follow logs for all services
docker compose logs -f

# Rebuild after Dockerfile/dependency changes
docker compose up --build --force-recreate
```

Notes:

- Source code is mounted into containers, so backend/frontend reload on code changes.
- Named volumes are used for `node_modules` and Redis data.
- File watching is configured for Docker-on-Windows compatibility (polling enabled).

## Useful scripts

| Scope | Command | Description |
|---|---|---|
| Root | `npm run start:dev` | Start backend dev server via nodemon |
| Root | `npm run start:dev:backend` | Start backend dev server via nodemon |
| Root | `npm run start:dev:frontend` | Start frontend dev server |
| Root | `npm run build` | Build backend + frontend |
| Backend | `npm --prefix backend run start:dev` | Start backend with nodemon (`-L`, ts-node, auto-restart) |
| Backend | `npm --prefix backend run start:dev:nest` | Start backend with Nest native watcher |
| Backend | `npm --prefix backend run build` | Build backend |
| Backend | `npm --prefix backend run test` | Run backend tests |
| Frontend | `npm --prefix frontend run dev` | Start frontend dev server |
| Frontend | `npm --prefix frontend run build` | Build frontend |
| Frontend | `npm --prefix frontend run lint` | Run frontend lint |

## 5. Local URLs

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`
- Swagger (dev only): `http://localhost:3001/api/docs`

## API overview

Public endpoints:

- `GET /companies/search?q=...&page=...`
- `GET /companies/browse?...filters`
- `GET /companies/:ico`
- `GET /companies/:ico/history`
- `GET /monitoring/status`

Authenticated endpoints (Bearer token from Supabase session):

- `GET /watchlist`
- `POST /watchlist`
- `PATCH /watchlist/:ico`
- `DELETE /watchlist/:ico`
- `GET /companies/:ico/refresh`
- `POST /monitoring/sync`
- `POST /notifications/push/subscribe`
- `POST /notifications/telegram/connect`
- `GET /notifications/alerts`
- `POST /notifications/alerts/read-all`
- `GET /notifications/vapid-public-key`
- `POST /notifications/test-all`

## Scheduled jobs

Configured in backend and executed while backend process is running:

- `0 2 * * *` (Europe/Bratislava): debt-source synchronization (`DataSyncService`)
- `0 3 * * *` (Europe/Bratislava): nightly watchlist monitoring and alert dispatch (`MonitoringService`)

## Notifications setup notes

### Telegram

1. Create a bot with `@BotFather`.
2. Put token into `TELEGRAM_BOT_TOKEN`.
3. Send `/start` to your bot and use the returned `chat_id`.
4. Connect `chat_id` in app Notifications/Profile UI.

### Web Push

1. Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

2. Put keys and contact email into backend `.env`.
3. In UI, enable browser notifications.

## PWA behavior

- PWA is enabled in production builds.
- PWA is disabled in development (`next-pwa` config), to avoid service worker cache conflicts while iterating locally.

## Localization (i18n)

- Supported UI languages: English (`en`) and Slovak (`sk`).
- Runtime language switcher is available in the bottom-right corner of the app.
- Selected language is persisted in browser `localStorage` key `kontrahent.locale`.
- Translation dictionaries live in `frontend/lib/i18n/messages.ts`.
- Date and currency formatting are locale-aware (`en-US` / `sk-SK`) across dashboard, search, notifications, and company detail views.