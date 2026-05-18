import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks an endpoint as public (no authentication required). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip guard for @Public() routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authentication token');
    }

    const token = authHeader.split(' ')[1];
    console.log('[AuthGuard] Received token:', token.substring(0, 15) + '...');

    // Verify token with Supabase
    const supabase = createClient(
      this.config.getOrThrow('SUPABASE_URL'),
      this.config.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.error('[AuthGuard] getUser error:', error?.message);
      throw new UnauthorizedException('Invalid token');
    }

    // Attach user to request
    request.user = user;
    return true;
  }
}
