'use client';
import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Shield, Search, Loader2, Plus, Check, ExternalLink,
  ArrowLeft, LayoutDashboard, ArrowUpDown,
  Building2, MapPin, Users, TrendingUp, Calendar, X,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { api } from '../../lib/api';
import { getSupabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n/provider';
import { formatNumberValue } from '../../lib/i18n/formatters';

const SORT_OPTIONS = [
  { value: 'sales-desc', labelKey: 'search.sort.salesDesc', icon: TrendingUp },
  { value: 'sales', labelKey: 'search.sort.salesAsc', icon: TrendingUp },
  { value: 'name', labelKey: 'search.sort.name', icon: Building2 },
  { value: 'ico', labelKey: 'search.sort.ico', icon: Building2 },
  { value: 'city', labelKey: 'search.sort.city', icon: MapPin },
  { value: 'region', labelKey: 'search.sort.region', icon: MapPin },
  { value: 'empl-desc', labelKey: 'search.sort.employeesDesc', icon: Users },
  { value: 'creation-date-desc', labelKey: 'search.sort.creationDateDesc', icon: Calendar },
];

const REGION_OPTIONS = [
  { value: '', labelKey: 'search.region.all' },
  { value: 'bratislavský', labelKey: 'search.region.bratislavsky' },
  { value: 'trnavský', labelKey: 'search.region.trnavsky' },
  { value: 'trenčiansky', labelKey: 'search.region.trenciansky' },
  { value: 'nitriansky', labelKey: 'search.region.nitriansky' },
  { value: 'žilinský', labelKey: 'search.region.zilinsky' },
  { value: 'banskobystrický', labelKey: 'search.region.banskobystricky' },
  { value: 'prešovský', labelKey: 'search.region.presovsky' },
  { value: 'košický', labelKey: 'search.region.kosicky' },
];

const LEGAL_FORM_OPTIONS = [
  { value: '', labelKey: 'search.legalForm.all' },
  { value: '112', labelKey: 'search.legalForm.sro' },
  { value: '121', labelKey: 'search.legalForm.as' },
  { value: '111', labelKey: 'search.legalForm.vos' },
  { value: '113', labelKey: 'search.legalForm.ks' },
  { value: '125', labelKey: 'search.legalForm.sjas' },
  { value: '205', labelKey: 'search.legalForm.coop' },
  { value: '117', labelKey: 'search.legalForm.foundation' },
  { value: '119', labelKey: 'search.legalForm.nonprofit' },
  { value: '701', labelKey: 'search.legalForm.association' },
  { value: '801', labelKey: 'search.legalForm.municipality' },
];

const EMPLOYEES_OPTIONS = [
  { value: '', labelKey: 'search.employees.all' },
  { value: '01', labelKey: 'search.employees.0' },
  { value: '02', labelKey: 'search.employees.1' },
  { value: '05', labelKey: 'search.employees.5to9' },
  { value: '06', labelKey: 'search.employees.10to19' },
  { value: '11', labelKey: 'search.employees.25to49' },
  { value: '12', labelKey: 'search.employees.50to99' },
  { value: '21', labelKey: 'search.employees.100to149' },
  { value: '24', labelKey: 'search.employees.250to499' },
  { value: '25', labelKey: 'search.employees.500to999' },
  { value: '38', labelKey: 'search.employees.30000' },
];

function SearchContent() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sortOptions = SORT_OPTIONS.map((option) => ({ ...option, label: t(option.labelKey) }));
  const regionOptions = REGION_OPTIONS.map((option) => ({ ...option, label: t(option.labelKey) }));
  const legalFormOptions = LEGAL_FORM_OPTIONS.map((option) => ({ ...option, label: t(option.labelKey) }));
  const employeesOptions = EMPLOYEES_OPTIONS.map((option) => ({ ...option, label: t(option.labelKey) }));

  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [addingIco, setAddingIco] = useState<string | null>(null);

  // Filter state from URL
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [sort, setSort] = useState(searchParams.get('sort') || 'sales-desc');
  const [region, setRegion] = useState(searchParams.get('region') || '');
  const [legalForm, setLegalForm] = useState(searchParams.get('legalForm') || '');
  const [employees, setEmployees] = useState(searchParams.get('employees') || '');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');

  const updateUrl = useCallback((params: Record<string, string | number>) => {
    const urlP = new URLSearchParams();
    const all = { page, sort, region, legalForm, employees, q: query, ...params };
    if (all.sort && all.sort !== 'sales-desc') urlP.set('sort', String(all.sort));
    if (all.region) urlP.set('region', String(all.region));
    if (all.legalForm) urlP.set('legalForm', String(all.legalForm));
    if (all.employees) urlP.set('employees', String(all.employees));
    if (all.q) urlP.set('q', String(all.q));
    if (Number(all.page) > 1) urlP.set('page', String(all.page));
    const qs = urlP.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [page, sort, region, legalForm, employees, query]);

  const fetchData = useCallback(async (p: number, s: string, r: string, lf: string, emp: string, q: string) => {
    setLoading(true);
    try {
      const data = await api.companies.browse({
        page: p, sort: s, region: r, legalForm: lf, employees: emp, q: q || undefined,
      });
      setResults(data);
    } catch (err) {
      console.error('Browse failed:', err);
      setResults({ companies: [], total: 0, page: p, perPage: 20, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        api.watchlist.list().then(data => {
          setWatchlist((data as any[]).map(item => item.ico));
        });
      }
    });
    fetchData(page, sort, region, legalForm, employees, query);
  }, []);

  const applyFilters = (overrides: Record<string, any> = {}) => {
    const newPage = overrides.page ?? 1;
    const newSort = overrides.sort ?? sort;
    const newRegion = overrides.region ?? region;
    const newLegalForm = overrides.legalForm ?? legalForm;
    const newEmployees = overrides.employees ?? employees;
    const newQuery = overrides.q ?? query;

    setPage(newPage);
    setSort(newSort);
    setRegion(newRegion);
    setLegalForm(newLegalForm);
    setEmployees(newEmployees);
    setQuery(newQuery);
    updateUrl({ page: newPage, sort: newSort, region: newRegion, legalForm: newLegalForm, employees: newEmployees, q: newQuery });
    fetchData(newPage, newSort, newRegion, newLegalForm, newEmployees, newQuery);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetFilters = () => {
    setSearchInput('');
    applyFilters({ sort: 'sales-desc', region: '', legalForm: '', employees: '', q: '', page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    applyFilters({ page: newPage });
  };

  const addToWatchlist = async (ico: string) => {
    if (!user) { router.push('/auth/login?redirect=/search'); return; }
    setAddingIco(ico);
    try {
      await api.watchlist.add(ico);
      setWatchlist(prev => [...prev, ico]);
    } catch (err) { console.error('Failed:', err); }
    finally { setAddingIco(null); }
  };

  const hasActiveFilters = region || legalForm || employees || query;
  const companies = results?.companies || [];
  const total = results?.total || 0;
  const totalPages = results?.totalPages || 0;
  const formatNumber = (n: number) => formatNumberValue(n, locale);

  // Build page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    const maxVisible = 7;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 px-4 md:px-6 py-4 sticky top-0 z-20 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="text-brand-500 w-5 h-5" />
            <span className="font-bold tracking-tight hidden sm:block">
              Kontrahent<span className="text-brand-500">.sk</span>
            </span>
          </Link>

          <form onSubmit={(e) => { e.preventDefault(); applyFilters({ q: searchInput, page: 1 }); }} className="flex-1 max-w-xl flex gap-2">
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

          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/dashboard" className="btn-ghost p-2 flex items-center gap-2 text-sm">
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden md:inline">{t('nav.watchlist')}</span>
              </Link>
            ) : (
              <Link href="/auth/login" className="btn-ghost text-sm">{t('nav.signIn')}</Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4 text-slate-400 text-sm">
          <Link href="/dashboard" className="hover:text-slate-200 flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> {t('search.back')}
          </Link>
          <span>/</span>
          <span className="text-slate-200">{t('search.databaseLabel')}</span>
        </div>

        {/* Title + Stats */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100 mb-1">{t('search.title')}</h1>
          <p className="text-sm text-slate-500">
            {total > 0 ? t('search.total', { count: formatNumber(total) }) : t('search.loadingDatabase')}
            {hasActiveFilters && t('search.filtered')}
          </p>
        </div>

        {/* Filter bar */}
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort select */}
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => applyFilters({ sort: e.target.value, page: 1 })}
                className="appearance-none bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 pr-10 text-sm text-slate-200 cursor-pointer hover:border-slate-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-colors"
              >
                {sortOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ArrowUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Region select */}
            <select
              value={region}
              onChange={(e) => applyFilters({ region: e.target.value, page: 1 })}
              className="appearance-none bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 pr-8 text-sm text-slate-200 cursor-pointer hover:border-slate-600 focus:border-brand-500 transition-colors"
            >
              {regionOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Legal form */}
            <select
              value={legalForm}
              onChange={(e) => applyFilters({ legalForm: e.target.value, page: 1 })}
              className="appearance-none bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 pr-8 text-sm text-slate-200 cursor-pointer hover:border-slate-600 focus:border-brand-500 transition-colors"
            >
              {legalFormOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Employees */}
            <select
              value={employees}
              onChange={(e) => applyFilters({ employees: e.target.value, page: 1 })}
              className="appearance-none bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2.5 pr-8 text-sm text-slate-200 cursor-pointer hover:border-slate-600 focus:border-brand-500 transition-colors"
            >
              {employeesOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {hasActiveFilters && (
              <button onClick={resetFilters} className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/15 border border-red-400/20 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" /> {t('common.clearFilters')}
              </button>
            )}
          </div>
        </div>

        {/* Results table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-brand-500" />
            <p>{t('search.loadingDatabase')}</p>
          </div>
        ) : companies.length > 0 ? (
          <>
            {/* Desktop table */}
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
                            <span className="text-green-400"><Check className="w-3.5 h-3.5" /></span>
                          ) : (
                            <button onClick={() => addToWatchlist(c.ico)} disabled={addingIco === c.ico}
                              className="p-1.5 rounded-md hover:bg-brand-500/20 text-slate-400 hover:text-brand-400 transition-colors">
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

            {/* Mobile cards */}
            <div className="md:hidden grid gap-3">
              {companies.map((c: any) => (
                <div key={c.ico} className="card p-4 hover:border-slate-700 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <Link href={`/company/${c.ico}`} className="font-bold text-slate-100 hover:text-brand-400 transition-colors text-sm leading-tight">
                      {c.name}
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      {watchlist.includes(c.ico) ? (
                        <span className="text-green-400 text-xs flex items-center gap-1"><Check className="w-3 h-3" /></span>
                      ) : (
                        <button onClick={() => addToWatchlist(c.ico)} className="btn-primary py-1 px-2 text-xs flex items-center gap-1">
                          <Plus className="w-3 h-3" /> {t('search.watch')}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-slate-400">
                    <span className="font-mono text-brand-400">ICO: {c.ico}</span>
                    <span>{c.city || ''}{c.region ? `, ${c.region}` : ''}</span>
                    {c.sales && <span className="text-slate-300 font-medium">{t('search.salesLabel')}: {c.sales}</span>}
                    {c.employees && <span>{t('search.employeesLabel')}: {c.employees}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-1.5">
                <button onClick={() => handlePageChange(1)} disabled={page === 1}
                  className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button onClick={() => handlePageChange(page - 1)} disabled={page === 1}
                  className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {getPageNumbers().map((p, i) => (
                  p === '...' ? (
                    <span key={`dots-${i}`} className="px-2 py-1 text-slate-500 text-sm">…</span>
                  ) : (
                    <button key={p} onClick={() => handlePageChange(p as number)}
                      className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${
                        p === page
                          ? 'bg-brand-500 text-white border border-brand-500'
                          : 'border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}>
                      {p}
                    </button>
                  )
                ))}

                <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => handlePageChange(totalPages)} disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                  <ChevronsRight className="w-4 h-4" />
                </button>

                {/* <div className="ml-4 bg-slate-800/80 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-700">
                  Strana {page} z {formatNumber(totalPages)}
                </div> */}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
            <Building2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-400 mb-2">{t('search.noResults')}</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              {t('search.noResultsDescription')}
            </p>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="mt-4 btn-primary py-2 px-4 text-sm">
                {t('common.clearFilters')}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>}>
      <SearchContent />
    </Suspense>
  );
}
