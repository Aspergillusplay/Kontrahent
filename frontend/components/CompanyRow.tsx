'use client';
import Link from 'next/link';
import { Trash2, MapPin, Clock, ChevronRight } from 'lucide-react';
import RiskBadge from './RiskBadge';
import { formatDistanceToNow } from 'date-fns';
import { useI18n } from '../lib/i18n/provider';
import { formatCurrencyValue, toDateFnsLocale } from '../lib/i18n/formatters';

interface Props {
  item: {
    ico: string;
    alias?: string;
    companies: {
      name: string;
      city?: string;
      risk_score: 'green' | 'yellow' | 'red';
      risk_score_numeric?: number;
      risk_reasons?: string[];
      tax_debt?: number;
      social_debt?: number;
      court_cases?: number;
      last_checked_at?: string;
    };
  };
  onRemove: () => void;
}

export default function CompanyRow({ item, onRemove }: Props) {
  const { locale, t } = useI18n();
  const c = item.companies;
  if (!c) return null;

  const hasDebt = (c.tax_debt || 0) + (c.social_debt || 0) > 0;
  const totalDebt = (c.tax_debt || 0) + (c.social_debt || 0);
  const lastChecked = c.last_checked_at
    ? formatDistanceToNow(new Date(c.last_checked_at), { addSuffix: true, locale: toDateFnsLocale(locale) })
    : null;

  return (
    <div className={`group flex items-start sm:items-center gap-3 sm:gap-4 bg-slate-900 border rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 hover:border-slate-700 transition-all ${
      c.risk_score === 'red'
        ? 'border-red-500/30'
        : c.risk_score === 'yellow'
        ? 'border-yellow-500/20'
        : 'border-slate-800'
    }`}>
      {/* Risk indicator bar */}
      <div className={`w-1 h-10 rounded-full shrink-0 mt-0.5 sm:mt-0 ${
        c.risk_score === 'red' ? 'bg-red-500' :
        c.risk_score === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'
      }`} />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/company/${item.ico}`}
              className="block font-semibold text-slate-100 hover:text-brand-400 transition-colors leading-tight break-words"
            >
              {item.alias || c.name}
            </Link>
            {item.alias && (
              <span className="text-slate-500 text-xs hidden sm:block mt-0.5 break-words">({c.name})</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 sm:hidden">
            <Link
              href={`/company/${item.ico}`}
              className="btn-ghost p-1.5 opacity-100 transition-opacity"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>

            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="btn-ghost p-1.5 text-slate-600 hover:text-red-400 opacity-100 transition-all"
              title={t('companyRow.removeFromWatchlist')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded">{item.ico}</span>
          {c.city && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {c.city}
            </span>
          )}
          {lastChecked && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {lastChecked}
            </span>
          )}
          {hasDebt && (
            <span className="text-yellow-500">
              {t('companyRow.debt', { value: formatCurrencyValue(totalDebt, locale) })}
            </span>
          )}
          {c.court_cases > 0 && (
            <span className="text-yellow-500">{t('companyRow.courts', { count: c.court_cases })}</span>
          )}
        </div>

        <div className="mt-2 flex items-center sm:hidden">
          <RiskBadge score={c.risk_score} numericScore={c.risk_score_numeric} size="sm" />
        </div>
      </div>

      {/* Right side */}
      <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 shrink-0 self-start sm:self-center">
        <RiskBadge score={c.risk_score} numericScore={c.risk_score_numeric} size="sm" />

        <Link
          href={`/company/${item.ico}`}
          className="btn-ghost p-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>

        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="btn-ghost p-1.5 text-slate-600 hover:text-red-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
          title={t('companyRow.removeFromWatchlist')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
