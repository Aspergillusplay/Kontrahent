import { CompanyRiskData } from '../dto/company.dto';

type DebtSummary = NonNullable<CompanyRiskData['debt_summary']>;

type TopLevelDebt = {
  tax: unknown;
  social: unknown;
  health: unknown;
};

export function toNumberSafe(value: unknown): number {
  const parsed = parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function buildDebtSummary(rawSummary: Partial<DebtSummary> | undefined, topLevel: TopLevelDebt): DebtSummary {
  const tax = Math.max(toNumberSafe(rawSummary?.tax), toNumberSafe(topLevel.tax));
  const social = Math.max(toNumberSafe(rawSummary?.social), toNumberSafe(topLevel.social));
  const health = Math.max(toNumberSafe(rawSummary?.health), toNumberSafe(topLevel.health));
  const total = tax + social + health;

  return {
    tax,
    social,
    health,
    total,
    sources_count: [tax, social, health].filter((value) => value > 0).length,
  };
}

export function sanitizeDisplayName(rawName: unknown): string {
  const normalized = normalizeText(rawName);
  return normalized.replace(/\s*\(Historick[ýy]\s+n[aá]zov:[^)]+\)\s*$/i, '').trim() || normalized;
}

export function sanitizeDisplayAddress(rawAddress: unknown, ...nameCandidates: unknown[]): string {
  let address = normalizeText(rawAddress);

  for (const candidate of nameCandidates) {
    const name = normalizeText(candidate);
    if (!name) continue;
    if (address.startsWith(name)) {
      address = address.slice(name.length).trim();
    }
  }

  return address;
}

export function toRiskNumeric(rawNumeric: unknown, rawRiskScore: unknown): number {
  const numeric = toNumberSafe(rawNumeric);
  if (numeric > 0) return numeric;

  if (rawRiskScore === 'green') return 100;
  if (rawRiskScore === 'yellow') return 60;
  return 20;
}
