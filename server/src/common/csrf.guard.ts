import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The second half of the CSRF defence. The first half is the session cookie's
 * SameSite=Lax, which already stops a cross-site form POST from carrying it.
 *
 * This adds a required custom header. A browser cannot attach one to a
 * cross-origin request without first winning a CORS preflight, and CORS is
 * off entirely — so an attacker's page can neither send the header nor get
 * permission to. Same-origin fetch() from our own pages sets it trivially.
 *
 * The point of having both is that neither is load-bearing alone: SameSite
 * has had browser-specific gaps, and a header check is worthless if CORS is
 * ever opened up carelessly. Together, one has to fail silently AND the other
 * be misconfigured before anything is exposed.
 */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'fetch';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(req.method)) return true;

    if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      throw new ForbiddenException('Missing or invalid request header');
    }

    return true;
  }
}
