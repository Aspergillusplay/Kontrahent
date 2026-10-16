import { enUS, sk } from 'date-fns/locale';
import { AppLocale } from './config';

export function toIntlLocale(locale: AppLocale): string {
  return locale === 'sk' ? 'sk-SK' : 'en-US';
}

export function toDateFnsLocale(locale: AppLocale) {
  return locale === 'sk' ? sk : enUS;
}

export function formatCurrencyValue(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumberValue(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(toIntlLocale(locale)).format(value);
}
