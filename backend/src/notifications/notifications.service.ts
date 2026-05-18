import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as webpush from 'web-push';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly telegramBaseUrl: string;

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

  /**
   * Sends a message via Telegram Bot API.
   */
  async sendTelegram(chatId: string, message: string): Promise<void> {
    if (!this.telegramBaseUrl) {
      this.logger.warn('Telegram bot token is not configured');
      return;
    }

    try {
      await axios.post(`${this.telegramBaseUrl}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      });
      this.logger.log(`✉️ Telegram message sent to ${chatId}`);
    } catch (err) {
      this.logger.error(`Telegram error: ${err.message}`);
    }
  }

  /**
   * Sends a web push notification.
   */
  async sendPushNotification(
    subscription: any,
    payload: { title: string; body: string; url?: string },
  ): Promise<void> {
    if (!subscription) {
      this.logger.warn('Attempted to send push without a subscription');
      return;
    }

    try {
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
      );
      this.logger.log(`✅ Push notification sent successfully`);
    } catch (err) {
      this.logger.error(`❌ Web Push error: ${err.message}`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        this.logger.warn('Push subscription is expired or invalid');
      }
    }
  }

  /**
   * Tests Telegram channel connectivity (profile setup flow).
   */
  async testTelegram(chatId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.sendTelegram(
        chatId,
        '✅ *Kontrahent.sk*\n\nYour Telegram account is connected successfully.\n\nYou will now receive alerts for changes in your watched companies.',
      );
      return { success: true, message: 'Test message sent' };
    } catch {
      return { success: false, message: 'Failed to send message' };
    }
  }
}
