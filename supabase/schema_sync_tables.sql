-- ============================================================
-- EXTENSION TO schema.sql
-- Tables for local synchronization of official debtor registries
-- Run this AFTER the main schema.sql
-- ============================================================

-- ============================================================
-- TAX_DEBTORS (Financial Administration of the Slovak Republic)
-- Synchronized daily from official XML/CSV exports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tax_debtors (
  ico           TEXT PRIMARY KEY,
  name          TEXT,
  debt_amount   NUMERIC(15,2) DEFAULT 0,
  debt_type     TEXT DEFAULT 'tax',
  source        TEXT DEFAULT 'financna_sprava',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_debtors_debt ON public.tax_debtors(debt_amount DESC);
CREATE INDEX IF NOT EXISTS idx_tax_debtors_synced ON public.tax_debtors(synced_at DESC);

-- ============================================================
-- SOCIAL_DEBTORS (Social Insurance Agency)
-- Synchronized from official CSV/ZIP exports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.social_debtors (
  ico           TEXT PRIMARY KEY,
  name          TEXT,
  debt_amount   NUMERIC(15,2) DEFAULT 0,
  debt_type     TEXT DEFAULT 'social',
  source        TEXT DEFAULT 'socialna_poistovna',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_debtors_debt ON public.social_debtors(debt_amount DESC);

-- ============================================================
-- SYNC_LOG (sync history)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source        TEXT NOT NULL,
  records_count INT DEFAULT 0,
  status        TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'partial')),
  error_message TEXT,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_date ON public.sync_log(synced_at DESC);

-- ============================================================
-- RLS for new tables (read-only public access)
-- ============================================================
ALTER TABLE public.tax_debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_debtors_read" ON public.tax_debtors FOR SELECT USING (TRUE);
CREATE POLICY "social_debtors_read" ON public.social_debtors FOR SELECT USING (TRUE);
CREATE POLICY "sync_log_read" ON public.sync_log FOR SELECT USING (TRUE);

-- ============================================================
-- USEFUL CHECK QUERIES
-- ============================================================

-- Check synchronization coverage
-- SELECT source, COUNT(*), MAX(synced_at) FROM tax_debtors GROUP BY source;
-- SELECT source, COUNT(*), MAX(synced_at) FROM social_debtors GROUP BY source;

-- Top debtors
-- SELECT name, ico, debt_amount FROM tax_debtors ORDER BY debt_amount DESC LIMIT 20;

-- Check a specific company
-- SELECT * FROM tax_debtors WHERE ico = '31320155';
-- SELECT * FROM social_debtors WHERE ico = '31320155';
