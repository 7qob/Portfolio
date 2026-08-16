import { join } from 'node:path';

/**
 * Every knob the service has, resolved once at import time.
 *
 * There is deliberately no secret in here. Session tokens are opaque random
 * bytes looked up in the database rather than signed JWTs, so the service has
 * nothing to sign with and nothing to leak — which is what lets the image be
 * public and the compose file secret-free.
 */

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: intEnv('PORT', 8080),

  /**
   * Inside a container this has to be 0.0.0.0 or the port mapping cannot
   * reach it. Exposure is restricted by compose publishing to 127.0.0.1 only,
   * not by this — nginx is the sole thing that should ever connect.
   */
  host: env('HOST', '0.0.0.0'),

  db: {
    path: env('DB_PATH', join(process.cwd(), 'data', 'app.db')),
  },

  vault: {
    /**
     * Mounted read-only in production. Lives outside the nginx web root on
     * purpose: files under /var/www can be served by a stray location block,
     * files here cannot be served by anything but this process.
     */
    filesDir: env('VAULT_FILES_DIR', join(process.cwd(), 'vault-files')),
  },

  site: {
    /**
     * Where Publish writes generated project pages, and where uploads land.
     * In production these are the only two rw mounts the container has
     * (/site/pages and /site/assets/up); everything else stays read-only.
     * The media directory is under the nginx web root on purpose — unlike
     * vault files, uploads here are public page assets.
     */
    pagesDir: env('PAGES_DIR', join(process.cwd(), 'site', 'pages')),
    mediaDir: env('MEDIA_DIR', join(process.cwd(), 'site', 'assets', 'up')),
  },

  session: {
    /**
     * __Host- is not decoration: it tells the browser to refuse the cookie
     * unless it is Secure, Path=/ and has no Domain, which stops a subdomain
     * from ever setting a session for the apex. It requires HTTPS, so plain
     * http:// development gets the unprefixed name instead.
     */
    cookieName: isProduction ? '__Host-sid' : 'sid',
    idleHours: intEnv('SESSION_IDLE_HOURS', 8),
    absoluteDays: intEnv('SESSION_ABSOLUTE_DAYS', 7),
  },

  login: {
    /** Failures counted per IP and per username inside the window. */
    maxFailures: intEnv('LOGIN_MAX_FAILURES', 5),
    windowMinutes: intEnv('LOGIN_WINDOW_MINUTES', 15),
    lockoutMinutes: intEnv('LOGIN_LOCKOUT_MINUTES', 15),
  },

  /**
   * How long login attempts and download records are kept. These are logs of
   * real people's activity, so they expire rather than accumulate forever.
   */
  retentionDays: intEnv('RETENTION_DAYS', 90),

  /**
   * Number of proxies in front of us, for working out the real client IP.
   * Cloudflare Tunnel -> nginx -> here is one hop we control.
   */
  trustProxyHops: intEnv('TRUST_PROXY_HOPS', 1),
} as const;
