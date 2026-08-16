import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';

import { AdminGuard, AuthGuard } from '../auth/auth.guard';
import { AuditService } from '../common/audit.service';
import { clientIp } from '../common/client';
import { CsrfGuard } from '../common/csrf.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthenticatedUser } from '../common/types';
import { UploadMediaDto } from './dto';
import { MediaService } from './media.service';

/** Largest current asset is a 16 MB MP4; 64 MB leaves room without inviting abuse. */
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

@Controller('admin/media')
@UseGuards(AuthGuard, AdminGuard, CsrfGuard)
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return { rows: this.media.list() };
  }

  /**
   * width/height arrive as form fields, measured in the browser before upload
   * (new Image() / video.videoWidth) — exact values with zero server-side
   * image dependencies. They become the attributes that stop layout shift.
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadMediaDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('No file was sent.');

    const row = this.media.store({
      buffer: file.buffer,
      originalName: file.originalname || null,
      declaredMime: file.mimetype,
      width: dto.width ?? null,
      height: dto.height ?? null,
    });

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'media.upload',
      target: row.filename,
      detail: `${row.mime}, ${row.size_bytes} bytes`,
      ip: clientIp(req),
    });

    return row;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): void {
    const removed = this.media.remove(id);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'media.delete',
      target: removed.filename,
      ip: clientIp(req),
    });
  }
}
