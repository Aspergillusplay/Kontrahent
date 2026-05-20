'use client';

import { format } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import { CompanyHistoryItem } from '../../lib/company-types';
import { useI18n } from '../../lib/i18n/provider';
import { toDateFnsLocale } from '../../lib/i18n/formatters';

type CompanyHistoryTimelineProps = {
  history: CompanyHistoryItem[];
};

export default function CompanyHistoryTimeline({ history }: CompanyHistoryTimelineProps) {
  const { t, locale } = useI18n();

  if (!history.length) {
    return null;
  }

  return (
    <div className="card border-slate-800">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">{t('company.historyChanges')}</h3>
      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 sm:pr-4 scrollbar-thin scrollbar-thumb-slate-800">
        {history.map((entry) => (
          <div
            key={entry.id}
            className={`flex items-start gap-4 p-4 rounded-xl transition-colors ${
              entry.change_type === 'worsened'
                ? 'bg-red-500/5 border border-red-500/10'
                : entry.change_type === 'improved'
                  ? 'bg-green-500/5 border border-green-500/10'
                  : 'bg-slate-900/50 border border-slate-800/50'
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 shadow-lg ${
                entry.change_type === 'worsened'
                  ? 'bg-red-500 shadow-red-500/20'
                  : entry.change_type === 'improved'
                    ? 'bg-green-500 shadow-green-500/20'
                    : 'bg-slate-600 shadow-slate-600/20'
              }`}
            />
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-1">
                <span className="text-sm font-bold text-slate-200">{entry.field_name}</span>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded uppercase">
                  {format(new Date(entry.changed_at), 'd.M.yy HH:mm', { locale: toDateFnsLocale(locale) })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-400 line-through opacity-50">{entry.old_value || '—'}</span>
                <TrendingUp className="w-3 h-3 text-slate-600 rotate-90" />
                <span
                  className={`font-medium ${
                    entry.change_type === 'worsened'
                      ? 'text-red-400'
                      : entry.change_type === 'improved'
                        ? 'text-green-400'
                        : 'text-slate-200'
                  }`}
                >
                  {entry.new_value}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
