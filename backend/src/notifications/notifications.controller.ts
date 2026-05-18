import { Controller, Post, Body, Request, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsObject } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ConfigService } from '@nestjs/config';

class SavePushSubscriptionDto {
  @IsObject()
  subscription: object;
}

class SetTelegramDto {
  @IsString()
  chat_id: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private notifications: NotificationsService,
    private supabase: SupabaseService,
    private config: ConfigService,
  ) {}

  /** Saves Web Push subscription into user profile. */
  @Post('push/subscribe')
  @ApiOperation({ summary: 'Save push subscription' })
  async subscribePush(@Request() req, @Body() dto: SavePushSubscriptionDto) {
    await this.supabase.db
      .from('profiles')
      .update({ push_subscription: dto.subscription })
      .eq('id', req.user.id);

    return { success: true };
  }

  /** Sets Telegram chat ID and sends a test message. */
  @Post('telegram/connect')
  @ApiOperation({ summary: 'Connect Telegram account' })
  async connectTelegram(@Request() req, @Body() dto: SetTelegramDto) {
    const result = await this.notifications.testTelegram(dto.chat_id);
    if (result.success) {
      await this.supabase.db
        .from('profiles')
        .update({ telegram_chat_id: dto.chat_id })
        .eq('id', req.user.id);
    }
    return result;
  }

  /** Returns recent alerts for current user. */
  @Get('alerts')
  @ApiOperation({ summary: 'My alerts' })
  async getAlerts(@Request() req) {
    const { data, error } = await this.supabase.db
      .from('alerts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('sent_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data;
  }

  /** Marks all user alerts as read. */
  @Post('alerts/read-all')
  @ApiOperation({ summary: 'Mark all alerts as read' })
  async markAllRead(@Request() req) {
    await this.supabase.db
      .from('alerts')
      .update({ is_read: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    return { success: true };
  }

  /** Returns VAPID public key for frontend. */
  @Get('vapid-public-key')
  getVapidPublicKey() {
    const key = this.config.get<string>('VAPID_PUBLIC_KEY') || '';
    return { key };
  }

  /** Sends a test notification (Push and Telegram). */
  @Post('test-all')
  @ApiOperation({ summary: 'Send test notification' })
  async sendTestNotification(@Request() req) {
    const { data: profile } = await this.supabase.db
      .from('profiles')
      .select('telegram_chat_id, push_subscription')
      .eq('id', req.user.id)
      .single();

    if (!profile) {
      return { success: false, message: 'Profile not found' };
    }

    const results = {
      telegram: false,
      push: false,
    };

    if (profile.telegram_chat_id) {
      await this.notifications.sendTelegram(
        profile.telegram_chat_id,
        '🧪 *Test message*\n\nThis is a test of your Kontrahent.sk notifications.',
      );
      results.telegram = true;
    }

    if (profile.push_subscription) {
      await this.notifications.sendPushNotification(profile.push_subscription, {
        title: 'Test notification',
        body: 'Your Web Push notifications are configured correctly.',
        url: '/notifications',
      });
      results.push = true;
    } else {
      console.warn(`[TestNotification] User ${req.user.id} has no push subscription`);
    }

    return { 
      success: true, 
      results,
      message: results.telegram || results.push 
        ? 'Test notifications were sent.' 
        : 'No notification channels are configured.'
    };
  }
}
