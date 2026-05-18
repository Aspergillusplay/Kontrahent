# Data Sources and Ingestion Logic

This document describes the data-source logic that is currently implemented in the codebase.

## 1. Runtime flow by API use case

### Company search (`GET /companies/search`)

Primary source:
- Ekosystem Datahub search endpoint:
  - `GET {EKOSYSTEM_API_BASE}/corporate_bodies/search`
  - Optional header: `Authorization: Token {EKOSYSTEM_API_KEY}`

Behavior details:
- For very short queries (`< 2` characters), backend returns local cache results only.
- For exact numeric ICO-like input (`6-8` digits), backend first tries direct `getCompany()` resolution.

Fallback chain when global search is unavailable:
1. Local cache from `public.companies`
2. FinStat public search page scraping:
   - `https://www.finstat.sk/vyhladavanie?...`

Result enrichment:
- Search results are enriched with stored `risk_score` values from local DB when available.

### Company browse (`GET /companies/browse`)

Source:
- FinStat public company database page scraping:
  - `https://www.finstat.sk/databaza-firiem-organizacii?...`

Extracted fields:
- ICO, company name, city, region, employee range, sales, creation date
- Total count and pagination metadata

### Company details (`GET /companies/:ico`, `GET /companies/:ico/refresh`)

Data assembly pipeline:
1. Read cached row from `public.companies`.
2. If cache is stale/incomplete, refresh with:
   - FinStat company page scraping: `https://www.finstat.sk/{ico}`
   - Ekosystem registry detail endpoint:
     - `GET {EKOSYSTEM_API_BASE}/corporate_bodies/{ico}`
   - FinStat search fallback for identity fields (name/address/city) if needed.
3. Merge normalized fields, compute risk, persist to `public.companies`.

Main enrichment from FinStat scraping:
- Debt-related signals (`tax_debt`, `social_debt`, `health_debt`)
- Legal event counters
- Bankruptcy/liquidation indicators
- Financial indicators and chart-derived history
- Metadata fallback (`DIC`, `IC DPH`, `SK NACE`, registration date, etc.)

### Monitoring and debt-source sync

Endpoints:
- `GET /monitoring/status`
- `POST /monitoring/sync`

Background job:
- Daily cron in `DataSyncService`: `0 2 * * *` (`Europe/Bratislava`)

Sync targets:
- `public.tax_debtors`
- `public.social_debtors`

Source chain:
1. Financial Administration (tax debtors)
   - Primary: `https://report.financnasprava.sk/ds_dsdd.zip` (ZIP/XML)
   - Fallback: legacy XML URL
   - Fallback: legacy CSV URL
2. Social Insurance Agency (social debtors)
   - Primary: discover current download URL from:
     - `https://www.socpoist.sk/nastroje-sluzby/zoznam-dlznikov`
   - Fallback: static ZIP URL in code

## 2. Source matrix

| Source | Access mode | Used for | Role |
|---|---|---|---|
| Ekosystem Datahub (`corporate_bodies/search`) | HTTP JSON (+ optional token) | Search | Primary search source |
| Ekosystem Datahub (`corporate_bodies/{ico}`) | HTTP JSON (+ optional token) | Company details | Identity/status enrichment |
| FinStat public search pages | HTML scraping | Search fallback | Discovery and identity fallback |
| FinStat public database page | HTML scraping | Browse | Primary browse source |
| FinStat company page | HTML scraping | Company details | Main risk/financial/event enrichment |
| Financial Administration debtor export | ZIP/XML (+ legacy XML/CSV) | Monitoring sync | Writes `tax_debtors` snapshot table |
| Social Insurance debtor export | ZIP/CSV discovered URL + fallback | Monitoring sync | Writes `social_debtors` snapshot table |

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

`DataSyncService` keeps `tax_debtors` and `social_debtors` synchronized for monitoring/lookup purposes.

Current company detail risk scoring is still driven mainly by:
- FinStat company-page extraction
- Cached company data in `public.companies`

The sync tables are an additional debt data layer, not the only scoring source.

## 5. Resilience strategy

- Search fallback tiers: `Ekosystem -> local cache -> FinStat search`.
- Tax debtor feed fallback tiers: `ZIP/XML -> legacy XML -> legacy CSV`.
- Social debtor feed: dynamic URL discovery + static fallback URL.
- Cache freshness logic with forced refresh when critical identity/debt/enrichment fields are missing or inconsistent.

## 6. Optional placeholders

These env variables exist but are not part of the current primary flow:
- `FINSTAT_API_KEY`
- `FINSTAT_API_BASE`

Current implementation uses public FinStat pages (scraping), not paid FinStat API endpoints.
