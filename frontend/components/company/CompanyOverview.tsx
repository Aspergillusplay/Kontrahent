'use client';

import { Briefcase, Calendar, Fingerprint, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CompanyDetails } from '../../lib/company-types';
import ChartTooltip from './ChartTooltip';
import { formatCurrency } from './company-view.utils';
import { useI18n } from '../../lib/i18n/provider';

type HistoryChartCardProps = {
  title: string;
  iconClass: string;
  gradientId: string;
  stroke: string;
  data: { year: string; value: number }[];
};

function HistoryChartCard({ title, iconClass, gradientId, stroke, data }: HistoryChartCardProps) {
  const { t, locale } = useI18n();

  const renderAreaLabel = (props: any) => {
    const { x, y, value } = props;
    if (value === undefined || value === null) return null;
    return (
      <text
        x={x}
        y={y - 15}
        fill="#94a3b8"
        fontSize={10}
        textAnchor="middle"
        className="font-mono font-medium"
      >
        {formatCurrency(value, locale)}
      </text>
    );
  };

  return (
    <div className="card h-[320px] flex flex-col">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
        <TrendingUp className={`w-3.5 h-3.5 ${iconClass}`} /> {title}
      </h3>
      <div className="flex-1 min-h-0">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 20, right: 40, left: 40, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stroke} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="year"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 10 }}
                dy={10}
              />
              <YAxis hide={true} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#334155' }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                strokeWidth={2.5}
                activeDot={{ r: 6, strokeWidth: 0, fill: stroke }}
                dot={{ r: 4, strokeWidth: 2, fill: '#0f172a', stroke: stroke }}
                label={renderAreaLabel}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-600 text-xs italic bg-slate-900/20 rounded-lg">
            {t('company.historyNoData')}
          </div>
        )}
      </div>
    </div>
  );
}

type CompanyOverviewProps = {
  company: CompanyDetails;
};

export default function CompanyOverview({ company }: CompanyOverviewProps) {
  const { t, locale } = useI18n();

  const metrics = [
    { label: t('company.metric.revenue'), value: company.revenue !== undefined ? formatCurrency(company.revenue, locale) : '—' },
    {
      label: company.is_loss ? t('company.metric.loss') : t('company.metric.profit'),
      value: company.profit !== undefined ? formatCurrency(Math.abs(company.profit), locale) : '—',
      color: company.is_loss ? 'text-red-400' : 'text-emerald-400',
    },
    { label: t('company.metric.assets'), value: company.assets !== undefined ? formatCurrency(company.assets, locale) : '—' },
    {
      label: t('company.metric.equity'),
      value: company.equity !== undefined ? formatCurrency(company.equity, locale) : '—',
      color: company.negative_equity ? 'text-red-400' : undefined,
    },
    {
      label: t('company.metric.debtRatio'),
      value: company.debt_ratio !== undefined ? `${company.debt_ratio.toFixed(1)} %` : '—',
      color: company.debt_ratio !== undefined && company.debt_ratio > 100 ? 'text-yellow-400' : undefined,
    },
    {
      label: t('company.metric.grossMargin'),
      value: company.gross_margin !== undefined ? `${company.gross_margin.toFixed(2)} %` : '—',
    },
  ];

  return (
    <div className="lg:col-span-3 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Fingerprint className="w-3.5 h-3.5 text-brand-500" /> {t('company.registrationDetails')}
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800/50 pb-3">
              <span className="text-sm text-slate-400">{t('company.dic')}</span>
              <span className="text-sm font-mono text-slate-200">{company.dic || '—'}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800/50 pb-3">
              <span className="text-sm text-slate-400">{t('company.icDph')}</span>
              <span className="text-sm font-mono text-slate-200">{company.ic_dph || '—'}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-slate-400">{t('company.address')}</span>
              <span className="text-sm leading-relaxed text-slate-200">{company.address || '—'}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5 text-brand-500" /> {t('company.businessActivity')}
          </h3>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5 border-b border-slate-800/50 pb-3">
              <span className="text-sm text-slate-400">{t('company.industry')}</span>
              <span className="text-sm font-medium text-slate-200">{company.industry || '—'}</span>
            </div>
            <div className="flex flex-col gap-1.5 border-b border-slate-800/50 pb-3">
              <span className="text-sm text-slate-400">{t('company.skNace')}</span>
              <span className="text-sm leading-snug text-slate-300">{company.sk_nace || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">{t('company.employees')}</span>
              <span className="text-sm font-medium text-slate-200 bg-slate-800/50 px-2 py-0.5 rounded">
                {company.employees || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-slate-900/40 border border-slate-800/60 p-4 rounded-xl">
            <div className={`text-base font-bold font-mono ${metric.color || 'text-slate-100'}`}>{metric.value}</div>
            <div className="text-[10px] uppercase font-bold text-slate-500 mt-1 tracking-wider">{metric.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <HistoryChartCard
          title={t('company.chart.revenueTrend')}
          iconClass="text-blue-500"
          gradientId="revenueTrend"
          stroke="#3b82f6"
          data={company.history_data?.revenue || []}
        />
        <HistoryChartCard
          title={t('company.chart.profitTrend')}
          iconClass="text-emerald-500"
          gradientId="profitTrend"
          stroke="#10b981"
          data={company.history_data?.profit || []}
        />
      </div>
    </div>
  );
}
