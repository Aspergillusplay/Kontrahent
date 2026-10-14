# Kontrahent.sk

Search Slovak companies, inspect available financial statements and track a personal watchlist. Source coverage and reporting dates accompany results; unavailable data does not imply safety.

- Next.js 16 / React 19 frontend on Vercel
- NestJS 11 API on Render
- Supabase PostgreSQL/Auth with private-user RLS policies
- English/Slovak UI, light/dark themes, installable PWA, optional Telegram/Web Push

[Data sources](DATA_SOURCES.md) · [Operations and verification](docs/reliability.md)

## Local setup

Use Node.js 22.12+ (24 recommended) and npm. Install each application:

```sh
npm --prefix backend ci
npm --prefix frontend ci
```

Create `backend/.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL=http://localhost:3000`. Create `frontend/.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL=http://localhost:3001`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Never expose the service-role key to the frontend.

For a new database apply `supabase/schema.sql`, `supabase/schema_sync_tables.sql`, then ordered files in `supabase/migrations`. For existing databases apply only unapplied migrations. Configure Supabase's site URL and frontend `/auth/callback` redirects. Google login also requires its provider setup.

Run `npm run start:dev:backend` and `npm run start:dev:frontend` in separate terminals, or `docker compose up --build`. Frontend: port 3000; API: 3001; development Swagger: `/api/docs`. Leave `BACKGROUND_JOBS_ENABLED=false` and `TELEGRAM_BOT_POLLING_ENABLED=false` locally when using a shared database.

## Verification

```sh
npm --prefix backend test
npm --prefix frontend run build
npm --prefix backend audit --omit=dev
npm --prefix frontend audit --omit=dev
```

`backend/test/database-integrity.sql` is rollback-only. The optional `backend/test/api.integration.cjs` requires `RUN_INTEGRATION_TESTS=true`, a local API and local environment files. It creates/removes a disposable Auth user, checks isolation and watchlist operations, and sends no email, Telegram or push.

GitHub Actions runs both builds, backend regression tests and production-dependency audits.

## Free deployment

Keep the existing Vercel Hobby frontend, Render Free API and Supabase project. `render.yaml` documents the API configuration; `frontend/vercel.json` contains one daily cron. Server-only secrets, deployment and recovery are described in [operations](docs/reliability.md).

Render Free sleeps after inactivity. The UI explains delayed responses and provides retry. This setup does not promise uninterrupted availability or real-time monitoring. Source failures preserve previous snapshots and show their age.
