'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppLocale, DEFAULT_LOCALE, LOCALES, LOCALE_STORAGE_KEY } from './config';
import { messages, TranslationParams } from './messages';

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, params?: TranslationParams) => string;
  availableLocales: readonly AppLocale[];
};

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
    const value = params[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (savedLocale === 'en' || savedLocale === 'sk') {
      setLocaleState(savedLocale);
      return;
    }

    const browserLocale = window.navigator.language.toLowerCase();
    if (browserLocale.startsWith('sk')) {
      setLocaleState('sk');
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const t = useCallback((key: string, params?: TranslationParams) => {
    const localized = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE][key] ?? key;
    return interpolate(localized, params);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, availableLocales: LOCALES }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
