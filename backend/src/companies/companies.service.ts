import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import AdmZip = require('adm-zip');
import { parseStringPromise } from 'xml2js';
import { SupabaseService } from '../supabase/supabase.service';
import { CompanyRiskData } from './dto/company.dto';
import {
  buildDebtSummary,
  sanitizeDisplayAddress,
  sanitizeDisplayName,
  toRiskNumeric,
} from './utils/company-data.utils';

type DebtSnapshot = {
  tax: number;
  social: number;
  health: number;
  total: number;
  sources_count: number;
};

type DebtLookupResult = {
  amount: number;
  missingTable: boolean;
};

type TaxDebtorRecord = {
  nameNorm: string;
  cityNorm: string;
  streetNorm: string;
  amount: number;
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
  private readonly missingDebtTablesWarned = new Set<string>();
  private readonly debtCacheTtlMs = 6 * 60 * 60 * 1000;

  private readonly rpoBase: string;
  private readonly ruzBase: string;
  private readonly ruzDefaultSince = '2000-01-01';

  private readonly taxDebtorsZipUrl = 'https://report.financnasprava.sk/ds_dsdd.zip';
  private readonly socialDebtorsZipUrl =
    'https://www.socpoist.sk/api/idsp/download/7946c279-f0b4-451a-b199-a317f675e6cf';

  private readonly requestHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'application/json,text/plain,*/*',
  };

  private socialDebtorsCache: { loadedAt: number; debtsByIco: Map<string, number> } | null = null;
  private taxDebtorsCache:
    | {
        loadedAt: number;
        records: TaxDebtorRecord[];
      }
    | null = null;

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
    const q = this.normalizeSearchText(query);
    this.logger.log(`Searching for: "${q}" (page ${safePage}, offset ${offset})`);

    if (q.length < 2) {
      return this.searchLocalCompanies(q, offset, limit);
    }

    if (/^\d{6,8}$/.test(q)) {
      try {
        const company = await this.getCompany(this.normalizeIco(q));
        if ((company.name || '').trim()) {
          return [
            {
              ico: company.ico,
              name: company.name,
              address: company.address || '',
              city: company.city || '',
              source: 'direct',
              risk_score: company.risk_score,
            },
          ];
        }
      } catch (e) {
        this.logger.warn(`Direct ICO lookup failed for ${q}: ${this.getErrorMessage(e)}`);
      }
    }

    const [rpoMatches, ruzMatches, localMatches] = await Promise.all([
      this.searchViaRpo(q, safePage, limit),
      this.searchViaRuzByIco(q),
      this.searchLocalCompanies(q, offset, limit),
    ]);

    const merged: CompanySearchResult[] = [];
    const seen = new Set<string>();
    for (const sourceList of [rpoMatches, ruzMatches, localMatches]) {
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
    const perPage = 20;
    const page = Math.max(1, Number(params.page) || 1);
    const queryText = this.normalizeSearchText(params.query);

    if (queryText.length >= 2) {
      const searchRows = await this.search(queryText, page);
      const companies = await this.mapSearchRowsToBrowseRows(searchRows);
      const hasNextPage = searchRows.length >= perPage;
      const total = hasNextPage ? page * perPage + 1 : (page - 1) * perPage + companies.length;

      return {
        companies,
        total,
        page,
        perPage,
        totalPages: hasNextPage ? page + 1 : Math.max(1, page),
      };
    }

    try {
      const legalFormFilter = this.normalizeSearchText(params.legalForm);
      const regionFilter = this.normalizeSearchText(params.region);
      const employeesFilter = this.normalizeSearchText(params.employees);

      const { ids, total } = await this.fetchRuzUnitIdsPage({
        page,
        perPage,
        legalForm: legalFormFilter,
      });

      const unitDetails = await Promise.all(ids.map((id) => this.fetchRuzUnitById(id)));
      const regionCode = await this.resolveRegionCode(regionFilter);
      const sizeMap = await this.getRuzOrgSizesMap();
      const regionMap = await this.getRuzRegionsMap();

      const filteredUnits = unitDetails.filter((unit) => {
        if (!unit) return false;
        if (regionCode && unit.kraj !== regionCode) return false;
        if (employeesFilter && unit.velkostOrganizacie !== employeesFilter) return false;
        return true;
      });

      const icos = filteredUnits.map((u) => this.normalizeIco(u.ico || ''));
      const { data: localRows } = await this.supabase.db
        .from('companies')
        .select('ico, raw_data, city')
        .in('ico', icos);

      const localByIco = new Map((localRows || []).map((row) => [this.normalizeSearchIco(row.ico), row]));

      const companies = filteredUnits
        .map((unit) => {
          const ico = this.normalizeSearchIco(unit.ico || '');
          const local = localByIco.get(ico);
          const revenue = this.toNumber(local?.raw_data?.financials?.revenue || 0);
          const sales = revenue > 0 ? this.formatCompactCurrency(revenue) : '';

          return {
            ico,
            name: this.normalizeSearchText(unit.nazovUJ),
            city: this.normalizeSearchText(unit.mesto),
            region: this.normalizeSearchText(regionMap.get(unit.kraj || '') || unit.kraj || ''),
            employees: this.normalizeSearchText(
              sizeMap.get(unit.velkostOrganizacie || '') || unit.velkostOrganizacie || '',
            ),
            sales,
            creation_date: this.normalizeSearchText(unit.datumZalozenia),
            source_url: `${this.ruzBase.replace('/api', '/home/detail')}?id=${unit.id}`,
          } as BrowseCompanyItem;
        })
        .filter((row) => !!row.ico && !!row.name);

      this.sortBrowseRows(companies, params.sort);

      const totalPages = total > 0 ? Math.ceil(total / perPage) : 1;
      return {
        companies,
        total,
        page,
        perPage,
        totalPages,
      };
    } catch (e) {
      this.logger.error(`Browse via official registries failed: ${this.getErrorMessage(e)}`);
      return {
        companies: [],
        total: 0,
        page,
        perPage,
        totalPages: 0,
      };
    }
  }

  async getCompany(ico: string): Promise<CompanyRiskData> {
    const normalized = this.normalizeIco(ico);
    const { data: cached } = await this.supabase.db.from('companies').select('*').eq('ico', normalized).maybeSingle();
    const cacheAge = cached?.last_checked_at ? Date.now() - new Date(cached.last_checked_at).getTime() : Infinity;
    const cachedRaw = cached?.raw_data || {};

    const cachedDebtTotal =
      this.toNumber(cached?.tax_debt || 0) +
      this.toNumber(cached?.social_debt || 0) +
      this.toNumber(cached?.health_debt || 0);
    const cachedIdentityMissing = this.isInvalidIdentityName(cached?.name);
    const cachedHasCoreDetails = !!(
      this.normalizeSearchText(cachedRaw?.dic || '') ||
      this.normalizeSearchText(cachedRaw?.ic_dph || '') ||
      this.normalizeSearchText(cachedRaw?.sk_nace || '') ||
      this.normalizeSearchText(cachedRaw?.industry || '') ||
      this.toNumber(cachedRaw?.financials?.revenue || 0) > 0 ||
      this.toNumber(cachedRaw?.financials?.assets || 0) > 0 ||
      this.toNumber(cachedRaw?.financials?.profit || 0) !== 0
    );
    const shouldRefreshDebtSnapshot = !!cached && cachedDebtTotal <= 0;
    const shouldRefreshIdentity = !!cached && cachedIdentityMissing;
    const shouldRefreshEnrichment = !!cached && !cachedHasCoreDetails;

    if (
      cached &&
      cacheAge < 24 * 60 * 60 * 1000 &&
      !shouldRefreshDebtSnapshot &&
      !shouldRefreshIdentity &&
      !shouldRefreshEnrichment
    ) {
      return this.formatCompany(cached);
    }

    return this.fetchAndStore(normalized);
  }

  async getHistory(ico: string) {
    const normalized = this.normalizeIco(ico);
    const { data, error } = await this.supabase.db
      .from('company_history')
      .select('*')
      .eq('ico', normalized)
      .order('changed_at', { ascending: false })
      .limit(200);

    if (error) {
      this.logger.error(`Unable to load history for ICO ${normalized}: ${error.message}`);
      return [];
    }

    return data || [];
  }

  async fetchAndStore(ico: string): Promise<CompanyRiskData> {
    this.logger.log(`Fetching ICO from official sources: ${ico}`);

    const { data: existing } = await this.supabase.db.from('companies').select('*').eq('ico', ico).maybeSingle();

    const [rpoData, ruzData, debtSnapshot] = await Promise.all([
      this.fetchFromRpo(ico),
      this.fetchFromRuz(ico),
      this.resolveDebtSnapshot(ico, existing),
    ]);

    const resolvedName = [
      rpoData?.name,
      ruzData?.name,
      existing?.name,
    ]
      .map((name) => this.normalizeSearchText(name))
      .find((name) => !this.isInvalidIdentityName(name)) || '';
    const safeResolvedName = resolvedName || this.normalizeSearchText(existing?.name) || `ICO ${ico}`;

    const resolvedAddress = this.pickFirstText(
      rpoData?.address,
      ruzData?.address,
      existing?.address,
      '',
    ) || '';
    const resolvedCity = this.pickFirstText(
      rpoData?.city,
      ruzData?.city,
      existing?.city,
      '',
    ) || '';
    const resolvedLegalForm = this.pickFirstText(
      rpoData?.legal_form,
      ruzData?.legal_form,
      existing?.legal_form,
    ) || '';
    const resolvedStatus = this.pickFirstText(
      rpoData?.status,
      ruzData?.status,
      existing?.status,
      '',
    ) || '';

    const resolvedTaxDebt = this.maxWithExisting(debtSnapshot.tax, existing?.tax_debt);
    const resolvedSocialDebt = this.maxWithExisting(debtSnapshot.social, existing?.social_debt);
    const resolvedHealthDebt = this.maxWithExisting(debtSnapshot.health, existing?.health_debt);

    const existingRaw = existing?.raw_data || {};
    const existingFinancials = existingRaw?.financials || {};
    const ruzFinancials = ruzData?.financials || {};
    const financials = {
      ...existingFinancials,
      ...ruzFinancials,
    };

    const indicators = {
      ...(existingRaw?.indicators || {}),
      dlhy_nedoplatky:
        this.toNumber(resolvedTaxDebt) + this.toNumber(resolvedSocialDebt) + this.toNumber(resolvedHealthDebt) > 0,
      pohladavky_statu: existingRaw?.indicators?.pohladavky_statu || false,
      has_docasna_ochrana: existingRaw?.indicators?.has_docasna_ochrana || false,
      dph_status: existingRaw?.indicators?.dph_status || 'NIE',
    };

    const existingEvents = existingRaw?.events_detail || {};
    const eventsDetail = {
      bankruptcies: this.maxWithExisting(ruzData?.events_detail?.bankruptcies || 0, existingEvents?.bankruptcies || 0),
      debts: this.maxWithExisting(ruzData?.events_detail?.debts || 0, existingEvents?.debts || 0),
      court_decisions: this.maxWithExisting(
        ruzData?.events_detail?.court_decisions || 0,
        existingEvents?.court_decisions || 0,
      ),
      payment_orders: this.maxWithExisting(
        ruzData?.events_detail?.payment_orders || 0,
        existingEvents?.payment_orders || 0,
      ),
      executions: this.maxWithExisting(ruzData?.events_detail?.executions || 0, existingEvents?.executions || 0),
    };

    const importantDates = {
      ...(existingRaw?.important_dates || {}),
      ...(ruzData?.important_dates || {}),
      ...(rpoData?.important_dates || {}),
    };

    const debtSummary = buildDebtSummary(existingRaw?.debt_summary, {
      tax: resolvedTaxDebt,
      social: resolvedSocialDebt,
      health: resolvedHealthDebt,
    });
    eventsDetail.debts = Math.max(this.toNumber(eventsDetail.debts || 0), debtSummary.sources_count > 0 ? 1 : 0);

    const historyData = {
      revenue: this.mergeYearSeries(existingRaw?.history_data?.revenue, ruzData?.history_data?.revenue),
      profit: this.mergeYearSeries(existingRaw?.history_data?.profit, ruzData?.history_data?.profit),
    };

    const breakdown = {
      assets: this.mergeBreakdownItems(existingRaw?.breakdown?.assets, ruzData?.breakdown?.assets),
      liabilities: this.mergeBreakdownItems(existingRaw?.breakdown?.liabilities, ruzData?.breakdown?.liabilities),
    };

    const rawData = {
      ...existingRaw,
      rpo: {
        ...(existingRaw?.rpo || {}),
        ...(rpoData?.raw || {}),
      },
      ruz: {
        ...(existingRaw?.ruz || {}),
        ...(ruzData?.raw || {}),
      },
      financials,
      indicators,
      events_detail: eventsDetail,
      important_dates: importantDates,
      history_data: historyData,
      breakdown,
      debt_summary: debtSummary,
      dic: this.pickFirstText(ruzData?.dic, rpoData?.dic, existingRaw?.dic),
      ic_dph: this.pickFirstText(ruzData?.ic_dph, rpoData?.ic_dph, existingRaw?.ic_dph),
      industry: this.pickFirstText(ruzData?.industry, rpoData?.industry, existingRaw?.industry),
      employees: this.pickFirstText(ruzData?.employees, rpoData?.employees, existingRaw?.employees),
      sk_nace: this.pickFirstText(ruzData?.sk_nace, rpoData?.sk_nace, existingRaw?.sk_nace),
      registration_date: this.pickFirstText(
        ruzData?.registration_date,
        rpoData?.registration_date,
        existingRaw?.registration_date,
      ),
      historical_name: this.pickFirstText(ruzData?.historical_name, rpoData?.historical_name, existingRaw?.historical_name),
      additional_financial_rows: this.mergeMappedRows(existingRaw?.additional_financial_rows, ruzData?.mapped_rows),
    };

    const resolvedCourtCases = Math.max(
      this.toNumber(existing?.court_cases || 0),
      this.toNumber(rawData?.events_detail?.court_decisions || 0),
    );

    const statusNorm = this.normalizeLookup(resolvedStatus);
    const nameNorm = this.normalizeLookup(safeResolvedName);
    const resolvedIsBankrupt = !!(
      rpoData?.is_bankrupt ||
      ruzData?.is_bankrupt ||
      existing?.is_bankrupt ||
      statusNorm.includes('konkurz') ||
      statusNorm.includes('insolv') ||
      nameNorm.includes('konkurz')
    );
    const resolvedIsInLiquidation = !!(
      rpoData?.is_in_liquidation ||
      ruzData?.is_in_liquidation ||
      existing?.is_in_liquidation ||
      statusNorm.includes('likvid') ||
      nameNorm.includes('likvid')
    );

    const mergedForRisk = {
      tax_debt: resolvedTaxDebt,
      social_debt: resolvedSocialDebt,
      health_debt: resolvedHealthDebt,
      is_bankrupt: resolvedIsBankrupt,
      is_in_liquidation: resolvedIsInLiquidation,
      status: resolvedStatus,
      indicators,
      financials,
    };

    const risk = this.calculateRisk(mergedForRisk);

    const finalData = {
      ico,
      name: safeResolvedName,
      legal_form: resolvedLegalForm,
      address: resolvedAddress,
      city: resolvedCity,
      status: resolvedStatus,
      tax_debt: resolvedTaxDebt,
      social_debt: resolvedSocialDebt,
      health_debt: resolvedHealthDebt,
      court_cases: resolvedCourtCases,
      is_bankrupt: resolvedIsBankrupt,
      is_in_liquidation: resolvedIsInLiquidation,
      raw_data: rawData,
      last_checked_at: new Date().toISOString(),
      ...risk,
    };

    const persistData: any = { ...finalData };
    delete persistData.risk_score_numeric;

    if (existing) {
      await this.trackChanges(existing, finalData);
      const { error: updateError } = await this.supabase.db.from('companies').update(persistData).eq('ico', ico);
      if (updateError) {
        this.logger.error(`Unable to update company ${ico}: ${updateError.message}`);
      }
    } else {
      const { error: insertError } = await this.supabase.db.from('companies').insert(persistData);
      if (insertError) {
        this.logger.error(`Unable to insert company ${ico}: ${insertError.message}`);
      }
    }

    return this.formatCompany(finalData);
  }

  private async searchLocalCompanies(query: string, offset: number, limit: number): Promise<CompanySearchResult[]> {
    const escapedQ = query.replace(/,/g, '\\,');
    let queryBuilder = this.supabase.db
      .from('companies')
      .select('ico, name, address, city, risk_score');

    if (query.length >= 2) {
      queryBuilder = queryBuilder.or(`name.ilike.%${escapedQ}%,ico.ilike.%${escapedQ}%`);
    } else {
      queryBuilder = queryBuilder.order('updated_at', { ascending: false });
    }

    const { data: localMatches } = await queryBuilder.range(offset, offset + limit - 1);
    return (localMatches || []).map((row) => ({
      ...row,
      ico: this.normalizeSearchIco(row.ico),
      source: 'local',
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
        headers: this.requestHeaders,
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
      return [];
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
      .select('ico, risk_score')
      .in('ico', icos);

    const riskByIco = new Map((localData || []).map((row) => [this.normalizeSearchIco(row.ico), row.risk_score]));
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
        entities.find((entity) => this.extractRpoIco(entity) === this.normalizeIco(ico)) ||
        entities[0];
      if (!picked?.id) return {};

      const { data } = await axios.get(`${this.rpoBase}/entity/${picked.id}`, {
        params: {
          showHistoricalData: true,
          showOrganizationUnits: true,
        },
        timeout: 12000,
        headers: this.requestHeaders,
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
      if (!unit) return {};

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
    const [taxLocal, socialLocal] = await Promise.all([
      this.lookupDebtFromSupabaseTable('tax_debtors', ico),
      this.lookupDebtFromSupabaseTable('social_debtors', ico),
    ]);

    let tax = taxLocal.amount;
    let social = socialLocal.amount;

    if (tax <= 0) {
      tax = await this.lookupTaxDebtByIcoFromFeed(ico, existing);
    }
    if (social <= 0) {
      social = await this.lookupSocialDebtByIcoFromFeed(ico);
    }

    const health = this.toNumber(existing?.health_debt || 0);
    const summary = buildDebtSummary(existing?.raw_data?.debt_summary, {
      tax,
      social,
      health,
    });

    return {
      tax: this.toNumber(summary.tax || 0),
      social: this.toNumber(summary.social || 0),
      health: this.toNumber(summary.health || 0),
      total: this.toNumber(summary.total || 0),
      sources_count: this.toNumber(summary.sources_count || 0),
    };
  }

  private async lookupDebtFromSupabaseTable(
    table: 'tax_debtors' | 'social_debtors',
    ico: string,
  ): Promise<DebtLookupResult> {
    try {
      const { data, error } = await this.supabase.db
        .from(table)
        .select('debt_amount')
        .eq('ico', this.normalizeIco(ico))
        .maybeSingle();

      if (error) {
        const message = this.normalizeLookup(error.message || '');
        const missingTable =
          error.code === 'PGRST205' ||
          message.includes('does not exist') ||
          message.includes('relation') ||
          message.includes('not found');

        if (missingTable && !this.missingDebtTablesWarned.has(table)) {
          this.missingDebtTablesWarned.add(table);
          this.logger.warn(`Debt table "${table}" is not available. Run schema_sync_tables.sql`);
        }

        return { amount: 0, missingTable };
      }

      return { amount: this.toNumber(data?.debt_amount || 0), missingTable: false };
    } catch {
      return { amount: 0, missingTable: false };
    }
  }

  private async lookupTaxDebtByIcoFromFeed(ico: string, existing: any): Promise<number> {
    const normalizedIco = this.normalizeIco(ico);
    const records = await this.loadTaxDebtorsCache();
    const directByIco = records.find((row) => row.nameNorm.includes(normalizedIco));
    if (directByIco) return this.toNumber(directByIco.amount);

    const nameNorm = this.normalizeLookup(existing?.name || '');
    if (!nameNorm) return 0;
    const cityNorm = this.normalizeLookup(existing?.city || '');
    const streetNorm = this.normalizeLookup(existing?.address || '');

    let best = 0;
    for (const row of records) {
      if (!row.nameNorm.includes(nameNorm)) continue;
      if (cityNorm && row.cityNorm && !row.cityNorm.includes(cityNorm)) continue;
      if (streetNorm && row.streetNorm && !row.streetNorm.includes(streetNorm)) continue;
      if (row.amount > best) best = row.amount;
    }

    return best;
  }

  private async lookupSocialDebtByIcoFromFeed(ico: string): Promise<number> {
    const cache = await this.loadSocialDebtorsCache();
    return this.toNumber(cache.get(this.normalizeIco(ico)) || 0);
  }

  private async loadTaxDebtorsCache(): Promise<TaxDebtorRecord[]> {
    if (this.taxDebtorsCache && Date.now() - this.taxDebtorsCache.loadedAt < this.debtCacheTtlMs) {
      return this.taxDebtorsCache.records;
    }

    try {
      const { data: zipBuffer } = await axios.get(this.taxDebtorsZipUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: this.requestHeaders,
      });

      const xmlText = this.extractFirstTextFileFromZip(zipBuffer, ['.xml']);
      const parsed = await parseStringPromise(xmlText, { explicitArray: false, ignoreAttrs: false });
      const rows =
        parsed?.ZoznamDanovychDlznikov?.DS_DSDD?.ITEM ||
        parsed?.ZoznamDlznikov?.Dlznik ||
        parsed?.zoznam?.dlznik ||
        [];

      const list = Array.isArray(rows) ? rows : [rows];
      const records: TaxDebtorRecord[] = list
        .filter((item: any) => !!item)
        .map((item: any) => {
          const name = this.normalizeSearchText(item?.NAZOV_SUBJEKTU || item?.NazovSubjektu || item?.Nazov || '');
          const city = this.normalizeSearchText(item?.MESTO || item?.Mesto || '');
          const street = this.normalizeSearchText(item?.ULICA || item?.Ulica || '');
          const amount = this.toAmount(item?.CIASTKA || item?.SumaDlhu || item?.suma || '0');
          const ico = this.normalizeIco(item?.ICO || item?.Ico || item?.ico || '');

          return {
            nameNorm: this.normalizeLookup([name, ico].filter(Boolean).join(' ')),
            cityNorm: this.normalizeLookup(city),
            streetNorm: this.normalizeLookup(street),
            amount,
          };
        })
        .filter((item) => item.amount > 0);

      this.taxDebtorsCache = {
        loadedAt: Date.now(),
        records,
      };
      return records;
    } catch (e) {
      this.logger.warn(`Unable to refresh tax debt cache: ${this.getErrorMessage(e)}`);
      return this.taxDebtorsCache?.records || [];
    }
  }

  private async loadSocialDebtorsCache(): Promise<Map<string, number>> {
    if (this.socialDebtorsCache && Date.now() - this.socialDebtorsCache.loadedAt < this.debtCacheTtlMs) {
      return this.socialDebtorsCache.debtsByIco;
    }

    try {
      const { data: payload, headers } = await axios.get(this.socialDebtorsZipUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: this.requestHeaders,
      });

      const contentType = String(headers?.['content-type'] || '').toLowerCase();
      const csvText =
        contentType.includes('zip') || this.socialDebtorsZipUrl.toLowerCase().endsWith('.zip')
          ? this.extractFirstTextFileFromZip(payload, ['.csv', '.txt'])
          : Buffer.from(payload).toString('utf8');

      const parsed = this.parseDebtorsCsv(csvText);
      this.socialDebtorsCache = {
        loadedAt: Date.now(),
        debtsByIco: parsed,
      };
      return parsed;
    } catch (e) {
      this.logger.warn(`Unable to refresh social debt cache: ${this.getErrorMessage(e)}`);
      return this.socialDebtorsCache?.debtsByIco || new Map<string, number>();
    }
  }

  private parseDebtorsCsv(csvText: string): Map<string, number> {
    const out = new Map<string, number>();
    const lines = String(csvText || '')
      .replace(/\uFEFF/g, '')
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => !!line.trim());
    if (lines.length < 2) return out;

    const delimiter = this.detectDelimiter(lines[0]);
    const header = this.parseDelimitedLine(lines[0], delimiter).map((item) => this.normalizeLookup(item));
    const icoIdx = this.findColumnIndex(header, ['ico', 'ic', 'ico']);
    const debtIdx = this.findColumnIndex(header, ['suma', 'dlh', 'dlzna', 'nedoplatok']);

    if (icoIdx < 0) return out;

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseDelimitedLine(lines[i], delimiter).map((item) => item.trim());
      const ico = this.normalizeIco(cols[icoIdx] || '');
      if (!ico) continue;
      const amount = debtIdx >= 0 ? this.toAmount(cols[debtIdx] || '0') : 0;
      out.set(ico, amount);
    }

    return out;
  }

  private detectDelimiter(sampleLine: string): string {
    const commaCount = (sampleLine.match(/,/g) || []).length;
    const semicolonCount = (sampleLine.match(/;/g) || []).length;
    return commaCount > semicolonCount ? ',' : ';';
  }

  private parseDelimitedLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }

    result.push(current);
    return result;
  }

  private findColumnIndex(header: string[], keywords: string[]): number {
    for (const kw of keywords) {
      const idx = header.findIndex((item) => item.includes(this.normalizeLookup(kw)));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  private extractFirstTextFileFromZip(zipBuffer: any, preferredExtensions: string[]): string {
    const zip = new AdmZip(Buffer.from(zipBuffer));
    const entries = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .sort((a, b) => a.entryName.localeCompare(b.entryName));

    for (const ext of preferredExtensions) {
      const entry = entries.find((candidate) => candidate.entryName.toLowerCase().endsWith(ext.toLowerCase()));
      if (entry) return entry.getData().toString('utf8');
    }

    const first = entries[0];
    if (!first) return '';
    return first.getData().toString('utf8');
  }

  private toAmount(raw: string): number {
    const normalized = String(raw || '')
      .replace(/\u00A0/g, '')
      .replace(/\s+/g, '')
      .replace(/[^0-9,.-]/g, '')
      .replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async fetchRpoSearch(params: Record<string, any>): Promise<any[]> {
    const { data } = await axios.get(`${this.rpoBase}/search`, {
      params,
      timeout: 12000,
      headers: this.requestHeaders,
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
      .find((value: string) => /^\d{6,10}$/.test(value));
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
      headers: this.requestHeaders,
    });

    const ids = Array.isArray(data?.id)
      ? data.id
      : Array.isArray(data?.ids)
      ? data.ids
      : [];

    return ids.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0);
  }

  private async fetchRuzUnitIdsPage(params: {
    page: number;
    perPage: number;
    legalForm?: string;
  }): Promise<{ ids: number[]; total: number }> {
    const page = Math.max(1, params.page || 1);
    const perPage = Math.max(1, Math.min(200, params.perPage || 20));
    const offset = (page - 1) * perPage;

    const total = await this.fetchRuzTotalRemaining(params.legalForm);

    const ids: number[] = [];
    let skipped = 0;
    let cursor = 0;
    let guard = 0;

    while (ids.length < perPage && guard < 400) {
      guard++;
      const batch = await this.fetchRuzUnitIds({
        maxRecords: 1000,
        continueAfterId: cursor,
        legalForm: params.legalForm,
      });
      if (!batch.length) break;

      if (skipped + batch.length <= offset) {
        skipped += batch.length;
        cursor = batch[batch.length - 1];
        continue;
      }

      const startIndex = Math.max(0, offset - skipped);
      const needed = perPage - ids.length;
      ids.push(...batch.slice(startIndex, startIndex + needed));
      skipped += batch.length;
      cursor = batch[batch.length - 1];
      if (batch.length < 1000) break;
    }

    return { ids, total };
  }

  private async fetchRuzTotalRemaining(legalForm?: string): Promise<number> {
    try {
      const params: Record<string, any> = {
        'zmenene-od': this.ruzDefaultSince,
      };
      if (legalForm) params['pravna-forma'] = legalForm;

      const { data } = await axios.get(`${this.ruzBase}/zostavajuce-id/uctovne-jednotky`, {
        params,
        timeout: 12000,
        headers: this.requestHeaders,
      });
      return this.toNumber(data?.pocetZostavajucichId || data?.remainingCount || 0);
    } catch {
      return 0;
    }
  }

  private async fetchRuzUnitById(id: number): Promise<any | null> {
    try {
      const { data } = await axios.get(`${this.ruzBase}/uctovna-jednotka`, {
        params: { id },
        timeout: 12000,
        headers: this.requestHeaders,
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

    const candidates = unique.sort((a, b) => b - a).slice(0, Math.max(limit * 2, 10));
    const statements = await Promise.all(candidates.map((id) => this.fetchRuzStatementById(id)));
    const valid = statements.filter((item) => !!item) as any[];

    valid.sort((a, b) => {
      const aDate = this.statementSortKey(a);
      const bDate = this.statementSortKey(b);
      return bDate.localeCompare(aDate);
    });

    return valid.slice(0, limit);
  }

  private async fetchRuzStatementById(id: number): Promise<any | null> {
    try {
      const { data } = await axios.get(`${this.ruzBase}/uctovna-zavierka`, {
        params: { id },
        timeout: 12000,
        headers: this.requestHeaders,
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
      this.normalizeSearchText(statement?.datumZostaveniaK) ||
      this.normalizeSearchText(statement?.obdobieDo) ||
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

    if (this.toNumber(financials.assets || 0) > 0 && this.toNumber(financials.equity || 0) > 0) {
      const liabilities = Math.max(0, this.toNumber(financials.assets || 0) - this.toNumber(financials.equity || 0));
      financials.debt_ratio = this.toNumber(financials.assets || 0) > 0
        ? (liabilities / this.toNumber(financials.assets || 0)) * 100
        : undefined;
    }

    financials.is_loss = this.toNumber(financials.profit || 0) < 0;
    financials.negative_equity = this.toNumber(financials.equity || 0) < 0;

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
        headers: this.requestHeaders,
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
        headers: this.requestHeaders,
      });
      this.ruzTemplateCache.set(templateId, data || null);
      return data || null;
    } catch {
      this.ruzTemplateCache.set(templateId, null);
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
    const pickValue = (row: RuzMappedRow): number => {
      if (!Array.isArray(row.values) || row.values.length === 0) return 0;
      if (row.values.length === 1) return row.values[0];
      if (row.values.length === 2) return row.values[0];
      if (row.values.length >= 4) return row.values[2];
      return row.values[row.values.length - 1];
    };

    const findByLabel = (patterns: string[], tableNeedles: string[] = []): number => {
      const candidates = rows.filter((row) => {
        const labelNorm = this.normalizeLookup(row.label);
        const tableNorm = this.normalizeLookup(row.tableName);
        const labelMatch = patterns.some((needle) => labelNorm.includes(this.normalizeLookup(needle)));
        if (!labelMatch) return false;
        if (!tableNeedles.length) return true;
        return tableNeedles.some((needle) => tableNorm.includes(this.normalizeLookup(needle)));
      });
      if (!candidates.length) return 0;

      // Prefer rows with broader "total" semantics.
      const scored = candidates
        .map((row) => {
          const labelNorm = this.normalizeLookup(row.label);
          let score = 0;
          if (labelNorm.includes('spolu') || labelNorm.includes('sucet') || labelNorm.includes('total')) score += 30;
          if (labelNorm.includes('trzby') || labelNorm.includes('vysledok') || labelNorm.includes('majetok')) score += 10;
          return { row, score, value: pickValue(row) };
        })
        .filter((item) => Number.isFinite(item.value));

      scored.sort((a, b) => b.score - a.score);
      return this.toNumber(scored[0]?.value || 0);
    };

    const revenue = findByLabel(
      ['trzby za vlastne vykony a tovar', 'trzby', 'vynosy spolu', 'uctova trieda 6 sucet'],
      ['vynosy', 'vykaz ziskov', 'revenues'],
    );
    const profitAfterTax = findByLabel(
      ['vysledok hospodarenia po zdaneni', 'vysledok hospodarenia za uctovne obdobie'],
      ['vynosy', 'vykaz ziskov', 'revenues', 'pasiv'],
    );
    const assets = findByLabel(
      ['spolu majetok', 'aktiva spolu', 'majetok spolu'],
      ['aktiv', 'assets'],
    );
    const equity = findByLabel(
      ['vlastne imanie', 'vlastne zdroje krytia'],
      ['pasiv', 'liabilit'],
    );

    const grossMargin = revenue > 0 && this.toNumber(profitAfterTax) !== 0
      ? (this.toNumber(profitAfterTax) / revenue) * 100
      : undefined;

    return {
      revenue: revenue > 0 ? revenue : undefined,
      profit: this.toNumber(profitAfterTax),
      assets: assets > 0 ? assets : undefined,
      equity: this.toNumber(equity),
      gross_margin: Number.isFinite(grossMargin) ? grossMargin : undefined,
    };
  }

  private extractBreakdownFromMappedRows(rows: RuzMappedRow[]): {
    assets: { name: string; value: number }[];
    liabilities: { name: string; value: number }[];
  } {
    const normalize = (text: string) => this.normalizeLookup(text);
    const pickValue = (row: RuzMappedRow): number => {
      if (row.values.length === 1) return row.values[0];
      if (row.values.length === 2) return row.values[0];
      if (row.values.length >= 4) return row.values[2];
      return row.values[row.values.length - 1];
    };

    const assetsRows = rows
      .filter((row) => normalize(row.tableName).includes('aktiv'))
      .map((row) => ({
        name: this.normalizeSearchText(row.label),
        value: Math.abs(this.toNumber(pickValue(row))),
      }))
      .filter((row) => row.value > 0 && !!row.name && !normalize(row.name).includes('spolu majetok'));

    const liabilitiesRows = rows
      .filter((row) => normalize(row.tableName).includes('pasiv'))
      .map((row) => ({
        name: this.normalizeSearchText(row.label),
        value: Math.abs(this.toNumber(pickValue(row))),
      }))
      .filter((row) => row.value > 0 && !!row.name && !normalize(row.name).includes('vlastne imanie a zavazky'));

    return {
      assets: assetsRows.slice(0, 12),
      liabilities: liabilitiesRows.slice(0, 12),
    };
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
      if (revValue !== 0) {
        revenue.push({ year, value: revValue });
      }
      if (profitValue !== 0) {
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
        headers: this.requestHeaders,
      });
      const list = Array.isArray(data) ? data : [];
      const map = new Map<string, string>();
      list.forEach((item: any) => {
        const code = this.normalizeSearchText(item?.kod || item?.code || '');
        const name = this.normalizeSearchText(item?.nazov || item?.name || '');
        if (code) map.set(code, name || code);
      });
      this.ruzLegalFormsByCode = map;
      return map;
    } catch {
      this.ruzLegalFormsByCode = new Map<string, string>();
      return this.ruzLegalFormsByCode;
    }
  }

  private async getRuzOrgSizesMap(): Promise<Map<string, string>> {
    if (this.ruzOrgSizesByCode) return this.ruzOrgSizesByCode;
    try {
      const { data } = await axios.get(`${this.ruzBase}/velkosti-organizacie`, {
        timeout: 12000,
        headers: this.requestHeaders,
      });
      const list = Array.isArray(data) ? data : [];
      const map = new Map<string, string>();
      list.forEach((item: any) => {
        const code = this.normalizeSearchText(item?.kod || item?.code || '');
        const name = this.normalizeSearchText(item?.nazov || item?.name || '');
        if (code) map.set(code, name || code);
      });
      this.ruzOrgSizesByCode = map;
      return map;
    } catch {
      this.ruzOrgSizesByCode = new Map<string, string>();
      return this.ruzOrgSizesByCode;
    }
  }

  private async getRuzRegionsMap(): Promise<Map<string, string>> {
    if (this.ruzRegionsByCode) return this.ruzRegionsByCode;
    try {
      const { data } = await axios.get(`${this.ruzBase}/kraje`, {
        timeout: 12000,
        headers: this.requestHeaders,
      });
      const list = Array.isArray(data) ? data : [];
      const byCode = new Map<string, string>();
      const byName = new Map<string, string>();
      list.forEach((item: any) => {
        const code = this.normalizeSearchText(item?.kod || item?.code || '');
        const name = this.normalizeSearchText(item?.nazov || item?.name || '');
        if (!code) return;
        byCode.set(code, name || code);
        if (name) byName.set(this.normalizeLookup(name), code);
      });
      this.ruzRegionsByCode = byCode;
      this.ruzRegionCodeByName = byName;
      return byCode;
    } catch {
      this.ruzRegionsByCode = new Map<string, string>();
      this.ruzRegionCodeByName = new Map<string, string>();
      return this.ruzRegionsByCode;
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

  private sortBrowseRows(rows: BrowseCompanyItem[], sort: string) {
    const key = this.normalizeLookup(sort || 'sales-desc');
    rows.sort((a, b) => {
      if (key.includes('name')) return a.name.localeCompare(b.name, 'sk');
      if (key.includes('ico')) return a.ico.localeCompare(b.ico);
      if (key.includes('city')) return a.city.localeCompare(b.city, 'sk');
      if (key.includes('region')) return a.region.localeCompare(b.region, 'sk');
      if (key.includes('empl')) return a.employees.localeCompare(b.employees, 'sk');
      if (key.includes('sales')) {
        const aSales = this.parseLocalizedNumber(a.sales || '0');
        const bSales = this.parseLocalizedNumber(b.sales || '0');
        return key.includes('desc') ? bSales - aSales : aSales - bSales;
      }
      if (key.includes('creation')) return (b.creation_date || '').localeCompare(a.creation_date || '');
      return 0;
    });
  }

  private async mapSearchRowsToBrowseRows(searchRows: CompanySearchResult[]): Promise<BrowseCompanyItem[]> {
    const icos = searchRows.map((row) => this.normalizeSearchIco(row.ico)).filter(Boolean);
    const { data: localRows } = await this.supabase.db
      .from('companies')
      .select('ico, raw_data')
      .in('ico', icos);
    const localByIco = new Map((localRows || []).map((row) => [this.normalizeSearchIco(row.ico), row]));

    return searchRows.map((row) => {
      const ico = this.normalizeSearchIco(row.ico);
      const local = localByIco.get(ico);
      const revenue = this.toNumber(local?.raw_data?.financials?.revenue || 0);
      return {
        ico,
        name: this.normalizeSearchText(row.name),
        city: this.normalizeSearchText(row.city),
        region: '',
        employees: '',
        sales: revenue > 0 ? this.formatCompactCurrency(revenue) : '',
        creation_date: '',
        source_url: '',
      };
    });
  }

  private formatCompactCurrency(value: number): string {
    const amount = this.toNumber(value);
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return `${Math.round(amount).toLocaleString('sk-SK')} EUR`;
  }

  private calculateRisk(data: any): Partial<CompanyRiskData> {
    let score = 100;
    const reasons: string[] = [];
    const indicators = data?.indicators || data?.raw_data?.indicators || {};
    const financials = data?.financials || data?.raw_data?.financials || {};

    const totalDebt =
      this.toNumber(data.tax_debt || 0) + this.toNumber(data.social_debt || 0) + this.toNumber(data.health_debt || 0);

    if (totalDebt > 1000) {
      score -= 40;
      reasons.push(`High debt in registries: ${totalDebt.toFixed(2)} EUR`);
    } else if (totalDebt > 0) {
      score -= 15;
      reasons.push(`Recorded debt obligations: ${totalDebt.toFixed(2)} EUR`);
    }

    if (data.status && this.normalizeLookup(data.status).includes('likvid')) {
      score -= 80;
      reasons.push('Company is in liquidation');
    }
    if (data.is_bankrupt) {
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

    score = Math.max(1, Math.min(100, score));
    return {
      risk_score: score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red',
      risk_score_numeric: score,
      risk_reasons: reasons.length ? reasons : ['No risk indicators found'],
    };
  }

  private formatCompany(row: any): CompanyRiskData {
    const d = row.raw_data || {};
    const f = d.financials || {};
    const indicators = d.indicators || {};
    const events = d.events_detail || {};
    const dates = d.important_dates || {};
    const breakdown = d.breakdown || {};
    const riskNumeric = toRiskNumeric(row.risk_score_numeric, row.risk_score);
    const debtSummary = buildDebtSummary(d?.debt_summary, {
      tax: row.tax_debt,
      social: row.social_debt,
      health: row.health_debt,
    });

    const displayName = sanitizeDisplayName(row.name);
    const displayAddress = sanitizeDisplayAddress(row.address, row.name, displayName);

    return {
      ico: row.ico,
      name: displayName,
      legal_form: row.legal_form,
      address: displayAddress,
      city: row.city,
      status: row.status,
      risk_score: row.risk_score as 'red' | 'yellow' | 'green',
      risk_score_numeric: riskNumeric,
      risk_reasons: row.risk_reasons,
      tax_debt: row.tax_debt,
      social_debt: row.social_debt,
      health_debt: row.health_debt,
      court_cases: row.court_cases || 0,
      is_bankrupt: row.is_bankrupt,
      is_in_liquidation: row.is_in_liquidation || false,
      last_checked_at: row.last_checked_at,
      revenue: f.revenue,
      profit: f.profit,
      equity: f.equity,
      assets: f.assets,
      financial_year: f.financial_year,
      debt_ratio: f.debt_ratio,
      gross_margin: f.gross_margin,
      is_loss: this.toNumber(f.profit || 0) < 0,
      negative_equity: this.toNumber(f.equity || 0) < 0,
      dlhy_nedoplatky: !!indicators.dlhy_nedoplatky,
      pohladavky_statu: !!indicators.pohladavky_statu,
      has_docasna_ochrana: !!indicators.has_docasna_ochrana,
      dph_status: indicators.dph_status || 'NIE',
      events_detail: {
        bankruptcies: this.toNumber(events.bankruptcies || 0),
        debts: this.toNumber(events.debts || 0),
        court_decisions: this.toNumber(events.court_decisions || 0),
        payment_orders: this.toNumber(events.payment_orders || 0),
        executions: this.toNumber(events.executions || 0),
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
      history_data: d.history_data,
      breakdown: {
        assets: Array.isArray(breakdown.assets) ? breakdown.assets : [],
        liabilities: Array.isArray(breakdown.liabilities) ? breakdown.liabilities : [],
      },
      important_dates: {
        bankruptcy: dates.bankruptcy,
        orsr_entry: dates.orsr_entry,
      },
    };
  }

  private async trackChanges(oldData: any, newData: any) {
    const fields = ['risk_score', 'tax_debt', 'social_debt', 'health_debt', 'status'];

    for (const field of fields) {
      if (String(oldData[field]) !== String(newData[field])) {
        let type: 'improved' | 'worsened' | 'neutral' = 'neutral';

        if (field === 'risk_score') {
          const order = { green: 3, yellow: 2, red: 1 };
          const oldVal = order[oldData[field]] || 0;
          const newVal = order[newData[field]] || 0;
          type = newVal > oldVal ? 'improved' : 'worsened';
        } else if (field.includes('debt')) {
          type = Number(newData[field]) > Number(oldData[field]) ? 'worsened' : 'improved';
        }

        await this.supabase.db.from('company_history').insert({
          ico: oldData.ico,
          field_name: field,
          old_value: String(oldData[field]),
          new_value: String(newData[field]),
          change_type: type,
        });
      }
    }
  }

  private mergeYearSeries(existing: any, incoming: any): { year: string; value: number }[] {
    const list = [
      ...(Array.isArray(existing) ? existing : []),
      ...(Array.isArray(incoming) ? incoming : []),
    ]
      .map((item: any) => ({
        year: this.normalizeSearchText(item?.year),
        value: this.toNumber(item?.value || 0),
      }))
      .filter((item) => !!item.year);

    const byYear = new Map<string, number>();
    list.forEach((item) => {
      if (!byYear.has(item.year)) {
        byYear.set(item.year, item.value);
      } else {
        const previous = this.toNumber(byYear.get(item.year));
        if (Math.abs(item.value) > Math.abs(previous)) byYear.set(item.year, item.value);
      }
    });

    return [...byYear.entries()]
      .map(([year, value]) => ({ year, value }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }

  private mergeBreakdownItems(existing: any, incoming: any): { name: string; value: number }[] {
    const out = new Map<string, number>();
    const rows = [
      ...(Array.isArray(existing) ? existing : []),
      ...(Array.isArray(incoming) ? incoming : []),
    ];

    rows.forEach((row: any) => {
      const name = this.normalizeSearchText(row?.name);
      if (!name) return;
      const value = Math.abs(this.toNumber(row?.value || 0));
      if (value <= 0) return;
      const prev = out.get(name) || 0;
      if (value > prev) out.set(name, value);
    });

    return [...out.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }

  private mergeMappedRows(existing: any, incoming: any): any[] {
    const rows = [
      ...(Array.isArray(existing) ? existing : []),
      ...(Array.isArray(incoming) ? incoming : []),
    ];
    const seen = new Set<string>();
    const out: any[] = [];

    rows.forEach((row: any) => {
      const key = [
        this.normalizeSearchText(row?.tableName),
        this.toNumber(row?.lineNo || 0),
        this.normalizeSearchText(row?.label),
      ].join('|');
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({
        tableName: this.normalizeSearchText(row?.tableName),
        lineNo: this.toNumber(row?.lineNo || 0),
        label: this.normalizeSearchText(row?.label),
        values: Array.isArray(row?.values) ? row.values.map((v: any) => this.toNumber(v)) : [],
        templateId: this.toNumber(row?.templateId || 0),
      });
    });

    return out;
  }

  private maxWithExisting(newValue: any, existingValue: any): number {
    return Math.max(this.toNumber(newValue || 0), this.toNumber(existingValue || 0));
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

  private normalizeSearchIco(raw: any): string {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.padStart(8, '0');
  }

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

  private parseLocalizedNumber(raw: any): number {
    const compact = String(raw || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '');
    const match = compact.match(/-?\d+(?:[.,]\d+)?/);
    if (!match) return 0;
    return this.toNumber(match[0].replace(',', '.'));
  }
}
