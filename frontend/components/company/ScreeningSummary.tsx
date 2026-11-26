'use client';

import type { CompanyDetails } from '../../lib/company-types';
import { useI18n } from '../../lib/i18n/provider';
import { formatCurrencyValue } from '../../lib/i18n/formatters';

export type ScreeningCompany = Partial<Pick<CompanyDetails, 'screening' | 'profit' | 'equity' | 'revenue' |
  'financial_year' | 'social_debt' | 'data_quality'>>;

export default function ScreeningSummary({ company }: {company: ScreeningCompany}) {
  const { t, locale } = useI18n();
  const checks = Object.values(company.screening || {}).filter(value => typeof value === 'boolean');
  const favorable = checks.filter(Boolean).length;
  const year = company.financial_year;
  const fields = [
    { label: t('company.metric.revenue'), value: company.revenue },
    { label: t('company.metric.profit'), value: company.profit },
    { label: t('company.metric.equity'), value: company.equity },
  ].filter(field => Number.isFinite(field.value));
  const social = company.screening?.no_social_arrears;
  if (!checks.length && !fields.length) return null;
  return <div className="mt-3 space-y-1.5 text-xs leading-relaxed">
    {checks.length > 0 && <p className="font-medium text-slate-200">
      {t('company.screeningResult', {passed: favorable, checked: checks.length})}
      {checks.length < 3 && <span className="ml-1 text-slate-400">· {t('company.screeningMissing', {count: 3 - checks.length})}</span>}
    </p>}
    {fields.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-300">
      <span className="font-medium text-slate-400">{year}</span>
      {fields.map(({label,value}) => <span key={label}>{label} <strong className="font-medium">{formatCurrencyValue(value!, locale)}</strong></span>)}
    </div>}
    {typeof social === 'boolean' && <p className="text-slate-300">
      {t('company.socialRegistryAmount')} <strong className="font-medium">{formatCurrencyValue(company.social_debt!, locale)}</strong>
    </p>}
  </div>;
}
