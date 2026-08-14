import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';

import { decoyVerify, verifyPassword } from '../common/password';
import { UsersService } from '../users/users.service';
import { SessionService } from './session.service';
import { ThrottleService } from './throttle.service';

export interface LoginContext {
  ip: string;
  userAgent: string;
}

export interface LoginResult {
  token: string;
  user: { id: number; username: string; role: string; mustChangePassword: boolean };
}

/**
 * Deliberately identical for every kind of failure. "No such user", "wrong
 * password" and "account disabled" are all the same sentence, because the
 * differences are only useful to someone working out which usernames exist.
 * The real reason is written to login_attempts, where the admin panel can
 * show it and an attacker cannot.
 */
const GENERIC_FAILURE = 'Invalid username or password.';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly throttle: ThrottleService,
  ) {}

  async login(username: string, password: string, context: LoginContext): Promise<LoginResult> {
    const trimmed = username.trim();

    const state = this.throttle.check(trimmed, context.ip);
    if (state.locked) {
      this.throttle.record({
        username: trimmed,
        userId: null,
        ip: context.ip,
        userAgent: context.userAgent,
        success: false,
        reason: 'locked_out',
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many attempts. Try again in ${Math.ceil(state.retryAfterSeconds / 60)} minute(s).`,
          retryAfterSeconds: state.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = this.users.findByUsername(trimmed);

    if (!user) {
      // Burn the same argon2 time a real user would, so the response time
      // does not sort real usernames from invented ones.
      await decoyVerify(password);
      this.fail(trimmed, null, context, 'unknown_user');
    }

    if (user.disabled_at !== null) {
      await decoyVerify(password);
      this.fail(trimmed, user.id, context, 'account_disabled');
    }

    const ok = await verifyPassword(user.password_hash, password);
    if (!ok) {
      this.fail(trimmed, user.id, context, 'bad_password');
    }

    const token = this.sessions.create(user.id, context.ip, context.userAgent);
    this.users.markLogin(user.id);
    this.throttle.record({
      username: trimmed,
      userId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
      success: true,
      reason: null,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.must_change_password === 1,
      },
    };
  }

  /** Records the real reason, then throws the generic one. Never returns. */
  private fail(
    username: string,
    userId: number | null,
    context: LoginContext,
    reason: string,
  ): never {
    this.throttle.record({
      username,
      userId,
      ip: context.ip,
      userAgent: context.userAgent,
      success: false,
      reason,
    });

    throw new UnauthorizedException(GENERIC_FAILURE);
  }
}
