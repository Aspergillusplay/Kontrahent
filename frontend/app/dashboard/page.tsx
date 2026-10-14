"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '../../components/AppHeader';
import RequestFeedback from '../../components/RequestFeedback';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n/provider';
import { getSupabase } from '../../lib/supabase';
import { DashboardCompaniesList, DashboardDemoBanner, DashboardHeaderActions, DashboardHeaderCenterSearch,
  DashboardSummarySection, DashboardTitleSection } from './components/DashboardSections';

export default function DashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [batchRefreshing, setBatchRefreshing] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(null);
      try {
        const { data: { user }, error: authError } = await getSupabase().auth.getUser();
        if (authError && authError.name !== 'AuthSessionMissingError') throw authError;
        const demo = !user && new URLSearchParams(window.location.search).get('demo') === 'true';
        if (!user && !demo) { router.replace('/auth/login?redirect=/dashboard'); return; }
        if (!active) return;
        setIsDemo(demo);
        if (demo) {
          const companies = [];
          for (const ico of ['35763469', '50847902', '36421928']) {
            companies.push({ ico, companies: await api.companies.get(ico, controller.signal) });
          }
          if (active) setWatchlist(companies);
        } else {
          const [list, alerts] = await Promise.all([api.watchlist.list(), api.notifications.alerts()]);
          if (active) { setWatchlist(list); setUnreadAlerts(alerts.filter(a => !a.is_read).length); }
        }
      } catch (e) { if (active) setError(String(e)); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [attempt, router]);

  async function handleRemove(ico: string) {
    if (isDemo || pending.current.has(ico)) return;
    pending.current.add(ico); setError(null);
    try { await api.watchlist.remove(ico); setWatchlist(prev => prev.filter(w => w.ico !== ico)); }
    catch (e) { setError(String(e)); }
    finally { pending.current.delete(ico); }
  }
  async function handleRefreshAll() {
    if (isDemo || pending.current.has('refresh')) return;
    pending.current.add('refresh'); setBatchRefreshing(true); setError(null);
    let failed = false;
    for (const item of watchlist) {
      try {
        const company = await api.companies.refresh(item.ico);
        setWatchlist(prev => prev.map(w => w.ico === item.ico ? { ...w, companies: company } : w));
      } catch { failed = true; }
    }
    if (failed) setError('refresh');
    pending.current.delete('refresh'); setBatchRefreshing(false);
  }
  async function signOut() {
    const { error } = await getSupabase().auth.signOut();
    if (error) setError(error.message); else window.location.assign('/');
  }
  const riskCounts = Object.fromEntries(['red', 'yellow', 'green', 'unknown'].map(risk =>
    [risk, watchlist.filter(w => (w.companies?.risk_score || 'unknown') === risk).length])) as Record<'red'|'yellow'|'green'|'unknown', number>;
  return <div className="min-h-screen bg-slate-950">
    {isDemo && <DashboardDemoBanner t={t} />}
    <AppHeader maxWidthClassName="max-w-6xl" center={<DashboardHeaderCenterSearch t={t} searchQuery={searchQuery}
      setSearchQuery={setSearchQuery} onSearchSubmit={e => { e.preventDefault(); if (searchQuery.trim()) router.push('/search?q=' + encodeURIComponent(searchQuery.trim())); }} />}
      right={<DashboardHeaderActions t={t} isDemo={isDemo} unreadAlerts={unreadAlerts} onSignOut={signOut} />} />
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      <DashboardTitleSection t={t} />
      <RequestFeedback loading={loading || batchRefreshing} error={error} onRetry={() => setAttempt(a => a + 1)} />
      {!loading && <DashboardSummarySection t={t} watchlist={watchlist} batchRefreshing={batchRefreshing || isDemo}
        onRefreshAll={handleRefreshAll} riskCounts={riskCounts} />}
      {(!error || watchlist.length > 0) && <DashboardCompaniesList t={t} loading={loading} watchlist={watchlist} onRemove={isDemo ? undefined : handleRemove} />}
    </main>
  </div>;
}
