import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';

import { AdminGuard, AuthGuard } from '../auth/auth.guard';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../common/audit.service';
import { clientIp } from '../common/client';
import { CsrfGuard } from '../common/csrf.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthenticatedUser } from '../common/types';
import { UsersService } from '../users/users.service';
import { VaultService } from '../vault/vault.service';
import { AdminService } from './admin.service';
import {
  CreateUserDto,
  CreateVaultItemDto,
  PageQueryDto,
  UpdateUserDto,
  UpdateVaultItemDto,
} from './dto';

/** School PDFs are single-digit megabytes; 32 MB is generous without inviting abuse. */
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;

/**
 * Everything here is behind both guards. AuthGuard establishes who is
 * calling; AdminGuard rejects anyone who is not an admin. The site hides the
 * Admin link from other users, but that is cosmetic — this is the check that
 * decides, and unhiding the link gets a 403.
 */
@Controller('admin')
@UseGuards(AuthGuard, AdminGuard, CsrfGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly vault: VaultService,
    private readonly audit: AuditService,
  ) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('logins')
  logins(@Query() page: PageQueryDto) {
    return this.admin.logins(page.limit, page.offset);
  }

  @Get('downloads')
  downloads(@Query() page: PageQueryDto) {
    return this.admin.downloads(page.limit, page.offset);
  }

  @Get('sessions')
  activeSessions() {
    return { rows: this.admin.sessions() };
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSession(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): void {
    if (!this.sessions.revokeById(id)) {
      throw new NotFoundException('No such active session.');
    }

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'session.revoke',
      target: `session:${id}`,
      ip: clientIp(req),
    });
  }

  @Get('audit')
  auditLog(@Query() page: PageQueryDto) {
    return { rows: this.admin.auditLog(page.limit, page.offset) };
  }

  @Get('users')
  listUsers() {
    return { rows: this.users.listAll() };
  }

  /**
   * Returns the generated password, once. It is not stored in plaintext and
   * cannot be read back — losing it means resetting it.
   */
  @Post('users')
  async createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.users.create({
      username: dto.username,
      role: dto.role,
      displayName: dto.displayName ?? null,
      note: dto.note ?? null,
      createdBy: actor.id,
    });

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'user.create',
      target: created.username,
      detail: `role=${created.role}`,
      ip: clientIp(req),
    });

    return created;
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): { ok: true } {
    const target = this.users.findById(id);
    if (!target) throw new NotFoundException('No such user.');

    // Locking yourself out is a mistake with no recovery short of a shell on
    // the Pi. UsersService also refuses to remove the last admin, which
    // covers the case of two admins demoting each other.
    if (id === actor.id && (dto.disabled === true || dto.role === 'user')) {
      throw new BadRequestException('You cannot disable or demote your own account.');
    }

    if (dto.role !== undefined) {
      this.users.setRole(id, dto.role);
      this.audit.record({
        actorId: actor.id,
        actorName: actor.username,
        action: 'user.role',
        target: target.username,
        detail: `role=${dto.role}`,
        ip: clientIp(req),
      });
    }

    if (dto.disabled !== undefined) {
      this.users.setDisabled(id, dto.disabled);

      // A disabled account with a live session is still a logged-in account.
      if (dto.disabled) this.sessions.revokeAllForUser(id);

      this.audit.record({
        actorId: actor.id,
        actorName: actor.username,
        action: dto.disabled ? 'user.disable' : 'user.enable',
        target: target.username,
        ip: clientIp(req),
      });
    }

    if (dto.note !== undefined) {
      this.users.setNote(id, dto.note);
    }

    return { ok: true };
  }

  @Post('users/:id/password')
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const target = this.users.findById(id);
    if (!target) throw new NotFoundException('No such user.');

    const password = await this.users.resetPassword(id);

    // The point of a reset is usually that the old password is compromised.
    // Leaving their sessions alive would make it cosmetic.
    this.sessions.revokeAllForUser(id);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'user.password_reset',
      target: target.username,
      ip: clientIp(req),
    });

    return { username: target.username, password };
  }

  @Get('vault-items')
  vaultItems() {
    return { rows: this.vault.listAll() };
  }

  @Post('vault-items')
  createVaultItem(
    @Body() dto: CreateVaultItemDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const row = this.vault.createItem({
      slug: dto.slug,
      title: dto.title,
      description: dto.description ?? null,
    });

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'vault.create',
      target: dto.slug,
      ip: clientIp(req),
    });

    return { id: row.id };
  }

  /**
   * The PDF itself, uploaded through the panel instead of carried to the Pi
   * by hand. The bytes are checked (%PDF-) and the stored name is derived
   * from the slug server-side — the upload's own filename is never used.
   */
  @Post('vault-items/:id/file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_BYTES },
    }),
  )
  uploadVaultFile(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): { ok: true } {
    if (!file) throw new BadRequestException('No file was sent.');

    const item = this.vault.findById(id);
    if (!item) throw new NotFoundException('No such document.');

    this.vault.saveFile(item, file.buffer);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'vault.upload',
      target: item.slug,
      detail: `${file.buffer.length} bytes`,
      ip: clientIp(req),
    });

    return { ok: true };
  }

  @Delete('vault-items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVaultItem(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): void {
    const item = this.vault.findById(id);
    if (!item) throw new NotFoundException('No such document.');

    this.vault.deleteItem(item);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'vault.delete',
      target: item.slug,
      ip: clientIp(req),
    });
  }

  @Patch('vault-items/:id')
  updateVaultItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVaultItemDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): { ok: true } {
    this.admin.updateVaultItem(id, dto);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'vault.update',
      target: `item:${id}`,
      detail: Object.keys(dto).join(','),
      ip: clientIp(req),
    });

    return { ok: true };
  }
}
