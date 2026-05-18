'use client';

import { ReactNode } from 'react';
import { AlertTriangle, BellRing, ShieldCheck, Zap } from 'lucide-react';
import { CompanyDebtSummary, CompanyDetails } from '../../lib/company-types';
import { formatCurrency } from './company-view.utils';
import { useI18n } from '../../lib/i18n/provider';

type EventCardProps = {
  label: string;
  value: number;
  dangerClass: string;
  normalClass?: string;
  icon: ReactNode;
};

function EventCard({ label, value, dangerClass, normalClass, icon }: EventCardProps) {
  const baseClass =
    normalClass || 'bg-slate-900/50 border border-slate-800 text-slate-400';
  const className = value > 0 ? dangerClass : baseClass;

  return (
    <div className={`p-4 rounded-xl flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="font-bold font-mono">{value}</span>
    </div>
  );
}

type BinaryIndicatorCardProps = {
  label: string;
  value: boolean;
  trueLabel: string;
  falseLabel: string;
};

function BinaryIndicatorCard({ label, value, trueLabel, falseLabel }: BinaryIndicatorCardProps) {
  return (
    <div className="bg-slate-900/50 p-3 rounded-lg text-center border border-slate-800/50">
      <div className={`text-sm font-bold ${value ? 'text-red-400' : 'text-emerald-400'}`}>{value ? trueLabel : falseLabel}</div>
      <div className="text-[9px] uppercase text-slate-500 mt-1 font-bold">{label}</div>
    </div>
  );
}

type CompanySidebarProps = {
  company: CompanyDetails;
  debtSummary: CompanyDebtSummary;
};

export default function CompanySidebar({ company, debtSummary }: CompanySidebarProps) {
  const { t, locale } = useI18n();
  const rawDphStatus = String(company.dph_status || '').trim();
  const normalizedDphStatus = rawDphStatus
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const dphDisplayValue = !rawDphStatus || normalizedDphStatus === 'NIE'
    ? t('common.no')
    : normalizedDphStatus === 'ANO'
    ? t('common.yes')
    : rawDphStatus;

  return (
    <div className="space-y-6">
      <div className="card border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
          <BellRing className="w-3.5 h-3.5 text-brand-500" /> {t('company.importantEvents')}
        </h3>
        <div className="space-y-3">
          <EventCard
            label={t('company.bankruptcies')}
            value={company.events_detail?.bankruptcies || 0}
            dangerClass="bg-red-500/10 border border-red-500/20 text-red-400"
            icon={<AlertTriangle className="w-4 h-4" />}
          />
          <EventCard
            label={t('company.debtsClaims')}
            value={company.events_detail?.debts || 0}
            dangerClass="bg-orange-500/10 border border-orange-500/20 text-orange-400"
            icon={<Zap className="w-4 h-4" />}
          />
          <EventCard
            label={t('company.courtDecisions')}
            value={company.events_detail?.court_decisions || 0}
            dangerClass="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300"
            icon={<ShieldCheck className="w-4 h-4" />}
          />

          <div className="grid grid-cols-2 gap-3 mt-1">
            <div
              className={`p-3 rounded-lg text-center border ${
                (company.events_detail?.payment_orders || 0) > 0
                  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400'
              }`}
            >
              <div className="text-sm font-bold">{company.events_detail?.payment_orders || 0}</div>
              <div className="text-[9px] uppercase mt-1 font-bold">{t('company.paymentOrders')}</div>
            </div>
            <div
              className={`p-3 rounded-lg text-center border ${
                (company.events_detail?.executions || 0) > 0
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400'
              }`}
            >
              <div className="text-sm font-bold">{company.events_detail?.executions || 0}</div>
              <div className="text-[9px] uppercase mt-1 font-bold">{t('company.enforcements')}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <BinaryIndicatorCard label={t('company.indicatorDebts')} value={!!company.dlhy_nedoplatky} trueLabel={t('common.yes')} falseLabel={t('common.no')} />
            <BinaryIndicatorCard label={t('company.indicatorState')} value={!!company.pohladavky_statu} trueLabel={t('common.yes')} falseLabel={t('common.no')} />
            <div className="bg-slate-900/50 p-3 rounded-lg text-center border border-slate-800/50">
              <div
                className={`text-sm font-bold ${
                  company.dph_status && company.dph_status !== 'NIE' ? 'text-orange-400' : 'text-emerald-400'
                }`}
              >
                {dphDisplayValue}
              </div>
              <div className="text-[9px] uppercase text-slate-500 mt-1 font-bold">{t('company.vatRegistry')}</div>
            </div>
            <BinaryIndicatorCard label={t('company.indicatorProtection')} value={!!company.has_docasna_ochrana} trueLabel={t('common.yes')} falseLabel={t('common.no')} />
          </div>
        </div>
      </div>

      <div className="card border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-brand-500" /> {t('company.officialDebt')}
        </h3>

        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{t('company.totalDebt')}</div>
          <div className={`text-xl font-mono font-bold ${debtSummary.total > 0 ? 'text-orange-300' : 'text-emerald-300'}`}>
            {formatCurrency(debtSummary.total, locale)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{t('company.sourcesWithDebt', { count: debtSummary.sources_count })}</div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/50 rounded-lg p-3">
            <span className="text-slate-400">{t('company.taxRegistry')}</span>
            <span className={`font-mono font-bold ${debtSummary.tax > 0 ? 'text-red-400' : 'text-slate-200'}`}>
              {formatCurrency(debtSummary.tax, locale)}
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/50 rounded-lg p-3">
            <span className="text-slate-400">{t('company.socialInsurance')}</span>
            <span className={`font-mono font-bold ${debtSummary.social > 0 ? 'text-red-400' : 'text-slate-200'}`}>
              {formatCurrency(debtSummary.social, locale)}
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/50 rounded-lg p-3">
            <span className="text-slate-400">{t('company.healthInsurance')}</span>
            <span className={`font-mono font-bold ${debtSummary.health > 0 ? 'text-red-400' : 'text-slate-200'}`}>
              {formatCurrency(debtSummary.health, locale)}
            </span>
          </div>
        </div>
      </div>

      <div className="card border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-brand-500" /> {t('company.registries')}
        </h3>
        <div className="space-y-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{t('company.latestOrsrEntry')}</div>
            <div className="text-sm text-slate-200 mt-0.5">{company.important_dates?.orsr_entry || '—'}</div>
          </div>
          {company.important_dates?.bankruptcy && (
            <div>
              <div className="text-[10px] text-red-500/70 uppercase font-bold tracking-tighter">{t('company.bankruptcyProceedings')}</div>
              <div className="text-sm text-red-400 mt-0.5">{company.important_dates.bankruptcy}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
