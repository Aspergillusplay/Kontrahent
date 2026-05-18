'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  History,
  MapPin,
  RefreshCw,
  Zap,
} from 'lucide-react';
import RiskBadge from '../RiskBadge';
import { CompanyDetails } from '../../lib/company-types';
import { resolveRiskContainerClass } from './company-view.utils';
import { useI18n } from '../../lib/i18n/provider';
import { toDateFnsLocale } from '../../lib/i18n/formatters';

type CompanyHeaderProps = {
  company: CompanyDetails;
  isDemo: boolean;
  inWatchlist: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onAddToWatchlist: () => void;
};

export default function CompanyHeader({
  company,
  isDemo,
  inWatchlist,
  refreshing,
  onRefresh,
  onAddToWatchlist,
}: CompanyHeaderProps) {
  const { t, locale } = useI18n();
  const riskClass = resolveRiskContainerClass(company.risk_score);

  return (
    <>
      {isDemo && (
        <div className="bg-brand-600 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-4">
          <Zap className="w-4 h-4 animate-pulse" />
          <span>{t('company.demoBanner')}</span>
          <Link
            href="/auth/register"
            className="bg-white text-brand-600 px-3 py-1 rounded-md text-xs font-bold hover:bg-slate-100 transition-colors"
          >
            {t('nav.startFree')}
          </Link>
        </div>
      )}

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('company.backToDashboard')}
      </Link>

      <div className={`card border ${riskClass} mb-8`}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <RiskBadge score={company.risk_score} numericScore={company.risk_score_numeric} size="lg" />
              <span className="text-xs text-slate-500 font-mono bg-slate-800 px-2 py-1 rounded">ICO: {company.ico}</span>
              {company.important_dates?.bankruptcy && (
                <span className="text-xs font-bold bg-red-500/20 text-red-400 px-2 py-1 rounded flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {t('company.bankruptcySince', { value: company.important_dates.bankruptcy })}
                </span>
              )}
              {company.financial_year && (
                <span className="text-xs font-bold bg-brand-500/20 text-brand-400 px-2 py-1 rounded flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {t('company.financialYear', { value: company.financial_year })}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold mb-1 leading-tight tracking-tight text-white">{company.name}</h1>
            {company.historical_name && (
              <div className="flex items-center gap-2 text-slate-500 mb-4 text-xs font-medium">
                <History className="w-3 h-3" />
                <span>
                  {t('company.historicalName')} <span className="italic">{company.historical_name}</span>
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-5 text-sm text-slate-400">
              {company.city && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-500" /> {company.city}
                </span>
              )}
              {company.registration_date && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-500" /> {t('company.founded', { value: company.registration_date })}
                </span>
              )}
              {company.last_checked_at && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-500" />
                  {t('company.updated', { value: format(new Date(company.last_checked_at), 'd. MMM yyyy HH:mm', { locale: toDateFnsLocale(locale) }) })}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="btn-ghost flex items-center gap-2 text-sm h-10 px-4"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {t('company.refresh')}
            </button>
            {!inWatchlist && (
              <button onClick={onAddToWatchlist} className="btn-primary text-sm h-10 px-4">
                + {t('company.watch')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
