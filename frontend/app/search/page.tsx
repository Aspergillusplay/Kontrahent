"use client";

import { Suspense, useCallback, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import RequestFeedback from '../../components/RequestFeedback';
import { api, ApiError } from '../../lib/api';
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
  { value: 'creation-date-desc', labelKey: 'search.sort.creationDateDesc' },
];

const REGION_OPTIONS = [
  { value: '', labelKey: 'search.region.all' },
  { value: 'SK010', labelKey: 'search.region.bratislavsky' },
  { value: 'SK021', labelKey: 'search.region.trnavsky' },
  { value: 'SK022', labelKey: 'search.region.trenciansky' },
  { value: 'SK023', labelKey: 'search.region.nitriansky' },
  { value: 'SK031', labelKey: 'search.region.zilinsky' },
  { value: 'SK032', labelKey: 'search.region.banskobystricky' },
  { value: 'SK041', labelKey: 'search.region.presovsky' },
  { value: 'SK042', labelKey: 'search.region.kosicky' },
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

  const [error,setError]=useState<string|null>(null);
  const [retry,setRetry]=useState(0);
  const adding=useRef(false);
  const page=Math.max(1, Math.min(5000, Number(searchParams.get('page')) || 1));
  const sort=searchParams.get('sort') || 'name';
  const region=searchParams.get('region') || '';
  const legalForm=searchParams.get('legalForm') || '';
  const employees=searchParams.get('employees') || '';
  const query=searchParams.get('q') || '';
  const [searchInput,setSearchInput]=useState(query);
  useEffect(()=>setSearchInput(query),[query]);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError(null);
    api.companies.browse({page,sort,region,legalForm,employees,q:query},controller.signal)
      .then(data=>{if(!controller.signal.aborted)setResults(data);})
      .catch(err=>{if(!controller.signal.aborted)setError(String(err.message));})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[page,sort,region,legalForm,employees,query,retry]);
  useEffect(()=>{
    let active=true;
    getSupabase().auth.getUser().then(async ({data})=>{
      if(!active)return;
      setUser(data.user);
      if(data.user){ const items=await api.watchlist.list(); if(active)setWatchlist(items.map(item=>item.ico)); }
    }).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  const applyFilters=(overrides:Record<string,any>={})=>{
    const next={sort,region,legalForm,employees,q:query,page:1,...overrides};
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries(next))if(value && !(key==='page' && value===1))params.set(key,String(value));
    router.push('/search?'+params.toString(),{scroll:false});
  };
  const resetFilters=()=>{setSearchInput('');router.push('/search');};
  const handlePageChange=(next:number)=>{if(next>0)applyFilters({page:next});};

  const addToWatchlist = async (ico: string) => {
    if (!user) {
      router.push('/auth/login?redirect=/search');
      return;
    }
    if(adding.current)return;
    adding.current=true;
    setAddingIco(ico);
    try {
      await api.watchlist.add(ico);
      setWatchlist((prev) => Array.from(new Set([...prev, ico])));
    } catch (err) {
      if(err instanceof ApiError && err.status===409)setWatchlist(prev=>Array.from(new Set([...prev,ico])));
      else setError(String(err));
    } finally {
      adding.current=false;
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

      <RequestFeedback loading={loading} error={error} onRetry={()=>setRetry(n=>n+1)} />
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
        companies={error ? [] : companies}
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
