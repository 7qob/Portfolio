import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from './types';

/**
 * The user AuthGuard attached. Throws rather than returning undefined so a
 * handler can never be written against a possibly-absent user — if this
 * decorator is reachable without the guard, that is a wiring bug and it
 * should be loud.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) throw new UnauthorizedException('Not signed in.');
    return req.user;
  },
);
