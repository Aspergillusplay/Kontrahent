import { AlertTriangle, CheckCircle, Loader2, MessageCircle } from 'lucide-react';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type ProfileTelegramSectionProps = {
  t: TranslateFn;
  profile: any;
  telegramId: string;
  telegramStatus: 'idle' | 'loading' | 'success' | 'error';
  setTelegramId: (value: string) => void;
  onConnectTelegram: (e: React.FormEvent) => Promise<void>;
};

export default function ProfileTelegramSection({
  t,
  profile,
  telegramId,
  telegramStatus,
  setTelegramId,
  onConnectTelegram,
}: ProfileTelegramSectionProps) {
  return (
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
          <span className="ml-auto text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">{t('profile.connected')}</span>
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

      <form onSubmit={onConnectTelegram} className="flex gap-3">
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
          ) : (
            t('common.connect')
          )}
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
  );
}
