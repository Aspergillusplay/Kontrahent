'use client';
import Link from 'next/link';
import AppHeader from '../../components/AppHeader';
import { useI18n } from '../../lib/i18n/provider';

export default function AboutData() {
  const { locale } = useI18n();
  const sk = locale === 'sk';
  return <div className="min-h-screen bg-slate-950"><AppHeader />
    <main className="max-w-3xl mx-auto px-5 py-12 space-y-8 text-slate-300 leading-relaxed">
      <h1 className="text-3xl font-bold text-slate-100">{sk ? 'Údaje a ich dostupnosť' : 'Data and availability'}</h1>
      <section id="coverage" className="card space-y-3">
        <h2 className="text-xl font-semibold">{sk ? 'Zdroje a presnosť' : 'Sources and accuracy'}</h2>
        <p>{sk ? 'Identifikačné údaje pochádzajú z RPO a účtovné výkazy z RÚZ. Zobrazený rok označuje obdobie výkazu, nie dátum dnešnej kontroly. Individuálne a konsolidované výkazy sa nemiešajú.' : 'Company identity comes from RPO and accounting statements from RUZ. The displayed financial year identifies the reporting period, not today’s check date. Individual and consolidated statements are kept separate.'}</p>
        <p>{sk ? 'Pomlčka znamená nedostupný údaj. Nula pri dlhu znamená, že vo overenej snímke zdroja nie je zverejnená suma. Zoznamy majú publikačné lehoty a prahové hodnoty; nejde o potvrdenie bezdlžnosti. Daňové dlhy bez spoľahlivého identifikátora firmy nepriraďujeme podľa názvu.' : 'A dash means unavailable data. A zero debt amount means no amount is published in the verified source snapshot. Registers have publication delays and thresholds; this is not a certificate of no debt. Tax debts without a reliable company identifier are not assigned by name.'}</p>
        <p>{sk ? 'Hodnotenie je orientačné a pri neúplných zdrojoch môže zostať nevyhodnotené. Katalóg a jeho filtre zahŕňajú len indexované firmy. Staré neoverené udalosti sa v histórii nezobrazujú.' : 'The assessment is indicative and may remain unassessed when coverage is incomplete. The directory and its filters cover indexed companies. Legacy unverified events are excluded from the visible history.'}</p>
        <div className="flex flex-wrap gap-4 text-brand-400 underline">
          <a href="https://rpo.statistics.sk/" target="_blank" rel="noreferrer">RPO</a>
          <a href="https://www.registeruz.sk/" target="_blank" rel="noreferrer">RÚZ</a>
          <a href="https://www.socpoist.sk/nastroje-sluzby/zoznam-dlznikov" target="_blank" rel="noreferrer">Sociálna poisťovňa</a>
        </div>
      </section>
      <section id="account" className="card space-y-3">
        <h2 className="text-xl font-semibold">{sk ? 'Účet a upozornenia' : 'Account and notifications'}</h2>
        <p>{sk ? 'Účet obsahuje e-mail, meno, zoznam sledovaných firiem a nastavenia upozornení. Vlastný zoznam a upozornenia sú dostupné len prihlásenému vlastníkovi. Telegram a push vyžadujú dobrovoľné pripojenie príslušného kanála.' : 'Your account contains your email, name, watchlist and notification settings. Private lists and alerts are available only to their signed-in owner. Telegram and push require you to connect the respective channel.'}</p>
        <p>{sk ? 'Aplikácia používa bezplatné služby Vercel, Render a Supabase. Server môže po nečinnosti spať a prvé načítanie môže trvať približne minútu. Upozornenia prichádzajú po úspešnom obnovení údajov; okamžité doručenie ani nepretržitá dostupnosť nie sú garantované.' : 'The app uses free Vercel, Render and Supabase services. The server can sleep after inactivity, and the first request can take about a minute. Alerts follow successful data updates; immediate delivery and continuous availability are not guaranteed.'}</p>
      </section>
      <Link href="/search" className="btn-primary inline-flex">{sk ? 'Vyhľadať firmu' : 'Find a company'}</Link>
    </main>
  </div>;
}
