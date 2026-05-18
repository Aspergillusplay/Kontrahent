'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Loader2 } from 'lucide-react';
import CompanyBreakdownSection from '../../../components/company/CompanyBreakdownSection';
import CompanyHeader from '../../../components/company/CompanyHeader';
import CompanyHistoryTimeline from '../../../components/company/CompanyHistoryTimeline';
import CompanyOverview from '../../../components/company/CompanyOverview';
import CompanySidebar from '../../../components/company/CompanySidebar';
import { resolveDebtSummary } from '../../../components/company/company-view.utils';
import { api } from '../../../lib/api';
import { CompanyDetails, CompanyHistoryItem } from '../../../lib/company-types';
import { getSupabase } from '../../../lib/supabase';
import { useI18n } from '../../../lib/i18n/provider';

export default function CompanyPage({ params }: { params: { ico: string } }) {
  const { t } = useI18n();
  const [company, setCompany] = useState<CompanyDetails | null>(null);
  const [history, setHistory] = useState<CompanyHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const loadCompany = useCallback(async () => {
    setLoading(true);
    try {
      const [companyResult, historyResult] = await Promise.allSettled([
        api.companies.get(params.ico),
        api.companies.history(params.ico),
      ]);

      if (companyResult.status === 'fulfilled') {
        setCompany(companyResult.value);
      } else {
        setCompany(null);
      }

      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value);
      } else {
        setHistory([]);
      }
    } catch (error) {
      console.error('Failed to load company details', error);
      setCompany(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [params.ico]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      const demoMode = !user;
      setIsDemo(demoMode);

      if (!demoMode) {
        try {
          const watchlist = await api.watchlist.list();
          if (isMounted) {
            setInWatchlist(watchlist.some((item) => item.ico === params.ico));
          }
        } catch (error) {
          console.error('Failed to load watchlist', error);
        }
      } else {
        setInWatchlist(false);
      }

      await loadCompany();
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [loadCompany, params.ico]);

  const handleRefresh = async () => {
    if (isDemo) {
      window.location.href = '/auth/login';
      return;
    }

    setRefreshing(true);
    try {
      const freshCompany = await api.companies.refresh(params.ico);
      setCompany(freshCompany);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddToWatchlist = async () => {
    if (isDemo) {
      window.location.href = '/auth/register';
      return;
    }

    await api.watchlist.add(params.ico);
    setInWatchlist(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center px-4">
        <div>
          <Building2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-slate-400">{t('company.notFound')}</h2>
          <p className="text-slate-500 text-sm mt-1">{t('company.notFoundDescription', { ico: params.ico })}</p>
          <Link href="/dashboard" className="btn-primary inline-block mt-4">
            {t('common.back')}
          </Link>
        </div>
      </div>
    );
  }

  const debtSummary = resolveDebtSummary(company);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <CompanyHeader
          company={company}
          isDemo={isDemo}
          inWatchlist={inWatchlist}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onAddToWatchlist={handleAddToWatchlist}
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <CompanyOverview company={company} />
          <CompanySidebar company={company} debtSummary={debtSummary} />
        </div>

        <CompanyBreakdownSection company={company} />
        <CompanyHistoryTimeline history={history} />
      </div>
    </div>
  );
}
