import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../db/database.service';
import { generatePassword, hashPassword } from '../common/password';
import type { Role, UserRow } from '../common/types';

export interface CreatedUser {
  id: number;
  username: string;
  role: Role;
  /** Shown once and never recoverable — only the hash is stored. */
  password: string;
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/i;

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  findByUsername(username: string): UserRow | undefined {
    return this.database.db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as UserRow | undefined;
  }

  findById(id: number): UserRow | undefined {
    return this.database.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | UserRow
      | undefined;
  }

  /** Never selects password_hash — no caller has a use for it. */
  listAll(): UserRow[] {
    return this.database.db
      .prepare(
        `SELECT id, username, role, display_name, note, created_at, created_by,
                disabled_at, last_login_at, must_change_password
           FROM users
          ORDER BY disabled_at IS NOT NULL, username COLLATE NOCASE`,
      )
      .all() as UserRow[];
  }

  countAdmins(): number {
    const row = this.database.db
      .prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL`)
      .get() as { n: number };
    return row.n;
  }

  /**
   * Creates an account with a generated password. The caller never chooses
   * one: a password picked by whoever is issuing accounts is a password that
   * gets reused, and this way the plaintext exists only in the response that
   * displays it once.
   */
  async create(input: {
    username: string;
    role: Role;
    displayName?: string | null;
    note?: string | null;
    createdBy?: number | null;
  }): Promise<CreatedUser> {
    const username = input.username.trim();

    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequestException(
        'Username must be 3–32 characters: letters, digits, dot, dash or underscore, starting with a letter or digit.',
      );
    }

    if (this.findByUsername(username)) {
      throw new ConflictException('That username already exists.');
    }

    const password = generatePassword();
    const passwordHash = await hashPassword(password);

    try {
      const result = this.database.db
        .prepare(
          `INSERT INTO users (username, password_hash, role, display_name, note, created_by, must_change_password)
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
        )
        .run(
          username,
          passwordHash,
          input.role,
          input.displayName ?? null,
          input.note ?? null,
          input.createdBy ?? null,
        );

      return {
        id: Number(result.lastInsertRowid),
        username,
        role: input.role,
        password,
      };
    } catch (error) {
      // The UNIQUE index is the real arbiter — the lookup above can lose a
      // race with a second request creating the same name.
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ConflictException('That username already exists.');
      }
      throw error;
    }
  }

  /** Returns the new password; the old one stops working immediately. */
  async resetPassword(userId: number): Promise<string> {
    const user = this.findById(userId);
    if (!user) throw new NotFoundException('No such user.');

    const password = generatePassword();
    const passwordHash = await hashPassword(password);

    this.database.db
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(passwordHash, userId);

    return password;
  }

  async changeOwnPassword(userId: number, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    this.database.db
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(passwordHash, userId);
  }

  setDisabled(userId: number, disabled: boolean): void {
    const user = this.findById(userId);
    if (!user) throw new NotFoundException('No such user.');

    // Disabling the last admin locks everyone out of the panel permanently,
    // and the only way back would be a shell on the Pi.
    if (disabled && user.role === 'admin' && user.disabled_at === null && this.countAdmins() <= 1) {
      throw new BadRequestException('This is the only active admin — promote another one first.');
    }

    this.database.db
      .prepare(`UPDATE users SET disabled_at = ${disabled ? "datetime('now')" : 'NULL'} WHERE id = ?`)
      .run(userId);
  }

  setRole(userId: number, role: Role): void {
    const user = this.findById(userId);
    if (!user) throw new NotFoundException('No such user.');

    if (role === 'user' && user.role === 'admin' && this.countAdmins() <= 1) {
      throw new BadRequestException('This is the only active admin — promote another one first.');
    }

    this.database.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  }

  markLogin(userId: number): void {
    this.database.db
      .prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`)
      .run(userId);
  }
}
