import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { DataSyncService } from './data-sync.service';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);
  private running: Promise<any> | null = null;
  constructor(private db: SupabaseService, private config: ConfigService,
    private sync: DataSyncService, private monitoring: MonitoringService) {}
  onApplicationBootstrap() {
    if(this.config.get('BACKGROUND_JOBS_ENABLED') === 'true') {
      const timer=setTimeout(()=>void this.runDue().catch(e=>this.logger.error(e.message)),10000);
      timer.unref();
    }
  }
  @Cron('*/15 * * * *')
  async scheduled() {
    if(this.config.get('BACKGROUND_JOBS_ENABLED') === 'true') await this.runDue();
  }
  runDue() {
    if(this.running) return this.running;
    this.running=this.execute().finally(()=>this.running=null);
    return this.running;
  }
  private async execute() {
    const owner=randomUUID();
    const {data:claimed,error}=await this.db.db.rpc('claim_job',{p_name:'daily-maintenance',p_owner:owner,p_seconds:600});
    if(error) throw new Error('Maintenance lock is unavailable');
    if(!claimed) return {status:'already_running'};
    let success=false;
    try {
      const {data:last,error:readError}=await this.db.db.from('job_leases').select('completed_at').eq('name','daily-maintenance').single();
      if(readError) throw new Error('Maintenance state is unavailable');
      const due=!last.completed_at || Date.now()-Date.parse(last.completed_at)>=23*3600000;
      const deadline=Date.now()+5*60000;
      const sources=due ? await this.sync.syncAll() : undefined;
      const result=await this.monitoring.runNightlyMonitoring(deadline);
      success=due;
      return {status:'completed',sources,...result};
    } finally {
      const {error}=await this.db.db.rpc('finish_job',{p_name:'daily-maintenance',p_owner:owner,p_success:success});
      if(error) this.logger.error('Unable to release maintenance lease; it will expire automatically');
    }
  }
}
