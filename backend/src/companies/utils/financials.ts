type Row = { label: string; tableName: string; values: number[]; lineNo?: number; templateId?: number; invalidCurrent?: boolean };
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const currentValue = (row: Row): number | undefined => {
  // Standard RUZ assets: gross, adjustment, current net, prior net.
  // Two-column balance/income reports: current, prior. Unknown layouts are not guessed.
  const index = row.values.length === 4 ? 2 : row.values.length <= 2 ? 0 : -1;
  const value = row.values[index];
  return Number.isFinite(value) ? value : undefined;
};
const current = currentValue;
// Some statutory forms leave unused sales lines blank. Accept the reported
// sales components only when all rows exist and reconcile to operating income.
function reconciledSales(rows: Row[]): number | undefined {
  const total = rows.find(row => norm(row.label).startsWith('vynosy z hospodarskej cinnosti spolu') &&
    ((row.templateId === 687 && row.lineNo === 1) || (row.templateId === 699 && row.lineNo === 2)));
  if (!total || current(total) === undefined) return undefined;
  const micro = total.templateId === 687;
  const last = micro ? 7 : 9;
  const lastSale = micro ? 3 : 5;
  const parts = rows.filter(row => row.templateId === total.templateId && row.tableName === total.tableName &&
    row.lineNo > total.lineNo && row.lineNo <= last);
  if (parts.length !== last - total.lineNo || new Set(parts.map(row => row.lineNo)).size !== parts.length ||
      parts.some(row => row.values.length !== 2 || row.invalidCurrent)) return undefined;
  const sales = parts.filter(row => row.lineNo <= lastSale);
  const sum = (items: Row[]) => items.reduce((value, row) => value + (current(row) ?? 0), 0);
  if (!sales.some(row => current(row) !== undefined) || sum(parts) !== current(total)) return undefined;
  return sum(sales);
}
export function extractFinancials(rows: Row[]): Record<string, any> {
  const find = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const row = rows.find(r => pattern.test(norm(r.label)) && current(r) !== undefined);
      if (row) return current(row);
    }
    return undefined;
  };
  let revenue = find([/^cisty obrat\b/, /^trzby za vlastne vykony a tovar\b/]);
  if (revenue === undefined) {
    const goods = find([/^trzby (z predaja|za predaj) tovaru\b/]);
    const productsAndServices = find([/^trzby (z predaja|za predaj) vlastnych vyrobkov a sluzieb\b/]);
    if (goods !== undefined && productsAndServices !== undefined) revenue = goods + productsAndServices;
  }
  if (revenue === undefined) {
    const components = [find([/^trzby (z predaja|za predaj) tovaru\b/]), find([/^trzby (z predaja|za predaj) vlastnych vyrobkov\b/]), find([/^trzby (z predaja|za predaj) sluzieb\b/])];
    if (components.every(v => v !== undefined)) revenue = components.reduce((a, b) => a + b, 0);
  }
  revenue ??= reconciledSales(rows);
  const profit = find([/^vysledok hospodarenia za uctovne obdobie po zdaneni\b/, /^vysledok hospodarenia po zdaneni\b/]);
  const assets = find([/^spolu majetok\b/, /^majetok spolu\b/, /^aktiva spolu\b/]);
  const equity = find([/^vlastne imanie\b(?! a zavazky)/, /^vlastne zdroje krytia\b/]);
  return Object.fromEntries(Object.entries({ revenue, profit, assets, equity,
    net_margin: revenue > 0 && profit !== undefined ? profit / revenue * 100 : undefined,
  }).filter(([,value]) => value !== undefined));
}
export function extractBreakdown(rows: Row[]) {
  const select = (patterns: RegExp[]) => patterns.flatMap(pattern => {
    const row = rows.find(r => pattern.test(norm(r.label)));
    const value = row && current(row);
    return row && value > 0 ? [{ name: row.label, value }] : [];
  });
  const totals = extractFinancials(rows);
  // A partial pie chart wrongly implies that its visible categories form 100%.
  const complete = (parts: { name: string; value: number }[], total: number) =>
    total > 0 && Math.abs(parts.reduce((sum, p) => sum + p.value, 0) - total) <= 1 ? parts : [];
  return {
    assets: complete(select([/^neobezny majetok\b/, /^obezny majetok\b/, /^casove rozlisenie\b/]), totals.assets),
    liabilities: complete(select([/^vlastne imanie\b(?! a zavazky)/, /^zavazky\b/]), totals.assets),
  };
}
