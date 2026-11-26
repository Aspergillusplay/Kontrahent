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

export function compactCompanyName(name: string) {
  return name.split(/;\s*skrátený názov\s*:/i)[0].trim() || name;
}
