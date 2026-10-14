# Reliability release — October 2026

## Repairs

Previous paths could retain repaid debts through truthy fallbacks, mix reporting columns/years, match debt by similar names, duplicate monitoring history, show low risk for unknown data and cache private API responses. Repairs introduce exact IČO matching, explicit source status, validated financial templates, atomic snapshots and event uniqueness.

Search filters run before pagination; URL navigation preserves them. Failed dashboard requests keep existing data and expose retry. Unknown values/assessments are distinct from zero/low risk. Slow first requests explain server startup. PWA upgrades remove old response caches, including clients registered at the former worker URL.

## Existing hosting configuration

| Host | Setting | Value |
| --- | --- | --- |
| Render | Plan / root | Free, one Frankfurt web instance / backend |
| Render | Runtime | Repository Dockerfile, Node 22 |
| Render | FRONTEND_URL | https://kontrahent.vercel.app |
| Render | BACKGROUND_JOBS_ENABLED | true |
| Render | TELEGRAM_BOT_POLLING_ENABLED | false |
| Both servers | MAINTENANCE_SECRET | Same random server-only secret |
| Vercel | Root / Node | frontend / 24.x |
| Vercel | NEXT_PUBLIC_API_URL | https://kontrahent-backend.onrender.com |
| Vercel | CRON_SECRET | Independent random server-only secret |
| Vercel | Cron | /api/maintenance, daily at 05:00 UTC |

Keep existing Supabase, Telegram and VAPID credentials. Never commit secrets. `/health` checks process liveness; `/health/ready` checks database access. The Blueprint's health-check setting requires applying it to a manually configured service.

A maintenance call queues work in the existing API. A 10-minute database lease, bounded batches and a persistent cursor allow recovery after process interruption. No paid worker, Redis or artificial keep-alive service is introduced.

## Database rollout

Three versioned migrations were applied before this application release. Existing accounts/watchlists were preserved. Fifty-two malformed or duplicate history rows were soft-quarantined. Unverified legacy history remains stored but is not displayed.

The October 12 social-insurance export was imported October 13: 134,413 published rows produced 120,082 distinct identified IČOs. Rows without an IČO are not guessed. Thirty cached companies were rechecked; one unverified legacy identity remains excluded from directory browse.

## Verification

- Seventeen backend regression tests passed: repayment to zero, missing values, identifier validation, financial columns/components, chart reconciliation, malformed/duplicate feed rows, concurrency, stale fallback, report selection and push endpoint validation.
- PostgreSQL rollback tests passed for snapshot/history deduplication, late-result rejection, atomic source publication, leases and permissions.
- Disposable-user integration passed for login, profile/watchlist isolation, private/admin denial, duplicate additions, list/update/delete, unsafe push rejection and alerts/read-all. Test users were removed.
- Backend TypeScript and production frontend builds passed. Production-dependency audits returned zero known vulnerabilities at verification time.
- Tailwind 3 development dependencies retain audit findings; they process repository-controlled styles and do not ship in the production server dependency tree. A Tailwind major migration is outside this repair.
- Browser verification covers search, company data, themes, responsive display and sign-in redirects. Actual delivery to a user's Telegram/browser and Google OAuth consent require user interaction and were not exercised.

## Release and recovery

1. Apply only unapplied migrations and configure the server-only maintenance secrets.
2. Run builds/tests and inspect the application diff.
3. Merge to main; allow Vercel to build. Render auto-deploy is disabled, so explicitly deploy its current main commit.
4. Verify deployed commit, readiness, source status, company lookup, filter totals, private-route denial, PWA worker URLs and production UI.
5. On an operational regression, redeploy the last known good release on each host, preserving additive migrations and snapshots. Prefer a forward fix over returning to the pre-integrity application, which could again write misleading values. Never drop user/source tables during recovery.

## External limits

[Render Free](https://render.com/docs/free) sleeps after 15 minutes of inactivity and can take about a minute to wake. [Vercel Hobby cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) runs daily with scheduling tolerance. Supabase Free and official registers have availability/usage limits.

RPO name search may fail while exact IČO lookup works via RUZ. Tax, health-insurance, VAT and court coverage must remain unavailable until a reliable exact-identifier connector exists. External notification delivery has an unavoidable crash window between sending and saving the receipt.

This is an informational view of published records, not a solvency certificate. Source publication date, accounting period and application check time are different concepts.
