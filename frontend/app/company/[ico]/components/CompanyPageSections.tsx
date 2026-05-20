import Link from 'next/link';
import { ArrowLeft, Building2, Loader2 } from 'lucide-react';
import AppHeader from '../../../../components/AppHeader';
import CompanyBreakdownSection from '../../../../components/company/CompanyBreakdownSection';
import CompanyHeader from '../../../../components/company/CompanyHeader';
import CompanyHistoryTimeline from '../../../../components/company/CompanyHistoryTimeline';
import CompanyOverview from '../../../../components/company/CompanyOverview';
import CompanySidebar from '../../../../components/company/CompanySidebar';
import { resolveDebtSummary } from '../../../../components/company/company-view.utils';
import { CompanyDetails, CompanyHistoryItem } from '../../../../lib/company-types';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type CompanyBackHeaderProps = {
  t: TranslateFn;
};

export function CompanyBackHeader({ t }: CompanyBackHeaderProps) {
  return (
    <AppHeader
      maxWidthClassName="max-w-7xl"
      right={
        <Link href="/dashboard" className="btn-ghost text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t('common.back')}
        </Link>
      }
    />
  );
}

export function CompanyLoadingState() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
    </div>
  );
}

type CompanyNotFoundStateProps = {
  t: TranslateFn;
  ico: string;
};

export function CompanyNotFoundState({ t, ico }: CompanyNotFoundStateProps) {
  return (
    <div className="flex items-center justify-center text-center px-4 py-20">
      <div>
        <Building2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-slate-400">{t('company.notFound')}</h2>
        <p className="text-slate-500 text-sm mt-1">{t('company.notFoundDescription', { ico })}</p>
        <Link href="/dashboard" className="btn-primary inline-block mt-4">
          {t('common.back')}
        </Link>
      </div>
    </div>
  );
}

type CompanyDetailsContentProps = {
  company: CompanyDetails;
  history: CompanyHistoryItem[];
  isDemo: boolean;
  inWatchlist: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onAddToWatchlist: () => Promise<void>;
};

export function CompanyDetailsContent({
  company,
  history,
  isDemo,
  inWatchlist,
  refreshing,
  onRefresh,
  onAddToWatchlist,
}: CompanyDetailsContentProps) {
  const debtSummary = resolveDebtSummary(company);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
      <CompanyHeader
        company={company}
        isDemo={isDemo}
        inWatchlist={inWatchlist}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onAddToWatchlist={onAddToWatchlist}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <CompanyOverview company={company} />
        <CompanySidebar company={company} debtSummary={debtSummary} />
      </div>

      <CompanyBreakdownSection company={company} />
      <CompanyHistoryTimeline history={history} />
    </div>
  );
}
