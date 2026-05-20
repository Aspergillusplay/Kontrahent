import { Bell, CheckCircle, Loader2 } from 'lucide-react';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type ProfilePushSectionProps = {
  t: TranslateFn;
  pushStatus: 'idle' | 'loading' | 'success' | 'error';
  onEnablePush: () => Promise<void>;
};

export default function ProfilePushSection({ t, pushStatus, onEnablePush }: ProfilePushSectionProps) {
  return (
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
          <span className="ml-auto text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">{t('profile.enabled')}</span>
        )}
      </div>

      <button
        onClick={onEnablePush}
        disabled={pushStatus === 'loading' || pushStatus === 'success'}
        className="btn-primary flex items-center gap-2"
      >
        {pushStatus === 'loading' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> {t('profile.enabling')}
          </>
        ) : pushStatus === 'success' ? (
          <>
            <CheckCircle className="w-4 h-4" /> {t('profile.active')}
          </>
        ) : (
          <>
            <Bell className="w-4 h-4" /> {t('profile.enablePush')}
          </>
        )}
      </button>

      {pushStatus === 'error' && <p className="text-red-400 text-sm mt-2">{t('profile.pushError')}</p>}
    </div>
  );
}
