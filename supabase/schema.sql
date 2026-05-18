-- ============================================================
-- Kontrahent.sk - Supabase Database Schema
-- Run in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  full_name        TEXT,
  company_name     TEXT,
  telegram_chat_id TEXT,
  push_subscription JSONB,
  plan             TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE public.companies (
  ico               TEXT PRIMARY KEY,               -- ICO (company identifier)
  name              TEXT NOT NULL,
  legal_form        TEXT,
  address           TEXT,
  city              TEXT,
  status            TEXT,                           -- active / dissolved / in liquidation

  -- Risk indicators
  tax_debt          NUMERIC(15,2) DEFAULT 0,        -- Tax debt (EUR)
  social_debt       NUMERIC(15,2) DEFAULT 0,        -- Social insurance debt (EUR)
  health_debt       NUMERIC(15,2) DEFAULT 0,        -- Health insurance debt (EUR)
  court_cases       INT DEFAULT 0,                  -- Number of active court cases
  is_bankrupt       BOOLEAN DEFAULT FALSE,          -- Bankruptcy register flag
  is_in_liquidation BOOLEAN DEFAULT FALSE,

  -- Computed risk
  risk_score        TEXT DEFAULT 'green' CHECK (risk_score IN ('green', 'yellow', 'red')),
  risk_reasons      JSONB DEFAULT '[]'::JSONB,      -- Warning reason list

  -- Raw API response cache
  raw_data          JSONB,

  last_checked_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_risk_score ON public.companies(risk_score);
CREATE INDEX idx_companies_updated ON public.companies(updated_at);

-- ============================================================
-- COMPANY HISTORY (audit trail of changes)
-- ============================================================
CREATE TABLE public.company_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ico         TEXT NOT NULL REFERENCES public.companies(ico) ON DELETE CASCADE,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  field_name  TEXT NOT NULL,       -- e.g. 'tax_debt', 'risk_score'
  old_value   TEXT,
  new_value   TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('improved', 'worsened', 'neutral'))
);

CREATE INDEX idx_history_ico ON public.company_history(ico);
CREATE INDEX idx_history_changed_at ON public.company_history(changed_at DESC);

-- ============================================================
-- WATCHLISTS
-- ============================================================
CREATE TABLE public.watchlists (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ico             TEXT NOT NULL REFERENCES public.companies(ico) ON DELETE CASCADE,
  alias           TEXT,               -- User-defined label / note
  notify_telegram BOOLEAN DEFAULT TRUE,
  notify_push     BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, ico)
);

CREATE INDEX idx_watchlists_user ON public.watchlists(user_id);
CREATE INDEX idx_watchlists_ico ON public.watchlists(ico);

-- ============================================================
-- ALERTS (sent notification log)
-- ============================================================
CREATE TABLE public.alerts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ico          TEXT NOT NULL,
  company_name TEXT NOT NULL,
  message      TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  is_read      BOOLEAN DEFAULT FALSE,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_user ON public.alerts(user_id, is_read);
CREATE INDEX idx_alerts_sent ON public.alerts(sent_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_history ENABLE ROW LEVEL SECURITY;

-- Profiles: user sees only their own
CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Companies: everyone can read (public data)
CREATE POLICY "companies_read" ON public.companies
  FOR SELECT USING (TRUE);

-- Company history: everyone can read
CREATE POLICY "history_read" ON public.company_history
  FOR SELECT USING (TRUE);

-- Watchlists: user manages their own
CREATE POLICY "watchlists_own" ON public.watchlists
  FOR ALL USING (auth.uid() = user_id);

-- Alerts: user sees their own
CREATE POLICY "alerts_own" ON public.alerts
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Compute risk score from company fields
CREATE OR REPLACE FUNCTION compute_risk_score(
  p_tax_debt NUMERIC,
  p_social_debt NUMERIC,
  p_health_debt NUMERIC,
  p_court_cases INT,
  p_is_bankrupt BOOLEAN,
  p_is_in_liquidation BOOLEAN
) RETURNS TEXT AS $$
BEGIN
  IF p_is_bankrupt OR p_is_in_liquidation OR p_tax_debt > 1000 THEN
    RETURN 'red';
  ELSIF p_social_debt > 0 OR p_health_debt > 0 OR p_court_cases > 0 OR p_tax_debt > 0 THEN
    RETURN 'yellow';
  ELSE
    RETURN 'green';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
