export const LOCALES = ['en', 'sk'] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';

export const LOCALE_STORAGE_KEY = 'kontrahent.locale';
