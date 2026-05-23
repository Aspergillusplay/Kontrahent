# Data Sources and Ingestion Logic

This document describes the current data-source architecture after migration away from HTML scraping.

## 1. Runtime flow by API use case

### Company search (`GET /companies/search`)

Primary source:
- RPO API (Statistical Office of the Slovak Republic)
  - `GET {RPO_API_BASE}/search`
  - Main params used: `fullName`, `identifier`, `onlyActive`

Fallback chain:
1. Local cache (`public.companies`)
2. RUZ ICO lookup for numeric identifiers (`GET {RUZ_API_BASE}/uctovne-jednotky`)

Result enrichment:
- Search results are enriched with local `risk_score` when available.

### Company browse (`GET /companies/browse`)

Primary source:
- RUZ API (Register of financial statements)
  - `GET {RUZ_API_BASE}/uctovne-jednotky`
  - `GET {RUZ_API_BASE}/zostavajuce-id/uctovne-jednotky`
  - `GET {RUZ_API_BASE}/uctovna-jednotka`

Enrichment:
- Legal forms / organization sizes / regions from RUZ codelists:
  - `/pravne-formy`
  - `/velkosti-organizacie`
  - `/kraje`
- Local cached revenue is added to browse rows when available.

### Company details (`GET /companies/:ico`, `GET /companies/:ico/refresh`)

Data assembly pipeline:
1. Read cached row from `public.companies`.
2. Refresh from official sources:
   - RPO entity search + detail:
     - `GET {RPO_API_BASE}/search?identifier={ico}`
     - `GET {RPO_API_BASE}/entity/{id}`
   - RUZ accounting unit + statements:
     - `GET {RUZ_API_BASE}/uctovne-jednotky`
     - `GET {RUZ_API_BASE}/uctovna-jednotka`
     - `GET {RUZ_API_BASE}/uctovna-zavierka`
     - `GET {RUZ_API_BASE}/uctovny-vykaz`
     - `GET {RUZ_API_BASE}/sablona`
3. Resolve debt snapshot from official debtor feeds (tax/social) and local sync tables.
4. Merge with existing `raw_data` without dropping previously captured fields.

### Monitoring and debt-source sync

Endpoints:
- `GET /monitoring/status`
- `POST /monitoring/sync`

Background job:
- Daily cron in `DataSyncService`: `0 2 * * *` (`Europe/Bratislava`)

Sync targets:
- `public.tax_debtors`
- `public.social_debtors`

Official source chain:
1. Financial Administration (tax debtors)
   - Primary: `https://report.financnasprava.sk/ds_dsdd.zip` (ZIP/XML)
   - Fallback: legacy XML URL
   - Fallback: legacy CSV URL
2. Social Insurance Agency (social debtors)
   - Direct export URL: `https://www.socpoist.sk/api/idsp/download/7946c279-f0b4-451a-b199-a317f675e6cf`

## 2. Source matrix

| Source | Access mode | Used for | Role |
|---|---|---|---|
| RPO API (`/search`, `/entity/{id}`) | HTTP JSON | Search, identity, status | Primary legal-entity source |
| RUZ API (`/uctovne-jednotky`, `/uctovna-jednotka`, `/uctovna-zavierka`, `/uctovny-vykaz`, `/sablona`) | HTTP JSON | Browse, financials, profile enrichment | Primary accounting source |
| Financial Administration debtor export | ZIP/XML (+ legacy XML/CSV) | Monitoring sync + fallback debt resolution | Official tax-debt source |
| Social Insurance debtor export | ZIP/CSV | Monitoring sync + fallback debt resolution | Official social-debt source |

## 3. Database persistence map

Primary serving table:
- `public.companies`

Related product tables:
- `public.company_history`
- `public.watchlists`
- `public.alerts`
- `public.profiles`

Snapshot and sync tables:
- `public.tax_debtors`
- `public.social_debtors`
- `public.sync_log`

## 4. Important implementation note

`DataSyncService` keeps `tax_debtors` and `social_debtors` synchronized for monitoring and lookup.

`CompaniesService`:
- resolves identity/enrichment from RPO + RUZ,
- resolves debts from synchronized tables and official feed fallbacks,
- preserves previously captured fields in `raw_data` when new source payloads do not include them.

## 5. Resilience strategy

- Search fallback tiers: `RPO -> local cache -> RUZ ICO lookup`.
- Browse fallback for text query: local cache augmentation.
- Tax debtor feed fallback tiers: `ZIP/XML -> legacy XML -> legacy CSV`.
- Company cache freshness logic with forced refresh when identity or enrichment is incomplete.
