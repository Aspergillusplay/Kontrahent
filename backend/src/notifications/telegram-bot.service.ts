import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/** Optional local polling. Disabled by default to avoid competing consumers on free hosts. */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private stopped=false;
  private controller=new AbortController();
  private readonly logger=new Logger(TelegramBotService.name);
  constructor(private config:ConfigService) {}
  onModuleInit() {
    if(this.config.get('TELEGRAM_BOT_POLLING_ENABLED')==='true' && this.config.get('TELEGRAM_BOT_TOKEN')) void this.poll();
  }
  onModuleDestroy() {this.stopped=true;this.controller.abort();}
  private async poll() {
    const base='https://api.telegram.org/bot'+this.config.get('TELEGRAM_BOT_TOKEN');
    let offset=0;
    while(!this.stopped) {
      try {
        const {data}=await axios.get(base+'/getUpdates',{params:{offset,timeout:25,allowed_updates:JSON.stringify(['message'])},timeout:30000,signal:this.controller.signal});
        for(const update of data.result || []) {
          offset=update.update_id+1;
          const message=update.message;
          if(message?.chat?.type==='private' && /^\/(start|help)(?:\s|$)/.test(message.text || '')) {
            await axios.post(base+'/sendMessage',{chat_id:message.chat.id,text:'Kontrahent: your chat ID is '+message.chat.id+'. Enter it in notification settings.'},{timeout:10000,signal:this.controller.signal});
          }
        }
      } catch(error) {
        if(this.stopped)return;
        if(error.response?.status===409){this.logger.warn('Another Telegram consumer is active; polling stopped');return;}
        this.logger.warn('Telegram polling temporarily unavailable');
        await new Promise(resolve=>setTimeout(resolve,10000));
      }
    }
  }
}
