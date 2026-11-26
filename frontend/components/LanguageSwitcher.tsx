'use client';

import { Languages } from 'lucide-react';
import { useI18n } from '../lib/i18n/provider';

export default function LanguageSwitcher() {
  const { locale, setLocale, t, availableLocales } = useI18n();

  return (
    <div className="language-dock">
      <div role="group" aria-label={t('language.switch')} className="inline-flex items-center gap-0.5 rounded-xl border border-slate-700 bg-slate-900 p-0.5 shadow-md">
        <Languages aria-hidden="true" size={16} className="mx-1.5 text-slate-400" />
        {availableLocales.map(code => <button
          key={code}
          type="button"
          lang={code}
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={`min-h-11 min-w-11 rounded-lg text-xs font-bold ${locale === code ? 'bg-brand-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
        >{code.toUpperCase()}</button>)}
      </div>
    </div>
  );
}
