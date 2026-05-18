// auth.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';

@Module({
  providers: [
    // Globally apply the auth guard — routes opt-in to public via @Public()
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [],
})
export class AuthModule {}
