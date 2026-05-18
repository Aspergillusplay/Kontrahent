import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { useI18n } from '../lib/i18n/provider';

type RiskScore = 'green' | 'yellow' | 'red';

interface Props {
  score: RiskScore;
  numericScore?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const config = {
  green: {
    labelKey: 'risk.safe',
    icon: ShieldCheck,
    classes: 'text-green-400 bg-green-400/10 border-green-400/20',
    dot: 'bg-green-400',
    scoreColor: 'text-green-400',
  },
  yellow: {
    labelKey: 'risk.warning',
    icon: ShieldAlert,
    classes: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    dot: 'bg-yellow-400',
    scoreColor: 'text-yellow-400',
  },
  red: {
    labelKey: 'risk.critical',
    icon: ShieldX,
    classes: 'text-red-400 bg-red-400/10 border-red-400/20',
    dot: 'bg-red-400 animate-pulse',
    scoreColor: 'text-red-400',
  },
};

export default function RiskBadge({ score, numericScore, size = 'md', showLabel = true }: Props) {
  const { t } = useI18n();
  const c = config[score] || config.green;
  const Icon = c.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-2.5 py-1 gap-1.5',
    lg: 'text-base px-3 py-1.5 gap-2',
  }[size];

  const iconSize = { sm: 12, md: 14, lg: 18 }[size];

  return (
    <span className={`inline-flex items-center border rounded-full font-medium ${c.classes} ${sizeClasses}`}>
      <Icon size={iconSize} />
      {numericScore !== undefined && (
        <span className={`font-bold ${c.scoreColor}`}>{numericScore}/100</span>
      )}
      {showLabel && t(c.labelKey)}
    </span>
  );
}
