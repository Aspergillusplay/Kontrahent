import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { DataSyncService } from './data-sync.service';
import { MonitoringController } from './monitoring.controller';
import { CompaniesModule } from '../companies/companies.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CompaniesModule, WatchlistModule, NotificationsModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, DataSyncService],
  exports: [DataSyncService],
})
export class MonitoringModule {}
