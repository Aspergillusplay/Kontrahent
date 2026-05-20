"use client";

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { getSupabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n/provider';
import { formatNumberValue } from '../../lib/i18n/formatters';
import { SearchHeaderBar, SearchMainContent } from './components/SearchPageSections';

const SORT_OPTIONS = [
  { value: 'sales-desc', labelKey: 'search.sort.salesDesc' },
  { value: 'sales', labelKey: 'search.sort.salesAsc' },
  { value: 'name', labelKey: 'search.sort.name' },
  { value: 'ico', labelKey: 'search.sort.ico' },
  { value: 'city', labelKey: 'search.sort.city' },
  { value: 'region', labelKey: 'search.sort.region' },
  { value: 'empl-desc', labelKey: 'search.sort.employeesDesc' },
  { value: 'creation-date-desc', labelKey: 'search.sort.creationDateDesc' },
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

  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [sort, setSort] = useState(searchParams.get('sort') || 'sales-desc');
  const [region, setRegion] = useState(searchParams.get('region') || '');
  const [legalForm, setLegalForm] = useState(searchParams.get('legalForm') || '');
  const [employees, setEmployees] = useState(searchParams.get('employees') || '');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');

  const updateUrl = useCallback(
    (params: Record<string, string | number>) => {
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
    },
    [page, sort, region, legalForm, employees, query]
  );

  const fetchData = useCallback(async (p: number, s: string, r: string, lf: string, emp: string, q: string) => {
    setLoading(true);
    try {
      const data = await api.companies.browse({ page: p, sort: s, region: r, legalForm: lf, employees: emp, q: q || undefined });
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
        api.watchlist.list().then((data) => {
          setWatchlist((data as any[]).map((item) => item.ico));
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
    if (!user) {
      router.push('/auth/login?redirect=/search');
      return;
    }
    setAddingIco(ico);
    try {
      await api.watchlist.add(ico);
      setWatchlist((prev) => [...prev, ico]);
    } catch (err) {
      console.error('Failed:', err);
    } finally {
      setAddingIco(null);
    }
  };

  const hasActiveFilters = !!(region || legalForm || employees || query);
  const companies = results?.companies || [];
  const total = results?.total || 0;
  const totalPages = results?.totalPages || 0;
  const formatNumber = (n: number) => formatNumberValue(n, locale);

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
      <SearchHeaderBar
        t={t}
        loading={loading}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onSearchSubmit={(e) => {
          e.preventDefault();
          const nextQuery = searchInput.trim();
          setSearchInput(nextQuery);
          applyFilters({ q: nextQuery, page: 1 });
        }}
        user={user}
      />

      <SearchMainContent
        t={t}
        total={total}
        formatNumber={formatNumber}
        hasActiveFilters={hasActiveFilters}
        sort={sort}
        region={region}
        legalForm={legalForm}
        employees={employees}
        sortOptions={sortOptions}
        regionOptions={regionOptions}
        legalFormOptions={legalFormOptions}
        employeesOptions={employeesOptions}
        loading={loading}
        companies={companies}
        watchlist={watchlist}
        addingIco={addingIco}
        totalPages={totalPages}
        page={page}
        applyFilters={applyFilters}
        resetFilters={resetFilters}
        addToWatchlist={addToWatchlist}
        handlePageChange={handlePageChange}
        getPageNumbers={getPageNumbers}
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
