'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shield, Bell, Send, CheckCircle2, AlertCircle, Loader2, ArrowLeft, Smartphone } from 'lucide-react';
import { api, registerPushNotifications } from '../../lib/api';
import { getSupabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n/provider';
import { toIntlLocale } from '../../lib/i18n/formatters';

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
        // Get profile to see if telegram is already connected
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
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 md:px-6 py-4 sticky top-0 z-10 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 btn-ghost -ml-2">
            <ArrowLeft className="w-4 h-4" />
            <span>{t('notifications.back')}</span>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="text-brand-500 w-5 h-5" />
            <span className="font-bold tracking-tight">{t('notifications.title')}</span>
          </div>
          <div className="w-10"></div> {/* Spacer */}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          
          {/* Settings Sidebar */}
          <div className="md:col-span-1 space-y-6">
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Send className="w-4 h-4" /> {t('notifications.telegramTitle')}
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                {t('notifications.telegramDescription')}
              </p>
              <form onSubmit={handleConnectTelegram} className="space-y-3">
                <div>
                  <label className="text-[10px] text-slate-500 ml-1 mb-1 block">{t('notifications.chatId')}</label>
                  <input
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                    placeholder={t('notifications.chatPlaceholder')}
                    className="input py-2 text-sm"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={connecting || !telegramId}
                  className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-2"
                >
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.connect')}
                </button>
              </form>
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Smartphone className="w-4 h-4" /> {t('notifications.webPushTitle')}
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                {t('notifications.webPushDescription')}
              </p>
              <button 
                onClick={handleEnablePush}
                disabled={pushStatus === 'loading' || pushStatus === 'success'}
                className={`w-full py-2 text-sm rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  pushStatus === 'success' 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                {pushStatus === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
                {pushStatus === 'success' && <CheckCircle2 className="w-4 h-4" />}
                {pushStatus === 'idle' && t('notifications.enable')}
                {pushStatus === 'success' && t('notifications.active')}
                {pushStatus === 'error' && t('notifications.activationError')}
              </button>
            </div>

            <div className="card bg-brand-500/5 border-brand-500/20">
              <h3 className="text-sm font-semibold text-brand-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Bell className="w-4 h-4" /> {t('notifications.testingTitle')}
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                {t('notifications.testingDescription')}
              </p>
              <button 
                onClick={handleSendTest}
                disabled={testLoading || (!telegramId && pushStatus !== 'success')}
                className={`w-full py-2 text-sm flex items-center justify-center gap-2 transition-all ${
                  testSuccess 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'btn-primary'
                }`}
              >
                {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                 testSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {testSuccess ? t('notifications.sent') : t('notifications.sendTest')}
              </button>
              {(!telegramId && pushStatus !== 'success') && (
                <p className="text-[10px] text-slate-500 mt-2 text-center">
                  {t('notifications.connectChannelFirst')}
                </p>
              )}
            </div>
          </div>

          {/* Alerts List */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{t('notifications.alertHistory')}</h2>
              {alerts.some(a => !a.is_read) && (
                <button onClick={markAllRead} className="text-xs text-brand-400 hover:text-brand-300">
                  {t('notifications.markAllRead')}
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <span>{t('notifications.loadingHistory')}</span>
              </div>
            ) : alerts.length === 0 ? (
              <div className="card text-center py-16">
                <Bell className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <p className="text-slate-400">{t('notifications.empty')}</p>
                <p className="text-xs text-slate-500 mt-2">{t('notifications.emptyDescription')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div 
                    key={alert.id} 
                    className={`card p-4 transition-all ${!alert.is_read ? 'border-brand-500/50 bg-brand-500/5' : 'opacity-80 hover:opacity-100'}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 p-2 rounded-lg ${
                        alert.type === 'danger' ? 'bg-red-500/10 text-red-400' : 
                        alert.type === 'warning' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {alert.type === 'danger' ? <AlertCircle className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-slate-100">{alert.title}</h4>
                          <span className="text-[10px] text-slate-500">
                            {new Date(alert.sent_at).toLocaleString(toIntlLocale(locale))}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 leading-relaxed">{alert.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
