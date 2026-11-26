'use client';

import { formatDistanceToNow } from 'date-fns';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { compactCompanyName } from '../lib/company-assessment';
import type { CompanyDetails } from '../lib/company-types';
import { formatCurrencyValue, toDateFnsLocale } from '../lib/i18n/formatters';
import { useI18n } from '../lib/i18n/provider';
import CompanyAssessment from './company/CompanyAssessment';

type Props = {
  item: {ico: string; alias?: string; companies: CompanyDetails | null};
  onRemove?: () => void;
};

export default function CompanyRow({item, onRemove}: Props) {
  const {locale, t} = useI18n();
  const company = item.companies;
  if (!company) return null;
  const name = compactCompanyName(company.name);
  const alias = item.alias?.trim();
  const checked = Date.parse(company.last_checked_at);
  const figures = (['revenue', 'profit', 'equity'] as const).filter(field => Number.isFinite(company[field]));
  const debtSources = (['social', 'tax', 'health'] as const).filter(source => {
    const status = company.data_quality?.debts?.[source]?.status;
    return (status === 'verified' || status === 'stale') && Number.isFinite(company[`${source}_debt`]);
  });

  return <article className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-semibold leading-snug text-slate-100">
          <Link href={`/company/${item.ico}`} className="break-words hover:text-brand-400 focus-visible:underline">{alias || name}</Link>
        </h3>
        {alias && alias !== name && alias !== company.name && <p className="text-xs text-slate-400">{name}</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
          <span className="font-mono">IČO {item.ico}</span>
          {company.city && <span>{company.city}</span>}
          {Number.isFinite(checked) && <time dateTime={company.last_checked_at}>{t('assessment.checked', {
            time: formatDistanceToNow(checked, {addSuffix: true, locale: toDateFnsLocale(locale)}),
          })}</time>}
        </div>
      </div>
      {onRemove && <button type="button" onClick={onRemove} className="btn-ghost shrink-0 p-2 hover:text-red-400"
        aria-label={t('companyRow.removeFromWatchlist') + ' · ' + (alias || name)}><Trash2 size={16} /></button>}
    </div>
    <div className="mt-3"><CompanyAssessment company={company} /></div>
    {figures.length > 0 && <div className="mt-3 border-t border-slate-800 pt-2">
      <p className="text-xs font-medium text-slate-400">{t('company.financialStatements')} {company.financial_year}</p>
      <dl className="mt-1 grid gap-x-5 gap-y-1 sm:grid-cols-3">
        {figures.map(field => <div key={field} className="flex flex-wrap justify-between gap-x-2 text-xs sm:block">
          <dt className="text-slate-400">{t('company.metric.' + (field === 'profit' && company.profit! < 0 ? 'loss' : field))}</dt>
          <dd className="font-medium tabular-nums text-slate-200">{formatCurrencyValue(field === 'profit' ? Math.abs(company[field]!) : company[field]!, locale)}</dd>
        </div>)}
      </dl>
    </div>}
    {!figures.length && (company.filing?.state === 'private' || company.filing?.state === 'no_public_filing') &&
      <p className="mt-2 text-xs text-slate-400">{t('company.filing.' + company.filing.state)}</p>}
    {debtSources.length > 0 && <dl className="mt-2 grid gap-1 text-xs">
      {debtSources.map(source => <div key={source} className="flex flex-wrap justify-between gap-x-2">
        <dt className="text-slate-400">{t('assessment.arrears.' + source)}
          {company.data_quality?.debts?.[source]?.status === 'stale' && ' · ' + t('company.coverage.stale')}</dt>
        <dd className="font-medium tabular-nums text-slate-200">{formatCurrencyValue(company[`${source}_debt`], locale)}</dd>
      </div>)}
    </dl>}
  </article>;
}
