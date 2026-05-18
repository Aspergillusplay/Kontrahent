'use client';

import { formatCurrency } from './company-view.utils';
import { useI18n } from '../../lib/i18n/provider';

type TooltipPayloadItem = {
  value?: number;
  payload?: {
    name?: string;
  };
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
};

export default function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  const { locale } = useI18n();

  if (!active || !payload?.length) {
    return null;
  }

  const value = Number(payload[0].value || 0);
  const fallbackLabel = payload[0].payload?.name || '';

  return (
    <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl">
      <p className="text-slate-400 text-xs mb-1 font-medium">{label || fallbackLabel}</p>
      <p className="text-slate-100 font-bold font-mono text-sm">{formatCurrency(value, locale)}</p>
    </div>
  );
}
