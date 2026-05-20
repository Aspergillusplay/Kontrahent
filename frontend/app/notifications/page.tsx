"use client";

import { useEffect, useState } from 'react';
import NotificationsAlertsPanel from './components/NotificationsAlertsPanel';
import NotificationsHeader from './components/NotificationsHeader';
import NotificationsSettingsSidebar from './components/NotificationsSettingsSidebar';
import { api, registerPushNotifications } from '../../lib/api';
import { useI18n } from '../../lib/i18n/provider';
import { getSupabase } from '../../lib/supabase';

export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [telegramId, setTelegramId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testLoading, setTestLoading] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        loadData();
        supabase
          .from('profiles')
          .select('telegram_chat_id, push_subscription')
          .eq('id', data.user.id)
          .single()
          .then(({ data: profile }) => {
            if (profile?.telegram_chat_id) {
              setTelegramId(profile.telegram_chat_id);
            }
            if (profile?.push_subscription) {
              setPushStatus('success');
            }
          });
      } else {
        window.location.href = '/auth/login';
      }
    });
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.notifications.alerts();
      setAlerts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telegramId.trim()) return;
    setConnecting(true);
    try {
      const res = await api.notifications.connectTelegram(telegramId);
      if (res.success) {
        alert(t('notifications.telegramConnected'));
      } else {
        alert(`Error: ${res.message}`);
      }
    } catch (err: any) {
      alert(err.message || t('notifications.telegramConnectionError'));
    } finally {
      setConnecting(false);
    }
  };

  const handleEnablePush = async () => {
    setPushStatus('loading');
    try {
      const success = await registerPushNotifications();
      setPushStatus(success ? 'success' : 'error');
    } catch (err) {
      console.error(err);
      setPushStatus('error');
    }
  };

  const handleSendTest = async () => {
    setTestLoading(true);
    setTestSuccess(false);
    try {
      const res = await api.notifications.sendTest();
      if (res.success) {
        setTestSuccess(true);
        setTimeout(() => setTestSuccess(false), 3000);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setTestLoading(false);
    }
  };

  const markAllRead = async () => {
    await api.notifications.markAllRead();
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NotificationsHeader t={t} />

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          <NotificationsSettingsSidebar
            t={t}
            telegramId={telegramId}
            setTelegramId={setTelegramId}
            connecting={connecting}
            pushStatus={pushStatus}
            testLoading={testLoading}
            testSuccess={testSuccess}
            onConnectTelegram={handleConnectTelegram}
            onEnablePush={handleEnablePush}
            onSendTest={handleSendTest}
          />

          <NotificationsAlertsPanel
            t={t}
            locale={locale}
            alerts={alerts}
            loading={loading}
            onMarkAllRead={markAllRead}
          />
        </div>
      </main>
    </div>
  );
}
