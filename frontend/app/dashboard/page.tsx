"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '../../components/AppHeader';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n/provider';
import { getSupabase } from '../../lib/supabase';
import {
  DashboardCompaniesList,
  DashboardDemoBanner,
  DashboardHeaderActions,
  DashboardHeaderCenterSearch,
  DashboardSummarySection,
  DashboardTitleSection,
} from './components/DashboardSections';

export default function DashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = getSupabase();

  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [batchRefreshing, setBatchRefreshing] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const isDemoFromQuery =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'true';

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user && isDemoFromQuery) {
        setIsDemo(true);
      }
      loadData(!!data.user);
    });
  }, []);

  const loadData = async (hasAuth: boolean) => {
    setLoading(true);
    try {
      if (!hasAuth) {
        const exampleIcos = ['35876832', '35763469', '46861891'];
        const companies = await Promise.all(
          exampleIcos.map(async (ico) => {
            try {
              const data = await api.companies.get(ico);
              return { ico, companies: data };
            } catch {
              return null;
            }
          })
        );
        setWatchlist(companies.filter((c) => c !== null));
        return;
      }

      const [wl, alerts] = await Promise.allSettled([api.watchlist.list(), api.notifications.alerts()]);

      if (wl.status === 'fulfilled') setWatchlist(wl.value as any[]);
      if (alerts.status === 'fulfilled') {
        setUnreadAlerts((alerts.value as any[]).filter((a: any) => !a.is_read).length);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleRemove = async (ico: string) => {
    await api.watchlist.remove(ico);
    setWatchlist((prev) => prev.filter((w) => w.ico !== ico));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleRefreshAll = async () => {
    if (watchlist.length === 0 || batchRefreshing || isDemo) return;
    setBatchRefreshing(true);
    try {
      await Promise.allSettled(watchlist.map((item) => api.companies.refresh(item.ico)));
      await loadData(true);
    } catch (err) {
      console.error('Batch refresh error:', err);
    } finally {
      setBatchRefreshing(false);
    }
  };

  const riskCounts = {
    red: watchlist.filter((w) => w.companies?.risk_score === 'red').length,
    yellow: watchlist.filter((w) => w.companies?.risk_score === 'yellow').length,
    green: watchlist.filter((w) => w.companies?.risk_score === 'green').length,
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {isDemo && <DashboardDemoBanner t={t} />}

      <AppHeader
        maxWidthClassName="max-w-6xl"
        center={
          <DashboardHeaderCenterSearch
            t={t}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSearchSubmit={handleSearchSubmit}
          />
        }
        right={<DashboardHeaderActions t={t} isDemo={isDemo} unreadAlerts={unreadAlerts} onSignOut={signOut} />}
      />

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <DashboardTitleSection t={t} />
        <DashboardSummarySection
          t={t}
          watchlist={watchlist}
          batchRefreshing={batchRefreshing}
          onRefreshAll={handleRefreshAll}
          riskCounts={riskCounts}
        />
        <DashboardCompaniesList t={t} loading={loading} watchlist={watchlist} onRemove={handleRemove} />
      </main>
    </div>
  );
}
