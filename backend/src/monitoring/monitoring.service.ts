import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { CompaniesService } from '../companies/companies.service';
import { WatchlistService } from '../watchlist/watchlist.service';
import { NotificationsService } from '../notifications/notifications.service';

interface ChangeEvent {
  field: string;
  oldValue: any;
  newValue: any;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private supabase: SupabaseService,
    private companies: CompaniesService,
    private watchlist: WatchlistService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Main monitoring cron. Runs every night at 03:00.
   * Iterates over all watched companies and compares current data.
   */
  @Cron('0 3 * * *', { name: 'nightly-monitoring', timeZone: 'Europe/Bratislava' })
  async runNightlyMonitoring() {
    this.logger.log('🔍 Starting nightly monitoring...');

    const watchedItems = await this.watchlist.getAllWatchedIcos();
    const uniqueIcos = [...new Set(watchedItems.map((w) => w.ico))];

    this.logger.log(`📊 Checking ${uniqueIcos.length} companies...`);
    let alertsSent = 0;

    for (const ico of uniqueIcos) {
      try {
        const changes = await this.checkCompanyForChanges(ico);
        if (changes.length > 0) {
          // Find all users watching this company
          const watchers = watchedItems.filter((w) => w.ico === ico);
          for (const watcher of watchers) {
            await this.dispatchAlerts(watcher.user_id, ico, changes, {
              telegram: watcher.notify_telegram,
              push: watcher.notify_push,
            });
            alertsSent++;
          }
        }
      } catch (err) {
        this.logger.error(`Error while checking ICO ${ico}: ${err.message}`);
      }

      // Small delay to respect API rate limits
      await this.sleep(500);
    }

    this.logger.log(`✅ Monitoring completed. Alerts sent: ${alertsSent}`);
  }

  /**
   * Compares current company data with stored values and returns a list of changes.
   */
  private async checkCompanyForChanges(ico: string): Promise<ChangeEvent[]> {
    // Get current state from DB
    const { data: oldData } = await this.supabase.db
      .from('companies')
      .select('*')
      .eq('ico', ico)
      .single();

    if (!oldData) return [];

    // Fetch fresh data
    const newData = await this.companies.fetchAndStore(ico);
    const changes: ChangeEvent[] = [];

    // ── Diff logic ──────────────────────────────────────────
    
    // Tax debt change
    if (Number(newData.tax_debt) !== Number(oldData.tax_debt)) {
      const increased = newData.tax_debt > oldData.tax_debt;
      changes.push({
        field: 'tax_debt',
        oldValue: oldData.tax_debt,
        newValue: newData.tax_debt,
        severity: newData.tax_debt > 1000 ? 'critical' : 'warning',
        message: increased
          ? `💸 New tax debt: ${newData.tax_debt.toFixed(2)} EUR (previously: ${Number(oldData.tax_debt).toFixed(2)} EUR)`
          : `✅ Tax debt decreased to ${newData.tax_debt.toFixed(2)} EUR`,
      });
    }

    // Social debt change
    if (Number(newData.social_debt) !== Number(oldData.social_debt)) {
      const increased = newData.social_debt > oldData.social_debt;
      changes.push({
        field: 'social_debt',
        oldValue: oldData.social_debt,
        newValue: newData.social_debt,
        severity: 'warning',
        message: increased
          ? `💸 New social debt: ${newData.social_debt.toFixed(2)} EUR`
          : `✅ Social debt decreased to ${newData.social_debt.toFixed(2)} EUR`,
      });
    }

    // Bankruptcy
    if (!oldData.is_bankrupt && newData.is_bankrupt) {
      changes.push({
        field: 'is_bankrupt',
        oldValue: false,
        newValue: true,
        severity: 'critical',
        message: '🚨 COMPANY ENTERED BANKRUPTCY!',
      });
    }

    // Liquidation
    if (!oldData.is_in_liquidation && newData.is_in_liquidation) {
      changes.push({
        field: 'is_in_liquidation',
        oldValue: false,
        newValue: true,
        severity: 'critical',
        message: '🚨 COMPANY ENTERED LIQUIDATION!',
      });
    }

    // New court cases
    if (newData.court_cases > oldData.court_cases) {
      changes.push({
        field: 'court_cases',
        oldValue: oldData.court_cases,
        newValue: newData.court_cases,
        severity: 'warning',
        message: `⚖️ New court case detected (total: ${newData.court_cases})`,
      });
    }

    // Risk score upgrade
    if (oldData.risk_score !== newData.risk_score) {
      const worsened =
        (oldData.risk_score === 'green' && newData.risk_score !== 'green') ||
        (oldData.risk_score === 'yellow' && newData.risk_score === 'red');

      changes.push({
        field: 'risk_score',
        oldValue: oldData.risk_score,
        newValue: newData.risk_score,
        severity: newData.risk_score === 'red' ? 'critical' : 'info',
        message: worsened
          ? `🔴 Risk score worsened: ${oldData.risk_score} -> ${newData.risk_score}`
          : `🟢 Risk score improved: ${oldData.risk_score} -> ${newData.risk_score}`,
      });
    }

    // Save changes to history table
    if (changes.length > 0) {
      await this.supabase.db.from('company_history').insert(
        changes.map((c) => ({
          ico,
          field_name: c.field,
          old_value: String(c.oldValue),
          new_value: String(c.newValue),
          change_type:
            c.severity === 'critical' || (c.field !== 'risk_score' && c.newValue > c.oldValue)
              ? 'worsened'
              : c.newValue < c.oldValue
              ? 'improved'
              : 'neutral',
        })),
      );
    }

    return changes;
  }

  /**
   * Sends alerts for one specific user.
   */
  private async dispatchAlerts(
    userId: string,
    ico: string,
    changes: ChangeEvent[],
    channels: { telegram: boolean; push: boolean },
  ) {
    const { data: profile } = await this.supabase.db
      .from('profiles')
      .select('telegram_chat_id, push_subscription, email')
      .eq('id', userId)
      .single();

    const { data: company } = await this.supabase.db
      .from('companies')
      .select('name')
      .eq('ico', ico)
      .single();

    const companyName = company?.name || ico;
    const criticalChanges = changes.filter((c) => c.severity === 'critical');
    const severity = criticalChanges.length > 0 ? 'critical' : 'warning';

    const messageLines = [
      `📋 *${companyName}* (ICO: ${ico})`,
      '',
      ...changes.map((c) => c.message),
      '',
      `🔗 https://kontrahent.sk/company/${ico}`,
    ];
    const message = messageLines.join('\n');

    // Save alert to DB
    await this.supabase.db.from('alerts').insert({
      user_id: userId,
      ico,
      company_name: companyName,
      message,
      severity,
    });

    // Send notifications
    const promises: Promise<any>[] = [];

    if (channels.telegram && profile?.telegram_chat_id) {
      promises.push(
        this.notifications.sendTelegram(profile.telegram_chat_id, message),
      );
    }

    if (channels.push && profile?.push_subscription) {
      promises.push(
        this.notifications.sendPushNotification(profile.push_subscription, {
          title: `⚠️ ${companyName}`,
          body: changes[0].message,
          url: `/company/${ico}`,
        }),
      );
    }

    await Promise.allSettled(promises);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
