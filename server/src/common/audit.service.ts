import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../db/database.service';

/**
 * Records administrative actions — who created, disabled or reset what.
 *
 * actor_name is stored alongside actor_user_id for the same reason the
 * download log copies the item title: the foreign key nulls out if that
 * account is ever removed, and "someone deleted this account" is not a useful
 * entry. The name is a snapshot of the moment, not a lookup.
 */
@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  record(input: {
    actorId: number | null;
    actorName: string | null;
    action: string;
    target?: string | null;
    detail?: string | null;
    ip?: string | null;
  }): void {
    this.database.db
      .prepare(
        `INSERT INTO audit_log (actor_user_id, actor_name, action, target, detail, ip)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.actorId,
        input.actorName,
        input.action,
        input.target ?? null,
        input.detail ?? null,
        input.ip ?? null,
      );
  }
}
