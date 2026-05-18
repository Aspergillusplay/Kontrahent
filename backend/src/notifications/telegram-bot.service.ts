import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: TelegramBot | null = null;
  private pollingStarted = false;
  private stoppedByConflict = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    
    // Skip initialization if token is default placeholder or missing
    if (!token || token.includes('1234567890:ABCdef')) {
      this.logger.warn('Telegram Bot Token is not set or is a placeholder. Bot will not start.');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: false });

      const pollingEnabled = this.resolvePollingEnabled();

      this.bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const message = `👋 *Welcome to Kontrahent.sk!*\n\nYour unique Chat ID for connecting with the app is:\n\n\`${chatId}\`\n\nCopy it and paste it in notification settings in the app.`;
        
        this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      });

      this.bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        this.bot.sendMessage(chatId, 'This bot sends alerts about changes in companies you watch in Kontrahent.sk.\n\nUse /start to view your Chat ID.');
      });

      this.bot.on('message', (msg) => {
        this.logger.log(`📩 Received message from ${msg.chat.id}: ${msg.text}`);
      });

      this.bot.on('polling_error', async (err: any) => {
        const message = err?.message || 'unknown polling error';
        if (message.includes('409')) {
          this.logger.warn(
            'Telegram polling conflict (409). Another instance is already consuming updates. ' +
            'Polling is disabled for this process.',
          );
          this.stoppedByConflict = true;
          await this.stopPolling();
          return;
        }

        this.logger.error(`⚠️ Polling error: ${message}`);
      });

      if (pollingEnabled) {
        await this.startPolling();
      } else {
        this.logger.log('🤖 Telegram Bot initialized (polling disabled). Outbound notifications remain available.');
      }
    } catch (err) {
      this.logger.error(`Failed to initialize Telegram Bot: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    await this.stopPolling();
  }

  /**
   * Helper to send manual messages (can be used by NotificationsService)
   */
  async sendMessage(chatId: string, text: string) {
    if (!this.bot) return;
    return this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  private resolvePollingEnabled(): boolean {
    const raw = this.config.get<string>('TELEGRAM_BOT_POLLING_ENABLED');
    if (typeof raw === 'string') {
      return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
    }

    // In development, default to disabled to avoid conflicts with another running instance.
    return (this.config.get<string>('NODE_ENV') || 'development') === 'production';
  }

  private async startPolling() {
    if (!this.bot || this.pollingStarted || this.stoppedByConflict) return;

    try {
      await this.bot.deleteWebHook();
    } catch (err: any) {
      this.logger.warn(`Unable to remove webhook before polling: ${err?.message || err}`);
    }

    await this.bot.startPolling();
    this.pollingStarted = true;
    this.logger.log('🤖 Telegram Bot initialized and polling...');
  }

  private async stopPolling() {
    if (!this.bot || !this.pollingStarted) return;
    try {
      await this.bot.stopPolling();
    } catch (err: any) {
      this.logger.warn(`Unable to stop telegram polling cleanly: ${err?.message || err}`);
    } finally {
      this.pollingStarted = false;
    }
  }
}
