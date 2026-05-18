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
  return {
    total: Number(
      company.debt_summary?.total ??
        ((company.tax_debt || 0) + (company.social_debt || 0) + (company.health_debt || 0)),
    ),
    sources_count: Number(
      company.debt_summary?.sources_count ??
        [company.tax_debt, company.social_debt, company.health_debt].filter((value) => Number(value || 0) > 0)
          .length,
    ),
    tax: Number(company.debt_summary?.tax ?? company.tax_debt ?? 0),
    social: Number(company.debt_summary?.social ?? company.social_debt ?? 0),
    health: Number(company.debt_summary?.health ?? company.health_debt ?? 0),
  };
}

export function resolveRiskContainerClass(score: CompanyDetails['risk_score']): string {
  const scoreClassByRisk: Record<CompanyDetails['risk_score'], string> = {
    green: 'border-green-500/30 bg-green-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    red: 'border-red-500/30 bg-red-500/5',
  };

  return scoreClassByRisk[score] || '';
}
