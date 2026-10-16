'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n/provider';

export default function RequestFeedback({loading=false,error,onRetry}:{loading?:boolean;error?:string|null;onRetry?:()=>void}) {
  const {t}=useI18n();
  const [slow,setSlow]=useState(false);
  useEffect(()=>{
    setSlow(false);
    if(!loading) return;
    const timer=setTimeout(()=>setSlow(true),8000);
    return ()=>clearTimeout(timer);
  },[loading]);
  if(!error && !slow) return null;
  return <div role={error?'alert':'status'} className="max-w-7xl mx-auto px-4 my-4">
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-slate-200 flex flex-wrap items-center justify-between gap-3">
      <p>{t(error?'common.requestFailed':'common.wakingServer')}</p>
      {error && onRetry && <button className="btn-ghost border border-slate-700" onClick={onRetry}>{t('common.retry')}</button>}
    </div>
  </div>;
}
