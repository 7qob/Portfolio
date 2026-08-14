import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from '../db/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Unauthenticated on purpose — it is what Docker's HEALTHCHECK and nginx
   * poll. It reports only whether the process can reach its own database, and
   * deliberately leaks nothing about users, sessions or configuration.
   */
  @Get()
  check(): { status: string; database: string; uptimeSeconds: number } {
    let database = 'ok';
    try {
      this.database.db.prepare('SELECT 1').get();
    } catch {
      database = 'unavailable';
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
