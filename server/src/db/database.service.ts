import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { config } from '../config';
import { MIGRATIONS } from './migrations';

/**
 * Owns the one SQLite connection.
 *
 * better-sqlite3 is synchronous, which sounds wrong for a server and is not:
 * these queries are microseconds against a local file, and the alternative is
 * paying async overhead to wait for nothing. It also means a request handler
 * either has its data or has thrown, with no half-finished states to reason
 * about.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly db: Database.Database;

  constructor() {
    mkdirSync(dirname(config.db.path), { recursive: true });
    this.db = new Database(config.db.path);

    // WAL lets reads continue during a write, which matters because the admin
    // panel polls while people are logging in.
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }

  onModuleInit(): void {
    this.migrate();
  }

  onModuleDestroy(): void {
    this.db.close();
  }

  /**
   * Applies every migration the database has not seen yet. `user_version` is
   * a SQLite-native integer stored in the file header, so the schema version
   * travels with the file and there is no bookkeeping table to fall out of
   * sync with reality.
   */
  private migrate(): void {
    const current = this.db.pragma('user_version', { simple: true }) as number;

    if (current > MIGRATIONS.length) {
      throw new Error(
        `Database is at version ${current} but this build only knows ` +
          `${MIGRATIONS.length}. Refusing to start: an older image against a ` +
          `newer database would silently corrupt it.`,
      );
    }

    if (current === MIGRATIONS.length) {
      this.logger.log(`Schema up to date (version ${current})`);
      return;
    }

    for (let version = current; version < MIGRATIONS.length; version++) {
      const sql = MIGRATIONS[version];
      if (sql === undefined) continue;

      this.logger.log(`Applying migration ${version + 1}`);

      // exec() cannot run inside a prepared transaction, so the transaction is
      // driven by hand. A failure part-way leaves the version unbumped and the
      // rollback undoes the partial schema.
      this.db.exec('BEGIN');
      try {
        this.db.exec(sql);
        this.db.pragma(`user_version = ${version + 1}`);
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }

    this.logger.log(`Schema migrated to version ${MIGRATIONS.length}`);
  }

  /** Deletes activity records past the retention window. */
  purgeExpired(): { logins: number; downloads: number; sessions: number } {
    const cutoff = `-${config.retentionDays} days`;

    const logins = this.db
      .prepare(`DELETE FROM login_attempts WHERE created_at < datetime('now', ?)`)
      .run(cutoff).changes;

    const downloads = this.db
      .prepare(`DELETE FROM download_log WHERE created_at < datetime('now', ?)`)
      .run(cutoff).changes;

    // Sessions go as soon as they are dead, not after the retention window —
    // an expired session row has no value to anyone.
    const sessions = this.db
      .prepare(`DELETE FROM sessions WHERE absolute_expires_at < datetime('now')`)
      .run().changes;

    return { logins, downloads, sessions };
  }
}
