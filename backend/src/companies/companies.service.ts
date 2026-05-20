import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
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
  finstat_url: string;
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
  source: 'direct' | 'register' | 'local' | 'finstat';
  risk_score?: string;
};

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  private readonly ekosystemBase: string;
  private readonly missingDebtTablesWarned = new Set<string>();
  private readonly debtCacheTtlMs = 6 * 60 * 60 * 1000;
  private readonly taxDebtorsZipUrl = 'https://report.financnasprava.sk/ds_dsdd.zip';
  private readonly socialDebtorsPageUrl = 'https://www.socpoist.sk/nastroje-sluzby/zoznam-dlznikov';
  private readonly socialDebtorsZipFallbackUrl =
    'https://www.socpoist.sk/api/idsp/download/7946c279-f0b4-451a-b199-a317f675e6cf';
  private socialDebtorsCache: { loadedAt: number; debtsByIco: Map<string, number> } | null = null;
  private taxDebtorsCache:
    | {
        loadedAt: number;
        records: TaxDebtorRecord[];
      }
    | null = null;

  constructor(
    private supabase: SupabaseService,
    private config: ConfigService,
  ) {
    this.ekosystemBase = this.config.get('EKOSYSTEM_API_BASE') || 'https://datahub.ekosystem.slovensko.digital/api/datahub';
  }

  async search(query: string, page = 1): Promise<CompanySearchResult[]> {
    const limit = 20;
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const offset = (safePage - 1) * limit;
    const q = query ? query.trim() : '';
    this.logger.log(`Searching for: "${q}" (page ${safePage}, offset ${offset})`);

    // Empty/very short queries should return local recent data only.
    if (q.length < 2) {
      return this.searchLocalCompanies(q, offset, limit);
    }

    // For exact ICO lookups, bypass global search and fetch directly.
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

        this.logger.warn(`Direct ICO lookup returned empty company name for ${q}, using fallback search sources`);
      } catch (e) {
        this.logger.warn(`Direct ICO lookup failed for ${q}: ${this.getErrorMessage(e)}`);
      }
    }

    try {
      const endpoint = `${this.ekosystemBase}/corporate_bodies/search`;
      const params: any = { q, limit, offset };
      const apiKey = this.config.get('EKOSYSTEM_API_KEY');

      this.logger.log(`Fetching from API: ${endpoint} with params ${JSON.stringify(params)}`);
      const { data } = await axios.get(endpoint, { 
        params, 
        timeout: 8000,
        headers: apiKey ? {
          'Authorization': `Token ${apiKey}`
        } : {}
      });
      
      const rawResults = Array.isArray(data) ? data : (data?.corporate_bodies || data?.results || []);
      
      if (!Array.isArray(rawResults)) {
        this.logger.error(`Unexpected API response structure: ${JSON.stringify(data).substring(0, 200)}`);
        return [];
      }

      const results: CompanySearchResult[] = rawResults
        .map((b: any): CompanySearchResult | null => {
          const ico = this.normalizeSearchIco(b.ico || b.registration_number || b.id || b.identifier?.value);
          const name = this.normalizeSearchText(b.name || b.full_name || b.name?.value);
          if (!ico || !name) return null;

          return {
            ico,
            name,
            address: b.address?.formatted_address || b.address?.physical_address?.formatted_address || '',
            city: b.address?.municipality?.value || b.address?.physical_address?.municipality?.value || '',
            source: 'register',
          };
        })
        .filter((row): row is CompanySearchResult => row !== null);

      return this.enrichSearchResultsWithRisk(results);
    } catch (e) {
      this.logger.warn(`Global search/browse failed: ${this.getErrorMessage(e)}`);
    }

    // Resilient fallback: local DB + FinStat public search.
    const [localMatches, finstatMatches] = await Promise.all([
      this.searchLocalCompanies(q, offset, limit),
      this.searchViaFinStat(q, safePage, limit),
    ]);

    const merged: CompanySearchResult[] = [...localMatches];
    const seen = new Set(
      merged
        .map((item) => this.normalizeSearchIco(item.ico))
        .filter((ico) => !!ico),
    );

    for (const row of finstatMatches) {
      const normalizedIco = this.normalizeSearchIco(row.ico);
      if (!normalizedIco || seen.has(normalizedIco)) continue;
      seen.add(normalizedIco);
      merged.push({ ...row, ico: normalizedIco });
      if (merged.length >= limit) break;
    }

    return this.enrichSearchResultsWithRisk(merged.slice(0, limit));
  }

  async browseFinStatDatabase(params: BrowseParams): Promise<BrowseResult> {
    const {
      page,
      sort,
      activity,
      region,
      legalForm,
      employees,
      salesFrom,
      query: searchQuery,
    } = params;
    const queryText = this.normalizeSearchText(searchQuery);
    const shouldAugmentWithLocal =
      queryText.length >= 2 &&
      !activity &&
      !region &&
      !legalForm &&
      !employees &&
      !salesFrom;

    this.logger.log(`Browsing FinStat database: sort=${sort}, page=${page}, activity=${activity}, region=${region}`);

    if (shouldAugmentWithLocal) {
      const quickMatches = await this.search(queryText, page);
      if (quickMatches.length > 0) {
        const companies = quickMatches.map((row) => ({
          ico: this.normalizeSearchIco(row.ico),
          name: row.name,
          city: row.city || '',
          region: '',
          employees: '',
          sales: '',
          creation_date: '',
          finstat_url: `https://www.finstat.sk/${this.normalizeSearchIco(row.ico)}`,
        }));

        const hasNextPage = quickMatches.length >= 20;
        const total = hasNextPage ? page * 20 + 1 : (page - 1) * 20 + quickMatches.length;

        return {
          companies,
          total,
          page,
          perPage: 20,
          totalPages: hasNextPage ? page + 1 : Math.max(page, 1),
        };
      }
    }

    try {
      const urlParams = new URLSearchParams();
      if (activity) urlParams.set('Activity', activity);
      if (region) urlParams.set('Region', region);
      if (salesFrom) urlParams.set('SalesFrom', salesFrom);
      if (legalForm) urlParams.set('LegalForm', legalForm);
      if (employees) urlParams.set('NumberOfEmployees', employees);
      if (sort) urlParams.set('Sort', sort);
      if (searchQuery) urlParams.set('query', searchQuery);
      if (page > 1) urlParams.set('page', String(page));

      const url = `https://www.finstat.sk/databaza-firiem-organizacii?${urlParams.toString()}`;
      this.logger.log(`Fetching FinStat database: ${url}`);

      const { data: html } = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'sk,en;q=0.5',
        },
      });

      const $ = cheerio.load(html);
      const companies: BrowseCompanyItem[] = [];

      // Parse total count from breadcrumb text (e.g., "... vyfiltrovanych firiem")
      let total = 0;
      const breadcrumbText = $('.breadcrumb').text() || '';
      const totalMatch = breadcrumbText.match(/([\d\s]+)\s*vyfiltrovan/);
      if (totalMatch) {
        total = parseInt(totalMatch[1].replace(/\s/g, ''), 10) || 0;
      }

      // Parse company table rows
      // FinStat table columns (source language): Name + ICO, City, Region, Employees, Sales, Founded
      const tableRows = $('table.table tbody tr, table.table tr').not('thead tr');

      if (tableRows.length > 0) {
        tableRows.each((_, tr) => {
          const cells = $(tr).find('td');
          if (cells.length < 2) return;

          // Cell 0: company name with a link containing ICO in href
          const nameLink = $(cells[0]).find('a[href]').first();
          const name = this.normalizeSearchText(nameLink.text());
          const href = nameLink.attr('href') || '';
          const icoFromHref = href.match(/\/(\d{6,8})(?:[/?#]|$)/)?.[1] || '';

          // ICO might also be text in Cell 0
          const cell0Text = $(cells[0]).text();
          const icoFromCell = cell0Text.match(/IČO:\s*(\d{6,8})/) ? cell0Text.match(/IČO:\s*(\d{6,8})/)[1] : '';
          const ico = this.normalizeSearchIco(icoFromHref || icoFromCell);

          if (!ico || !name) return;

          // Cell mapping: 1 City, 2 Region, 3 Employees, 4 Sales, 5 Founded
          const city = cells.length > 1 ? this.normalizeSearchText($(cells[1]).text()) : '';
          const regionVal = cells.length > 2 ? this.normalizeSearchText($(cells[2]).text()) : '';
          const employeesVal = cells.length > 3 ? this.normalizeSearchText($(cells[3]).text()) : '';
          const sales = cells.length > 4 ? this.normalizeSearchText($(cells[4]).text()) : '';
          const creationDate = cells.length > 5 ? this.normalizeSearchText($(cells[5]).text()) : '';

          companies.push({
            ico,
            name,
            city,
            region: regionVal,
            employees: employeesVal,
            sales,
            creation_date: creationDate,
            finstat_url: `https://www.finstat.sk/${ico}`,
          });
        });
      }

      // Alternative parsing: FinStat may use div-based layout instead of table
      if (companies.length === 0) {
        // Try parsing from the result list items
        $('a[href^="/"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const icoMatch = href.match(/^\/(\d{8})(?:[/?#]|$)/);
          if (!icoMatch) return;

          const ico = this.normalizeSearchIco(icoMatch[1]);
          const name = this.normalizeSearchText($(el).text());
          if (!ico || !name || this.isInvalidIdentityName(name)) return;

          // Avoid duplicates
          if (companies.find(c => c.ico === ico)) return;

          companies.push({
            ico,
            name,
            city: '',
            region: '',
            employees: '',
            sales: '',
            creation_date: '',
            finstat_url: `https://www.finstat.sk/${ico}`,
          });
        });
      }

      // Deduplicate
      const seen = new Set<string>();
      const dedupedCompanies = companies.filter(c => {
        if (seen.has(c.ico)) return false;
        seen.add(c.ico);
        return true;
      });

      const perPage = 20;

      const localMatches = shouldAugmentWithLocal
        ? await this.searchLocalCompaniesForBrowse(queryText, 240)
        : [];

      if (total === 0 && localMatches.length > 0) {
        const start = (Math.max(page, 1) - 1) * perPage;
        const companiesPage = localMatches.slice(start, start + perPage);
        const totalPages = Math.ceil(localMatches.length / perPage);

        this.logger.log(
          `FinStat browse fallback to local matches: ${localMatches.length} total, page ${page}`,
        );

        return {
          companies: companiesPage,
          total: localMatches.length,
          page,
          perPage,
          totalPages,
        };
      }

      const mergedCompanies =
        shouldAugmentWithLocal && page === 1
          ? this.mergeBrowseCompanies(localMatches, dedupedCompanies).slice(0, perPage)
          : dedupedCompanies;

      const effectiveTotal =
        total > 0
          ? Math.max(total, mergedCompanies.length)
          : mergedCompanies.length;

      const totalPages = effectiveTotal > 0 ? Math.ceil(effectiveTotal / perPage) : 1;

      this.logger.log(
        `FinStat browse: found ${mergedCompanies.length} companies (local augment: ${localMatches.length}), total=${effectiveTotal}`,
      );

      return {
        companies: mergedCompanies,
        total: effectiveTotal,
        page,
        perPage,
        totalPages,
      };
    } catch (e) {
      this.logger.error(`FinStat browse failed: ${this.getErrorMessage(e)}`);
      return {
        companies: [],
        total: 0,
        page,
        perPage: 20,
        totalPages: 0,
      };
    }
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

    const { data: localMatches } = await queryBuilder
      .range(offset, offset + limit - 1);

    return (localMatches || []).map((row) => ({
      ...row,
      ico: this.normalizeSearchIco(row.ico),
      source: 'local',
    }));
  }

  private async searchLocalCompaniesForBrowse(query: string, limit: number): Promise<BrowseCompanyItem[]> {
    const q = this.normalizeSearchText(query);
    if (q.length < 2) return [];

    const digits = q.replace(/\D/g, '');
    const escapedText = this.escapeSupabaseFilterValue(q);
    const escapedDigits = this.escapeSupabaseFilterValue(digits);

    let queryBuilder = this.supabase.db
      .from('companies')
      .select('ico, name, city, address')
      .limit(limit);

    if (digits.length >= 2) {
      queryBuilder =
        q === digits
          ? queryBuilder.or(`ico.ilike.${escapedDigits}%,ico.ilike.%${escapedDigits}%`)
          : queryBuilder.or(
              `ico.ilike.${escapedDigits}%,name.ilike.%${escapedText}%,city.ilike.%${escapedText}%,address.ilike.%${escapedText}%`,
            );
    } else {
      queryBuilder = queryBuilder.or(
        `name.ilike.%${escapedText}%,city.ilike.%${escapedText}%,address.ilike.%${escapedText}%`,
      );
    }

    const { data } = await queryBuilder;
    if (!Array.isArray(data) || data.length === 0) return [];

    const queryNorm = this.normalizeLookup(q);
    const scored = data
      .map((row) => {
        const ico = this.normalizeSearchIco(row.ico);
        const name = this.normalizeSearchText(row.name);
        const city = this.normalizeSearchText(row.city);
        const address = this.normalizeSearchText(row.address);
        const nameNorm = this.normalizeLookup(name);
        const cityNorm = this.normalizeLookup(city);

        let score = 0;
        if (digits.length >= 2) {
          if (ico.startsWith(digits)) score += 300;
          else if (ico.includes(digits)) score += 180;
        }

        if (nameNorm.startsWith(queryNorm)) score += 120;
        else if (nameNorm.includes(queryNorm)) score += 80;

        if (cityNorm.startsWith(queryNorm)) score += 35;
        else if (cityNorm.includes(queryNorm)) score += 20;

        return {
          score,
          item: {
            ico,
            name,
            city,
            region: '',
            employees: '',
            sales: '',
            creation_date: '',
            finstat_url: `https://www.finstat.sk/${ico}`,
          } satisfies BrowseCompanyItem,
        };
      })
      .filter((row) => !!row.item.ico && !!row.item.name)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.item.name !== b.item.name) return a.item.name.localeCompare(b.item.name, 'sk');
        return a.item.ico.localeCompare(b.item.ico);
      });

    return scored.map((row) => row.item);
  }

  private mergeBrowseCompanies(primary: BrowseCompanyItem[], secondary: BrowseCompanyItem[]): BrowseCompanyItem[] {
    const merged: BrowseCompanyItem[] = [];
    const seen = new Set<string>();

    for (const row of [...primary, ...secondary]) {
      const ico = this.normalizeSearchIco(row.ico);
      if (!ico || seen.has(ico)) continue;

      seen.add(ico);
      merged.push({
        ...row,
        ico,
      });
    }

    return merged;
  }

  private escapeSupabaseFilterValue(value: string): string {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,');
  }

  private async searchViaFinStat(query: string, page: number, limit: number): Promise<CompanySearchResult[]> {
    try {
      const params = new URLSearchParams({ query });
      if (page > 1) {
        params.set('page', String(page));
      }

      const url = `https://www.finstat.sk/vyhladavanie?${params.toString()}`;
      const { data: html } = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        },
      });

      const $ = cheerio.load(html);
      const parsed: CompanySearchResult[] = [];

      $('.search-result-item').each((_, el) => {
        if (parsed.length >= limit) return;

        const link = $(el).find('.search-result-item-name a[href]').first();
        const href = link.attr('href') || '';
        const name = this.normalizeSearchText(link.text());
        const icoFromHref = href.match(/\/(\d{6,8})(?:[/?#]|$)/)?.[1] || '';
        const icoFromBadge = this.normalizeSearchText($(el).find('.search-result-item-ico').first().text())
          .match(/(\d{6,8})/)?.[1] || '';
        const ico = this.normalizeSearchIco(icoFromHref || icoFromBadge);

        if (!ico || !name) return;

        const addressLine = this.normalizeSearchText($(el).find('.search-result-item-name .f-sm').first().text());
        const addressParts = addressLine
          .split(',')
          .map((part) => part.trim())
          .filter((part) => !!part);

        let address = addressLine;
        let city = '';
        if (addressParts.length > 1) {
          city = addressParts[addressParts.length - 1];
          address = addressParts.slice(0, -1).join(', ');
        }

        parsed.push({
          ico,
          name,
          address,
          city,
          source: 'finstat',
          risk_score: undefined as string | undefined,
        });
      });

      if (parsed.length > 0) {
        return parsed;
      }

      // Fallback parser if FinStat changes CSS classes.
      $('a[href^="/"]').each((_, el) => {
        if (parsed.length >= limit) return false;
        const href = $(el).attr('href') || '';
        const ico = this.normalizeSearchIco(href.match(/^\/(\d{6,8})(?:[/?#]|$)/)?.[1] || '');
        if (!ico) return;
        const name = this.normalizeSearchText($(el).text());
        if (!name) return;

        parsed.push({
          ico,
          name,
          address: '',
          city: '',
          source: 'finstat',
          risk_score: undefined as string | undefined,
        });
      });

      return parsed;
    } catch (e) {
      this.logger.warn(`FinStat fallback search failed: ${this.getErrorMessage(e)}`);
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

    const riskByIco = new Map(
      (localData || []).map((row) => [this.normalizeSearchIco(row.ico), row.risk_score]),
    );

    normalized.forEach((row) => {
      if (!row.risk_score) {
        const risk = riskByIco.get(row.ico);
        if (risk) row.risk_score = risk;
      }
    });

    return normalized;
  }

  private normalizeSearchIco(raw: any): string {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.padStart(8, '0');
  }

  private normalizeSearchText(value: any): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  private isInvalidIdentityName(name: any): boolean {
    const normalized = this.normalizeSearchText(name).toLowerCase();
    if (!normalized) return true;

    return [
      'prehľad o firme',
      'prehlad o firme',
      'finančný report',
      'financny report',
      'finančné ukazovatele',
      'financne ukazovatele',
      'udalosti vo firme',
      'dlhy a pohľadávky',
      'dlhy a pohladavky',
      'platobné rozkazy',
      'platobne rozkazy',
      'súdne rozhodnutia',
      'sudne rozhodnutia',
      'exekúcie',
      'exekucie',
      'obchodný register',
      'obchodny register',
    ].includes(normalized);
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
    const cachedHasDebtSignals =
      !!cachedRaw?.indicators?.dlhy_nedoplatky ||
      this.toNumber(cachedRaw?.events_detail?.debts || 0) > 0;
    const cachedHasCoreDetails = !!(
      this.normalizeSearchText(cachedRaw?.dic || '') ||
      this.normalizeSearchText(cachedRaw?.ic_dph || '') ||
      this.normalizeSearchText(cachedRaw?.sk_nace || '') ||
      this.normalizeSearchText(cachedRaw?.industry || '') ||
      this.toNumber(cachedRaw?.financials?.revenue || 0) > 0 ||
      this.toNumber(cachedRaw?.financials?.assets || 0) > 0 ||
      this.toNumber(cachedRaw?.financials?.profit || 0) !== 0
    );
    const shouldRefreshDebtSnapshot = !!cached && cachedHasDebtSignals && cachedDebtTotal <= 0;
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

    if (shouldRefreshDebtSnapshot) {
      this.logger.log(`Refreshing stale debt snapshot for ICO ${normalized}`);
    }

    if (shouldRefreshIdentity) {
      this.logger.log(`Refreshing stale identity snapshot for ICO ${normalized}`);
    }

    if (shouldRefreshEnrichment) {
      this.logger.log(`Refreshing stale enrichment snapshot for ICO ${normalized}`);
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
    this.logger.log(`Fetching ICO: ${ico}`);

    const { data: existing } = await this.supabase.db.from('companies').select('*').eq('ico', ico).maybeSingle();

    const data = await this.scrapeFinStat(ico);
    const ekosystemData = await this.fetchFromEkosystem(ico);
    let identityFallback: { name?: string; address?: string; city?: string } = {};

    const hasPrimaryIdentity = !!(ekosystemData?.name || data?.name);
    if (!hasPrimaryIdentity) {
      identityFallback = await this.lookupCompanyIdentityFallback(ico);
    }

    const resolvedName = [
      ekosystemData?.name,
      data?.name,
      identityFallback?.name,
      existing?.name,
    ]
      .map((name) => this.normalizeSearchText(name))
      .find((name) => !this.isInvalidIdentityName(name)) || '';
    const safeResolvedName = resolvedName || this.normalizeSearchText(existing?.name) || `ICO ${ico}`;
    const resolvedAddress = (
      ekosystemData?.address ||
      data?.address ||
      identityFallback?.address ||
      existing?.address ||
      ''
    ).trim();
    const resolvedCity = (
      ekosystemData?.city ||
      data?.city ||
      identityFallback?.city ||
      existing?.city ||
      ''
    ).trim();
    const resolvedLegalForm = this.pickFirstText(
      ekosystemData?.legal_form,
      data?.legal_form,
      existing?.legal_form,
    ) || '';
    const resolvedStatus = this.pickFirstText(
      ekosystemData?.status,
      data?.status,
      existing?.status,
      this.normalizeLookup(resolvedName).includes('konkurz') ? 'v konkurze' : '',
      this.normalizeLookup(resolvedName).includes('likvidac') ? 'v likvidácii' : '',
    ) || '';

    const resolvedTaxDebt = this.toNumber(data?.tax_debt || 0) > 0
      ? this.toNumber(data?.tax_debt || 0)
      : this.toNumber(existing?.tax_debt || 0);
    const resolvedSocialDebt = this.toNumber(data?.social_debt || 0) > 0
      ? this.toNumber(data?.social_debt || 0)
      : this.toNumber(existing?.social_debt || 0);
    const resolvedHealthDebt = this.toNumber(data?.health_debt || 0) > 0
      ? this.toNumber(data?.health_debt || 0)
      : this.toNumber(existing?.health_debt || 0);

    const financials = {
      ...(existing?.raw_data?.financials || {}),
      ...(data?.financials || {}),
    };
    const indicators = {
      ...(existing?.raw_data?.indicators || {}),
      ...(data?.indicators || {}),
    };
    const eventsDetail = {
      ...(existing?.raw_data?.events_detail || {}),
      ...(data?.events_detail || {}),
    };
    const importantDates = {
      ...(existing?.raw_data?.important_dates || {}),
      ...(data?.important_dates || {}),
    };

    const sourceDebtSummary = data?.debt_summary || existing?.raw_data?.debt_summary || {};
    const debtSummary = buildDebtSummary(sourceDebtSummary, {
      tax: resolvedTaxDebt,
      social: resolvedSocialDebt,
      health: resolvedHealthDebt,
    });

    const rawData = {
      ...(existing?.raw_data || {}),
      financials,
      indicators,
      events_detail: eventsDetail,
      important_dates: importantDates,
      history_data: data?.history_data || existing?.raw_data?.history_data || {},
      breakdown: data?.breakdown || existing?.raw_data?.breakdown || {},
      debt_summary: debtSummary,
      dic: this.pickFirstText(data?.dic, existing?.raw_data?.dic),
      ic_dph: this.pickFirstText(data?.ic_dph, existing?.raw_data?.ic_dph),
      industry: this.pickFirstText(data?.industry, existing?.raw_data?.industry),
      employees: this.pickFirstText(data?.employees, existing?.raw_data?.employees),
      sk_nace: this.pickFirstText(data?.sk_nace, existing?.raw_data?.sk_nace),
      registration_date: this.pickFirstText(data?.registration_date, existing?.raw_data?.registration_date),
      historical_name: this.pickFirstText(data?.historical_name, existing?.raw_data?.historical_name),
    };

    const resolvedCourtCases = Math.max(
      this.toNumber(existing?.court_cases || 0),
      this.toNumber(rawData?.events_detail?.court_decisions || 0),
    );

    const resolvedIsBankrupt = !!(
      data?.is_bankrupt ||
      rawData?.important_dates?.bankruptcy ||
      existing?.is_bankrupt ||
      this.normalizeLookup(resolvedName).includes('konkurz')
    );
    const resolvedIsInLiquidation = !!(
      data?.is_in_liquidation ||
      existing?.is_in_liquidation ||
      this.normalizeLookup(resolvedName).includes('likvidac')
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

    // Update or insert
    if (existing) {
      // Track history
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

  private async lookupCompanyIdentityFallback(ico: string): Promise<{ name?: string; address?: string; city?: string }> {
    try {
      const candidates = await this.searchViaFinStat(ico, 1, 10);
      const normalized = this.normalizeIco(ico);
      const validCandidates = candidates.filter((item) => !this.isInvalidIdentityName(item?.name));
      const exact = validCandidates.find((item) => this.normalizeSearchIco(item.ico) === normalized);
      const picked = exact || validCandidates[0];

      if (!picked) return {};

      return {
        name: (picked.name || '').trim(),
        address: (picked.address || '').trim(),
        city: (picked.city || '').trim(),
      };
    } catch (e) {
      this.logger.warn(`Identity fallback lookup failed for ICO ${ico}: ${this.getErrorMessage(e)}`);
      return {};
    }
  }

  private calculateRisk(data: any): Partial<CompanyRiskData> {
    let score = 100;
    const reasons: string[] = [];
    const indicators = data?.indicators || data?.raw_data?.indicators || {};
    const financials = data?.financials || data?.raw_data?.financials || {};

    // Debt check
    const totalDebt =
      this.toNumber(data.tax_debt || 0) + this.toNumber(data.social_debt || 0) + this.toNumber(data.health_debt || 0);

    if (totalDebt > 1000) {
      score -= 40;
      reasons.push(`🔴 High debt in registries: ${totalDebt.toFixed(2)} EUR`);
    } else if (totalDebt > 0) {
      score -= 15;
      reasons.push(`🟡 Recorded debt obligations: ${totalDebt.toFixed(2)} EUR`);
    }

    // Status check
    if (data.status && data.status.toLowerCase().includes('likvid')) {
      score -= 80;
      reasons.push('🔴 Company is in liquidation');
    }
    if (data.is_bankrupt) {
      score -= 90;
      reasons.push('🔴 Insolvency register: company is bankrupt');
    }

    // Indicators from FinStat
    if (indicators?.dlhy_nedoplatky) {
      score -= 10;
      reasons.push('⚠️ Indicator: existing debts or arrears');
    }

    if (Number(financials?.equity || 0) < 0) {
      score -= 15;
      reasons.push(`📉 Negative equity: ${Number(financials.equity || 0).toFixed(0)} EUR`);
    }

    score = Math.max(1, Math.min(100, score));
    return {
      risk_score: score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red',
      risk_score_numeric: score,
      risk_reasons: reasons.length ? reasons : ['✅ No risk indicators found'],
    };
  }

  private async fetchFromEkosystem(ico: string): Promise<any> {
    try {
      const apiKey = this.config.get('EKOSYSTEM_API_KEY');
      const { data } = await axios.get(`${this.ekosystemBase}/corporate_bodies/${ico}`, {
        timeout: 10000,
        headers: apiKey
          ? {
              Authorization: `Token ${apiKey}`,
            }
          : {},
      });
      const b = data?.corporate_body || data;
      return {
        name: b?.full_name || b?.name || '',
        address: b?.address?.formatted_address || '',
        city: b?.address?.municipality?.value || '',
        legal_form: b?.legal_form?.value || '',
        status: b?.status?.value || b?.state?.value || '',
      };
    } catch (e) {
      return { name: '' };
    }
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

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }

  private normalizeIco(ico: string): string {
    return ico.padStart(8, '0');
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

  private parsePercentValue(raw: any): number {
    return this.parseLocalizedNumber(raw);
  }

  private safeJsonParse<T>(raw: string, fallback: T): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private extractChartConfigObjects($: cheerio.CheerioAPI): Array<{ title: string; categories: string[]; series: any[] }> {
    const charts: Array<{ title: string; categories: string[]; series: any[] }> = [];

    $('script').each((_, el) => {
      const script = $(el).html() || '';
      if (!script.includes('.finstatChart({')) return;

      const titleMatch = script.match(/title:\s*'([^']+)'/);
      const categoriesMatch = script.match(/categories:\s*(\[[\s\S]*?\])\s*,\s*series:/);
      const seriesMatch = script.match(/series:\s*(\[[\s\S]*?\])\s*,\s*seriesCount:/);

      if (!titleMatch || !categoriesMatch || !seriesMatch) return;

      const categoriesRaw = this.safeJsonParse<any[]>(categoriesMatch[1], []);
      const categories = categoriesRaw.map((value) => this.normalizeSearchText(value));
      const series = this.safeJsonParse<any[]>(seriesMatch[1], []);

      charts.push({
        title: this.normalizeSearchText(titleMatch[1]),
        categories,
        series,
      });
    });

    return charts;
  }

  private extractChartData(
    charts: Array<{ title: string; categories: string[]; series: any[] }>,
    titleNeedle: string,
  ): { year: string; value: number }[] {
    const needle = this.normalizeLookup(titleNeedle);
    const chart = charts.find((item) => this.normalizeLookup(item.title).includes(needle));
    if (!chart || !Array.isArray(chart.categories) || !Array.isArray(chart.series)) return [];

    const dataSeries = chart.series.find((item: any) => Array.isArray(item?.data)) || chart.series[0];
    if (!dataSeries || !Array.isArray(dataSeries.data)) return [];

    const out: { year: string; value: number }[] = [];
    chart.categories.forEach((year, index) => {
      const point = dataSeries.data[index];
      const rawValue = typeof point === 'number' ? point : point?.y;
      if (rawValue === undefined || rawValue === null) return;
      const value = this.toNumber(rawValue);
      if (isNaN(value)) return;
      out.push({ year: this.normalizeSearchText(year), value });
    });

    return out;
  }

  private extractPieBreakdown(
    charts: Array<{ title: string; categories: string[]; series: any[] }>,
    titleNeedle: string,
  ): { name: string; value: number }[] {
    const needle = this.normalizeLookup(titleNeedle);
    const chart = charts.find((item) => this.normalizeLookup(item.title).includes(needle));
    if (!chart || !Array.isArray(chart.series)) return [];

    const pieSeries =
      chart.series.find((item: any) => item?.type === 'pie' && Array.isArray(item?.data)) ||
      chart.series.find((item: any) => Array.isArray(item?.data));
    if (!pieSeries || !Array.isArray(pieSeries.data)) return [];

    return pieSeries.data
      .map((item: any) => {
        const name = this.normalizeSearchText(item?.name);
        const value = Math.abs(this.toNumber(item?.y));
        return { name, value };
      })
      .filter((item) => !!item.name && item.value > 0);
  }

  private extractCounterByTitle($: cheerio.CheerioAPI, hrefNeedle: string): number {
    const link = $('#detail-menu a, #detail-risk-list a')
      .filter((_, el) => (($(el).attr('href') || '').includes(hrefNeedle)))
      .first();

    if (!link || link.length === 0) return 0;

    const badgeText =
      this.normalizeSearchText(link.find('.badge').first().text()) ||
      this.normalizeSearchText(link.closest('li').find('.badge').first().text());
    const count = parseInt(badgeText, 10);
    return Number.isFinite(count) ? count : 0;
  }

  private extractRiskFlag($: cheerio.CheerioAPI, titleNeedle: string): boolean | null {
    const needle = this.normalizeLookup(titleNeedle);
    const item = $('#detail-risk-list li')
      .filter((_, el) => this.normalizeLookup($(el).text()).includes(needle))
      .first();

    if (!item || item.length === 0) return null;

    const normalized = this.normalizeLookup(item.text());
    if (normalized.includes('ano')) return true;
    if (normalized.includes('nie')) return false;
    return null;
  }

  private extractFirstDate(raw: any): string | undefined {
    const match = String(raw || '').match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
    return match?.[1];
  }

  private async scrapeFinStat(ico: string): Promise<any> {
    try {
      const { data: html } = await axios.get(`https://www.finstat.sk/${ico}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(html);
      const res: any = {
        tax_debt: 0,
        social_debt: 0,
        health_debt: 0,
        is_bankrupt: false,
        is_in_liquidation: false,
        financials: {},
        indicators: {},
        events_detail: {},
        history_data: {},
        breakdown: {},
        important_dates: {},
      };

      const readByStrongLabel = (labelNeedle: string): string => {
        const item = $('li')
          .filter((_, el) => this.normalizeLookup($(el).find('strong').first().text()).includes(this.normalizeLookup(labelNeedle)))
          .first();
        return this.normalizeSearchText(item.find('span').first().text());
      };

      // Identity fields (name/address/city) are needed when register API is unavailable.
      const header = $('#page-title h1').first();
      const headerClone = header.clone();
      headerClone.find('.subtitle').remove();
      const headerName = this.normalizeSearchText(headerClone.text());
      if (!this.isInvalidIdentityName(headerName)) {
        res.name = headerName;
      }

      const headerSubtitle = this.normalizeSearchText(header.find('.subtitle').first().text());
      if (headerSubtitle) {
        const historicalMatch = headerSubtitle.match(/Historick[ýy]\s+n[aá]zov:\s*(.+?)\)?$/i);
        if (historicalMatch?.[1]) {
          res.historical_name = this.normalizeSearchText(historicalMatch[1]);
        }
      }

      if (this.isInvalidIdentityName(res.name)) {
        const titleName = this.normalizeSearchText($('title').first().text()).split(' - ')[0]?.trim();
        if (!this.isInvalidIdentityName(titleName)) {
          res.name = titleName;
        }
      }

      const sidloItem = $('li')
        .filter((_, el) => this.normalizeSearchText($(el).find('strong').first().text()).toLowerCase().startsWith('sídlo'))
        .first();
      const sidloHtml = sidloItem.find('span').first().html() || '';

      if (sidloHtml) {
        const sidloLines = sidloHtml
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .split(/\n+/)
          .map((line) => this.normalizeSearchText(line))
          .filter((line) => !!line);

        const normalizedName = this.normalizeLookup((res.name || '').split('(')[0]);
        const filteredLines = sidloLines.filter((line) => {
          if (!res.name) return true;
          const normalizedLine = this.normalizeLookup(line);
          if (!normalizedLine) return false;
          if (normalizedLine === normalizedName) return false;
          if (normalizedName && normalizedLine.includes(normalizedName)) return false;
          return true;
        });

        const combinedAddress = this.normalizeSearchText(filteredLines.join(' '));
        if (combinedAddress) {
          res.address = combinedAddress;
          const cityMatch = combinedAddress.match(/\b\d{3}\s?\d{2}\s+(.+)$/);
          if (cityMatch) {
            res.city = this.normalizeSearchText(cityMatch[1]);
          }
        }
      }

      // Registration and business metadata.
      res.dic = this.pickFirstText(readByStrongLabel('DIČ'));
      res.ic_dph = this.pickFirstText(readByStrongLabel('IČ DPH'));
      res.registration_date = this.pickFirstText(readByStrongLabel('Dátum vzniku'));

      const historicalRaw = readByStrongLabel('Historický názov');
      if (historicalRaw) {
        res.historical_name = this.normalizeSearchText(
          historicalRaw
            .replace(/\(platn[eé].*?\)/gi, '')
            .replace(/Zobrazi[ťt]\s+v[šs]etky\s+historick[eé]\s+n[áa]zvy.*$/i, ''),
        );
      }

      const skNaceRaw = readByStrongLabel('SK NACE');
      if (skNaceRaw) {
        res.sk_nace = this.normalizeSearchText(skNaceRaw.split('podľa')[0]);
      }

      const employeesRaw = readByStrongLabel('Kategória zamestnancov');
      if (employeesRaw) {
        const employeesMatch = employeesRaw.match(/\d{4}\s*:\s*(.+)$/);
        res.employees = this.normalizeSearchText(employeesMatch?.[1] || employeesRaw);
      }

      const legalForm = readByStrongLabel('Právna forma');
      if (legalForm) {
        res.legal_form = legalForm;
      }

      const industry = this.normalizeSearchText($('#page-title .breadcrumb a[href*="Activity="]').first().text());
      if (industry) {
        res.industry = industry;
      }

      const normalizedName = this.normalizeLookup(res.name);
      if (normalizedName.includes('konkurz')) {
        res.status = 'v konkurze';
        res.is_bankrupt = true;
      }
      if (normalizedName.includes('likvidac')) {
        res.status = this.pickFirstText(res.status, 'v likvidácii');
        res.is_in_liquidation = true;
      }

      // Financial summary table.
      const financials: any = {};
      $('.detail-company-financial')
        .first()
        .find('tr')
        .each((_, tr) => {
          const label = this.normalizeLookup($(tr).find('.financial-name').first().text());
          const valueText = this.normalizeSearchText($(tr).find('.financial-value').first().text());
          if (!label || !valueText) return;

          if (label.includes('rok')) {
            financials.financial_year = valueText.match(/\d{4}/)?.[0] || valueText;
            return;
          }
          if (label.includes('celkove vynosy')) {
            financials.revenue = this.parseLocalizedNumber(valueText);
            return;
          }
          if (label.includes('strata')) {
            financials.profit = -Math.abs(this.parseLocalizedNumber(valueText));
            return;
          }
          if (label.includes('zisk')) {
            financials.profit = this.parseLocalizedNumber(valueText);
            return;
          }
          if (label.includes('aktiva')) {
            financials.assets = this.parseLocalizedNumber(valueText);
            return;
          }
          if (label.includes('vlastny kapital')) {
            financials.equity = this.parseLocalizedNumber(valueText);
            return;
          }
          if (label.includes('celkova zadlzenost')) {
            financials.debt_ratio = this.parsePercentValue(valueText);
            return;
          }
          if (label.includes('hruba marza')) {
            financials.gross_margin = this.parsePercentValue(valueText);
          }
        });

      financials.is_loss = this.toNumber(financials.profit || 0) < 0;
      financials.negative_equity = this.toNumber(financials.equity || 0) < 0;
      res.financials = financials;

      // Event counters and indicators from risk list/menu.
      const bankruptcyDate = this.extractFirstDate(
        $('#detail-risk-list li')
          .filter((_, el) => this.normalizeLookup($(el).text()).includes('konkurz'))
          .first()
          .text(),
      );
      const orsrDate = this.extractFirstDate(
        $('#detail-risk-list li')
          .filter((_, el) => this.normalizeLookup($(el).text()).includes('posledny zapis v orsr'))
          .first()
          .text(),
      );

      const dlhyFlag = this.extractRiskFlag($, 'Dlhy a nedoplatky');
      const pohladavkyFlag = this.extractRiskFlag($, 'Pohľadávky štátu');
      const docasnaOchranaFlag = this.extractRiskFlag($, 'Dočasná ochrana');
      const dphFlag = this.extractRiskFlag($, 'DPH zoznamy');

      res.indicators = {
        dlhy_nedoplatky: dlhyFlag === true,
        pohladavky_statu: pohladavkyFlag === true,
        has_docasna_ochrana: docasnaOchranaFlag === true,
        dph_status: dphFlag === true ? 'ÁNO' : 'NIE',
      };

      const menuBankruptcies = this.extractCounterByTitle($, '/konkurzy_restrukturalizacie');
      const menuDebts = this.extractCounterByTitle($, '/dlhy_a_pohladavky');
      const menuCourt = this.extractCounterByTitle($, '/sudne_rozhodnutia');
      const menuPayments = this.extractCounterByTitle($, '/platobne_rozkazy');
      const menuExecutions = this.extractCounterByTitle($, '/exekucie');

      res.events_detail = {
        bankruptcies: Math.max(menuBankruptcies, bankruptcyDate ? 1 : 0),
        debts: Math.max(menuDebts, (dlhyFlag ? 1 : 0) + (pohladavkyFlag ? 1 : 0)),
        court_decisions: menuCourt,
        payment_orders: menuPayments,
        executions: menuExecutions,
      };

      res.court_cases = this.toNumber(res.events_detail.court_decisions || 0);
      res.important_dates = {
        bankruptcy: bankruptcyDate,
        orsr_entry: orsrDate,
      };

      if (bankruptcyDate) {
        res.is_bankrupt = true;
      }

      // Financial charts and structure breakdowns.
      const charts = this.extractChartConfigObjects($);
      res.history_data = {
        revenue: this.extractChartData(charts, 'Tržby'),
        profit: this.extractChartData(charts, 'Zisk'),
      };
      res.breakdown = {
        assets: this.extractPieBreakdown(charts, 'Aktíva'),
        liabilities: this.extractPieBreakdown(charts, 'Pasíva'),
      };

      // Basic debt parsing from quick overview
      $('.detail-top .debt').each((_, el) => {
        const text = $(el).text().toLowerCase();
        const value = this.parseLocalizedNumber($(el).find('span').text());
        if (text.includes('daň')) res.tax_debt = value;
        if (text.includes('sociál')) res.social_debt = value;
        if (text.includes('zdravot')) res.health_debt = value;
      });

      // Bankrupt check
      if ($('.alert-danger').text().toLowerCase().includes('konkurz')) {
        res.is_bankrupt = true;
      }

      res.debt_summary = buildDebtSummary(res.debt_summary, {
        tax: res.tax_debt,
        social: res.social_debt,
        health: res.health_debt,
      });

      return res;
    } catch (e) {
      this.logger.error(`FinStat scrape failed for ${ico}: ${this.getErrorMessage(e)}`);
      return {};
    }
  }
}
