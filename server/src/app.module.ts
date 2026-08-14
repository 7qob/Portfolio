import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
