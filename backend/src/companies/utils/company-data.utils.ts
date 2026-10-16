import { BadRequestException } from '@nestjs/common';
import { CompanyRiskData } from '../dto/company.dto';

type DebtSummary = NonNullable<CompanyRiskData['debt_summary']>;

type TopLevelDebt = {
  tax: unknown;
  social: unknown;
  health: unknown;
};

export function toNumberSafe(value: unknown): number {
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const normalized = String(value).replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeIco(value: unknown): string {
  const text = String(value ?? '').trim();
  return /^\d{6,8}$/.test(text) ? text.padStart(8, '0') : '';
}

export function requireIco(value: unknown): string {
  const ico = normalizeIco(value);
  if (!ico) throw new BadRequestException('ICO must contain 6 to 8 digits');
  return ico;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function buildDebtSummary(rawSummary: Partial<DebtSummary> | undefined, topLevel: TopLevelDebt): DebtSummary {
  const tax = Math.max(0, toNumberSafe(topLevel.tax ?? rawSummary?.tax));
  const social = Math.max(0, toNumberSafe(topLevel.social ?? rawSummary?.social));
  const health = Math.max(0, toNumberSafe(topLevel.health ?? rawSummary?.health));
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
  const numeric = parseNumber(rawNumeric);
  if (numeric !== undefined) return Math.max(0, Math.min(100, numeric));

  if (rawRiskScore === 'green') return 100;
  if (rawRiskScore === 'yellow') return 60;
  return 20;
}
