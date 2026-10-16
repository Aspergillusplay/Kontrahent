# Data sources and integrity

Last verified: 2026-10-14. Coverage is also explained to users at `/about-data`.

| Source | Use | Limitations |
| --- | --- | --- |
| [RPO](https://api.statistics.sk/rpo/v1) | Name search, exact IČO identity/status | May time out; cached name matches remain available. |
| [RUZ](https://www.registeruz.sk/cruz-public/home/api) | Exact IČO lookup, accounting statements and code lists | No global name search; some reports are PDF-only or use unsupported templates. |
| [Sociálna poisťovňa](https://www.socpoist.sk/nastroje-sluzby/zoznam-dlznikov) | Published social-insurance debt snapshot | Publication delays and thresholds apply. Absence is not a certificate of no debt. |
| [Financial Administration](https://report.financnasprava.sk/ds_dsdd.zip) | Tax-debt ingestion when exact IČO is present | Inspected export lacks IČO. Tax debt is unavailable; names/addresses are never used to assign debt. |
| Health insurance, VAT, courts | No verified connector | Shown as unavailable, never as zero, false or a low-risk verdict. |

## Serving data

Directory filters and sorting run in PostgreSQL before pagination. The total covers indexed companies, not all Slovak registers. A first-page name/IČO query can add official identities; identity-only records have an unknown assessment. Identifiers must match exactly.

Checks share one in-flight request per IČO, allow at most four concurrent refreshes and bound external calls. A verified cache is reused for 24 hours. If both identity sources fail, the previous record remains visibly stale without advancing its timestamp. Legacy scraped financial and debt values are not exposed as verified data.

RUZ reports are selected by accounting period, excluding consolidated reports and superseded filings for the same year. Supported templates use the current net column, preserve zero/negative values, and use total revenue or all required components. Pie charts require top-level components to reconcile with the total. Company pages display the actual financial year.

## Atomic persistence

- `save_company_snapshot` serializes each IČO, rejects late older requests, and commits company changes, verified history and alerts together.
- Unique user/event keys prevent repeated identical checks from duplicating application alerts.
- `debt_snapshot_rows` stages complete source imports; validated publication atomically changes `debt_sync_state`. Failed imports preserve the previous snapshot.
- Social exports can contain separate registrations for one IČO. They are summed in integer cents and stored as one company total. Conflicting tax duplicates are rejected.
- Internal tables use RLS and mutation RPCs are service-role only. Browser users access their own private records.
- Invalid legacy history is soft-quarantined; other unverified history is retained but hidden.

## Monitoring

Vercel's daily authenticated maintenance request wakes the existing Render API and queues work. Startup and awake-process scheduling recover due work. Database leases prevent competing jobs; a persistent cursor spreads bounded company batches across runs. No Redis, paid worker or perpetual keep-alive loop is required.

Source attempts run at most once per 23 hours. Monitoring reuses the 24-hour company cache; individual explicit refresh remains available. Notifications retain per-channel delivery flags. A provider cannot guarantee exactly-once delivery across a crash between sending and saving a receipt; database history/alert deduplication remains transactional.

See [operations](docs/reliability.md) for configuration, checks and limits.
