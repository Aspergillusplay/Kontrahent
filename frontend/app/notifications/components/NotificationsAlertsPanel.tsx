import { AlertCircle, Bell, Loader2 } from 'lucide-react';
import { toIntlLocale } from '../../../lib/i18n/formatters';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type NotificationsAlertsPanelProps = {
  t: TranslateFn;
  locale: string;
  alerts: any[];
  loading: boolean;
  onMarkAllRead: () => Promise<void>;
};

export default function NotificationsAlertsPanel({
  t,
  locale,
  alerts,
  loading,
  onMarkAllRead,
}: NotificationsAlertsPanelProps) {
  return (
    <div className="md:col-span-2">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">{t('notifications.alertHistory')}</h2>
        {alerts.some((a) => !a.is_read) && (
          <button onClick={onMarkAllRead} className="text-xs text-brand-400 hover:text-brand-300">
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
              className={`card p-4 transition-all ${
                !alert.is_read ? 'border-brand-500/50 bg-brand-500/5' : 'opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`mt-1 p-2 rounded-lg ${
                    alert.type === 'danger'
                      ? 'bg-red-500/10 text-red-400'
                      : alert.type === 'warning'
                        ? 'bg-yellow-500/10 text-yellow-400'
                        : 'bg-blue-500/10 text-blue-400'
                  }`}
                >
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
  );
}
