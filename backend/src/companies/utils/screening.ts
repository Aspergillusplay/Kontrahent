type Observation = {status?: string; checked_at?: string};
type Coverage = {version?: number; identity?: Observation; financials?: Observation; debts?: {social?: Observation}};

export function screenCompany(quality: Coverage | undefined, financials: {financial_year?: string; profit?: number; equity?: number},
  socialDebt: number | null, now = new Date()) {
  const checkedRecently = (observation?: Observation) => {
    const age = now.getTime() - Date.parse(observation?.checked_at || '');
    return observation?.status === 'verified' && age >= 0 && age < 7 * 86400000;
  };
  const verified = quality?.version === 2 && quality.identity?.status === 'verified';
  const year = Number(financials.financial_year);
  const useAccounts = verified && checkedRecently(quality.financials) &&
    year >= now.getUTCFullYear() - 2 && year <= now.getUTCFullYear();
  return {
    nonnegative_profit: useAccounts && Number.isFinite(financials.profit) ? financials.profit >= 0 : null,
    positive_equity: useAccounts && Number.isFinite(financials.equity) ? financials.equity > 0 : null,
    no_social_arrears: verified && checkedRecently(quality.debts?.social) && Number.isFinite(socialDebt) ?
      socialDebt === 0 : null,
  };
}
