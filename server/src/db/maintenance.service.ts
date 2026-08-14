import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { config } from '../config';
import { DatabaseService } from './database.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Enforces the retention window.
 *
 * Login attempts and downloads are records of real people's activity, and a
 * log nobody ever deletes is a liability that grows on its own. They expire
 * after RETENTION_DAYS; dead sessions go immediately, since an expired
 * session row is of no use to anyone.
 *
 * A plain interval rather than @nestjs/schedule — one job on a fixed period
 * does not justify a dependency and its cron parser.
 */
@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    // Once at boot, because a container that restarts daily would otherwise
    // never reach the first interval.
    this.purge();

    this.timer = setInterval(() => this.purge(), DAY_MS);

    // Do not keep the process alive on this timer's account.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private purge(): void {
    try {
      const removed = this.database.purgeExpired();
      const total = removed.logins + removed.downloads + removed.sessions;

      if (total > 0) {
        this.logger.log(
          `Purged ${removed.logins} login attempts and ${removed.downloads} downloads ` +
            `older than ${config.retentionDays} days, plus ${removed.sessions} dead sessions`,
        );
      }
    } catch (error) {
      // Never fatal. Failing to tidy up is not a reason to stop serving.
      this.logger.error(`Retention purge failed: ${String(error)}`);
    }
  }
}
