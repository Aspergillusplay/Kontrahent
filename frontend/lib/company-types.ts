export type RiskScore = 'green' | 'yellow' | 'red';

export type CompanyChartPoint = {
  year: string;
  value: number;
};

export type CompanyBreakdownItem = {
  name: string;
  value: number;
};

export type CompanyDebtSummary = {
  total: number;
  sources_count: number;
  tax: number;
  social: number;
  health: number;
};

export type CompanyEventsDetail = {
  bankruptcies?: number;
  debts?: number;
  court_decisions?: number;
  payment_orders?: number;
  executions?: number;
  debt_sources_count?: number;
};

export type CompanyImportantDates = {
  bankruptcy?: string;
  orsr_entry?: string;
};

export type CompanyHistoryData = {
  revenue: CompanyChartPoint[];
  profit: CompanyChartPoint[];
};

export type CompanyBreakdownData = {
  assets: CompanyBreakdownItem[];
  liabilities: CompanyBreakdownItem[];
};

export type CompanySearchResult = {
  ico: string;
  name: string;
  address?: string;
  city?: string;
  source: 'direct' | 'register' | 'local' | 'rpo' | 'ruz';
  risk_score?: RiskScore;
};

export type CompanyDetails = {
  ico: string;
  name: string;
  legal_form: string;
  address: string;
  city: string;
  status: string;
  tax_debt: number;
  social_debt: number;
  health_debt: number;
  court_cases: number;
  is_bankrupt: boolean;
  is_in_liquidation: boolean;
  risk_score: RiskScore;
  risk_score_numeric: number;
  risk_reasons: string[];
  last_checked_at: string;
  revenue?: number;
  profit?: number;
  is_loss?: boolean;
  debt_ratio?: number;
  equity?: number;
  negative_equity?: boolean;
  assets?: number;
  financial_year?: string;
  gross_margin?: number;
  dlhy_nedoplatky?: boolean;
  pohladavky_statu?: boolean;
  has_docasna_ochrana?: boolean;
  dph_status?: string;
  debt_summary?: CompanyDebtSummary;
  dic?: string;
  ic_dph?: string;
  industry?: string;
  employees?: string;
  sk_nace?: string;
  registration_date?: string;
  historical_name?: string;
  history_data?: CompanyHistoryData;
  breakdown?: CompanyBreakdownData;
  important_dates?: CompanyImportantDates;
  events_detail?: CompanyEventsDetail;
};

export type CompanyHistoryItem = {
  id: string | number;
  field_name: string;
  old_value: string;
  new_value: string;
  change_type: 'improved' | 'worsened' | 'neutral';
  changed_at: string;
};
