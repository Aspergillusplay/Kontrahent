import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { SupabaseService } from '../supabase/supabase.service';
import { parseStringPromise } from 'xml2js';

/**
 * DataSyncService
 *
 * Downloads official CSV/XML files from public debtor registries
 * and stores them in local DB tables. This provides:
 * - Fast ICO lookup without external requests
 * - Better resilience when remote APIs are unavailable
 * - Full snapshot coverage (not only previously requested companies)
 *
 * Sources:
 *  1. Financial Administration SR - tax debtors (XML/ZIP)
 *  2. Social Insurance Agency - social debtors (CSV/ZIP)
 *  3. Business registry data via Ekosystem API
 */
@Injectable()
export class DataSyncService {
  private readonly logger = new Logger(DataSyncService.name);

  // Official URLs for public registries
  private readonly SOURCES = {
    // Financial Administration - current ZIP export with XML
    TAX_DEBTORS_ZIP:
      'https://report.financnasprava.sk/ds_dsdd.zip',

    // Legacy URL (fallback)
    TAX_DEBTORS_XML_LEGACY:
      'https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Zverejnovanie_dlznikov/zoznam_dlznikov_sf.xml',

    // Legacy URL (fallback)
    TAX_DEBTORS_CSV_LEGACY:
      'https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Zverejnovanie_dlznikov/zoznam_dlznikov_sf.csv',

    // Social Insurance Agency page with debtor archive links
    SOCIAL_DEBTORS_PAGE:
      'https://www.socpoist.sk/nastroje-sluzby/zoznam-dlznikov',

    // Direct fallback ZIP link (can change over time)
    SOCIAL_DEBTORS_ZIP_FALLBACK:
      'https://www.socpoist.sk/api/idsp/download/7946c279-f0b4-451a-b199-a317f675e6cf',
  } as const;

  constructor(
    private supabase: SupabaseService,
    private config: ConfigService,
  ) {}

