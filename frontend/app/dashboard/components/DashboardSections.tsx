import Link from 'next/link';
import { Bell, Loader2, LogOut, Plus, RefreshCw, Search, Shield, Zap } from 'lucide-react';
import CompanyRow from '../../../components/CompanyRow';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type DashboardDemoBannerProps = {
  t: TranslateFn;
};

export function DashboardDemoBanner({ t }: DashboardDemoBannerProps) {
  return (
    <div className="bg-brand-600 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-4">
      <Zap className="w-4 h-4 animate-pulse" />
      <span>{t('dashboard.demoBanner')}</span>
      <Link
        href="/auth/register"
        className="bg-white text-brand-600 px-3 py-1 rounded-md text-xs font-bold hover:bg-slate-100 transition-colors"
      >
        {t('nav.startFree')}
      </Link>
    </div>
  );
}

type DashboardHeaderCenterSearchProps = {
  t: TranslateFn;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
};

export function DashboardHeaderCenterSearch({
  t,
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
}: DashboardHeaderCenterSearchProps) {
  return (
    <form onSubmit={onSearchSubmit} className="w-full max-w-sm flex gap-2">
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
  );
}

type DashboardHeaderActionsProps = {
  t: TranslateFn;
  isDemo: boolean;
  unreadAlerts: number;
  onSignOut: () => Promise<void>;
};

export function DashboardHeaderActions({ t, isDemo, unreadAlerts, onSignOut }: DashboardHeaderActionsProps) {
  if (isDemo) {
    return (
      <Link href="/auth/login" className="btn-ghost text-sm">
        {t('nav.signIn')}
      </Link>
    );
  }

  return (
    <>
      <Link href="/notifications" className="relative btn-ghost p-2">
        <Bell className="w-5 h-5" />
        {unreadAlerts > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">
            {unreadAlerts}
          </span>
        )}
      </Link>
      <button onClick={onSignOut} className="btn-ghost p-2" title={t('dashboard.signOut')}>
        <span className="sr-only">{t('dashboard.signOut')}</span>
        <LogOut className="w-4 h-4" />
      </button>
    </>
  );
}

type DashboardTitleSectionProps = {
  t: TranslateFn;
};

export function DashboardTitleSection({ t }: DashboardTitleSectionProps) {
  return (
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
  );
}

type DashboardSummarySectionProps = {
  t: TranslateFn;
  watchlist: any[];
  batchRefreshing: boolean;
  onRefreshAll: () => Promise<void>;
  riskCounts: {
    red: number;
    yellow: number;
    green: number;
  };
};

export function DashboardSummarySection({
  t,
  watchlist,
  batchRefreshing,
  onRefreshAll,
  riskCounts,
}: DashboardSummarySectionProps) {
  if (watchlist.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{t('dashboard.portfolioStatus')}</h2>
        <button
          onClick={onRefreshAll}
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
          {
            label: t('dashboard.warnings'),
            count: riskCounts.yellow,
            color: 'text-yellow-400',
            bg: 'bg-yellow-400/10 border-yellow-400/20',
          },
          { label: t('dashboard.healthy'), count: riskCounts.green, color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl border p-4 ${s.bg}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
            <div className={`text-xs ${s.color} opacity-70 mt-0.5`}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type DashboardCompaniesListProps = {
  t: TranslateFn;
  loading: boolean;
  watchlist: any[];
  onRemove: (ico: string) => Promise<void>;
};

export function DashboardCompaniesList({ t, loading, watchlist, onRemove }: DashboardCompaniesListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-3 text-brand-500" />
        {t('dashboard.loadingList')}
      </div>
    );
  }

  if (watchlist.length === 0) {
    return (
      <div className="text-center py-24 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">
        <Shield className="w-16 h-16 text-slate-800 mx-auto mb-6" />
        <h3 className="text-xl font-bold text-slate-200 mb-2">{t('dashboard.emptyTitle')}</h3>
        <p className="text-slate-500 text-sm max-w-sm mx-auto mb-8">{t('dashboard.emptyDescription')}</p>
        <Link href="/search" className="btn-primary px-8 py-3">
          {t('dashboard.findFirst')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('dashboard.companyList')}</h2>
      {[...watchlist]
        .sort((a, b) => {
          const order = { red: 0, yellow: 1, green: 2 };
          return (order[a.companies?.risk_score as 'red' | 'yellow' | 'green'] ?? 3) - (order[b.companies?.risk_score as 'red' | 'yellow' | 'green'] ?? 3);
        })
        .map((item) => (
          <CompanyRow
            key={item.ico}
            item={{
              ...item,
              companies: {
                ...item.companies,
                risk_score_numeric: item.companies?.raw_data?.risk_score_numeric,
              },
            }}
            onRemove={() => onRemove(item.ico)}
          />
        ))}
    </div>
  );
}
