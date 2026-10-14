import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as webpush from 'web-push';
import { validatePushSubscription } from './push-subscription';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly telegramBaseUrl: string;
  private botInfo: { username: string } | null = null;

  constructor(private config: ConfigService) {
    const token = this.config.get('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.telegramBaseUrl = `https://api.telegram.org/bot${token}`;
    }

    // Configure web-push VAPID
    const vapidPublic = this.config.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = this.config.get('VAPID_PRIVATE_KEY');
    const vapidEmail = this.config.get('VAPID_EMAIL');
    if (vapidPublic && vapidPrivate && vapidEmail) {
      webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate);
    }
  }

  async getTelegramBot() {
    if (this.botInfo) return this.botInfo;
    if (!this.telegramBaseUrl) return { username: null };
    try {
      const { data } = await axios.get(this.telegramBaseUrl+'/getMe', { timeout: 10000 });
      const username=data?.result?.username;
      if (data?.ok && /^[A-Za-z0-9_]+$/.test(username)) return this.botInfo={username};
    } catch { this.logger.warn('Telegram bot information is unavailable'); }
    return { username: null };
  }

  /**
   * Sends a message via Telegram Bot API.
   */
  async sendTelegram(chatId: string, message: string): Promise<boolean> {
    if (!this.telegramBaseUrl) {
      this.logger.warn('Telegram bot token is not configured');
      return false;
    }

    try {
      await axios.post(`${this.telegramBaseUrl}/sendMessage`, {
        chat_id: chatId,
        text: message,
        disable_web_page_preview: false,
      }, { timeout: 10000 });
      this.logger.log(`✉️ Telegram message sent to ${chatId}`);
      return true;
    } catch (err) {
      this.logger.error(`Telegram error: ${err.message}`);
      return false;
    }
  }

  /**
   * Sends a web push notification.
   */
  async sendPushNotification(
    subscription: any,
    payload: { title: string; body: string; url?: string },
  ): Promise<boolean> {
    if (!subscription) {
      this.logger.warn('Attempted to send push without a subscription');
      return false;
    }

    try {
      subscription = validatePushSubscription(subscription);
      this.logger.log(`📱 Sending push to endpoint: ${subscription.endpoint?.substring(0, 30)}...`);
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          data: { url: payload.url || '/' },
          actions: [
            { action: 'view', title: 'View' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        }),
        { timeout: 10000 },
      );
      this.logger.log(`✅ Push notification sent successfully`);
      return true;
    } catch (err) {
      this.logger.error(`❌ Web Push error: ${err.message}`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        this.logger.warn('Push subscription is expired or invalid');
      }
      return false;
    }
  }

  /**
   * Tests Telegram channel connectivity (profile setup flow).
   */
  async testTelegram(chatId: string): Promise<{ success: boolean; message: string }> {
    try {
      const success = await this.sendTelegram(
        chatId,
        '✅ *Kontrahent.sk*\n\nYour Telegram account is connected successfully.\n\nYou will now receive alerts for changes in your watched companies.',
      );
      return { success, message: success ? 'Test message sent' : 'Telegram delivery failed' };
    } catch {
      return { success: false, message: 'Failed to send message' };
    }
  }
}
