"use client";

import { useEffect, useState } from 'react';
import { api, registerPushNotifications } from '../../lib/api';
import { useI18n } from '../../lib/i18n/provider';
import { getSupabase } from '../../lib/supabase';
import RequestFeedback from '../../components/RequestFeedback';
import ProfileHeader from './components/ProfileHeader';
import ProfilePushSection from './components/ProfilePushSection';
import ProfileTelegramSection from './components/ProfileTelegramSection';

export default function ProfilePage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [profile, setProfile] = useState<any>(null);
  const [telegramId, setTelegramId] = useState('');
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pushStatus, setPushStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (error) throw error;
        if (data) {
          setProfile(data);
          setTelegramId(data.telegram_chat_id || '');
          if (data.push_subscription) setPushStatus('success');
        }
      } else { window.location.assign('/auth/login?redirect=/profile'); }
    }).catch(e => setError(String(e))).finally(() => setLoading(false));
  }, [attempt]);

  const handleConnectTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setTelegramStatus('loading');
    try {
      const result = await api.notifications.connectTelegram(telegramId);
      setTelegramStatus(result.success ? 'success' : 'error');
    } catch {
      setTelegramStatus('error');
    }
  };

  const handleEnablePush = async () => {
    setPushStatus('loading');
    const success = await registerPushNotifications();
    setPushStatus(success ? 'success' : 'error');
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <ProfileHeader t={t} />

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">
        <h1 className="text-2xl font-bold mb-6">{t('profile.title')}</h1>

        <RequestFeedback loading={loading} error={error} onRetry={() => { setError(null); setLoading(true); setAttempt(a => a + 1); }} />
        {!loading && !error && <ProfileTelegramSection
          t={t}
          profile={profile}
          telegramId={telegramId}
          telegramStatus={telegramStatus}
          setTelegramId={setTelegramId}
          onConnectTelegram={handleConnectTelegram}
        />}

        {!loading && !error && <ProfilePushSection t={t} pushStatus={pushStatus} onEnablePush={handleEnablePush} />}
      </div>
    </div>
  );
}
