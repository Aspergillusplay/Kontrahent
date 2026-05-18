'use client';

import { Languages } from 'lucide-react';
import { useI18n } from '../lib/i18n/provider';

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-slate-700 bg-slate-900/90 p-1 shadow-xl backdrop-blur-sm">
      <div className="flex items-center gap-1">
        <span className="px-2 text-slate-400" title={t('language.switch')}>
          <Languages className="h-4 w-4" />
        </span>
        <button
          type="button"
          onClick={() => setLocale('en')}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            locale === 'en' ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLocale('sk')}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            locale === 'sk' ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          SK
        </button>
      </div>
    </div>
  );
}
