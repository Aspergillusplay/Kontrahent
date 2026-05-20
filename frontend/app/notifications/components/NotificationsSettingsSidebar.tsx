import { Bell, CheckCircle2, Loader2, Send, Smartphone } from 'lucide-react';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type NotificationsSettingsSidebarProps = {
  t: TranslateFn;
  telegramId: string;
  setTelegramId: (value: string) => void;
  connecting: boolean;
  pushStatus: 'idle' | 'loading' | 'success' | 'error';
  testLoading: boolean;
  testSuccess: boolean;
  onConnectTelegram: (e: React.FormEvent) => Promise<void>;
  onEnablePush: () => Promise<void>;
  onSendTest: () => Promise<void>;
};

export default function NotificationsSettingsSidebar({
  t,
  telegramId,
  setTelegramId,
  connecting,
  pushStatus,
  testLoading,
  testSuccess,
  onConnectTelegram,
  onEnablePush,
  onSendTest,
}: NotificationsSettingsSidebarProps) {
  return (
    <div className="md:col-span-1 space-y-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Send className="w-4 h-4" /> {t('notifications.telegramTitle')}
        </h3>
        <p className="text-xs text-slate-500 mb-4">{t('notifications.telegramDescription')}</p>
        <form onSubmit={onConnectTelegram} className="space-y-3">
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
        <p className="text-xs text-slate-500 mb-4">{t('notifications.webPushDescription')}</p>
        <button
          onClick={onEnablePush}
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
        <p className="text-xs text-slate-400 mb-4">{t('notifications.testingDescription')}</p>
        <button
          onClick={onSendTest}
          disabled={testLoading || (!telegramId && pushStatus !== 'success')}
          className={`w-full py-2 text-sm flex items-center justify-center gap-2 transition-all ${
            testSuccess
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'btn-primary'
          }`}
        >
          {testLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : testSuccess ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {testSuccess ? t('notifications.sent') : t('notifications.sendTest')}
        </button>
        {!telegramId && pushStatus !== 'success' && (
          <p className="text-[10px] text-slate-500 mt-2 text-center">{t('notifications.connectChannelFirst')}</p>
        )}
      </div>
    </div>
  );
}
