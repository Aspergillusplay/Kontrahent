'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, MessageCircle, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import { api, registerPushNotifications } from '../../lib/api';
import { useI18n } from '../../lib/i18n/provider';

export default function ProfilePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<any>(null);
  const [telegramId, setTelegramId] = useState('');
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pushStatus, setPushStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const supabase = getSupabase();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (data) {
          setProfile(data);
          setTelegramId(data.telegram_chat_id || '');
        }
      }
    });
  }, []);

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
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t('profile.back')}
        </Link>

        <h1 className="text-2xl font-bold mb-6">{t('profile.title')}</h1>

        {/* Telegram section */}
        <div className="card mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="font-semibold">{t('profile.telegramTitle')}</h2>
              <p className="text-sm text-slate-400">{t('profile.telegramDescription')}</p>
            </div>
            {profile?.telegram_chat_id && (
              <span className="ml-auto text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                {t('profile.connected')}
              </span>
            )}
          </div>

          <div className="bg-slate-800 rounded-lg p-4 mb-4 text-sm text-slate-300 space-y-2">
            <p className="font-medium text-slate-200">{t('profile.setupTitle')}</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-400">
              <li>{t('profile.step1')}</li>
              <li>{t('profile.step2')}</li>
              <li>{t('profile.step3')}</li>
            </ol>
          </div>

          <form onSubmit={handleConnectTelegram} className="flex gap-3">
            <input
              type="text"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              placeholder={t('profile.telegramPlaceholder')}
              className="input flex-1 font-mono"
            />
            <button
              type="submit"
              disabled={!telegramId || telegramStatus === 'loading'}
              className="btn-primary flex items-center gap-2"
            >
              {telegramStatus === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : telegramStatus === 'success' ? (
                <CheckCircle className="w-4 h-4" />
              ) : t('common.connect')}
            </button>
          </form>

          {telegramStatus === 'success' && (
            <p className="text-green-400 text-sm mt-2 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" /> {t('profile.testMessageSent')}
            </p>
          )}
          {telegramStatus === 'error' && (
            <p className="text-red-400 text-sm mt-2 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> {t('profile.connectFailed')}
            </p>
          )}
        </div>

        {/* Push notifications */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h2 className="font-semibold">{t('profile.pushTitle')}</h2>
              <p className="text-sm text-slate-400">{t('profile.pushDescription')}</p>
            </div>
            {pushStatus === 'success' && (
              <span className="ml-auto text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                {t('profile.enabled')}
              </span>
            )}
          </div>

          <button
            onClick={handleEnablePush}
            disabled={pushStatus === 'loading' || pushStatus === 'success'}
            className="btn-primary flex items-center gap-2"
          >
            {pushStatus === 'loading' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t('profile.enabling')}</>
            ) : pushStatus === 'success' ? (
              <><CheckCircle className="w-4 h-4" /> {t('profile.active')}</>
            ) : (
              <><Bell className="w-4 h-4" /> {t('profile.enablePush')}</>
            )}
          </button>
          {pushStatus === 'error' && (
            <p className="text-red-400 text-sm mt-2">
              {t('profile.pushError')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
