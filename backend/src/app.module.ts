import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller';
import { SupabaseModule } from './supabase/supabase.module';
import { CompaniesModule } from './companies/companies.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';

@Module({
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  imports: [
    // Config - loads .env
    ConfigModule.forRoot({ isGlobal: true }),

    // Cron jobs
    ScheduleModule.forRoot(),

    // Rate limiting — max 100 req / 60s per IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Core modules
    SupabaseModule,
    AuthModule,
    CompaniesModule,
    WatchlistModule,
    MonitoringModule,
    NotificationsModule,
  ],
})
export class AppModule {}
