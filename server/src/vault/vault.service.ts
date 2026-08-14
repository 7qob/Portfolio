import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync, statSync, type Stats } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

import { config } from '../config';
import { DatabaseService } from '../db/database.service';

export interface VaultItemRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  filename: string;
  mime: string;
  sort_order: number;
  visible: number;
  created_at: string;
  updated_at: string;
}

export interface VaultItemView {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  mime: string;
  /** null when the file is not on disk yet. */
  sizeBytes: number | null;
  available: boolean;
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * What a signed-in visitor sees. Note what is absent: `filename` never
   * leaves the server. The client addresses documents by id, so there is no
   * point at which a caller learns a path, and therefore no path for them to
   * try manipulating.
   */
  listVisible(): VaultItemView[] {
    const rows = this.database.db
      .prepare(
        `SELECT * FROM vault_items
          WHERE visible = 1
          ORDER BY sort_order, title COLLATE NOCASE`,
      )
      .all() as VaultItemRow[];

    return rows.map((row) => this.toView(row));
  }

  listAll(): (VaultItemView & { filename: string; visible: boolean; sortOrder: number })[] {
    const rows = this.database.db
      .prepare('SELECT * FROM vault_items ORDER BY sort_order, title COLLATE NOCASE')
      .all() as VaultItemRow[];

    return rows.map((row) => ({
      ...this.toView(row),
      filename: row.filename,
      visible: row.visible === 1,
      sortOrder: row.sort_order,
    }));
  }

  findById(id: number): VaultItemRow | undefined {
    return this.database.db.prepare('SELECT * FROM vault_items WHERE id = ?').get(id) as
      | VaultItemRow
      | undefined;
  }

  private toView(row: VaultItemRow): VaultItemView {
    const stats = this.statFile(row.filename);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      mime: row.mime,
      sizeBytes: stats?.size ?? null,
      available: stats !== null,
    };
  }

  private statFile(filename: string): Stats | null {
    try {
      const path = this.resolvePath(filename);
      if (!existsSync(path)) return null;

      const stats = statSync(path);
      return stats.isFile() ? stats : null;
    } catch {
      return null;
    }
  }

  /**
   * The last line of defence on path traversal, after the DTO check on the
   * way in and the CHECK constraint in the schema.
   *
   * basename() discards any directory part outright, and the containment test
   * afterwards catches what basename cannot: a symlink inside the directory
   * pointing somewhere else entirely. The trailing separator on the prefix
   * matters — without it, "/vault-files-secret" passes a naive startsWith
   * against "/vault-files".
   */
  resolvePath(filename: string): string {
    const safeName = basename(filename);
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new NotFoundException('Document not found.');
    }

    const root = resolve(config.vault.filesDir);
    const path = resolve(join(root, safeName));

    if (path !== root && !path.startsWith(root + sep)) {
      this.logger.warn(`Refused a path outside the vault directory: ${filename}`);
      throw new NotFoundException('Document not found.');
    }

    return path;
  }

  openStream(row: VaultItemRow): { stream: NodeJS.ReadableStream; size: number } {
    const path = this.resolvePath(row.filename);

    if (!existsSync(path)) {
      throw new NotFoundException('That document has not been uploaded yet.');
    }

    const stats = statSync(path);
    if (!stats.isFile()) throw new NotFoundException('Document not found.');

    return { stream: createReadStream(path), size: stats.size };
  }

  /**
   * The title is copied in rather than joined at read time, so the log still
   * says what was actually downloaded after an item is renamed or removed. A
   * record that changes retroactively is not a record.
   */
  logDownload(input: {
    userId: number;
    item: VaultItemRow;
    ip: string;
    userAgent: string;
  }): void {
    this.database.db
      .prepare(
        `INSERT INTO download_log (user_id, vault_item_id, item_title, ip, user_agent)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.userId, input.item.id, input.item.title, input.ip, input.userAgent);
  }
}
