'use client';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Plus, Bell, Search, RefreshCw, LogOut, Loader2, X, Zap } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import RiskBadge from '../../components/RiskBadge';
import CompanyRow from '../../components/CompanyRow';
import { useI18n } from '../../lib/i18n/provider';

export default function DashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabase();

  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [batchRefreshing, setBatchRefreshing] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user && searchParams.get('demo') === 'true') {
        setIsDemo(true);
      }
      loadData(!!data.user);
    });
  }, [searchParams]);

  const loadData = async (hasAuth: boolean) => {
    setLoading(true);
    try {
      if (!hasAuth) {
        // Load example companies for demo mode
        const exampleIcos = ['35876832', '35763469', '46861891'];
        const companies = await Promise.all(
          exampleIcos.map(async (ico) => {
            try {
              const data = await api.companies.get(ico);
              return { ico, companies: data };
            } catch (e) { return null; }
          })
        );
        setWatchlist(companies.filter(c => c !== null));
        return;
      }

      const [wl, alerts] = await Promise.allSettled([
        api.watchlist.list(),
        api.notifications.alerts(),
      ]);

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
      await Promise.allSettled(
        watchlist.map((item) => api.companies.refresh(item.ico))
      );
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
      {/* Demo Banner */}
      {isDemo && (
        <div className="bg-brand-600 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-4">
          <Zap className="w-4 h-4 animate-pulse" />
          <span>{t('dashboard.demoBanner')}</span>
          <Link href="/auth/register" className="bg-white text-brand-600 px-3 py-1 rounded-md text-xs font-bold hover:bg-slate-100 transition-colors">
            {t('nav.startFree')}
          </Link>
        </div>
      )}
      {/* Header */}
      <header className="border-b border-slate-800 px-4 md:px-6 py-4 sticky top-0 z-10 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="text-brand-500 w-5 h-5" />
            <span className="font-bold tracking-tight hidden sm:block">
              Kontrahent<span className="text-brand-500">.sk</span>
            </span>
          </Link>

          {/* Search redirect form */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-sm flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('dashboard.searchPlaceholder')}
                className="input pl-9 py-2 text-sm"
              />
            </div>
            <button type="submit" disabled={!searchQuery.trim()} className="btn-primary py-2 px-3">
              <Search className="w-4 h-4" />
            </button>
          </form>

          <div className="flex items-center gap-2">
            {!isDemo ? (
              <>
                <Link href="/notifications" className="relative btn-ghost p-2">
                  <Bell className="w-5 h-5" />
                  {unreadAlerts > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">
                      {unreadAlerts}
                    </span>
                  )}
                </Link>
                <button onClick={signOut} className="btn-ghost p-2" title={t('dashboard.signOut')}>
                  <span className="sr-only">{t('dashboard.signOut')}</span>
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <Link href="/auth/login" className="btn-ghost text-sm">{t('nav.signIn')}</Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {/* Title area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 tracking-tight">{t('dashboard.myWatchlist')}</h1>
            <p className="text-slate-500">{t('dashboard.watchlistOverview')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/search" className="btn-primary flex items-center gap-2 px-5 py-2.5">
              <Plus className="w-4 h-4" /> {t('dashboard.searchAndAdd')}
            </Link>
          </div>
        </div>

        {/* Summary cards */}
        {watchlist.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{t('dashboard.portfolioStatus')}</h2>
              <button
                onClick={handleRefreshAll}
                disabled={batchRefreshing}
                className="btn-ghost text-xs flex items-center gap-2 text-brand-400 hover:text-brand-300 px-2 py-1 border border-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${batchRefreshing ? 'animate-spin' : ''}`} />
                {batchRefreshing ? t('dashboard.refreshing') : t('dashboard.refreshAll')}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: t('dashboard.critical'), count: riskCounts.red, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
                { label: t('dashboard.warnings'), count: riskCounts.yellow, color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
                { label: t('dashboard.healthy'), count: riskCounts.green, color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20' },
              ].map((s, i) => (
                <div key={i} className={`rounded-xl border p-4 ${s.bg}`}>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
                  <div className={`text-xs ${s.color} opacity-70 mt-0.5`}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Companies list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-3 text-brand-500" />
            {t('dashboard.loadingList')}
          </div>
        ) : watchlist.length === 0 ? (
          <div className="text-center py-24 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">
            <Shield className="w-16 h-16 text-slate-800 mx-auto mb-6" />
            <h3 className="text-xl font-bold text-slate-200 mb-2">
              {t('dashboard.emptyTitle')}
            </h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto mb-8">
              {t('dashboard.emptyDescription')}
            </p>
            <Link href="/search" className="btn-primary px-8 py-3">
              {t('dashboard.findFirst')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('dashboard.companyList')}</h2>
            {/* Sort by risk: red first */}
            {[...watchlist]
              .sort((a, b) => {
                const order = { red: 0, yellow: 1, green: 2 };
                return (order[a.companies?.risk_score] ?? 3) - (order[b.companies?.risk_score] ?? 3);
              })
              .map((item) => (
                <CompanyRow
                  key={item.ico}
                  item={{
                    ...item,
                    companies: {
                      ...item.companies,
                      risk_score_numeric: item.companies?.raw_data?.risk_score_numeric
                    }
                  }}
                  onRemove={() => handleRemove(item.ico)}
                />
              ))}
          </div>
        )}
      </main>
    </div>
  );
}
