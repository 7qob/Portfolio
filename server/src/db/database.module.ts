import { Global, Module } from '@nestjs/common';

import { DatabaseService } from './database.service';
import { MaintenanceService } from './maintenance.service';

/**
 * Global so feature modules can inject the connection without each one
 * re-importing it. There is exactly one database and one connection to it.
 */
@Global()
@Module({
  providers: [DatabaseService, MaintenanceService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
