import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';
import { VaultModule } from './vault/vault.module';

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule, VaultModule],
  controllers: [HealthController],
})
export class AppModule {}