  // ──────────────────────────────────────────────────────────
  // CRON: synchronize debtor lists every day at 02:00
  // ──────────────────────────────────────────────────────────
  @Cron('0 2 * * *', {
    name: 'sync-debtors',
    timeZone: 'Europe/Bratislava',
  })
  async syncAll() {
    this.logger.log('🔄 Starting debtor registry synchronization...');

    const results = await Promise.allSettled([
      this.syncTaxDebtors(),
      this.syncSocialDebtors(),
    ]);

    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        this.logger.error(`Sync [${i}] failed: ${result.reason}`);
      }
    }

    this.logger.log('✅ Synchronization finished');
  }

  // ──────────────────────────────────────────────────────────
  // 1. Tax debtors - Financial Administration SR
  // ──────────────────────────────────────────────────────────
  async syncTaxDebtors(): Promise<number> {
    this.logger.log('📥 Downloading tax debtor list...');

    let records: TaxDebtorRecord[] = [];

    // 1) Current ZIP/XML export
    try {
      records = await this.fetchTaxDebtorsZipXml();
      this.logger.log(`  ZIP/XML: ${records.length} records`);
    } catch (xmlErr) {
      this.logger.warn(`ZIP/XML unavailable (${xmlErr.message}), trying legacy URL...`);
    }

    // 2) Legacy fallback (old XML)
    if (records.length === 0) {
      try {
        records = await this.fetchTaxDebtorsXmlLegacy();
        this.logger.log(`  Legacy XML: ${records.length} records`);
      } catch (legacyXmlErr) {
        this.logger.warn(`Legacy XML unavailable (${legacyXmlErr.message}), trying legacy CSV...`);
      }
    }

    // 3) Legacy CSV fallback
    if (records.length === 0) {
      try {
        records = await this.fetchTaxDebtorsCsvLegacy();
        this.logger.log(`  Legacy CSV: ${records.length} records`);
      } catch (csvErr) {
        this.logger.error(`All tax-debtor sources are unavailable: ${csvErr.message}`);
        return 0;
      }
    }

    if (records.length === 0) return 0;

    // Store in DB in batches of 1000
    await this.upsertDebtors('tax_debtors', records);
    this.logger.log(`✅ Tax debtors: ${records.length} records synchronized`);
    return records.length;
  }

  private async fetchTaxDebtorsZipXml(): Promise<TaxDebtorRecord[]> {
    const { data: zipBuffer } = await axios.get(this.SOURCES.TAX_DEBTORS_ZIP, {
      timeout: 30000,
      responseType: 'arraybuffer',
    });

    const xmlText = this.extractFirstTextFileFromZip(zipBuffer, ['.xml']);
    const parsed = await parseStringPromise(xmlText, {
      explicitArray: false,
      ignoreAttrs: false,
    });

    const dlznici =
      parsed?.ZoznamDanovychDlznikov?.DS_DSDD?.ITEM ||
      parsed?.ZoznamDlznikov?.Dlznik ||
      parsed?.zoznam?.dlznik ||
      [];

    const list = Array.isArray(dlznici) ? dlznici : [dlznici];

    const mapped = list
      .filter((d: any) => d)
      .map((d: any) => {
        const name = d?.NAZOV_SUBJEKTU || d?.NazovSubjektu || d?.nazov || d?.Nazov || '';
        const ico = this.normalizeIco(
          d?.ICO || d?.ico || d?.Ico || d?.IC || this.extractIcoFromText(name),
        );

        return {
          ico,
          name,
          debt_amount: this.toAmount(d?.CIASTKA || d?.SumaDlhu || d?.suma_dlhu || d?.suma || '0'),
          debt_type: 'tax',
          source: 'financna_sprava',
          synced_at: new Date().toISOString(),
        } as TaxDebtorRecord;
      })
      .filter((d) => d.ico && d.ico.length >= 6);

    if (list.length > 0 && mapped.length === 0) {
      this.logger.warn(
        'Tax export was loaded, but no ICO column was found. Tax debt data cannot be mapped reliably by ICO.',
      );
    }

    return mapped;
  }

  private async fetchTaxDebtorsXmlLegacy(): Promise<TaxDebtorRecord[]> {
    const { data: xmlText } = await axios.get(this.SOURCES.TAX_DEBTORS_XML_LEGACY, {
      timeout: 30000,
      responseType: 'text',
      headers: { 'Accept-Encoding': 'gzip, deflate' },
    });

    const parsed = await parseStringPromise(xmlText, {
      explicitArray: false,
      ignoreAttrs: false,
    });

    // XML structure: <ZoznamDlznikov><Dlznik>...</Dlznik></ZoznamDlznikov>
    const dlznici =
      parsed?.ZoznamDlznikov?.Dlznik ||
      parsed?.zoznam?.dlznik ||
      [];

    const list = Array.isArray(dlznici) ? dlznici : [dlznici];

    return list
      .filter((d: any) => d)
      .map((d: any) => ({
        ico: this.normalizeIco(d?.ICO || d?.ico || d?.Ico || ''),
        name: d?.NazovSubjektu || d?.nazov || d?.Nazov || '',
        debt_amount: parseFloat(
          String(d?.SumaDlhu || d?.suma_dlhu || d?.suma || '0').replace(',', '.'),
        ) || 0,
        debt_type: 'tax',
        source: 'financna_sprava',
        synced_at: new Date().toISOString(),
      }))
      .filter((d) => d.ico && d.ico.length >= 6);
  }

  private async fetchTaxDebtorsCsvLegacy(): Promise<TaxDebtorRecord[]> {
    const { data: csvText } = await axios.get(this.SOURCES.TAX_DEBTORS_CSV_LEGACY, {
      timeout: 30000,
      responseType: 'text',
    });

    return this.parseCsv(csvText, 'tax', 'financna_sprava');
  }

  // ──────────────────────────────────────────────────────────
  // 2. Social Insurance Agency - social debtors
  // ──────────────────────────────────────────────────────────
  async syncSocialDebtors(): Promise<number> {
    this.logger.log('📥 Downloading Social Insurance debtors list...');

    try {
      const url = await this.findSocialDebtorsUrl();
      if (!url) {
        this.logger.warn('Social Insurance debtors URL was not found');
        return 0;
      }

      const { data: payload, headers } = await axios.get(url, {
        timeout: 30000,
        responseType: 'arraybuffer',
      });

      const contentType = String(headers?.['content-type'] || '').toLowerCase();
      let csvText = '';

      if (contentType.includes('zip') || url.toLowerCase().endsWith('.zip')) {
        csvText = this.extractFirstTextFileFromZip(payload, ['.csv', '.txt']);
      } else {
        csvText = Buffer.from(payload).toString('utf8');
      }

      const records = this.parseCsv(csvText, 'social', 'socialna_poistovna');

      if (records.length === 0) {
        this.logger.warn('Social Insurance CSV is empty or could not be parsed');
        return 0;
      }

      await this.upsertDebtors('social_debtors', records);
      this.logger.log(`✅ Social debtors: ${records.length} records synchronized`);
      return records.length;
    } catch (err) {
      this.logger.error(`SP sync error: ${err.message}`);
      return 0;
    }
  }

  /**
   * Resolves the current Social Insurance debtors ZIP/CSV URL from the source page.
   */
  private async findSocialDebtorsUrl(): Promise<string | null> {
    try {
      const { data: html } = await axios.get(this.SOURCES.SOCIAL_DEBTORS_PAGE, {
        timeout: 10000,
        responseType: 'text',
      });

      const match = html.match(/href=["']([^"']*\/api\/idsp\/download\/[^"']+)["']/i);
      if (match?.[1]) {
        return match[1].startsWith('http')
          ? match[1]
          : `https://www.socpoist.sk${match[1]}`;
      }
    } catch (err) {
      this.logger.warn(`Social Insurance URL lookup failed: ${err.message}`);
    }

    return this.SOURCES.SOCIAL_DEBTORS_ZIP_FALLBACK;
  }

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────

  private parseCsv(
    csvText: string,
    debtType: string,
    source: string,
  ): TaxDebtorRecord[] {
    const lines = csvText
      .replace(/\uFEFF/g, '')
      .replace(/\r/g, '')
      .split('\n')
      .filter((l) => l.trim());

    if (lines.length < 2) return [];

    const delimiter = this.detectDelimiter(lines[0]);
    const header = this.parseDelimitedLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
    const records: TaxDebtorRecord[] = [];

    // Resolve CSV column indexes with tolerant matching
    const icoIdx = this.findColumnIndex(header, ['ico', 'ičo', 'ic']);
    const nameIdx = this.findColumnIndex(header, [
      'nazov', 'názov', 'meno', 'name', 'obchodne_meno', 'nazov_subjektu',
    ]);
    const debtIdx = this.findColumnIndex(header, [
      'dlžná suma', 'dlzna suma', 'suma', 'dlh', 'suma_dlhu', 'vyska_nedoplatku', 'dlzna_suma',
    ]);

    if (icoIdx === -1) {
      this.logger.warn(`CSV: ICO column was not found in header: ${header.join(', ')}`);
      return [];
    }

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseDelimitedLine(lines[i], delimiter).map((c) => c.trim());
      const ico = this.normalizeIco(cols[icoIdx] || '');
      if (!ico) continue;

      records.push({
        ico,
        name: nameIdx >= 0 ? (cols[nameIdx] || '') : '',
        debt_amount: debtIdx >= 0 ? this.toAmount(cols[debtIdx] || '0') : 0,
        debt_type: debtType,
        source,
        synced_at: new Date().toISOString(),
      });
    }

    return records;
  }

  private extractFirstTextFileFromZip(zipBuffer: any, preferredExtensions: string[]): string {
    const zip = new AdmZip(Buffer.from(zipBuffer));
    const entries = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .sort((a, b) => a.entryName.localeCompare(b.entryName));

    for (const ext of preferredExtensions) {
      const entry = entries.find((candidate) =>
        candidate.entryName.toLowerCase().endsWith(ext.toLowerCase()),
      );
      if (entry) {
        return entry.getData().toString('utf8');
      }
    }

    const first = entries[0];
    if (!first) return '';
    return first.getData().toString('utf8');
  }

  private extractIcoFromText(raw: string): string {
    const match = String(raw || '').match(/\b\d{8}\b/);
    return match?.[0] || '';
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
      const idx = header.findIndex((h) => h.includes(kw));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  private normalizeIco(raw: string): string {
    const cleaned = String(raw).replace(/\D/g, '').trim();
    if (cleaned.length < 6 || cleaned.length > 10) return '';
    return cleaned.padStart(8, '0');
  }

  private async upsertDebtors(
    table: 'tax_debtors' | 'social_debtors',
    records: TaxDebtorRecord[],
  ): Promise<void> {
    const BATCH_SIZE = 1000;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await this.supabase.db
        .from(table)
        .upsert(batch, { onConflict: 'ico' });

      if (error) {
        this.logger.error(`Upsert error (${table}, batch ${i}): ${error.message}`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // Public lookup from local DB (used by CompaniesService)
  // ──────────────────────────────────────────────────────────

  async getTaxDebt(ico: string): Promise<number> {
    const normalized = ico.padStart(8, '0');
    const { data } = await this.supabase.db
      .from('tax_debtors')
      .select('debt_amount')
      .eq('ico', normalized)
      .maybeSingle();

    return data?.debt_amount ?? 0;
  }

  async getSocialDebt(ico: string): Promise<number> {
    const normalized = ico.padStart(8, '0');
    const { data } = await this.supabase.db
      .from('social_debtors')
      .select('debt_amount')
      .eq('ico', normalized)
      .maybeSingle();

    return data?.debt_amount ?? 0;
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const [taxCount, socialCount] = await Promise.all([
      this.supabase.db.from('tax_debtors').select('*', { count: 'exact', head: true }),
      this.supabase.db.from('social_debtors').select('*', { count: 'exact', head: true }),
    ]);

    const { data: lastSync } = await this.supabase.db
      .from('sync_log')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      tax_debtors_count: taxCount.count || 0,
      social_debtors_count: socialCount.count || 0,
      last_sync: lastSync?.synced_at || null,
    };
  }

  /** Manual synchronization trigger (admin use). */
  async triggerManualSync(): Promise<{ tax: number; social: number }> {
    const [tax, social] = await Promise.all([
      this.syncTaxDebtors(),
      this.syncSocialDebtors(),
    ]);
    return { tax, social };
  }
}

interface TaxDebtorRecord {
  ico: string;
  name: string;
  debt_amount: number;
  debt_type: string;
  source: string;
  synced_at: string;
}

export interface SyncStatus {
  tax_debtors_count: number;
  social_debtors_count: number;
  last_sync: string | null;
}
