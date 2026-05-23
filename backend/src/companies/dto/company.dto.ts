import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckCompanyDto {
  @ApiProperty({ example: '31320155', description: 'Company ICO (8 digits)' })
  @IsString()
  @Length(6, 8)
  @Matches(/^\d+$/, { message: 'ICO must contain digits only' })
  ico: string;
}

export interface RegistryCompany {
  ico: string;
  name: string;
  legal_form?: string;
  address?: string;
  city?: string;
  status?: string;
  registration_date?: string;
}

export interface CompanyRiskData {
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
  risk_score: 'green' | 'yellow' | 'red';
  risk_score_numeric: number;
  risk_reasons: string[];
  last_checked_at: string;
  // Financial data from official accounting statements (RUZ)
  revenue?: number;
  profit?: number;
  is_loss?: boolean;
  debt_ratio?: number;
  equity?: number;
  negative_equity?: boolean;
  assets?: number;
  financial_year?: string;
  gross_margin?: number;
  // Debt/risk indicators
  dlhy_nedoplatky?: boolean;
  pohladavky_statu?: boolean;
  has_docasna_ochrana?: boolean;
  events_count?: number;
  dph_status?: string;
  debt_summary?: {
    total: number;
    sources_count: number;
    tax: number;
    social: number;
    health: number;
  };
  // New details
  dic?: string;
  ic_dph?: string;
  industry?: string;
  employees?: string;
  sk_nace?: string;
  registration_date?: string;
  historical_name?: string;
  history_data?: {
    revenue: { year: string; value: number }[];
    profit: { year: string; value: number }[];
  };
  breakdown?: {
    assets: { name: string; value: number }[];
    liabilities: { name: string; value: number }[];
  };
  important_dates?: {
    bankruptcy?: string;
    orsr_entry?: string;
  };
  events_detail?: {
    bankruptcies?: number;
    debts?: number;
    court_decisions?: number;
    payment_orders?: number;
    executions?: number;
    debt_sources_count?: number;
  };
}
