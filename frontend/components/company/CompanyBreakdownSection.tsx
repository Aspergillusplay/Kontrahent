'use client';

import { useState } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CompanyBreakdownItem, CompanyDetails } from '../../lib/company-types';
import ChartTooltip from './ChartTooltip';
import { BREAKDOWN_COLORS, formatCurrency } from './company-view.utils';
import { useI18n } from '../../lib/i18n/provider';

type BreakdownCardProps = {
  title: string;
  iconColorClass: string;
  items: CompanyBreakdownItem[];
};

function BreakdownCard({ title, iconColorClass, items }: BreakdownCardProps) {
  const { t, locale } = useI18n();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hiddenIndexes, setHiddenIndexes] = useState<Set<number>>(new Set());
  const [isAnimating, setIsAnimating] = useState(false);

  const pieData = items.map((item, index) =>
    hiddenIndexes.has(index) ? { ...item, value: 0 } : item,
  );
  const toggleItemVisibility = (index: number) => {
    setIsAnimating(true);
    setHiddenIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });

    setActiveIndex((prev) => (prev === index ? null : prev));
  };

  const onPieEnter = (_: any, index: number) => {
    if (typeof index !== 'number') return;
    if (isAnimating || hiddenIndexes.has(index)) return;
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    if (isAnimating) return;
    setActiveIndex(null);
  };

  return (
    <div className="card">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
        <PieChartIcon className={`w-3.5 h-3.5 ${iconColorClass}`} /> {title}
      </h3>
      <div className="flex flex-col md:flex-row items-center gap-8">
        <div className="w-full md:w-1/2 h-[280px]">
          {items.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={pieData}
                  cx="50%" 
                  cy="50%" 
                  innerRadius={70} 
                  outerRadius={100} 
                  paddingAngle={6} 
                  dataKey="value"
                  onMouseEnter={onPieEnter}
                  onMouseLeave={onPieLeave}
                  onClick={(_entry, index) => {
                    if (typeof index !== 'number') return;
                    toggleItemVisibility(index);
                  }}
                  animationDuration={260}
                  animationEasing="ease-in-out"
                  onAnimationStart={() => setIsAnimating(true)}
                  onAnimationEnd={() => setIsAnimating(false)}
                >
                  {items.map((_, index) => (
                    <Cell 
                      key={`cell-${title}-${index}`} 
                      fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} 
                      opacity={hiddenIndexes.has(index) ? 0 : activeIndex === null || activeIndex === index ? 1 : 0.35}
                      style={{ outline: 'none', transition: 'opacity 0.18s ease', cursor: 'pointer' }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-600 text-xs italic bg-slate-900/20 rounded-lg">
              {t('company.dataUnavailable')}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2.5 w-full">
          {items.map((item, index) => (
            <button
              type="button"
              key={`${title}-${item.name}-${index}`} 
              className={`w-full text-left flex items-start justify-between gap-3 text-[11px] group cursor-pointer transition-opacity duration-300 ${
                hiddenIndexes.has(index)
                  ? 'opacity-45'
                  : isAnimating || activeIndex === null || activeIndex === index
                    ? 'opacity-100'
                    : 'opacity-40'
              }`}
              onClick={() => toggleItemVisibility(index)}
              onMouseEnter={() => {
                if (hiddenIndexes.has(index) || isAnimating) return;
                setActiveIndex(index);
              }}
              onMouseLeave={() => {
                if (isAnimating) return;
                setActiveIndex(null);
              }}
              aria-pressed={!hiddenIndexes.has(index)}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-2 h-2 mt-1 shrink-0 rounded-full ring-2 transition-transform duration-300 ${
                    hiddenIndexes.has(index)
                      ? 'bg-slate-600 ring-slate-800'
                      : `ring-slate-900 ${activeIndex === index ? 'scale-125' : 'group-hover:scale-125'}`
                  }`}
                  style={hiddenIndexes.has(index) ? undefined : { backgroundColor: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }}
                />
                <span
                  className={`transition-colors leading-tight line-clamp-2 ${
                    hiddenIndexes.has(index)
                      ? 'text-slate-600'
                      : activeIndex === index
                        ? 'text-slate-200'
                        : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                  title={item.name}
                >
                  {item.name}
                </span>
              </div>
              <span
                className={`shrink-0 font-mono font-bold whitespace-nowrap transition-colors ${
                  hiddenIndexes.has(index)
                    ? 'text-slate-600'
                    : activeIndex === index
                      ? 'text-slate-100'
                      : 'text-slate-200'
                }`}
              >
                {formatCurrency(item.value, locale)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type CompanyBreakdownSectionProps = {
  company: CompanyDetails;
};

export default function CompanyBreakdownSection({ company }: CompanyBreakdownSectionProps) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
      <BreakdownCard
        title={t('company.assetStructure')}
        iconColorClass="text-blue-400"
        items={company.breakdown?.assets || []}
      />
      <BreakdownCard
        title={t('company.liabilityStructure')}
        iconColorClass="text-purple-400"
        items={company.breakdown?.liabilities || []}
      />
    </div>
  );
}
