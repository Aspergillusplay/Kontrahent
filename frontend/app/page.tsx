"use client";

import { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import {
  LandingDemoSearchSection,
  LandingFeaturesSection,
  LandingFooterSection,
  LandingFreeAccessSection,
  LandingHeaderActions,
  LandingHeroSection,
} from './components/landing/LandingSections';
import { useI18n } from '../lib/i18n/provider';
import { getSupabase } from '../lib/supabase';

export default function Page() {
  const { t } = useI18n();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabase();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader
        maxWidthClassName="max-w-6xl"
        right={<LandingHeaderActions t={t} loading={loading} user={user} />}
      />

      <LandingHeroSection t={t} user={user} />
      <LandingDemoSearchSection t={t} />
      <LandingFeaturesSection t={t} />
      <LandingFreeAccessSection t={t} loading={loading} user={user} />
      <LandingFooterSection t={t} />
    </div>
  );
}
