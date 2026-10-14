import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CompaniesService } from '../companies/companies.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  constructor(private supabase: SupabaseService, private companies: CompaniesService,
    private notifications: NotificationsService, private config: ConfigService) {}
  async runNightlyMonitoring(deadline = Date.now()+5*60000) {
    const {data:state,error:stateError}=await this.supabase.db.from('job_leases').select('cursor').eq('name','daily-maintenance').single();
    if(stateError) throw new Error('Monitoring checkpoint is unavailable');
    let cursor = state.cursor || ''; let checked = 0; let failed = 0;
    while (Date.now()<deadline && checked+failed<20) {
      const {data,error} = await this.supabase.db.from('watchlists').select('ico').gt('ico',cursor).order('ico').limit(200);
      if(error) throw new Error('Watchlist monitoring is unavailable');
      if(!data?.length) { cursor=''; break; }
      for(const ico of [...new Set(data.map(row=>row.ico))]) {
        if(Date.now()>=deadline || checked+failed>=20) break;
        try { await this.companies.getCompany(ico); checked++; }
        catch(error) { failed++; this.logger.warn('Company refresh failed: ' + ico); }
        cursor=ico;
        const {error:checkpointError}=await this.supabase.db.from('job_leases').update({cursor}).eq('name','daily-maintenance');
        if(checkpointError) throw new Error('Monitoring checkpoint could not be saved');
      }
      if(data.length<200 && cursor===data[data.length-1].ico) { cursor=''; break; }
    }
    const {error}=await this.supabase.db.from('job_leases').update({cursor}).eq('name','daily-maintenance');
    if(error) throw new Error('Monitoring checkpoint could not be saved');
    await this.deliverPendingAlerts(deadline+60000);
    return { checked, failed, remaining: !!cursor };
  }
  async deliverPendingAlerts(deadline = Date.now()+60000) {
    const {data:alerts,error} = await this.supabase.db.from('alerts').select('*')
      .not('event_id','is',null).or('telegram_delivered.eq.false,push_delivered.eq.false').order('sent_at').limit(100);
    if(error) throw new Error('Alert queue is unavailable');
    for(const alert of alerts || []) {
      if(Date.now()>=deadline) break;
      const [{data:profile,error:profileError},{data:watch,error:watchError}] = await Promise.all([
        this.supabase.db.from('profiles').select('telegram_chat_id,push_subscription').eq('id',alert.user_id).maybeSingle(),
        this.supabase.db.from('watchlists').select('notify_telegram,notify_push').eq('user_id',alert.user_id).eq('ico',alert.ico).maybeSingle(),
      ]);
      if(profileError || watchError) continue;
      const updates: Record<string,boolean> = {};
      if(!alert.telegram_delivered) {
        updates.telegram_delivered=!watch?.notify_telegram || !profile?.telegram_chat_id || await this.notifications.sendTelegram(profile.telegram_chat_id,
          alert.company_name+' (ICO '+alert.ico+')\n'+alert.message+'\n'+(this.config.get('FRONTEND_URL') || '').split(',')[0]+'/company/'+alert.ico);
      }
      if(!alert.push_delivered) {
        updates.push_delivered=!watch?.notify_push || !profile?.push_subscription || await this.notifications.sendPushNotification(profile.push_subscription,
          {title:alert.company_name,body:alert.message,url:'/company/'+alert.ico});
      }
      const {error:saveError}=await this.supabase.db.from('alerts').update(updates).eq('id',alert.id);
      if(saveError) throw new Error('Notification delivery state could not be saved');
    }
  }
}
