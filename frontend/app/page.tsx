'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shield, Bell, BarChart3, Zap, ArrowRight, LayoutDashboard } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n/provider';

export default function LandingPage() {
  const { t } = useI18n();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabase();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="text-brand-500 w-6 h-6" />
            <span className="font-bold text-xl tracking-tight">Kontrahent<span className="text-brand-500">.sk</span></span>
          </Link>
          <div className="flex items-center gap-3">
            {!loading && (
              user ? (
                <Link href="/dashboard" className="btn-primary text-sm flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4" /> {t('nav.dashboard')}
                </Link>
              ) : (
                <>
                  <Link href="/auth/login" className="btn-ghost text-sm">{t('nav.signIn')}</Link>
                  <Link href="/auth/register" className="btn-primary text-sm">{t('nav.startFree')}</Link>
                </>
              )
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-1.5 text-brand-400 text-sm mb-8">
          <Zap className="w-3.5 h-3.5" />
          {t('landing.banner')}
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
          {t('landing.heroLine1')}
          <br />
          <span className="text-brand-500">{t('landing.heroTrust')}</span>
        </h1>

        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          {t('landing.heroDescription')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {user ? (
            <Link href="/dashboard" className="btn-primary px-8 py-3 text-base flex items-center gap-2">
              {t('landing.goDashboard')} <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link href="/auth/register" className="btn-primary px-8 py-3 text-base flex items-center gap-2">
                {t('landing.tryFree')} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/dashboard?demo=true" className="btn-ghost px-8 py-3 text-base border border-slate-800">
                {t('landing.demoDashboard')} ->
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Live demo ICO search */}
      <section className="max-w-2xl mx-auto px-6 pb-16">
        <div className="card">
          <h3 className="text-sm font-medium text-slate-400 mb-3">{t('landing.tryNowTitle')}</h3>
          <form action="/search" method="get" className="flex gap-3">
            <input
              name="q"
              placeholder={t('landing.tryNowPlaceholder')}
              className="input flex-1 font-mono"
            />
            <button type="submit" className="btn-primary px-6">
              {t('landing.tryNowButton')}
            </button>
          </form>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <Bell className="w-5 h-5 text-brand-400" />,
              title: t('landing.featureAlertsTitle'),
              desc: t('landing.featureAlertsDesc'),
            },
            {
              icon: <BarChart3 className="w-5 h-5 text-brand-400" />,
              title: t('landing.featureSignalsTitle'),
              desc: t('landing.featureSignalsDesc'),
            },
            {
              icon: <Shield className="w-5 h-5 text-brand-400" />,
              title: t('landing.featureSourcesTitle'),
              desc: t('landing.featureSourcesDesc'),
            },
          ].map((f, i) => (
            <div key={i} className="card hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Free access notice */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="card border border-emerald-500/20 bg-emerald-500/5 text-center">
          <h2 className="text-3xl font-bold mb-3">{t('landing.freeTitle')}</h2>
          <p className="text-slate-300 max-w-2xl mx-auto mb-6">
            {t('landing.freeDescription')}
          </p>
          {!loading && !user && (
            <Link href="/auth/register" className="btn-primary px-8 py-3 text-base inline-flex items-center gap-2">
              {t('landing.createFree')} <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Shield className="w-4 h-4" />
            © 2025 Kontrahent.sk - {t('landing.footer')}
          </div>
          <div className="flex gap-6 text-sm text-slate-500">
            <Link href="/privacy" className="hover:text-slate-300">{t('landing.privacy')}</Link>
            <Link href="/terms" className="hover:text-slate-300">{t('landing.terms')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
