# Kontrahent.sk

[![TypeScript](https://img.shields.io/badge/TypeScript-94.6%25-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2014-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/Backend-NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![PWA](https://img.shields.io/badge/Experience-PWA-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

Kontrahent.sk is a full-stack platform for monitoring Slovak business counterparties.
It helps users assess financial and legal risk, search and analyze companies, track important changes, and receive alerts through Telegram and Web Push notifications.

## Why this project exists

When working with suppliers, clients, or other business partners, it is important to understand their reliability before problems become expensive. Kontrahent.sk brings together company search, debt and legal-event monitoring, risk indicators, and personal watchlists in one interface.

## Key features

- Public company search with external-source enrichment and local cache fallback.
- Company detail pages with risk score, debt indicators, legal-event signals, and financial history.
- Personal watchlist for tracking selected companies over time.
- Alert center with read/unread management.
- Telegram and Web Push notification delivery.
- Daily synchronization of debt-related source data.
- Background monitoring jobs for watchlist changes.
- English and Slovak interface localization.
- Progressive Web App support for installable mobile/desktop experience.

## Product overview

### User-facing areas

- `frontend/app/page.tsx` — landing page
- `frontend/app/search` — company discovery and search flows
- `frontend/app/company` — company detail pages
- `frontend/app/dashboard` — personal monitoring dashboard
- `frontend/app/notifications` — alerts and notification center
- `frontend/app/profile` — user profile and preferences
- `frontend/app/auth` — authentication flows

### Backend domains

- `backend/src/companies` — company search, browse, details, enrichment
- `backend/src/watchlist` — tracked counterparties per user
- `backend/src/monitoring` — sync jobs and monitoring logic
- `backend/src/notifications` — Telegram, push, and alert delivery
- `backend/src/auth` — authenticated API access
- `backend/src/supabase` — Supabase integration layer

## Repository structure

```text
kontrahent/
|-- backend/                # NestJS API
|-- frontend/               # Next.js 14 app (App Router, PWA)
|-- supabase/               # SQL schema files
|   |-- schema.sql
|   `-- schema_sync_tables.sql
|-- docker-compose.yml
|-- DATA_SOURCES.md         # Data origin and ingestion logic
`-- package.json            # Root helper scripts
```

## Tech stack

- **Frontend:** Next.js 14, React 18, Tailwind CSS, Recharts, next-pwa
- **Backend:** NestJS, TypeScript, Axios, Cheerio, BullMQ-ready dependencies
- **Database/Auth:** Supabase, PostgreSQL, Row Level Security
- **Notifications:** Telegram Bot API, Web Push
- **Scheduling:** `@nestjs/schedule`
- **Localization:** custom i18n layer for English and Slovak

## Data sources

The application aggregates company and risk-related information from multiple sources.
A full breakdown is available in `DATA_SOURCES.md`.

Current source logic includes:

- Ekosystem Datahub for company search and detail enrichment
- FinStat public pages for browse, company detail scraping, and fallback discovery
- Financial Administration debtor exports for tax-debt synchronization
- Social Insurance debtor exports for social-debt synchronization

## Prerequisites

- Node.js 20+ (recommended)
- npm 10+
- Supabase project (URL + keys)
- Optional: Docker Desktop 4+ for containerized local development

## 1. Install dependencies

From the repository root:

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
5. If needed, enable Google OAuth in Supabase Auth.

## 3. Configure environment variables

### Backend

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
- `FRONTEND_URL`

Important optional variables:

- `PORT` (default `3001`)
- `EKOSYSTEM_API_BASE`, `EKOSYSTEM_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_POLLING_ENABLED`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
- `REDIS_URL`

### Frontend

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
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SITE_URL`

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

## Run with Docker

The repository includes a local Docker setup for:

- `frontend` — Next.js dev server with hot reload
- `backend` — NestJS dev server with hot reload
- `redis` — local Redis service

### Start containers

```bash
docker compose up --build
```

### Open locally

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Swagger (dev only): `http://localhost:3001/api/docs`
- Redis: `localhost:6379`

## Useful scripts

| Scope | Command | Description |
|---|---|---|
| Root | `npm run start:dev` | Start backend dev server via nodemon |
| Root | `npm run start:dev:backend` | Start backend dev server |
| Root | `npm run start:dev:frontend` | Start frontend dev server |
| Root | `npm run build` | Build backend + frontend |
| Backend | `npm --prefix backend run build` | Build backend |
| Backend | `npm --prefix backend run test` | Run backend tests |
| Frontend | `npm --prefix frontend run dev` | Start frontend dev server |
| Frontend | `npm --prefix frontend run build` | Build frontend |
| Frontend | `npm --prefix frontend run lint` | Run frontend lint |

## API overview

### Public endpoints

- `GET /companies/search?q=...&page=...`
- `GET /companies/browse?...filters`
- `GET /companies/:ico`
- `GET /companies/:ico/history`
- `GET /monitoring/status`

### Authenticated endpoints

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

Configured in backend and executed while the backend process is running:

- `0 2 * * *` (`Europe/Bratislava`) — debt-source synchronization via `DataSyncService`
- `0 3 * * *` (`Europe/Bratislava`) — nightly watchlist monitoring and alert dispatch via `MonitoringService`

## Notifications setup notes

### Telegram

1. Create a bot with `@BotFather`.
2. Put the token into `TELEGRAM_BOT_TOKEN`.
3. Send `/start` to your bot and use the returned `chat_id`.
4. Connect the `chat_id` in the app UI.

### Web Push

1. Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

2. Put the keys and contact email into backend `.env`.
3. Enable browser notifications in the UI.

## PWA behavior

- PWA is enabled in production builds.
- PWA is disabled in development to avoid service worker cache conflicts during local iteration.

## Localization

- Supported UI languages: English (`en`) and Slovak (`sk`)
- Runtime language switcher is available in the app
- Selected language is stored in `localStorage` under `kontrahent.locale`

## Development notes

- Main application modules are wired in `backend/src/app.module.ts`.
- Repository-wide helper scripts live in the root `package.json`.
- App install metadata is configured in `frontend/public/manifest.json`.

## Roadmap ideas

- Add screenshots and product walkthrough GIFs to the README
- Add repository topics and social preview image in GitHub settings
- Add license metadata
- Add CI status badges once workflows are configured
