import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import AdmZip = require('adm-zip');
import { parseStringPromise } from 'xml2js';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { normalizeIco, parseNumber } from '../companies/utils/company-data.utils';

type Debtor = { ico: string; name: string; amount: number };
export function parseDebtorCsv(text: string): Debtor[] {
  const lines = text.replace(/\uFEFF/g,'').split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) throw new Error('Empty debtor export');
  const delimiter=lines[0].includes(';') ? ';' : ',';
  const split=(line:string) => {
    const cells:string[]=[]; let cell='',quoted=false;
    for(let i=0;i<line.length;i++) {
      if(line[i]==='"') { if(quoted && line[i+1]==='"') {cell+='"';i++;} else quoted=!quoted; }
      else if(line[i]===delimiter && !quoted) {cells.push(cell.trim());cell='';} else cell+=line[i];
    }
    if(quoted) throw new Error('Incomplete quoted CSV row');
    return [...cells,cell.trim()];
  };
  const header=split(lines[0]).map(h=>h.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
  const icoIndex=header.findIndex(h=>h==='ico');
  const amountIndex=header.findIndex(h=>/suma|dlh|nedoplat|dlzna/.test(h));
  const nameIndex=header.findIndex(h=>/nazov|meno|name/.test(h));
  if(icoIndex<0 || amountIndex<0) throw new Error('Export has no reliable ICO/amount columns');
  return lines.slice(1).flatMap(line=>{
    const values=split(line);
    // Official exports can omit leading zeroes, including older five-digit ICOs.
    const identifier=values[icoIndex]?.trim();
    const ico=/^\d{1,8}$/.test(identifier || '') ? identifier.padStart(8,'0') : '';
    if(values.length !== header.length) throw new Error('Truncated or malformed CSV row');
    if(values[icoIndex] && !ico) throw new Error('Invalid company identifier');
    if(!ico) return []; // Individuals without an ICO are outside company coverage.
    const amount=parseNumber(values[amountIndex]);
    if(amount===undefined || amount<0) throw new Error('Invalid debt amount');
    return [{ico,name:values[nameIndex] || '',amount}];
  });
}
export function deduplicateDebtors(records:Debtor[]):Debtor[] {
  const byIco=new Map<string,Debtor>();
  for(const record of records) {
    const previous=byIco.get(record.ico);
    if(previous && previous.amount!==record.amount) throw new Error('Conflicting duplicate ICO in export');
    byIco.set(record.ico,record);
  }
  if(!byIco.size) throw new Error('Empty or unsupported export cannot replace the last snapshot');
  return [...byIco.values()];
}
export function aggregateSocialDebtors(records: Debtor[]): Debtor[] {
  // Sociálna poisťovňa explicitly lists separate registrations for one ICO.
  // Sum these obligations once per published row, in cents, into one company record.
  const companies=new Map<string,Debtor>();
  for(const record of records) {
    const prior=companies.get(record.ico);
    companies.set(record.ico,{...record,amount:(Math.round((prior?.amount || 0)*100)+Math.round(record.amount*100))/100});
  }
  if(!companies.size) throw new Error('Empty social-insurance export');
  return [...companies.values()];
}
@Injectable()
export class DataSyncService {
  private readonly logger=new Logger(DataSyncService.name);
  constructor(private supabase:SupabaseService) {}
  async syncAll() {
    const results:Record<string,number|string>={};
    // Keep only one decompressed feed in memory at a time on Render Free.
    for(const source of ['tax','social'] as const) {
      try { results[source]=await this.syncSource(source); }
      catch(error) {
        results[source]='unavailable';
        this.logger.warn(source+' sync failed: '+error.message);
        await this.supabase.db.from('sync_log').insert({source,status:'error',error_message:String(error.message).slice(0,500)});
      }
    }
    return results;
  }
  private async syncSource(source:'tax'|'social') {
    const started=new Date().toISOString();
    let url='https://report.financnasprava.sk/ds_dsdd.zip';
    if(source==='social') {
      // The official bulk export ID changes on every publication.
      const {data:page}=await axios.get('https://www.socpoist.sk/nastroje-sluzby/zoznam-dlznikov',{timeout:15000,maxContentLength:2*1024*1024});
      const path=String(page).match(/href=["'](\/api\/idsp\/download\/[a-f0-9-]{36})["']/i)?.[1];
      if(!path) throw new Error('Official social-insurance export link is unavailable');
      url='https://www.socpoist.sk'+path;
    }
    const {data}=await axios.get(url,{responseType:'arraybuffer',timeout:30000,maxContentLength:32*1024*1024});
    const buffer=Buffer.from(data);
    let text:string;
    if(buffer.subarray(0,2).toString()==='PK') {
      const zip=new AdmZip(buffer);
      const file=zip.getEntries().find(entry=>!entry.isDirectory && (source==='tax' ? /\.xml$/i : /\.csv$/i).test(entry.entryName));
      if(!file || file.header.size>64*1024*1024) throw new Error('Export is unsupported or exceeds memory budget');
      text=file.getData().toString('utf8');
    } else text=buffer.toString('utf8');
    let records:Debtor[];
    if(source==='social') records=parseDebtorCsv(text);
    else {
      const parsed=await parseStringPromise(text,{explicitArray:false});
      const raw=parsed?.ZoznamDanovychDlznikov?.DS_DSDD?.ITEM || parsed?.ZoznamDlznikov?.Dlznik || [];
      records=(Array.isArray(raw)?raw:[raw]).flatMap(row=>{
        // A name/address similarity is not proof of company identity.
        const ico=normalizeIco(row.ICO || row.Ico || row.ico);
        if(!ico) return [];
        const amount=parseNumber(row.CIASTKA ?? row.SumaDlhu ?? row.suma);
        if(amount===undefined || amount<0) throw new Error('Invalid tax amount');
        return [{ico,name:String(row.NAZOV_SUBJEKTU || row.NazovSubjektu || ''),amount}];
      });
      // Partial identifier coverage would incorrectly turn absent companies into zero debt.
      if(records.length!==(Array.isArray(raw)?raw.length:1)) throw new Error('Tax export lacks complete ICO coverage');
    }
    const rows=source==='social' ? aggregateSocialDebtors(records) : deduplicateDebtors(records);
    const snapshot=randomUUID();
    try {
    for(let i=0;i<rows.length;i+=500) {
      const {error}=await this.supabase.db.from('debt_snapshot_rows').insert(rows.slice(i,i+500).map(row=>({...row,source,snapshot_id:snapshot})));
      if(error) throw new Error('Snapshot upload failed; previous snapshot remains active');
    }
    const {error}=await this.supabase.db.rpc('publish_debt_snapshot',{p_source:source,p_snapshot:snapshot,p_count:rows.length,p_checked_at:started});
    if(error) throw new Error('Snapshot publication failed; previous snapshot remains active');
    return rows.length;
    } catch(error) {
      // Remove only this failed staging upload, never the published snapshot.
      const {data:state,error:stateError}=await this.supabase.db.from('debt_sync_state').select('snapshot_id').eq('source',source).maybeSingle();
      if(!stateError && state?.snapshot_id!==snapshot) await this.supabase.db.from('debt_snapshot_rows').delete().eq('source',source).eq('snapshot_id',snapshot);
      throw error;
    }
  }
  async getSyncStatus() {
    const {data,error}=await this.supabase.db.from('debt_sync_state').select('source,records_count,checked_at');
    if(error) throw new Error('Sync status is unavailable');
    return {sources:data || [],tax_debtors_count:data?.find(r=>r.source==='tax')?.records_count ?? null,
      social_debtors_count:data?.find(r=>r.source==='social')?.records_count ?? null};
  }
}
