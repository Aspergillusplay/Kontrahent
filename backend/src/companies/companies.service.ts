import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AsyncLocalStorage } from 'node:async_hooks';
import { SupabaseService } from '../supabase/supabase.service';
import { CompanyRiskData } from './dto/company.dto';
import {
  buildDebtSummary, normalizeIco, requireIco, parseNumber,
  sanitizeDisplayAddress,
  sanitizeDisplayName,
} from './utils/company-data.utils';

import { mapLimit } from '../common/concurrency';
import { extractFinancials, extractBreakdown } from './utils/financials';

type DebtSnapshot = {
  tax: number;
  social: number;
  health: number;
  total: number;
  sources_count: number;
  quality: Record<string, { status: string; checked_at?: string }>;
};



type BrowseParams = {
  page: number;
  sort: string;
  activity: string;
  region: string;
  legalForm: string;
  employees: string;
  salesFrom: string;
  query: string;
};

type BrowseCompanyItem = {
  ico: string;
  name: string;
  city: string;
  region: string;
  employees: string;
  sales: string;
  creation_date: string;
  source_url: string;
};

type BrowseResult = {
  companies: BrowseCompanyItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

type CompanySearchResult = {
  ico: string;
  name: string;
  address: string;
  city: string;
  source: 'direct' | 'register' | 'local' | 'rpo' | 'ruz';
  risk_score?: string;
};

type RuzMappedRow = {
  tableName: string;
  lineNo: number;
  label: string;
  values: number[];
  templateId: number;
};

type RuzStatementFinancial = {
  financials: Record<string, any>;
  rows: RuzMappedRow[];
  breakdown: {
    assets: { name: string; value: number }[];
    liabilities: { name: string; value: number }[];
  };
};

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  private readonly requests = new AsyncLocalStorage<AbortSignal>();
  private readonly inFlight = new Map<string, Promise<CompanyRiskData>>();
  private readonly rpoBase: string;
  private readonly ruzBase: string;
  private readonly ruzDefaultSince = '2000-01-01';
  private readonly requestHeaders = { 'User-Agent': 'Kontrahent/1.0', Accept: 'application/json' };

  private ruzTemplateCache = new Map<number, any>();
  private ruzLegalFormsByCode: Map<string, string> | null = null;
  private ruzOrgSizesByCode: Map<string, string> | null = null;
  private ruzRegionsByCode: Map<string, string> | null = null;
  private ruzRegionCodeByName: Map<string, string> | null = null;

  constructor(
    private supabase: SupabaseService,
    private config: ConfigService,
  ) {
    this.rpoBase = this.config.get('RPO_API_BASE') || 'https://api.statistics.sk/rpo/v1';
    this.ruzBase = this.config.get('RUZ_API_BASE') || 'https://www.registeruz.sk/cruz-public/api';
  }

  async search(query: string, page = 1): Promise<CompanySearchResult[]> {
    const limit = 20;
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const offset = (safePage - 1) * limit;
    const q = this.normalizeSearchText(query).slice(0, 120);
    this.logger.log(`Searching for: "${q}" (page ${safePage}, offset ${offset})`);

    if (q.length < 2) {
      return this.searchLocalCompanies(q, offset, limit);
    }

    if (/^\d{6,8}$/.test(q)) {
      if (safePage > 1) return [];
      const company = await this.getCompany(normalizeIco(q));
      return [{ ico: company.ico, name: company.name, address: company.address || '', city: company.city || '', source: 'direct', risk_score: company.risk_score }];
    }
    const [remote, local] = await Promise.allSettled([
      this.searchViaRpo(q, safePage, limit), this.searchLocalCompanies(q, offset, limit),
    ]);
    const rpoMatches = remote.status === 'fulfilled' ? remote.value : [];
    const localMatches = local.status === 'fulfilled' ? local.value : [];
    if (local.status === 'rejected' || (remote.status === 'rejected' && !localMatches.length))
      throw new ServiceUnavailableException('Official company search is temporarily unavailable');
    const merged: CompanySearchResult[] = [];
    const seen = new Set<string>();
    for (const sourceList of [rpoMatches, localMatches]) {
      for (const row of sourceList) {
        const ico = this.normalizeSearchIco(row.ico);
        if (!ico || seen.has(ico)) continue;
        seen.add(ico);
        merged.push({ ...row, ico });
        if (merged.length >= limit) break;
      }
      if (merged.length >= limit) break;
    }

    return this.enrichSearchResultsWithRisk(merged.slice(0, limit));
  }

  async browseRegistryDatabase(params: BrowseParams): Promise<BrowseResult> {
    const page = Math.max(1, Math.min(5000, Math.floor(Number(params.page) || 1)));
    const query = this.normalizeSearchText(params.query).slice(0, 120);
    // Only identity fields are indexed from search. They are not a verified risk assessment.
    if (query.length >= 2 && page === 1) {
      const matches = await this.search(query, 1);
      if (matches.length) {
        const { error } = await this.supabase.db.from('companies').upsert(matches.map(row => ({
          ico: row.ico, name: row.name, address: row.address, city: row.city,
          risk_score: 'unknown', raw_data: { data_quality: { version: 0 } },
        })), { onConflict: 'ico', ignoreDuplicates: true });
        if (error) throw new ServiceUnavailableException('Company directory is unavailable');
      }
    }
    const { data, error } = await this.supabase.db.rpc('browse_company_cache', {
      p_query: query, p_page: page, p_sort: params.sort,
      p_region: params.region, p_legal_form: params.legalForm, p_employees: params.employees,
    });
    if (error) throw new ServiceUnavailableException('Company directory is unavailable');
    const [regions,sizes]=await Promise.all([this.getRuzRegionsMap(),this.getRuzOrgSizesMap()]);
    return { ...data, companies: data.companies.map(row => ({...row, region: regions.get(row.region) || row.region,
      employees: sizes.get(row.employees) || row.employees})) };
  }

  async getCompany(ico: string): Promise<CompanyRiskData> {
    const normalized = requireIco(ico);
    const { data: cached, error } = await this.supabase.db.from('companies').select('*').eq('ico', normalized).maybeSingle();
    if (error) throw new ServiceUnavailableException('Company database is unavailable');
    const age = cached?.last_checked_at ? Date.now() - new Date(cached.last_checked_at).getTime() : Infinity;
    if (cached?.raw_data?.data_quality?.version === 2 && age >= 0 && age < 24 * 60 * 60 * 1000) {
      return this.formatCompany(cached);
    }
    return this.fetchAndStore(normalized);
  }

  async getHistory(ico: string) {
    const normalized = requireIco(ico);
    const { data, error } = await this.supabase.db
      .from('company_history')
      .select('*')
      .eq('ico', normalized)
      .is('invalidated_at', null)
      .eq('is_verified', true)
      .order('changed_at', { ascending: false })
      .limit(200);

    if (error) {
      this.logger.error(`Unable to load history for ICO ${normalized}: ${error.message}`);
      throw new ServiceUnavailableException('Company history is unavailable');
    }

    return data || [];
  }

  async fetchAndStore(ico: string): Promise<CompanyRiskData> {
    const normalized = requireIco(ico);
    const pending = this.inFlight.get(normalized);
    if (pending) return pending;
    if (this.inFlight.size >= 4) throw new ServiceUnavailableException('Company checks are busy. Please retry shortly.');
    const work = this.requests.run(AbortSignal.timeout(45000), () => this.refreshCompany(normalized)).finally(() => this.inFlight.delete(normalized));
    this.inFlight.set(normalized, work);
    return work;
  }

  private async refreshCompany(ico: string): Promise<CompanyRiskData> {
    const startedAt = new Date().toISOString();
    const { data: existing, error } = await this.supabase.db.from('companies').select('*').eq('ico', ico).maybeSingle();
    if (error) throw new ServiceUnavailableException('Company database is unavailable');
    const [rpo, ruz, debts] = await Promise.all([
      this.fetchFromRpo(ico), this.fetchFromRuz(ico), this.resolveDebtSnapshot(ico, existing),
    ]);
    if (!rpo?.name && !ruz?.name) {
      if (existing && !this.isInvalidIdentityName(existing.name)) {
        const cached = this.formatCompany(existing);
        return { ...cached, data_quality: { ...cached.data_quality, stale: true } };
      }
      throw new ServiceUnavailableException('Company could not be verified. Retry when the official registers are available.');
    }
    const old = existing?.raw_data || {};
    const hasFinancials = ruz?.financials && ['revenue','profit','equity','assets'].some(k => Number.isFinite(ruz.financials[k]));
    const financials = hasFinancials
      ? ruz.financials : (old.data_quality?.version === 2 ? old.financials || {} : {});
    const name = this.pickFirstText(rpo.name, ruz.name, existing?.name);
    const status = this.pickFirstText(rpo.status, ruz.status, existing?.status) || '';
    const hasStatus = !!rpo.status;
    const bankrupt = hasStatus ? !!rpo.is_bankrupt : (ruz.is_bankrupt || existing?.is_bankrupt || false);
    const liquidation = hasStatus ? !!rpo.is_in_liquidation : (ruz.is_in_liquidation || existing?.is_in_liquidation || false);
    const quality = {
      version: 2, stale: false,
      identity: { status: rpo.name ? 'verified' : 'partial', checked_at: startedAt },
      legal_status: { status: hasStatus ? 'verified' : ruz.status ? 'partial' : 'unavailable', checked_at: startedAt },
      financials: { status: hasFinancials ? 'verified' : Object.keys(financials).length ? 'stale' : 'unavailable', checked_at: hasFinancials ? ruz?.raw?.last_sync_at : old.data_quality?.financials?.checked_at },
      debts: debts.quality,
      legal_events: { status: 'unavailable' }, vat: { status: 'unavailable' },
    };
    const raw = {
      ...old, rpo: rpo.raw || old.rpo, ruz: ruz.raw || old.ruz, financials,
      data_quality: quality, debt_summary: debts,
      indicators: { dlhy_nedoplatky: debts.total > 0 },
      events_detail: { bankruptcies: bankrupt ? 1 : undefined, debts: debts.sources_count || undefined },
      history_data: hasFinancials ? ruz.history_data : (old.data_quality?.version === 2 ? old.history_data : undefined),
      breakdown: hasFinancials ? ruz.breakdown : (old.data_quality?.version === 2 ? old.breakdown : { assets: [], liabilities: [] }),
      important_dates: { orsr_entry: this.pickFirstText(rpo.registration_date, ruz.registration_date) },
      dic: this.pickFirstText(ruz.dic, rpo.dic, old.dic),
      ic_dph: this.pickFirstText(rpo.ic_dph, old.ic_dph),
      industry: this.pickFirstText(ruz.industry, rpo.industry, old.industry),
      sk_nace: this.pickFirstText(ruz.sk_nace, rpo.sk_nace, old.sk_nace),
      employees: this.pickFirstText(ruz.employees, old.employees),
      registration_date: this.pickFirstText(rpo.registration_date, ruz.registration_date, old.registration_date),
      historical_name: this.pickFirstText(rpo.historical_name, old.historical_name),
      additional_financial_rows: ruz.mapped_rows || [],
    };
    const next = {
      ico, name, status,
      address: this.pickFirstText(rpo.address, ruz.address, existing?.address) || '',
      city: this.pickFirstText(rpo.city, ruz.city, existing?.city) || '',
      legal_form: this.pickFirstText(rpo.legal_form, ruz.legal_form, existing?.legal_form) || '',
      tax_debt: debts.tax, social_debt: debts.social, health_debt: debts.health,
      is_bankrupt: bankrupt, is_in_liquidation: liquidation,
      court_cases: 0, raw_data: raw, last_checked_at: startedAt,
    };
    const risk = this.calculateRisk(next);
    raw['risk_score_numeric'] = risk.risk_score_numeric;
    const { data: saved, error: saveError } = await this.supabase.db.rpc('save_company_snapshot', {
      p_snapshot: { ...next, risk_score: risk.risk_score, risk_reasons: risk.risk_reasons },
    });
    if (saveError) throw new ServiceUnavailableException('Company update could not be saved');
    return this.formatCompany(saved);
  }

  private async searchLocalCompanies(query: string, offset: number, limit: number): Promise<CompanySearchResult[]> {
    // Separate safe filters avoid injecting user text into PostgREST's OR grammar.
    let queryBuilder = this.supabase.db.from('companies').select('*');
    if (/^\d{6,8}$/.test(query)) queryBuilder = queryBuilder.eq('ico', normalizeIco(query));
    else if (query.length >= 2) queryBuilder = queryBuilder.ilike('name', '%' + query.replace(/[\\%_]/g, char => '\\' + char) + '%');
    const { data, error } = await queryBuilder.order('name').order('ico').range(offset, offset + limit - 1);
    if (error) throw new ServiceUnavailableException('Company directory is unavailable');
    return (data || []).map(record => ({ ico: record.ico, name: record.name, address: record.address, city: record.city,
      risk_score: this.formatCompany(record).risk_score,
      source: 'local' as const,
    }));
  }

  private async searchViaRpo(query: string, page: number, limit: number): Promise<CompanySearchResult[]> {
    try {
      const q = this.normalizeSearchText(query);
      const isDigits = /^\d{6,10}$/.test(q);
      const params: Record<string, any> = {
        onlyActive: true,
      };

      if (isDigits) {
        params.identifier = this.normalizeIco(q);
      } else {
        params.fullName = q;
      }

      // Some deployments expose pagination. Unknown params are ignored by RPO.
      params.limit = limit;
      params.offset = (Math.max(page, 1) - 1) * limit;

      const { data } = await axios.get(`${this.rpoBase}/search`, {
        params,
        timeout: 12000,
        headers: this.requestHeaders, signal: this.requests.getStore(),
      });

      const rawResults = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
        ? data
        : [];

      const parsed = rawResults
        .map((entity: any) => this.mapRpoSearchEntity(entity))
        .filter((row): row is CompanySearchResult => row !== null);

      if (parsed.length > limit) {
        return parsed.slice(0, limit);
      }

      return parsed;
    } catch (e) {
      this.logger.warn(`RPO search failed: ${this.getErrorMessage(e)}`);
      throw new ServiceUnavailableException('Official search is unavailable');
    }
  }

  private async searchViaRuzByIco(query: string): Promise<CompanySearchResult[]> {
    const digits = this.normalizeSearchText(query).replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 8) return [];

    try {
      const ids = await this.fetchRuzUnitIds({
        ico: this.normalizeIco(digits),
        maxRecords: 5,
      });
      if (!ids.length) return [];

      const units = await Promise.all(ids.slice(0, 5).map((id) => this.fetchRuzUnitById(id)));
      return units
        .filter((unit) => !!unit)
        .map((unit: any) => ({
          ico: this.normalizeSearchIco(unit.ico),
          name: this.normalizeSearchText(unit.nazovUJ),
          address: this.normalizeSearchText(`${unit.ulica || ''}`.trim()),
          city: this.normalizeSearchText(unit.mesto || ''),
          source: 'ruz' as const,
        }))
        .filter((row) => !!row.ico && !!row.name);
    } catch (e) {
      this.logger.warn(`RUZ ICO search fallback failed: ${this.getErrorMessage(e)}`);
      return [];
    }
  }

  private async enrichSearchResultsWithRisk(results: CompanySearchResult[]): Promise<CompanySearchResult[]> {
    if (!results.length) return [];

    const normalized = results
      .map((row) => ({
        ...row,
        ico: this.normalizeSearchIco(row.ico),
      }))
      .filter((row) => !!row.ico);

    const icos = [...new Set(normalized.map((row) => row.ico))];
    if (icos.length === 0) return normalized;

    const { data: localData } = await this.supabase.db
      .from('companies')
      .select('*')
      .in('ico', icos);

    const riskByIco = new Map((localData || []).map((row) => [this.normalizeSearchIco(row.ico), this.formatCompany(row).risk_score]));
    normalized.forEach((row) => {
      if (!row.risk_score) {
        const risk = riskByIco.get(row.ico);
        if (risk) row.risk_score = risk;
      }
    });

    return normalized;
  }

  private async fetchFromRpo(ico: string): Promise<any> {
    try {
      const entities = await this.fetchRpoSearch({ identifier: ico, onlyActive: false });
      const picked =
        entities.find((entity) => this.extractRpoIco(entity) === ico) ||
        entities.find((entity) => this.extractRpoIco(entity) === this.normalizeIco(ico));
      if (!picked?.id) return {};

      const { data } = await axios.get(`${this.rpoBase}/entity/${picked.id}`, {
        params: {
          showHistoricalData: true,
          showOrganizationUnits: true,
        },
        timeout: 12000,
        headers: this.requestHeaders, signal: this.requests.getStore(),
      });

      const entity = data || picked;
      const name = this.extractRpoName(entity) || this.extractRpoName(picked);
      const addressObj = this.extractRpoAddress(entity) || this.extractRpoAddress(picked);
      const legalForm = this.extractRpoLegalForm(entity) || this.extractRpoLegalForm(picked);
      const legalStatus = this.extractRpoStatus(entity) || this.extractRpoStatus(picked);
      const establishment = this.extractRpoDate(entity?.establishment);
      const historicalName = this.extractRpoHistoricalName(entity);

      const statusNorm = this.normalizeLookup(legalStatus);
      return {
        name,
        address: addressObj?.full || '',
        city: addressObj?.city || '',
        legal_form: legalForm,
        status: legalStatus,
        registration_date: establishment,
        historical_name: historicalName,
        sk_nace: this.extractRpoSkNace(entity),
        dic: this.extractRpoDic(entity),
        ic_dph: this.extractRpoVat(entity),
        is_bankrupt: statusNorm.includes('konkurz') || statusNorm.includes('insolv'),
        is_in_liquidation: statusNorm.includes('likvid'),
        raw: {
          id: entity?.id || picked?.id,
          source: 'rpo',
          last_sync_at: new Date().toISOString(),
          legal_statuses: entity?.legalStatuses || [],
          legal_forms: entity?.legalForms || [],
          addresses: entity?.addresses || [],
          identifiers: entity?.identifiers || [],
          alternative_names: entity?.alternativeNames || [],
          organization_units: entity?.organizationUnits || [],
        },
      };
    } catch (e) {
      this.logger.warn(`RPO company fetch failed for ${ico}: ${this.getErrorMessage(e)}`);
      return {};
    }
  }

  private async fetchFromRuz(ico: string): Promise<any> {
    try {
      const ids = await this.fetchRuzUnitIds({ ico, maxRecords: 5 });
      if (!ids.length) return {};

      const unit = await this.fetchRuzUnitById(ids[0]);
      if (!unit || normalizeIco(unit.ico) !== ico) return {};

      const [legalForms, regionMap, sizeMap] = await Promise.all([
        this.getRuzLegalFormsMap(),
        this.getRuzRegionsMap(),
        this.getRuzOrgSizesMap(),
      ]);

      const statementIds: number[] = Array.isArray(unit.idUctovnychZavierok)
        ? unit.idUctovnychZavierok.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
        : [];

      const rankedStatements = await this.fetchRuzStatementsForFinancials(statementIds, 8);
      const latestStatement = rankedStatements[0] || null;
      let latestFinancial: RuzStatementFinancial = {
        financials: {},
        rows: [],
        breakdown: { assets: [], liabilities: [] },
      };

      if (latestStatement) {
        latestFinancial = await this.fetchRuzStatementFinancial(latestStatement);
      }

      const historyData = await this.buildRuzHistoryFromStatements(rankedStatements.slice(0, 5));
      const statusFromName = this.deriveStatusFromName(unit.nazovUJ);

      return {
        name: this.normalizeSearchText(unit.nazovUJ),
        address: this.normalizeSearchText([unit.ulica, unit.psc, unit.mesto].filter(Boolean).join(', ')),
        city: this.normalizeSearchText(unit.mesto),
        legal_form: this.normalizeSearchText(legalForms.get(unit.pravnaForma || '') || unit.pravnaForma || ''),
        status: statusFromName || '',
        dic: this.normalizeSearchText(unit.dic),
        industry: this.normalizeSearchText(unit.skNace),
        sk_nace: this.normalizeSearchText(unit.skNace),
        registration_date: this.normalizeSearchText(unit.datumZalozenia),
        employees: this.normalizeSearchText(sizeMap.get(unit.velkostOrganizacie || '') || unit.velkostOrganizacie || ''),
        financials: latestFinancial.financials,
        history_data: historyData,
        breakdown: latestFinancial.breakdown,
        mapped_rows: latestFinancial.rows,
        is_bankrupt: this.normalizeLookup(statusFromName).includes('konkurz'),
        is_in_liquidation: this.normalizeLookup(statusFromName).includes('likvid'),
        events_detail: {
          bankruptcies: this.normalizeLookup(statusFromName).includes('konkurz') ? 1 : 0,
          debts: 0,
          court_decisions: 0,
          payment_orders: 0,
          executions: 0,
        },
        important_dates: {
          orsr_entry: this.normalizeSearchText(unit.datumZalozenia),
        },
        raw: {
          source: 'ruz',
          last_sync_at: new Date().toISOString(),
          unit,
          region: this.normalizeSearchText(regionMap.get(unit.kraj || '') || unit.kraj || ''),
          annual_report_count: Array.isArray(unit.idVyrocnychSprav) ? unit.idVyrocnychSprav.length : 0,
          statement_ids: statementIds,
          latest_statement: latestStatement,
        },
      };
    } catch (e) {
      this.logger.warn(`RUZ company fetch failed for ${ico}: ${this.getErrorMessage(e)}`);
      return {};
    }
  }

  private async resolveDebtSnapshot(ico: string, existing: any): Promise<DebtSnapshot> {
    const { data, error } = await this.supabase.db.rpc('company_debt_snapshot', { p_ico: ico });
    const quality: DebtSnapshot['quality'] = {};
    const values = { tax: 0, social: 0, health: 0 };
    for (const source of ['tax', 'social', 'health'] as const) {
      const row = !error && data?.find((item: any) => item.source === source);
      const fresh = row && Date.now() - Date.parse(row.checked_at) < 7 * 86400000;
      const oldQuality = existing?.raw_data?.data_quality?.debts?.[source];
      if (fresh) {
        values[source] = Number(row.amount);
        quality[source] = { status: 'verified', checked_at: row.checked_at };
      } else if (oldQuality?.checked_at) {
        values[source] = Number(existing?.[source + '_debt'] || 0);
        quality[source] = { status: 'stale', checked_at: oldQuality.checked_at };
      } else {
        // Old scraper/name matches are not reliable evidence of this company's debt.
        quality[source] = { status: 'unavailable' };
      }
    }
    return { ...buildDebtSummary(undefined, values), quality };
  }

  private async fetchRpoSearch(params: Record<string, any>): Promise<any[]> {
    const { data } = await axios.get(`${this.rpoBase}/search`, {
      params,
      timeout: 12000,
      headers: this.requestHeaders, signal: this.requests.getStore(),
    });
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data)) return data;
    return [];
  }

  private mapRpoSearchEntity(entity: any): CompanySearchResult | null {
    const ico = this.extractRpoIco(entity);
    const name = this.extractRpoName(entity);
    if (!ico || !name) return null;
    const address = this.extractRpoAddress(entity);

    return {
      ico,
      name,
      address: address?.full || '',
      city: address?.city || '',
      source: 'rpo',
    };
  }

  private extractRpoIco(entity: any): string {
    const identifiers = Array.isArray(entity?.identifiers) ? entity.identifiers : [];
    const candidate = identifiers
      .map((item: any) => this.normalizeSearchText(item?.value || item?.identifier || ''))
      .find((value: string) => /^\d{6,8}$/.test(value));
    if (candidate) return this.normalizeIco(candidate);
    return this.normalizeIco(entity?.ico || entity?.identifier || '');
  }

  private extractRpoName(entity: any): string {
    const names = Array.isArray(entity?.fullNames) ? entity.fullNames : [];
    const latest = this.pickLatestByValidity(names);
    return this.normalizeSearchText(latest?.value || entity?.name || '');
  }

  private extractRpoAddress(entity: any): { full: string; city: string } | null {
    const addresses = Array.isArray(entity?.addresses) ? entity.addresses : [];
    const latest = this.pickLatestByValidity(addresses);
    if (!latest) return null;

    const formatted = this.normalizeSearchText(latest?.formattedAddress);
    const street = this.normalizeSearchText(latest?.street?.value || '');
    const regNum = this.normalizeSearchText(latest?.regNumber || '');
    const municipality = this.normalizeSearchText(latest?.municipality?.value || latest?.municipality || '');
    const postalCode = this.normalizeSearchText(latest?.postalCode || '');
    const manual = [street, regNum, postalCode, municipality].filter(Boolean).join(' ');

    return {
      full: formatted || this.normalizeSearchText(manual),
      city: municipality,
    };
  }

  private extractRpoLegalForm(entity: any): string {
    const forms = Array.isArray(entity?.legalForms) ? entity.legalForms : [];
    const latest = this.pickLatestByValidity(forms);
    return this.normalizeSearchText(latest?.value?.value || latest?.value || '');
  }

  private extractRpoStatus(entity: any): string {
    const statuses = Array.isArray(entity?.legalStatuses) ? entity.legalStatuses : [];
    const latest = this.pickLatestByValidity(statuses);
    return this.normalizeSearchText(latest?.value?.value || latest?.value || '');
  }

  private extractRpoSkNace(entity: any): string {
    const activities = Array.isArray(entity?.activities) ? entity.activities : [];
    const latest = this.pickLatestByValidity(activities);
    return this.normalizeSearchText(latest?.value?.value || latest?.value || '');
  }

  private extractRpoDic(entity: any): string {
    const identifiers = Array.isArray(entity?.identifiers) ? entity.identifiers : [];
    const dic = identifiers.find((item: any) => this.normalizeLookup(item?.type || '').includes('dic'));
    return this.normalizeSearchText(dic?.value || '');
  }

  private extractRpoVat(entity: any): string {
    const identifiers = Array.isArray(entity?.identifiers) ? entity.identifiers : [];
    const vat = identifiers.find((item: any) => {
      const typeNorm = this.normalizeLookup(item?.type || '');
      return typeNorm.includes('dph') || typeNorm.includes('vat');
    });
    return this.normalizeSearchText(vat?.value || '');
  }

  private extractRpoHistoricalName(entity: any): string {
    const alternatives = Array.isArray(entity?.alternativeNames) ? entity.alternativeNames : [];
    const latest = this.pickLatestByValidity(alternatives);
    return this.normalizeSearchText(latest?.value || '');
  }

  private extractRpoDate(raw: any): string {
    if (!raw) return '';
    const source =
      typeof raw === 'object'
        ? raw?.value || raw?.date || raw?.validFrom || raw?.from || ''
        : raw;
    const text = this.normalizeSearchText(source);
    const iso = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (iso) return iso;
    const short = text.match(/\d{4}-\d{2}/)?.[0];
    return short || text;
  }

  private pickLatestByValidity<T extends Record<string, any>>(items: T[]): T | null {
    if (!Array.isArray(items) || items.length === 0) return null;
    const sorted = [...items].sort((a, b) => {
      const aKey = this.normalizeSearchText(a?.validFrom || a?.from || '');
      const bKey = this.normalizeSearchText(b?.validFrom || b?.from || '');
      return bKey.localeCompare(aKey);
    });
    return sorted[0] || null;
  }

  private async fetchRuzUnitIds(params: {
    ico?: string;
    legalForm?: string;
    maxRecords?: number;
    continueAfterId?: number;
  }): Promise<number[]> {
    const query: Record<string, any> = {
      'zmenene-od': this.ruzDefaultSince,
      'max-zaznamov': params.maxRecords || 100,
    };
    if (params.continueAfterId && params.continueAfterId > 0) {
      query['pokracovat-za-id'] = params.continueAfterId;
    }
    if (params.ico) query.ico = this.normalizeIco(params.ico);
    if (params.legalForm) query['pravna-forma'] = params.legalForm;

    const { data } = await axios.get(`${this.ruzBase}/uctovne-jednotky`, {
      params: query,
      timeout: 15000,
      headers: this.requestHeaders, signal: this.requests.getStore(),
    });

    const ids = Array.isArray(data?.id)
      ? data.id
      : Array.isArray(data?.ids)
      ? data.ids
      : [];

    return ids.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0);
  }

  private async fetchRuzUnitById(id: number): Promise<any | null> {
    try {
      const { data } = await axios.get(`${this.ruzBase}/uctovna-jednotka`, {
        params: { id },
        timeout: 12000,
        headers: this.requestHeaders, signal: this.requests.getStore(),
      });
      return data || null;
    } catch (e) {
      this.logger.warn(`RUZ unit fetch failed for id=${id}: ${this.getErrorMessage(e)}`);
      return null;
    }
  }

  private async fetchRuzStatementsForFinancials(statementIds: number[], limit: number): Promise<any[]> {
    const unique = [...new Set(statementIds)].filter((id) => Number.isFinite(id)).map((id) => Number(id));
    if (!unique.length) return [];

    const candidates = unique.sort((a, b) => b - a).slice(0, Math.max(limit, 10));
    const statements = await mapLimit(candidates, 3, id => this.fetchRuzStatementById(id));
    const valid = statements.filter(item => item && !item.konsolidovana) as any[];

    valid.sort((a, b) => {
      const aDate = this.statementSortKey(a);
      const bDate = this.statementSortKey(b);
      return bDate.localeCompare(aDate) || String(b.datumPodania || b.datumPoslednejUpravy || '').localeCompare(String(a.datumPodania || a.datumPoslednejUpravy || '')) || Number(b.id) - Number(a.id);
    });

    const years = new Set<string>();
    return valid.filter(statement => { const year = this.extractStatementYear(statement); if (!year || years.has(year)) return false; years.add(year); return true; }).slice(0, limit);
  }

  private async fetchRuzStatementById(id: number): Promise<any | null> {
    try {
      const { data } = await axios.get(`${this.ruzBase}/uctovna-zavierka`, {
        params: { id },
        timeout: 12000,
        headers: this.requestHeaders, signal: this.requests.getStore(),
      });
      if (!data) return null;
      if (this.normalizeLookup(data?.stav || '').includes('zmaz')) return null;
      return data;
    } catch {
      return null;
    }
  }

  private statementSortKey(statement: any): string {
    return (
      this.normalizeSearchText(statement?.obdobieDo) ||
      this.normalizeSearchText(statement?.datumZostaveniaK) ||
      this.normalizeSearchText(statement?.datumPodania) ||
      this.normalizeSearchText(statement?.datumPoslednejUpravy) ||
      ''
    );
  }

  private async fetchRuzStatementFinancial(statement: any): Promise<RuzStatementFinancial> {
    const reportIds: number[] = Array.isArray(statement?.idUctovnychVykazov)
      ? statement.idUctovnychVykazov.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];

    const mappedRows: RuzMappedRow[] = [];
    for (const reportId of reportIds) {
      const report = await this.fetchRuzReport(reportId);
      if (!report || !Array.isArray(report?.obsah?.tabulky) || report.obsah.tabulky.length === 0) continue;
      const templateId = Number(report.idSablony);
      const template = templateId ? await this.fetchRuzTemplate(templateId) : null;
      mappedRows.push(...this.mapRuzReportRows(report, template));
    }

    const financials = this.extractFinancialsFromMappedRows(mappedRows);
    if (statement?.obdobieDo) {
      const year = String(statement.obdobieDo).match(/^\d{4}/)?.[0];
      if (year) financials.financial_year = year;
    }
    if (!financials.financial_year && statement?.datumZostaveniaK) {
      financials.financial_year = String(statement.datumZostaveniaK).slice(0, 4);
    }

    if (financials.assets > 0 && financials.equity !== undefined) {
      const liabilities = Math.max(0, this.toNumber(financials.assets || 0) - this.toNumber(financials.equity || 0));
      financials.debt_ratio = this.toNumber(financials.assets || 0) > 0
        ? (liabilities / this.toNumber(financials.assets || 0)) * 100
        : undefined;
    }



    return {
      financials,
      rows: mappedRows,
      breakdown: this.extractBreakdownFromMappedRows(mappedRows),
    };
  }

  private async fetchRuzReport(id: number): Promise<any | null> {
    try {
      const { data } = await axios.get(`${this.ruzBase}/uctovny-vykaz`, {
        params: { id },
        timeout: 12000,
        headers: this.requestHeaders, signal: this.requests.getStore(),
      });
      return data || null;
    } catch {
      return null;
    }
  }

  private async fetchRuzTemplate(templateId: number): Promise<any | null> {
    if (this.ruzTemplateCache.has(templateId)) {
      return this.ruzTemplateCache.get(templateId);
    }

    try {
      const { data } = await axios.get(`${this.ruzBase}/sablona`, {
        params: { id: templateId },
        timeout: 12000,
        headers: this.requestHeaders, signal: this.requests.getStore(),
      });
      this.ruzTemplateCache.set(templateId, data || null);
      return data || null;
    } catch {
      return null;
    }
  }

  private mapRuzReportRows(report: any, template: any): RuzMappedRow[] {
    if (!Array.isArray(report?.obsah?.tabulky)) return [];
    const out: RuzMappedRow[] = [];
    const templateTables = Array.isArray(template?.tabulky) ? template.tabulky : [];

    report.obsah.tabulky.forEach((table: any, tableIndex: number) => {
      const data: any[] = Array.isArray(table?.data) ? table.data : [];
      const templateTable = templateTables[tableIndex];
      const templateRows: any[] = Array.isArray(templateTable?.riadky) ? templateTable.riadky : [];
      const dataCols = this.toNumber(templateTable?.pocetDatovychStlpcov || 0) || this.guessDataCols(data, templateRows.length);

      if (!dataCols || !data.length) return;
      const rowCount = Math.floor(data.length / dataCols);

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const start = rowIndex * dataCols;
        const rawValues = data.slice(start, start + dataCols);
        const values = rawValues.map((value: any) => this.parseLocalizedNumber(value));
        const rowMeta = templateRows[rowIndex] || {};
        const label = this.normalizeSearchText(rowMeta?.text?.sk || rowMeta?.text?.en || '');
        const lineNo = this.toNumber(rowMeta?.cisloRiadku || rowIndex + 1);
        out.push({
          tableName: this.normalizeSearchText(table?.nazov?.sk || table?.nazov?.en || ''),
          lineNo,
          label,
          values,
          templateId: this.toNumber(report?.idSablony || 0),
        });
      }
    });

    return out;
  }

  private guessDataCols(data: any[], rowCount: number): number {
    if (!rowCount || rowCount <= 0) return 0;
    const maybe = Math.floor(data.length / rowCount);
    return maybe > 0 ? maybe : 0;
  }

  private extractFinancialsFromMappedRows(rows: RuzMappedRow[]): Record<string, any> {
    return extractFinancials(rows);
  }

  private extractBreakdownFromMappedRows(rows: RuzMappedRow[]) {
    return extractBreakdown(rows);
  }

  private async buildRuzHistoryFromStatements(statements: any[]): Promise<{ revenue: any[]; profit: any[] }> {
    const revenue: { year: string; value: number }[] = [];
    const profit: { year: string; value: number }[] = [];

    for (const statement of statements) {
      const year = this.extractStatementYear(statement);
      if (!year) continue;

      const data = await this.fetchRuzStatementFinancial(statement);
      const revValue = this.toNumber(data.financials?.revenue || 0);
      const profitValue = this.toNumber(data.financials?.profit || 0);
      if (data.financials?.revenue !== undefined) {
        revenue.push({ year, value: revValue });
      }
      if (data.financials?.profit !== undefined) {
        profit.push({ year, value: profitValue });
      }
    }

    const dedupe = (rows: { year: string; value: number }[]) => {
      const byYear = new Map<string, number>();
      for (const row of rows) {
        if (!byYear.has(row.year)) byYear.set(row.year, row.value);
      }
      return [...byYear.entries()]
        .map(([year, value]) => ({ year, value }))
        .sort((a, b) => a.year.localeCompare(b.year));
    };

    return {
      revenue: dedupe(revenue),
      profit: dedupe(profit),
    };
  }

  private extractStatementYear(statement: any): string {
    const period = this.normalizeSearchText(statement?.obdobieDo || '');
    const periodYear = period.match(/^\d{4}/)?.[0];
    if (periodYear) return periodYear;
    const date = this.normalizeSearchText(statement?.datumZostaveniaK || statement?.datumPodania || '');
    return date.match(/^\d{4}/)?.[0] || '';
  }

  private deriveStatusFromName(name: string): string {
    const norm = this.normalizeLookup(name);
    if (norm.includes('konkurz')) return 'v konkurze';
    if (norm.includes('likvid')) return 'v likvidacii';
    return '';
  }

  private async getRuzLegalFormsMap(): Promise<Map<string, string>> {
    if (this.ruzLegalFormsByCode) return this.ruzLegalFormsByCode;
    try {
      const { data } = await axios.get(`${this.ruzBase}/pravne-formy`, {
        timeout: 12000,
        headers: this.requestHeaders, signal: this.requests.getStore(),
      });
      const list = Array.isArray(data) ? data : data?.klasifikacie || data?.lokacie || [];
      const map = new Map<string, string>();
      list.forEach((item: any) => {
        const code = this.normalizeSearchText(item?.kod || item?.code || '');
        const name = this.normalizeSearchText(item?.nazov?.sk || item?.nazov?.en || item?.nazov?.sk || item?.nazov?.en || item?.nazov || item?.name || '');
        if (code) map.set(code, name || code);
      });
      this.ruzLegalFormsByCode = map;
      return map;
    } catch {
      return new Map<string, string>();
    }
  }

  private async getRuzOrgSizesMap(): Promise<Map<string, string>> {
    if (this.ruzOrgSizesByCode) return this.ruzOrgSizesByCode;
    try {
      const { data } = await axios.get(`${this.ruzBase}/velkosti-organizacie`, {
        timeout: 12000,
        headers: this.requestHeaders, signal: this.requests.getStore(),
      });
      const list = Array.isArray(data) ? data : data?.klasifikacie || data?.lokacie || [];
      const map = new Map<string, string>();
      list.forEach((item: any) => {
        const code = this.normalizeSearchText(item?.kod || item?.code || '');
        const name = this.normalizeSearchText(item?.nazov?.sk || item?.nazov?.en || item?.nazov?.sk || item?.nazov?.en || item?.nazov || item?.name || '');
        if (code) map.set(code, name || code);
      });
      this.ruzOrgSizesByCode = map;
      return map;
    } catch {
      return new Map<string, string>();
    }
  }

  private async getRuzRegionsMap(): Promise<Map<string, string>> {
    if (this.ruzRegionsByCode) return this.ruzRegionsByCode;
    try {
      const { data } = await axios.get(`${this.ruzBase}/kraje`, {
        timeout: 12000,
        headers: this.requestHeaders, signal: this.requests.getStore(),
      });
      const list = Array.isArray(data) ? data : data?.klasifikacie || data?.lokacie || [];
      const byCode = new Map<string, string>();
      const byName = new Map<string, string>();
      list.forEach((item: any) => {
        const code = this.normalizeSearchText(item?.kod || item?.code || '');
        const name = this.normalizeSearchText(item?.nazov?.sk || item?.nazov?.en || item?.nazov?.sk || item?.nazov?.en || item?.nazov || item?.name || '');
        if (!code) return;
        byCode.set(code, name || code);
        if (name) byName.set(this.normalizeLookup(name), code);
      });
      this.ruzRegionsByCode = byCode;
      this.ruzRegionCodeByName = byName;
      return byCode;
    } catch {
      return new Map<string,string>();
    }
  }

  private async resolveRegionCode(regionFilter: string): Promise<string | null> {
    const normalized = this.normalizeLookup(regionFilter || '');
    if (!normalized) return null;
    await this.getRuzRegionsMap();
    if (!this.ruzRegionCodeByName) return null;
    const exact = this.ruzRegionCodeByName.get(normalized);
    if (exact) return exact;

    for (const [nameNorm, code] of this.ruzRegionCodeByName.entries()) {
      if (nameNorm.includes(normalized) || normalized.includes(nameNorm)) return code;
    }
    return null;
  }

  private calculateRisk(data: any): Partial<CompanyRiskData> {
    let score = 100;
    const reasons: string[] = [];
    const indicators = data?.indicators || data?.raw_data?.indicators || {};
    const financials = data?.financials || data?.raw_data?.financials || {};
    const legalStatus = this.verifiedLegalStatus(data);

    const totalDebt =
      this.toNumber(data.tax_debt || 0) + this.toNumber(data.social_debt || 0) + this.toNumber(data.health_debt || 0);

    if (totalDebt > 1000) {
      score -= 40;
      reasons.push(`High debt in registries: ${totalDebt.toFixed(2)} EUR`);
    } else if (totalDebt > 0) {
      score -= 15;
      reasons.push(`Recorded debt obligations: ${totalDebt.toFixed(2)} EUR`);
    }

    if (legalStatus.liquidation) {
      score -= 80;
      reasons.push('Company is in liquidation');
    }
    if (legalStatus.bankrupt) {
      score -= 90;
      reasons.push('Insolvency signal: company is bankrupt');
    }

    if (indicators?.dlhy_nedoplatky) {
      score -= 10;
      reasons.push('Indicator: existing debts or arrears');
    }

    if (Number(financials?.equity || 0) < 0) {
      score -= 15;
      reasons.push(`Negative equity: ${Number(financials.equity || 0).toFixed(0)} EUR`);
    }

    const coverage = data?.raw_data?.data_quality;
    if (score >= 80 && (!coverage || coverage.identity?.status !== 'verified' ||
        ['tax', 'social', 'health'].some(source => coverage.debts?.[source]?.status !== 'verified'))) {
      return { risk_score: 'unknown', risk_score_numeric: undefined, risk_reasons: ['Insufficient verified data for a complete risk assessment'] };
    }
    score = Math.max(1, Math.min(100, score));
    return {
      risk_score: score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red',
      risk_score_numeric: score,
      risk_reasons: reasons.length ? reasons : ['No risk indicators found'],
    };
  }

  formatCompany(row: any): CompanyRiskData {
    if (!row) return null;
    const d = row.raw_data || {};
    const valid = d.data_quality?.version === 2;
    const f = valid ? d.financials || {} : {};
    const indicators = d.indicators || {};
    const events = d.events_detail || {};
    const dates = d.important_dates || {};
    const breakdown = valid ? d.breakdown || {} : {};
    const knownDebt = (source: string) => valid && ['verified','stale'].includes(d.data_quality?.debts?.[source]?.status) ? Number(row[source + '_debt']) || 0 : 0;
    const debtSummary = buildDebtSummary(undefined, { tax: knownDebt('tax'), social: knownDebt('social'), health: knownDebt('health') });
    const legalStatus = this.verifiedLegalStatus(row);
    const risk = valid ? this.calculateRisk({ ...row, tax_debt: debtSummary.tax, social_debt: debtSummary.social, health_debt: debtSummary.health })
      : { risk_score: 'unknown' as const, risk_score_numeric: undefined, risk_reasons: ['Insufficient verified data for a complete risk assessment'] };

    const displayName = sanitizeDisplayName(row.name);
    const displayAddress = sanitizeDisplayAddress(row.address, row.name, displayName);

    return {
      ico: row.ico,
      name: displayName,
      legal_form: row.legal_form,
      address: displayAddress,
      city: row.city,
      status: legalStatus.status,
      data_quality: d.data_quality || { version: 0, stale: true },
      risk_score: risk.risk_score,
      risk_score_numeric: risk.risk_score_numeric,
      risk_reasons: risk.risk_reasons,
      tax_debt: debtSummary.tax,
      social_debt: debtSummary.social,
      health_debt: debtSummary.health,
      court_cases: undefined,
      is_bankrupt: legalStatus.bankrupt,
      is_in_liquidation: legalStatus.liquidation,
      last_checked_at: row.last_checked_at,
      revenue: f.revenue,
      profit: f.profit,
      equity: f.equity,
      assets: f.assets,
      financial_year: f.financial_year,
      debt_ratio: f.debt_ratio,
      net_margin: f.net_margin,
      is_loss: f.profit === undefined ? undefined : f.profit < 0,
      negative_equity: f.equity === undefined ? undefined : f.equity < 0,
      dlhy_nedoplatky: !!indicators.dlhy_nedoplatky,
      pohladavky_statu: undefined,
      has_docasna_ochrana: undefined,
      dph_status: undefined,
      events_detail: {
        bankruptcies: undefined,
        debts: debtSummary.sources_count > 0 ? debtSummary.sources_count : undefined,
        court_decisions: undefined,
        payment_orders: undefined,
        executions: undefined,
        debt_sources_count: this.toNumber(debtSummary.sources_count || 0),
      },
      debt_summary: {
        tax: this.toNumber(debtSummary.tax || 0),
        social: this.toNumber(debtSummary.social || 0),
        health: this.toNumber(debtSummary.health || 0),
        total: this.toNumber(debtSummary.total || 0),
        sources_count: this.toNumber(debtSummary.sources_count || 0),
      },
      dic: d.dic,
      ic_dph: d.ic_dph,
      industry: d.industry,
      employees: d.employees,
      sk_nace: d.sk_nace,
      registration_date: d.registration_date,
      historical_name: d.historical_name,
      history_data: valid ? d.history_data : undefined,
      breakdown: {
        assets: Array.isArray(breakdown.assets) ? breakdown.assets : [],
        liabilities: Array.isArray(breakdown.liabilities) ? breakdown.liabilities : [],
      },
      important_dates: {
        bankruptcy: undefined,
        orsr_entry: dates.orsr_entry,
      },
    };
  }



  private verifiedLegalStatus(row: any) {
    const raw = row.raw_data || {};
    if (raw.data_quality?.version !== 2) return { status: '', bankrupt: undefined, liquidation: undefined };
    // A registry status is evidence; a legacy boolean or a scraped event count is not.
    const verified = raw.data_quality?.legal_status?.status === 'verified';
    const status = verified ? String(row.status || '') : this.deriveStatusFromName(raw.ruz?.unit?.nazovUJ || '');
    const normalized = this.normalizeLookup(status);
    return { status, bankrupt: status ? normalized.includes('konkurz') || normalized.includes('insolv') : undefined,
      liquidation: status ? normalized.includes('likvid') : undefined };
  }

  private isInvalidIdentityName(name: any): boolean {
    const normalized = this.normalizeSearchText(name).toLowerCase();
    if (!normalized) return true;

    return [
      'prehlad o firme',
      'financny report',
      'financne ukazovatele',
      'udalosti vo firme',
      'dlhy a pohladavky',
      'platobne rozkazy',
      'sudne rozhodnutia',
      'exekucie',
      'obchodny register',
    ].includes(this.normalizeLookup(normalized));
  }

  private normalizeSearchIco(raw: any): string { return normalizeIco(raw); }

  private normalizeSearchText(value: any): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  private normalizeIco(ico: string): string {
    return this.normalizeSearchIco(ico);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }

  private toNumber(val: any): number {
    const n = parseFloat(String(val));
    return isNaN(n) ? 0 : n;
  }

  private pickFirstText(...values: any[]): string | undefined {
    for (const value of values) {
      const normalized = this.normalizeSearchText(value);
      if (normalized) return normalized;
    }
    return undefined;
  }

  private normalizeLookup(value: any): string {
    return this.normalizeSearchText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private parseLocalizedNumber(raw: any): number { return parseNumber(raw); }


}
