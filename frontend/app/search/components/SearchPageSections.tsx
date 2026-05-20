import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpDown,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import AppHeader from '../../../components/AppHeader';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type SearchHeaderBarProps = {
  t: TranslateFn;
  loading: boolean;
  searchInput: string;
  setSearchInput: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  user: any;
};

export function SearchHeaderBar({
  t,
  loading,
  searchInput,
  setSearchInput,
  onSearchSubmit,
  user,
}: SearchHeaderBarProps) {
  return (
    <AppHeader
      maxWidthClassName="max-w-7xl"
      center={
        <form onSubmit={onSearchSubmit} className="w-full max-w-xl flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('search.placeholder')}
              className="input pl-9 py-2 text-sm"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary py-2 px-4">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.search')}
          </button>
        </form>
      }
      right={
        user ? (
          <Link href="/dashboard" className="btn-ghost p-2 flex items-center gap-2 text-sm">
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden md:inline">{t('nav.watchlist')}</span>
          </Link>
        ) : (
          <Link href="/auth/login" className="btn-ghost text-sm">
            {t('nav.signIn')}
          </Link>
        )
      }
    />
  );
}

type SearchMainContentProps = {
  t: TranslateFn;
  total: number;
  formatNumber: (n: number) => string;
  hasActiveFilters: boolean;
  sort: string;
  region: string;
  legalForm: string;
  employees: string;
  sortOptions: Array<{ value: string; label: string }>;
  regionOptions: Array<{ value: string; label: string }>;
  legalFormOptions: Array<{ value: string; label: string }>;
  employeesOptions: Array<{ value: string; label: string }>;
  loading: boolean;
  companies: any[];
  watchlist: string[];
  addingIco: string | null;
  totalPages: number;
  page: number;
  applyFilters: (overrides: Record<string, any>) => void;
  resetFilters: () => void;
  addToWatchlist: (ico: string) => Promise<void>;
  handlePageChange: (newPage: number) => void;
  getPageNumbers: () => (number | '...')[];
};

export function SearchMainContent({
  t,
  total,
  formatNumber,
  hasActiveFilters,
  sort,
  region,
  legalForm,
  employees,
  sortOptions,
  regionOptions,
  legalFormOptions,
  employeesOptions,
  loading,
  companies,
  watchlist,
  addingIco,
  totalPages,
  page,
  applyFilters,
  resetFilters,
  addToWatchlist,
  handlePageChange,
  getPageNumbers,
}: SearchMainContentProps) {
  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-2 mb-4 text-slate-400 text-sm">
        <Link href="/dashboard" className="hover:text-slate-200 flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> {t('search.back')}
        </Link>
        <span>/</span>
        <span className="text-slate-200">{t('search.databaseLabel')}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-1">{t('search.title')}</h1>
        <p className="text-sm text-slate-500">
          {total > 0 ? t('search.total', { count: formatNumber(total) }) : t('search.loadingDatabase')}
          {hasActiveFilters && t('search.filtered')}
        </p>
      </div>

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => applyFilters({ sort: e.target.value, page: 1 })}
              className="appearance-none bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 pr-10 text-sm text-slate-200 cursor-pointer hover:border-slate-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-colors"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ArrowUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <select
            value={region}
            onChange={(e) => applyFilters({ region: e.target.value, page: 1 })}
            className="appearance-none bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 pr-8 text-sm text-slate-200 cursor-pointer hover:border-slate-600 focus:border-brand-500 transition-colors"
          >
            {regionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={legalForm}
            onChange={(e) => applyFilters({ legalForm: e.target.value, page: 1 })}
            className="appearance-none bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 pr-8 text-sm text-slate-200 cursor-pointer hover:border-slate-600 focus:border-brand-500 transition-colors"
          >
            {legalFormOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={employees}
            onChange={(e) => applyFilters({ employees: e.target.value, page: 1 })}
            className="appearance-none bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 pr-8 text-sm text-slate-200 cursor-pointer hover:border-slate-600 focus:border-brand-500 transition-colors"
          >
            {employeesOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/15 border border-red-400/20 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" /> {t('common.clearFilters')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mb-4 text-brand-500" />
          <p>{t('search.loadingDatabase')}</p>
        </div>
      ) : companies.length > 0 ? (
        <>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">{t('search.table.companyName')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">{t('search.table.ico')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">{t('search.table.city')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">{t('search.table.region')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">{t('search.table.employees')}</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">{t('search.table.sales')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">{t('search.table.founded')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {companies.map((c: any) => (
                  <tr key={c.ico} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-4 py-3">
                      <Link href={`/company/${c.ico}`} className="font-medium text-slate-100 hover:text-brand-400 transition-colors">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-brand-400 text-xs">{c.ico}</td>
                    <td className="px-4 py-3 text-slate-400">{c.city || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{c.region || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{c.employees || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-300 font-medium whitespace-nowrap">{c.sales || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{c.creation_date || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/company/${c.ico}`} className="p-1.5 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-brand-400 transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                        {watchlist.includes(c.ico) ? (
                          <span className="text-green-400">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => addToWatchlist(c.ico)}
                            disabled={addingIco === c.ico}
                            className="p-1.5 rounded-md hover:bg-brand-500/20 text-slate-400 hover:text-brand-400 transition-colors"
                          >
                            {addingIco === c.ico ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden grid gap-3">
            {companies.map((c: any) => (
              <div key={c.ico} className="card p-4 hover:border-slate-700 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Link href={`/company/${c.ico}`} className="font-bold text-slate-100 hover:text-brand-400 transition-colors text-sm leading-tight">
                    {c.name}
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    {watchlist.includes(c.ico) ? (
                      <span className="text-green-400 text-xs flex items-center gap-1">
                        <Check className="w-3 h-3" />
                      </span>
                    ) : (
                      <button onClick={() => addToWatchlist(c.ico)} className="btn-primary py-1 px-2 text-xs flex items-center gap-1">
                        <Plus className="w-3 h-3" /> {t('search.watch')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-slate-400">
                  <span className="font-mono text-brand-400">ICO: {c.ico}</span>
                  <span>
                    {c.city || ''}
                    {c.region ? `, ${c.region}` : ''}
                  </span>
                  {c.sales && (
                    <span className="text-slate-300 font-medium">
                      {t('search.salesLabel')}: {c.sales}
                    </span>
                  )}
                  {c.employees && <span>{t('search.employeesLabel')}: {c.employees}</span>}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1.5">
              <button
                onClick={() => handlePageChange(1)}
                disabled={page === 1}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {getPageNumbers().map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="px-2 py-1 text-slate-500 text-sm">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p as number)}
                    className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${
                      p === page
                        ? 'bg-brand-500 text-white border border-brand-500'
                        : 'border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
          <Building2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-400 mb-2">{t('search.noResults')}</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">{t('search.noResultsDescription')}</p>
          {hasActiveFilters && (
            <button onClick={resetFilters} className="mt-4 btn-primary py-2 px-4 text-sm">
              {t('common.clearFilters')}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
