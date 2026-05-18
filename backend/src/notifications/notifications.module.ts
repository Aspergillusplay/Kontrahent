// notifications.module.ts
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, TelegramBotService],
  exports: [NotificationsService, TelegramBotService],
})
export class NotificationsModule {}
