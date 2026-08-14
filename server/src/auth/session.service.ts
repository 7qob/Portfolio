import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { config } from '../config';
import { DatabaseService } from '../db/database.service';
import type { AuthenticatedUser, Role } from '../common/types';

/** How stale last_seen_at may get before a request bothers to update it. */
const SLIDE_THRESHOLD_SECONDS = 60;

interface SessionUserRow {
  session_id: number;
  user_id: number;
  username: string;
  role: Role;
  display_name: string | null;
  must_change_password: number;
  last_seen_at: string;
}

@Injectable()
export class SessionService {
  constructor(private readonly database: DatabaseService) {}

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Mints a session and returns the raw token — the only moment it exists in
   * this process. Only its SHA-256 is stored, so the database can never hand
   * anyone a usable cookie.
   *
   * SHA-256 rather than argon2 here on purpose: this is a 256-bit random
   * value, not a password. There is no dictionary to attack and nothing to
   * slow an attacker down against, so a password hash would buy nothing and
   * cost 19 MiB on every single authenticated request.
   */
  create(userId: number, ip: string, userAgent: string): string {
    const token = randomBytes(32).toString('base64url');

    this.database.db
      .prepare(
        `INSERT INTO sessions
           (user_id, token_hash, expires_at, absolute_expires_at, ip, user_agent)
         VALUES
           (?, ?, datetime('now', ?), datetime('now', ?), ?, ?)`,
      )
      .run(
        userId,
        SessionService.hash(token),
        `+${config.session.idleHours} hours`,
        `+${config.session.absoluteDays} days`,
        ip,
        userAgent,
      );

    return token;
  }

  /**
   * Resolves a cookie to a user, or null.
   *
   * Every condition is in the SQL rather than checked afterwards, so there is
   * no path where a revoked, expired or disabled account is read out and then
   * evaluated by code that might get the comparison wrong.
   */
  resolve(token: string): AuthenticatedUser | null {
    const row = this.database.db
      .prepare(
        `SELECT s.id            AS session_id,
                u.id            AS user_id,
                u.username      AS username,
                u.role          AS role,
                u.display_name  AS display_name,
                u.must_change_password,
                s.last_seen_at  AS last_seen_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash          = ?
            AND s.revoked_at          IS NULL
            AND u.disabled_at         IS NULL
            AND s.expires_at          > datetime('now')
            AND s.absolute_expires_at > datetime('now')`,
      )
      .get(SessionService.hash(token)) as SessionUserRow | undefined;

    if (!row) return null;

    this.slide(row.session_id, row.last_seen_at);

    return {
      id: row.user_id,
      username: row.username,
      role: row.role,
      displayName: row.display_name,
      mustChangePassword: row.must_change_password === 1,
      sessionId: row.session_id,
    };
  }

  /**
   * Pushes the idle expiry forward, but at most once a minute. Sliding on
   * every request would mean a database write per request for no benefit —
   * the absolute expiry is untouched either way, so a session still dies
   * SESSION_ABSOLUTE_DAYS after it was created no matter how active it is.
   */
  private slide(sessionId: number, lastSeenAt: string): void {
    const ageSeconds = (Date.now() - Date.parse(`${lastSeenAt}Z`)) / 1000;
    if (Number.isFinite(ageSeconds) && ageSeconds < SLIDE_THRESHOLD_SECONDS) return;

    this.database.db
      .prepare(
        `UPDATE sessions
            SET last_seen_at = datetime('now'),
                expires_at   = datetime('now', ?)
          WHERE id = ?`,
      )
      .run(`+${config.session.idleHours} hours`, sessionId);
  }

  revokeByToken(token: string): void {
    this.database.db
      .prepare(
        `UPDATE sessions SET revoked_at = datetime('now')
          WHERE token_hash = ? AND revoked_at IS NULL`,
      )
      .run(SessionService.hash(token));
  }

  revokeById(sessionId: number): boolean {
    return (
      this.database.db
        .prepare(
          `UPDATE sessions SET revoked_at = datetime('now')
            WHERE id = ? AND revoked_at IS NULL`,
        )
        .run(sessionId).changes > 0
    );
  }

  /**
   * Used when a password changes: every other session for that user dies, so
   * changing a password actually evicts whoever else was signed in as them.
   */
  revokeAllForUser(userId: number, exceptSessionId?: number): number {
    return this.database.db
      .prepare(
        `UPDATE sessions SET revoked_at = datetime('now')
          WHERE user_id = ? AND revoked_at IS NULL AND id <> ?`,
      )
      .run(userId, exceptSessionId ?? -1).changes;
  }
}
