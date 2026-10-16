'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CompanyBackHeader, CompanyDetailsContent, CompanyLoadingState } from './components/CompanyPageSections';
import RequestFeedback from '../../../components/RequestFeedback';
import { api, ApiError } from '../../../lib/api';
import { CompanyDetails, CompanyHistoryItem } from '../../../lib/company-types';
import { useI18n } from '../../../lib/i18n/provider';
import { getSupabase } from '../../../lib/supabase';

export default function CompanyPage({params}:{params: Promise<{ico: string}>}) {
  const resolvedParams = use(params);
  const {t}=useI18n(); const router=useRouter();
  const [company,setCompany]=useState<CompanyDetails|null>(null);
  const [history,setHistory]=useState<CompanyHistoryItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [adding,setAdding]=useState(false);
  const [inWatchlist,setInWatchlist]=useState(false);
  const [isDemo,setIsDemo]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [retry,setRetry]=useState(0);
  const mutation=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError(null);setCompany(null);setHistory([]);
    // Public company lookup does not wait for Auth or a private watchlist.
    api.companies.get(resolvedParams.ico,controller.signal).then(async data=>{
      if(controller.signal.aborted)return;
      setCompany(data);
      setLoading(false);
      const items=await api.companies.history(resolvedParams.ico,controller.signal);
      if(!controller.signal.aborted)setHistory(items);
    }).catch(err=>{if(!controller.signal.aborted)setError(err.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[resolvedParams.ico,retry]);
  useEffect(()=>{
    let active=true;setInWatchlist(false);
    getSupabase().auth.getUser().then(async ({data})=>{
      if(!active)return;
      setIsDemo(!data.user);
      if(data.user){const items=await api.watchlist.list();if(active)setInWatchlist(items.some(item=>item.ico===resolvedParams.ico));}
    }).catch(()=>{});
    return ()=>{active=false;};
  },[resolvedParams.ico]);
  const signIn=()=>router.push('/auth/login?redirect='+encodeURIComponent('/company/'+resolvedParams.ico));
  const handleRefresh=async()=>{
    if(isDemo){signIn();return;} if(mutation.current)return;
    mutation.current=true;setRefreshing(true);setError(null);
    try {setCompany(await api.companies.refresh(resolvedParams.ico));setHistory(await api.companies.history(resolvedParams.ico));}
    catch(err){setError(String(err));}
    finally {mutation.current=false;setRefreshing(false);}
  };
  const handleAdd=async()=>{
    if(isDemo){signIn();return;} if(mutation.current)return;
    mutation.current=true;setAdding(true);setError(null);
    try{await api.watchlist.add(resolvedParams.ico);setInWatchlist(true);}
    catch(err){if(err instanceof ApiError && err.status===409)setInWatchlist(true);else setError(String(err));}
    finally{mutation.current=false;setAdding(false);}
  };
  return <div className="min-h-screen bg-slate-950">
    <CompanyBackHeader t={t}/>
    <RequestFeedback loading={loading || refreshing} error={error} onRetry={()=>setRetry(n=>n+1)}/>
    {loading ? <CompanyLoadingState/> : company ? <CompanyDetailsContent company={company} history={history} isDemo={isDemo}
      inWatchlist={inWatchlist} refreshing={refreshing} adding={adding} onRefresh={handleRefresh} onAddToWatchlist={handleAdd}/> : null}
  </div>;
}
