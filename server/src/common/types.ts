export type Role = 'user' | 'admin';

/** A row of `users`, exactly as SQLite returns it. */
export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  display_name: string | null;
  note: string | null;
  created_at: string;
  created_by: number | null;
  disabled_at: string | null;
  last_login_at: string | null;
  must_change_password: number;
}

export interface SessionRow {
  id: number;
  user_id: number;
  token_hash: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  absolute_expires_at: string;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
}

/** What a guard attaches to the request once a session checks out. */
export interface AuthenticatedUser {
  id: number;
  username: string;
  role: Role;
  displayName: string | null;
  mustChangePassword: boolean;
  sessionId: number;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
