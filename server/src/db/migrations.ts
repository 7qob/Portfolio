/**
 * Schema history. Append-only: each entry runs once, in order, inside a
 * transaction, and SQLite's `user_version` pragma records how far we got.
 * Never edit an entry that has shipped — add another one.
 */
export const MIGRATIONS: readonly string[] = [
  // 001 — initial schema
  `
  CREATE TABLE users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    -- NOCASE so "Kira" and "kira" cannot both exist. Logins are typed by
    -- humans reading them off a message; case is not a distinguishing feature.
    username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash        TEXT NOT NULL,
    role                 TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    display_name         TEXT,
    -- Free-text reminder of who this login was issued to, e.g. which company.
    note                 TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Disable rather than delete: deleting the row would take the audit trail
    -- of what that account did with it.
    disabled_at          TEXT,
    last_login_at        TEXT,
    must_change_password INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE sessions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- SHA-256 of the cookie value, never the value itself. Someone who reads
    -- this table cannot mint a working cookie from it.
    token_hash          TEXT NOT NULL UNIQUE,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at        TEXT NOT NULL DEFAULT (datetime('now')),
    -- Two clocks: idle expiry slides forward on use, absolute expiry does not.
    expires_at          TEXT NOT NULL,
    absolute_expires_at TEXT NOT NULL,
    ip                  TEXT,
    user_agent          TEXT,
    revoked_at          TEXT
  );

  CREATE INDEX idx_sessions_user    ON sessions(user_id);
  CREATE INDEX idx_sessions_expires ON sessions(expires_at);

  CREATE TABLE login_attempts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Kept as typed, not resolved to a user: a failure against a username
    -- that does not exist is exactly the thing worth being able to see.
    username   TEXT NOT NULL,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip         TEXT,
    user_agent TEXT,
    success    INTEGER NOT NULL,
    reason     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_login_attempts_ip       ON login_attempts(ip, created_at);
  CREATE INDEX idx_login_attempts_username ON login_attempts(username, created_at);

  CREATE TABLE vault_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    description TEXT,
    -- A bare filename, resolved against VAULT_FILES_DIR at read time. The
    -- CHECK is defence in depth: the application already refuses anything
    -- that is not a plain name, and this makes a traversal string
    -- unstorable even if that check is ever bypassed.
    filename    TEXT NOT NULL CHECK (
                  filename <> ''
                  AND filename NOT LIKE '%/%'
                  AND filename NOT LIKE '%' || char(92) || '%'
                  AND filename NOT LIKE '%..%'
                ),
    mime        TEXT NOT NULL DEFAULT 'application/pdf',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    visible     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE download_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    vault_item_id INTEGER REFERENCES vault_items(id) ON DELETE SET NULL,
    -- Denormalised so the log still reads correctly after an item is renamed
    -- or removed. A log that changes retroactively is not a log.
    item_title    TEXT,
    ip            TEXT,
    user_agent    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_download_log_created ON download_log(created_at);
  CREATE INDEX idx_download_log_user    ON download_log(user_id);

  CREATE TABLE audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name    TEXT,
    action        TEXT NOT NULL,
    target        TEXT,
    detail        TEXT,
    ip            TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_audit_created ON audit_log(created_at);
  `,
];
