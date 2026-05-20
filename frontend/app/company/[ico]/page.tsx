"use client";

import { useCallback, useEffect, useState } from 'react';
import {
  CompanyBackHeader,
  CompanyDetailsContent,
  CompanyLoadingState,
  CompanyNotFoundState,
} from './components/CompanyPageSections';
import { api } from '../../../lib/api';
import { CompanyDetails, CompanyHistoryItem } from '../../../lib/company-types';
import { useI18n } from '../../../lib/i18n/provider';
import { getSupabase } from '../../../lib/supabase';

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

  return (
    <div className="min-h-screen bg-slate-950">
      <CompanyBackHeader t={t} />

      {loading ? (
        <CompanyLoadingState />
      ) : !company ? (
        <CompanyNotFoundState t={t} ico={params.ico} />
      ) : (
        <CompanyDetailsContent
          company={company}
          history={history}
          isDemo={isDemo}
          inWatchlist={inWatchlist}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onAddToWatchlist={handleAddToWatchlist}
        />
      )}
    </div>
  );
}
