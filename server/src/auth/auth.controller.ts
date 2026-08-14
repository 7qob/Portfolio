import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';

import { clientIp, userAgent } from '../common/client';
import { CurrentUser } from '../common/current-user.decorator';
import { CsrfGuard } from '../common/csrf.guard';
import { verifyPassword } from '../common/password';
import type { AuthenticatedUser } from '../common/types';
import { config } from '../config';
import { UsersService } from '../users/users.service';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto';
import { SessionService } from './session.service';

@Controller('auth')
@UseGuards(CsrfGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
  ) {}

  private cookieOptions(maxAgeMs: number): CookieOptions {
    return {
      httpOnly: true,               // unreadable from JavaScript, so XSS cannot lift it
      secure: config.isProduction,  // required by the __Host- prefix
      sameSite: 'lax',              // not sent on cross-site POSTs
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: LoginResponseUser }> {
    const result = await this.auth.login(dto.username, dto.password, {
      ip: clientIp(req),
      userAgent: userAgent(req),
    });

    res.cookie(
      config.session.cookieName,
      result.token,
      this.cookieOptions(config.session.absoluteDays * 24 * 60 * 60 * 1000),
    );

    return { user: result.user as LoginResponseUser };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    const token = req.cookies?.[config.session.cookieName] as string | undefined;
    if (token) this.sessions.revokeByToken(token);

    // Cleared with the same attributes it was set with — a cookie whose
    // options differ is a different cookie, and the browser keeps the old one.
    res.clearCookie(config.session.cookieName, this.cookieOptions(0));
  }

  /**
   * The site calls this on every page load to decide whether to show the
   * vault and admin links. 401 is the normal answer for a visitor, not an
   * error worth logging.
   */
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): { user: LoginResponseUser } {
    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  @Post('password')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    const row = this.users.findById(user.id);
    if (!row) throw new BadRequestException('Account not found.');

    // Re-checked even though there is a valid session: without it, a browser
    // someone left open is enough to take the account permanently.
    const ok = await verifyPassword(row.password_hash, dto.currentPassword);
    if (!ok) throw new BadRequestException('Current password is incorrect.');

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('New password must differ from the current one.');
    }

    await this.users.changeOwnPassword(user.id, dto.newPassword);

    // Everything except the session doing the changing. If the reason for the
    // change is that someone else has the old password, leaving their session
    // alive would defeat the point.
    this.sessions.revokeAllForUser(user.id, user.sessionId);
  }
}

interface LoginResponseUser {
  id: number;
  username: string;
  role: string;
  mustChangePassword: boolean;
}
