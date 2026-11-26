'use client';

import { assessmentGroup, type AssessmentInput } from '../../lib/company-assessment';
import { toIntlLocale } from '../../lib/i18n/formatters';
import { useI18n } from '../../lib/i18n/provider';
import RiskBadge from '../RiskBadge';

export default function CompanyAssessment({company}: {company: AssessmentInput}) {
  const {t, locale} = useI18n();
  const group = assessmentGroup(company);
  const classes = 'inline-flex max-w-full rounded-md border px-2 py-1 text-xs font-medium leading-snug';
  if (group === 'closed') {
    const date = new Intl.DateTimeFormat(toIntlLocale(locale), {dateStyle: 'medium', timeZone: 'UTC'}).format(new Date(company.termination_date!));
    return <span className={classes + ' border-slate-600 bg-slate-800 text-slate-200'}>{t('assessment.closedOn', {date})}</span>;
  }
  if (company.last_checked_at && (company.risk_score === 'red' || company.risk_score === 'yellow' || company.risk_score === 'green'))
    return <RiskBadge score={company.risk_score} numericScore={company.risk_score_numeric} size="sm" />;
  const checks = Object.values(company.screening || {}).filter(value => typeof value === 'boolean');
  const key = group === 'yellow' ? 'assessment.adverse' : group === 'unknown' && !company.last_checked_at ? 'company.queued' : 'assessment.' + group;
  const color = group === 'favourable' ? 'border-teal-500/30 text-teal-300' : group === 'yellow' ? 'border-yellow-500/30 text-yellow-400' : 'border-slate-700 text-slate-300';
  return <span className={classes + ' ' + color}>{t(key, {checked: checks.length, adverse: checks.filter(value => !value).length})}</span>;
}
