'use client';
import { CompanyDetails } from '../../lib/company-types';
import { useI18n } from '../../lib/i18n/provider';
export default function DataQualityNotice({company}:{company:CompanyDetails}) {
  const {t}=useI18n();
  const quality=company.data_quality;
  return <section className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4" aria-label={t('company.dataCoverage')}>
    <h2 className="font-semibold text-sm mb-2">{t('company.dataCoverage')}</h2>
    {company.screening && <p className="my-2 text-xs text-slate-400">{t('company.screeningMethod')}</p>}
    {quality?.stale && <p className="text-sm text-slate-400">{t('company.staleData')}</p>}
    <div className="flex flex-wrap gap-2 mt-3 text-xs">
      <span className="rounded-md bg-slate-800 px-2 py-1">{t('company.identity')}: {t('company.coverage.' + (quality?.identity?.status || 'unavailable'))}</span>
      {quality?.legal_status?.status === 'stale' && <span className="rounded-md bg-slate-800 px-2 py-1">
        {t('history.status')}: {t('company.coverage.stale')}
      </span>}
      {(['tax','social','health'] as const).map(source=><span key={source} className="rounded-md bg-slate-800 px-2 py-1">
        {t('company.source.'+source)}: {t('company.coverage.'+(quality?.debts?.[source]?.status || 'unavailable'))}
      </span>)}
      <span className="rounded-md bg-slate-800 px-2 py-1">{t('company.financialStatements')}: {t('company.coverage.'+(quality?.financials?.status || 'unavailable'))}</span>
    </div>
    <a href="/about-data#coverage" className="inline-block mt-3 text-xs text-brand-400 underline">{t('company.sourceDetails')}</a>
  </section>;
}
