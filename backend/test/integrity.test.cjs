const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDebtSummary, parseNumber, requireIco, normalizeIco } = require('../dist/companies/utils/company-data.utils');
const { extractFinancials, extractBreakdown } = require('../dist/companies/utils/financials');
const { parseDebtorCsv, deduplicateDebtors, aggregateSocialDebtors } = require('../dist/monitoring/data-sync.service');
const { CompaniesService } = require('../dist/companies/companies.service');
const { mapLimit } = require('../dist/common/concurrency');
const { validatePushSubscription } = require('../dist/notifications/push-subscription');
const service = () => new CompaniesService({}, { get: () => undefined });
const row = (label, values, tableName = '') => ({ label, values, tableName });

test('a repaid debt replaces the old amount with zero', () => {
  assert.deepEqual(buildDebtSummary({tax: 9500, total: 9500}, {tax: 0, social: '15.25', health: 0}),
    {tax: 0, social: 15.25, health: 0, total: 15.25, sources_count: 1});
});
test('missing and malformed numbers do not become zero', () => {
  for (const value of [null, undefined, '', '—', '12oops', '1,2,3', Infinity]) assert.equal(parseNumber(value), undefined);
  assert.equal(parseNumber('0'), 0); assert.equal(parseNumber('1 234,50'), 1234.5); assert.equal(parseNumber('-100'), -100);
});
test('ICO validation does not extract digits from unrelated text', () => {
  assert.equal(normalizeIco('123456'), '00123456');
  for (const value of ['abc12345678', '1234567890', '../12345678', '']) assert.throws(() => requireIco(value));
});
test('current net assets, zero profit and negative equity retain their meaning', () => {
  const financials = extractFinancials([
    row('SPOLU MAJETOK', [150, 40, 110, 900]), row('Vlastné imanie', [-25, 50]),
    row('Čistý obrat', [1000, 7000]), row('Výsledok hospodárenia za účtovné obdobie po zdanení', [0, 10]),
  ]);
  assert.deepEqual(financials, {assets: 110, equity: -25, revenue: 1000, profit: 0, net_margin: 0});
});
test('micro-entity revenue includes goods plus combined products and services', () => {
  assert.equal(extractFinancials([row('Tržby z predaja tovaru (604, 607)', [52005, 0]),
    row('Tržby z predaja vlastných výrobkov a služieb (601, 602, 606)', [1185, 0])]).revenue, 53190);
  assert.equal(extractFinancials([row('Tržby z predaja tovaru', [52005, 0])]).revenue, undefined);
});
test('unsupported financial layouts and partial pie charts remain unavailable', () => {
  assert.deepEqual(extractFinancials([row('Čistý obrat', [1, 2, 3])]), {});
  assert.deepEqual(extractBreakdown([row('SPOLU MAJETOK', [100]), row('Obežný majetok', [10])]).assets, []);
});
test('debtor CSV honors exact headers, quoted commas and omitted leading zeroes', () => {
  const rows = parseDebtorCsv('\uFEFF"NÁZOV/MENO","DIČ","IČO","DLŽNÁ SUMA"\n"A, s.r.o.","1234567890","15326","1 234,50"');
  assert.deepEqual(rows, [{name: 'A, s.r.o.', ico: '00015326', amount: 1234.5}]);
  assert.throws(() => parseDebtorCsv('DIČ;Suma\n12345678;10'));
  assert.throws(() => parseDebtorCsv('IČO;Suma\n12345678;bad'));
  assert.throws(() => parseDebtorCsv('IČO;Suma\n12345678'));
});
test('tax conflicts fail closed; separate social registrations sum in cents', () => {
  const rows = [{ico:'12345678',name:'A',amount:0.1},{ico:'12345678',name:'A',amount:0.2}];
  assert.throws(() => deduplicateDebtors(rows));
  assert.equal(deduplicateDebtors([rows[0], rows[0]]).length, 1);
  assert.equal(aggregateSocialDebtors(rows)[0].amount, 0.3);
});
test('concurrent requests for one company refresh and save only once', async () => {
  const c = service(); let calls = 0;
  c.refreshCompany = async ico => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return {ico}; };
  const result = await Promise.all(Array.from({length: 12}, () => c.fetchAndStore('12345678')));
  assert.equal(calls, 1); assert.equal(result.length, 12);
  await c.fetchAndStore('12345678'); assert.equal(calls, 2);
});
test('verified cached zero debt does not start another registry refresh', async () => {
  const c = service();
  const cached={ico:'12345678',name:'A',last_checked_at:new Date().toISOString(),risk_score:'unknown',tax_debt:0,
    raw_data:{data_quality:{version:2,debts:{tax:{status:'verified'}}}}};
  c.supabase={db:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:cached})})})})}};
  c.fetchAndStore=()=>{throw Error('Unexpected refresh');};
  assert.equal((await c.getCompany('12345678')).tax_debt,0);
});
test('legacy scraped data is not presented as verified financials or a safe score', () => {
  const c = service(); const formatted=c.formatCompany({ico:'12345678',name:'A',risk_score:'green',tax_debt:12345,
    raw_data:{financials:{revenue:99999},risk_score_numeric:100}});
  assert.equal(formatted.risk_score,'unknown'); assert.equal(formatted.risk_score_numeric,undefined);
  assert.equal(formatted.revenue,undefined); assert.equal(formatted.tax_debt,0);
  assert.equal(formatted.events_detail.court_decisions,undefined);
});
test('registry outage preserves saved data and its original check time', async () => {
  const c=service(),old={ico:'12345678',name:'A',last_checked_at:'2025-01-01',raw_data:{data_quality:{version:2}}};
  c.supabase={db:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:old})})})})}};
  c.fetchFromRpo=async()=>({});c.fetchFromRuz=async()=>({});c.resolveDebtSnapshot=async()=>({});
  const result=await c.fetchAndStore('12345678'); assert.equal(result.last_checked_at,'2025-01-01');assert.equal(result.data_quality.stale,true);
});
test('an unknown ICO is never saved with a fabricated identity', async () => {
  const c=service();c.supabase={db:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})}};
  c.fetchFromRpo=async()=>({});c.fetchFromRuz=async()=>({});c.resolveDebtSnapshot=async()=>({});
  await assert.rejects(c.fetchAndStore('12345678'), /could not be verified/);
});
test('individual financial statements win over consolidated and superseded reports', async () => {
  const c=service();const reports={1:{id:1,obdobieDo:'2025-12',datumPodania:'2026-01-01'},2:{id:2,obdobieDo:'2025-12',datumPodania:'2026-03-01'},3:{id:3,obdobieDo:'2025-12',konsolidovana:true}};
  c.fetchRuzStatementById=async id=>reports[id];
  assert.deepEqual((await c.fetchRuzStatementsForFinancials([1,2,3],8)).map(s=>s.id),[2]);
});
test('bounded parallel work preserves result order', async () => {
  let active=0,max=0;
  const output=await mapLimit([1,2,3,4,5],2,async n=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return n*2;});
  assert.deepEqual(output,[2,4,6,8,10]);assert.equal(max,2);
});
test('push endpoints cannot target local services or imitate an allowed host', () => {
  const keys={p256dh:Buffer.alloc(65).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')};
  for(const endpoint of ['http://127.0.0.1/api','https://fcm.googleapis.com.attacker.example/x','https://fcm.googleapis.com:8443/x','https://user:pass@fcm.googleapis.com/x'])
    assert.throws(()=>validatePushSubscription({endpoint,keys}));
  assert.equal(validatePushSubscription({endpoint:'https://fcm.googleapis.com/fcm/send/example',keys}).endpoint,'https://fcm.googleapis.com/fcm/send/example');
});

test('legacy bankruptcy flags do not contaminate a refreshed assessment', () => {
  const c=service();
  const record={ico:'50847902',name:'Example s.r.o.',is_bankrupt:true,status:'v konkurze',risk_score:'red',
    raw_data:{data_quality:{version:2,identity:{status:'partial'},debts:{}},ruz:{unit:{nazovUJ:'Example s.r.o.'}}}};
  const result=c.formatCompany(record);
  assert.equal(result.is_bankrupt,undefined);
  assert.equal(result.events_detail.bankruptcies,undefined);
  assert.equal(result.risk_score,'unknown');
  assert.equal(result.status,'');
  record.raw_data.ruz.unit.nazovUJ='Example s.r.o. v konkurze';
  assert.equal(c.formatCompany(record).is_bankrupt,true);
  assert.equal(c.formatCompany(record).risk_score,'red');
});
