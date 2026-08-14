import { Injectable } from '@nestjs/common';

import { config } from '../config';
import { DatabaseService } from '../db/database.service';

export interface ThrottleState {
  locked: boolean;
  retryAfterSeconds: number;
}

/**
 * Login rate limiting, counted straight out of `login_attempts` rather than
 * held in memory. The table has to exist anyway for the admin panel, and
 * deriving the limit from it means a container restart cannot be used to
 * clear a lockout.
 */
@Injectable()
export class ThrottleService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Checked before the password is verified, against both the source address
   * and the username.
   *
   * The per-username half is a deliberate trade. It lets someone who knows a
   * username lock that account for the window — but with a handful of
   * accounts, all issued by hand, an attacker spread across addresses is the
   * likelier threat, and every lockout is visible in the admin panel. The
   * window is short for exactly this reason.
   */
  check(username: string, ip: string): ThrottleState {
    const since = `-${config.login.windowMinutes} minutes`;

    const row = this.database.db
      .prepare(
        `SELECT
           SUM(CASE WHEN ip = ?       THEN 1 ELSE 0 END) AS by_ip,
           SUM(CASE WHEN username = ? THEN 1 ELSE 0 END) AS by_user,
           MAX(created_at)                               AS latest
         FROM login_attempts
         WHERE success = 0
           AND created_at > datetime('now', ?)
           AND (ip = ? OR username = ?)`,
      )
      .get(ip, username, since, ip, username) as {
      by_ip: number | null;
      by_user: number | null;
      latest: string | null;
    };

    const worst = Math.max(row.by_ip ?? 0, row.by_user ?? 0);
    if (worst < config.login.maxFailures || !row.latest) {
      return { locked: false, retryAfterSeconds: 0 };
    }

    // The clock runs from the most recent failure, so continuing to hammer it
    // while locked keeps extending the lockout rather than waiting it out.
    const elapsedMs = Date.now() - Date.parse(`${row.latest}Z`);
    const lockoutMs = config.login.lockoutMinutes * 60_000;
    const remainingMs = lockoutMs - elapsedMs;

    if (remainingMs <= 0) return { locked: false, retryAfterSeconds: 0 };

    return { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
  }

  record(input: {
    username: string;
    userId: number | null;
    ip: string;
    userAgent: string;
    success: boolean;
    reason: string | null;
  }): void {
    this.database.db
      .prepare(
        `INSERT INTO login_attempts (username, user_id, ip, user_agent, success, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.username.slice(0, 64),
        input.userId,
        input.ip,
        input.userAgent,
        input.success ? 1 : 0,
        input.reason,
      );
  }
}
