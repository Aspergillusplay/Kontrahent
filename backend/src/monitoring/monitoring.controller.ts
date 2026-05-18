import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DataSyncService } from './data-sync.service';
import { Public } from '../auth/auth.guard';

@ApiTags('monitoring')
@ApiBearerAuth()
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly dataSyncService: DataSyncService) {}

  /**
   * GET /monitoring/status
   * Returns registry table status and latest sync timestamp.
   */
  @Get('status')
  @Public()
  @ApiOperation({ summary: 'Debt registry synchronization status' })
  async getStatus() {
    return this.dataSyncService.getSyncStatus();
  }

  /**
   * POST /monitoring/sync
   * Triggers synchronization manually (admin/testing).
   */
  @Post('sync')
  @ApiOperation({ summary: 'Manual synchronization trigger (admin)' })
  async triggerSync() {
    const start = Date.now();
    const result = await this.dataSyncService.triggerManualSync();
    return {
      ...result,
      duration_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}
