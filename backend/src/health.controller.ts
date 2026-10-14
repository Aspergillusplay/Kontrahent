import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/auth.guard';
import { SupabaseService } from './supabase/supabase.service';
@Controller('health')
export class HealthController {
  constructor(private supabase: SupabaseService) {}
  @Public()
  @Get()
  live() { return { status: 'ok' }; }
  @Public()
  @Get('ready')
  async ready() {
    const { error } = await this.supabase.db.from('companies').select('ico').limit(1);
    if (error) throw new ServiceUnavailableException('Database is unavailable');
    return { status: 'ready' };
  }
}
