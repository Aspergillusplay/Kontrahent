import type { CompanyDetails } from './company-types';

export type AssessmentInput = Partial<Pick<CompanyDetails, 'termination_date' | 'risk_score' | 'risk_score_numeric' | 'screening' | 'last_checked_at'>>;

export function assessmentGroup(company: AssessmentInput) {
  if (company.termination_date) return 'closed';
  if (!company.last_checked_at) return 'unknown';
  if (company.risk_score === 'red' || company.risk_score === 'yellow' || company.risk_score === 'green') return company.risk_score;
  const checks = Object.values(company.screening || {});
  if (checks.includes(false)) return 'yellow';
  if (checks.filter(value => value === true).length === 3) return 'favourable';
  return checks.includes(true) ? 'limited' : 'unknown';
}

export function assessmentScore(company: AssessmentInput) {
  if (company.termination_date || !company.last_checked_at) return undefined;
  if (company.risk_score === 'red' || company.risk_score === 'yellow' || company.risk_score === 'green') {
    const value = company.risk_score_numeric;
    if (Number.isInteger(value) && value >= 1 && value <= 100) return {value, label: 'assessment.riskPoints'};
    return undefined;
  }
  if (company.risk_score !== 'partial' || !company.screening) return undefined;
  const {nonnegative_profit, positive_equity, no_social_arrears} = company.screening;
  const indicators = [nonnegative_profit, positive_equity, no_social_arrears];
  if (!indicators.every(value => typeof value === 'boolean')) return undefined;
  const value = Math.max(1, Math.round(100 * indicators.filter(Boolean).length / indicators.length));
  return {value, label: 'assessment.checkPoints'};
}

export function compactCompanyName(name: string) {
  return name.split(/;\s*skrátený názov\s*:/i)[0].trim() || name;
}
