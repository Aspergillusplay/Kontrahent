import { CompanyDebtSummary, CompanyDetails } from '../../lib/company-types';
import { AppLocale } from '../../lib/i18n/config';
import { formatCurrencyValue } from '../../lib/i18n/formatters';

export const BREAKDOWN_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#71717a',
];

export function formatCurrency(value: number, locale: AppLocale = 'en'): string {
  return formatCurrencyValue(value, locale);
}

export function resolveDebtSummary(company: CompanyDetails): CompanyDebtSummary {
  const value = (source: 'tax' | 'social' | 'health') => {
    if (!['verified', 'stale'].includes(company.data_quality?.debts?.[source]?.status || '')) return 0;
    const amount = Number(company.debt_summary?.[source] ?? company[(source + '_debt') as 'tax_debt'] ?? 0);
    return Number.isFinite(amount) && amount >= 0 ? amount : 0;
  };
  const tax = value('tax'), social = value('social'), health = value('health');
  return { tax, social, health, total: tax + social + health, sources_count: [tax, social, health].filter(n => n > 0).length };
}
