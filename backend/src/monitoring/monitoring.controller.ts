import { Controller, Get, Post, Request, ForbiddenException, HttpCode, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { JobsService } from './jobs.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DataSyncService } from './data-sync.service';
import { Public } from '../auth/auth.guard';

@ApiTags('monitoring')
@ApiBearerAuth()
@Controller('monitoring')
export class MonitoringController {
  private readonly logger = new Logger(MonitoringController.name);
  constructor(private readonly dataSyncService: DataSyncService, private readonly jobs: JobsService, private config: ConfigService) {}

  @Public()
  @Post('scheduled')
  @HttpCode(202)
  scheduled(@Request() request) {
    const expected=this.config.get<string>('MAINTENANCE_SECRET');
    const supplied=String(request.headers.authorization || '').replace(/^Bearer /,'');
    if(!expected || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(expected),Buffer.from(supplied))) {
      throw new ForbiddenException('Invalid maintenance token');
    }
    void this.jobs.runDue().catch(error=>this.logger.error(error.message));
    return {status:'accepted'};
  }

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
  async triggerSync(@Request() request) {
    if (request.user?.app_metadata?.role !== 'admin') throw new ForbiddenException('Administrator access required');
    const start = Date.now();
    const result = await this.jobs.runDue();
    return {
      ...result,
      duration_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}
