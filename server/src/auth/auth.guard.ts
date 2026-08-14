import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { config } from '../config';
import { SessionService } from './session.service';

/** Requires a valid session. Attaches the user to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[config.session.cookieName] as string | undefined;

    if (!token) throw new UnauthorizedException('Not signed in.');

    const user = this.sessions.resolve(token);
    if (!user) throw new UnauthorizedException('Session expired or revoked.');

    req.user = user;
    return true;
  }
}

/**
 * Requires the admin role, on top of a valid session.
 *
 * The admin link is hidden in the site's navigation for everyone else, but
 * hiding is decoration. This is the check that matters: unhiding the link in
 * devtools gets a 403, not a panel.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    if (!req.user) throw new UnauthorizedException('Not signed in.');
    if (req.user.role !== 'admin') throw new ForbiddenException('Admins only.');

    return true;
  }
}
