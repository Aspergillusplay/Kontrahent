'use client';

import { Archive, CircleCheck, CircleHelp, ClipboardList, Clock3, OctagonAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { assessmentGroup, type AssessmentInput } from '../../lib/company-assessment';
import { toIntlLocale } from '../../lib/i18n/formatters';
import { useI18n } from '../../lib/i18n/provider';

const states = {
  red: { icon: OctagonAlert, label: 'risk.critical' },
  yellow: { icon: TriangleAlert, label: 'risk.warning' },
  green: { icon: ShieldCheck, label: 'risk.safe' },
  favourable: { icon: CircleCheck, label: 'assessment.favourable' },
  limited: { icon: ClipboardList, label: 'assessment.incomplete' },
  closed: { icon: Archive, label: 'assessment.closedCompany' },
  unknown: { icon: CircleHelp, label: 'assessment.unknown' },
};

export default function CompanyAssessment({company, band = false}: {company: AssessmentInput; band?: boolean}) {
  const {t, locale} = useI18n();
  const group = assessmentGroup(company);
  const queued = group === 'unknown' && !company.last_checked_at;
  const Icon = queued ? Clock3 : states[group].icon;
  const checks = Object.values(company.screening || {}).filter(value => typeof value === 'boolean');
  let detail: string | undefined;
  if (group === 'closed') {
    const date = new Intl.DateTimeFormat(toIntlLocale(locale), {dateStyle: 'medium', timeZone: 'UTC'}).format(new Date(company.termination_date!));
    detail = t('assessment.registryDate', {date});
  } else if (group === 'favourable' || group === 'limited') {
    detail = t('assessment.checkCount', {checked: checks.length});
  } else if (group === 'yellow' && company.risk_score !== 'yellow') {
    detail = t('assessment.adverse', {adverse: checks.filter(value => !value).length, checked: checks.length});
  } else if ((group === 'red' || group === 'yellow' || group === 'green') && Number.isFinite(company.risk_score_numeric)) {
    detail = t('assessment.score', {score: company.risk_score_numeric!});
  }

  return <span data-assessment={group} className={'company-assessment ' + (band ? 'assessment-band' : 'assessment-badge')}>
    <span className="inline-flex min-w-0 items-center gap-2">
      <Icon aria-hidden="true" size={18} strokeWidth={2.4} className="shrink-0" />
      <strong>{t(queued ? 'company.queued' : states[group].label)}</strong>
    </span>
    {detail && <span className="assessment-detail">{detail}</span>}
  </span>;
}
