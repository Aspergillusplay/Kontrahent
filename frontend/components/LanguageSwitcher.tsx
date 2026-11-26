'use client';

import { Languages } from 'lucide-react';
import { useI18n } from '../lib/i18n/provider';

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <footer className="border-t border-slate-800 px-4 py-3">
      <div role="group" aria-label={t('language.switch')} className="mx-auto flex max-w-7xl items-center justify-end gap-1">
        <span className="px-2 text-slate-400" title={t('language.switch')}>
          <Languages className="h-4 w-4" />
        </span>
        <button
          type="button"
          onClick={() => setLocale('en')}
          aria-pressed={locale === 'en'}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            locale === 'en' ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLocale('sk')}
          aria-pressed={locale === 'sk'}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            locale === 'sk' ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          SK
        </button>
      </div>
    </footer>
  );
}
