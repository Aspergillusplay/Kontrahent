'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Calendar,
  Clock,
  History,
  MapPin,
  RefreshCw,
  Zap,
} from 'lucide-react';
import CompanyAssessment from './CompanyAssessment';
import { CompanyDetails } from '../../lib/company-types';
import { assessmentGroup } from '../../lib/company-assessment';
import { useI18n } from '../../lib/i18n/provider';
import { toDateFnsLocale } from '../../lib/i18n/formatters';

type CompanyHeaderProps = {
  company: CompanyDetails;
  isDemo: boolean;
  inWatchlist: boolean;
  refreshing: boolean;
  adding?: boolean;
  onRefresh: () => void;
  onAddToWatchlist: () => void;
};

export default function CompanyHeader({
  company,
  isDemo,
  inWatchlist,
  refreshing,
  adding,
  onRefresh,
  onAddToWatchlist,
}: CompanyHeaderProps) {
  const { t, locale } = useI18n();

  return (
    <>
      {isDemo && (
        <div className="bg-brand-600 px-4 py-2 text-center text-sm font-medium flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
          <Zap className="w-4 h-4 animate-pulse" />
          <span>{t('company.demoBanner')}</span>
          <Link
            href="/auth/register"
            className="bg-white text-brand-600 px-3 py-1 rounded-md text-xs font-bold hover:bg-white/90 transition-colors"
          >
            {t('nav.startFree')}
          </Link>
        </div>
      )}

      <div data-assessment={assessmentGroup(company)} className="assessment-card mb-8">
        <CompanyAssessment company={company} band />
        <div className="flex items-start justify-between gap-6 flex-wrap p-4 sm:p-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-xs text-slate-500 font-mono bg-slate-800 px-2 py-1 rounded">ICO: {company.ico}</span>
              {company.important_dates?.bankruptcy && (
                <span className="text-xs font-bold bg-red-500/20 text-red-400 px-2 py-1 rounded flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {t('company.bankruptcySince', { value: company.important_dates.bankruptcy })}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold mb-1 break-words leading-tight tracking-tight text-slate-100">{company.name}</h1>
            {company.historical_name && company.historical_name.trim() !== company.name.trim() && (
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
              {company.last_checked_at && !isNaN(Date.parse(company.last_checked_at)) && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-500" />
                  {t('company.updated', { value: format(new Date(company.last_checked_at), 'd. MMM yyyy HH:mm', { locale: toDateFnsLocale(locale) }) })}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-center w-full sm:w-auto">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="btn-ghost flex items-center justify-center gap-2 text-sm h-10 px-4 w-full sm:w-auto"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {t('company.refresh')}
            </button>
            {!inWatchlist && (
              <button disabled={adding} onClick={onAddToWatchlist} className="btn-primary text-sm h-10 px-4 w-full sm:w-auto">
                + {t('company.watch')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
