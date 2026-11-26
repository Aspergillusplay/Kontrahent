'use client';

import { BellRing, ShieldCheck, Zap } from 'lucide-react';
import type { CompanyDebtSummary, CompanyDetails } from '../../lib/company-types';
import { formatCurrency } from './company-view.utils';
import { useI18n } from '../../lib/i18n/provider';

export default function CompanySidebar({company, debtSummary}: {company: CompanyDetails; debtSummary: CompanyDebtSummary}) {
  const { t, locale } = useI18n();
  const events = [
    {label: t('company.bankruptcies'), value: company.events_detail?.bankruptcies},
    {label: t('company.courtDecisions'), value: company.events_detail?.court_decisions},
    {label: t('company.paymentOrders'), value: company.events_detail?.payment_orders},
    {label: t('company.enforcements'), value: company.events_detail?.executions},
  ].filter(item => Number.isFinite(item.value));
  const sources = (['social', 'tax', 'health'] as const).filter(source =>
    ['verified', 'stale'].includes(company.data_quality?.debts?.[source]?.status || ''));
  const dates = [
    {label: t('company.latestOrsrEntry'), value: company.important_dates?.orsr_entry !== company.registration_date ? company.important_dates?.orsr_entry : undefined},
    {label: t('company.bankruptcyProceedings'), value: company.important_dates?.bankruptcy},
  ].filter(item => item.value);
  return <aside className="space-y-6">
    {sources.length > 0 && <section className="card">
      <h3 className="mb-4 flex items-center gap-2 font-semibold"><Zap size={16}/>{t('company.knownDebt')}</h3>
      <dl className="space-y-3 text-sm">{sources.map(source => <div key={source} className="flex justify-between gap-3">
        <dt className="text-slate-400">{t('company.source.' + source)}
          {company.data_quality?.debts?.[source]?.status === 'stale' && <small className="block">{t('company.coverage.stale')}</small>}
        </dt>
        <dd className="font-mono">{formatCurrency(debtSummary[source], locale)}</dd>
      </div>)}</dl>
    </section>}
    {events.length > 0 && <section className="card">
      <h3 className="mb-4 flex items-center gap-2 font-semibold"><BellRing size={16}/>{t('company.importantEvents')}</h3>
      <dl className="space-y-3 text-sm">{events.map(({label, value}) => <div key={label} className="flex justify-between gap-3">
        <dt className="text-slate-400">{label}</dt><dd className="font-medium">{value}</dd>
      </div>)}</dl>
    </section>}
    {dates.length > 0 && <section className="card">
      <h3 className="mb-4 flex items-center gap-2 font-semibold"><ShieldCheck size={16}/>{t('company.registries')}</h3>
      <dl className="space-y-3 text-sm">{dates.map(({label, value}) => <div key={label} className="flex justify-between gap-3">
        <dt className="text-slate-400">{label}</dt><dd>{value}</dd>
      </div>)}</dl>
    </section>}
  </aside>;
}
