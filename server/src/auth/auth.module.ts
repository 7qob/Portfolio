import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { ThrottleService } from './throttle.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, SessionService, ThrottleService, AuthGuard],
  exports: [SessionService, ThrottleService, AuthGuard],
})
export class AuthModule {}
