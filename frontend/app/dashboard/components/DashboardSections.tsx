import Link from 'next/link';
import { Bell, Loader2, LogOut, Plus, RefreshCw, Search, Shield, Zap } from 'lucide-react';
import CompanyRow from '../../../components/CompanyRow';
import { assessmentGroup } from '../../../lib/company-assessment';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type DashboardDemoBannerProps = {
  t: TranslateFn;
};

export function DashboardDemoBanner({ t }: DashboardDemoBannerProps) {
  return (
    <div className="bg-brand-600 px-4 py-2 text-center text-sm font-medium flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
      <Zap className="w-4 h-4 animate-pulse" />
      <span>{t('dashboard.demoBanner')}</span>
      <Link
        href="/auth/register"
        className="bg-white text-brand-600 px-3 py-1 rounded-md text-xs font-bold hover:bg-white/90 transition-colors"
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
    <form onSubmit={onSearchSubmit} className="w-full md:max-w-sm flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={searchQuery}
          aria-label={t('dashboard.searchPlaceholder')}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('dashboard.searchPlaceholder')}
          className="input pl-9 py-2 text-sm"
        />
      </div>
      <button type="submit" aria-label={t('common.search')} disabled={!searchQuery.trim()} className="btn-primary py-2 px-3 shrink-0 inline-flex items-center justify-center">
        <Search className="w-4 h-4 sm:hidden" />
        <span className="hidden sm:inline">{t('common.search')}</span>
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
      <Link href="/notifications" aria-label={t('notifications.alertHistory')} className="relative btn-ghost p-2">
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
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 tracking-tight">{t('dashboard.myWatchlist')}</h1>
        <p className="text-slate-500">{t('dashboard.watchlistOverview')}</p>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/search" className="btn-primary w-full sm:w-auto justify-center flex items-center gap-2 px-5 py-2.5">
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
};

export function DashboardSummarySection({
  t,
  watchlist,
  batchRefreshing,
  onRefreshAll,
}: DashboardSummarySectionProps) {
  if (watchlist.length === 0) return null;
  const counts = {closed: 0, red: 0, yellow: 0, green: 0, favourable: 0, limited: 0, unknown: 0};
  for (const item of watchlist) counts[assessmentGroup(item.companies || {})]++;

  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{t('dashboard.portfolioStatus')}</h2>
        <button
          onClick={onRefreshAll}
          disabled={batchRefreshing}
          className="btn-ghost w-full sm:w-auto justify-center text-xs flex items-center gap-2 text-brand-400 hover:text-brand-300 px-2 py-1 border border-slate-800"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${batchRefreshing ? 'animate-spin' : ''}`} />
          {batchRefreshing ? t('dashboard.refreshing') : t('dashboard.refreshAll')}
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          ['red', 'risk.critical'], ['closed', 'assessment.closed'], ['yellow', 'risk.warning'],
          ['favourable', 'assessment.favourable'], ['green', 'risk.safe'],
          ['limited', 'assessment.incomplete'], ['unknown', 'risk.unknown'],
        ].map(([group, label]) => counts[group] > 0 && (
          <div key={group} data-assessment={group} className="assessment-total">
            <div className="text-2xl font-bold text-slate-100">{counts[group]}</div>
            <div className="mt-0.5 text-xs font-medium text-slate-300">{t(label)}</div>
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
  onRemove?: (ico: string) => Promise<void>;
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
        <Link href="/search" className="btn-primary px-8 py-3 inline-flex justify-center w-full sm:w-auto">
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
          const order = { red: 0, closed: 1, yellow: 2, unknown: 3, limited: 4, favourable: 5, green: 5 };
          return order[assessmentGroup(a.companies || {})] - order[assessmentGroup(b.companies || {})];
        })
        .map((item) => (
          <CompanyRow
            key={item.ico}
            item={item}
            onRemove={onRemove ? () => onRemove(item.ico) : undefined}
          />
        ))}
    </div>
  );
}
