import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AdminGuard, AuthGuard } from '../auth/auth.guard';
import { AuditService } from '../common/audit.service';
import { clientIp } from '../common/client';
import { CsrfGuard } from '../common/csrf.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthenticatedUser } from '../common/types';
import { CreateProjectDto, UpdateProjectDto } from './dto';
import { ProjectsService } from './projects.service';

/**
 * Authoring only. Nothing a visitor's browser loads ever calls these routes —
 * Publish writes a plain static file and that file is the whole public
 * surface. Same guard stack as the rest of the admin API.
 */
@Controller('admin/projects')
@UseGuards(AuthGuard, AdminGuard, CsrfGuard)
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return { rows: this.projects.list() };
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.projects.get(id);
  }

  @Post()
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = this.projects.create(dto);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'project.create',
      // The slug the service settled on, which is not always the one asked
      // for — a title alone derives one, and a collision numbers it.
      target: created.slug,
      ip: clientIp(req),
    });

    return created;
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): { ok: true } {
    this.projects.update(id, dto);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'project.update',
      target: `project:${id}`,
      detail: Object.keys(dto).join(','),
      ip: clientIp(req),
    });

    return { ok: true };
  }

  /**
   * Re-render everything already published, without publishing anything new.
   *
   * Which cell of the bento a project holds, and the order the index and the
   * pagers follow, are decisions about the site rather than about one page —
   * they are made in the Home page section, looking at all four cells at
   * once, and this is what writes them out.
   */
  @Post('render')
  render(@CurrentUser() actor: AuthenticatedUser, @Req() req: Request): { ok: true } {
    this.projects.renderPublished();

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'project.render',
      ip: clientIp(req),
    });

    return { ok: true };
  }

  @Post(':id/publish')
  publish(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): { ok: true } {
    this.projects.publish(id);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'project.publish',
      target: `project:${id}`,
      ip: clientIp(req),
    });

    return { ok: true };
  }

  @Post(':id/unpublish')
  unpublish(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): { ok: true } {
    this.projects.unpublish(id);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'project.unpublish',
      target: `project:${id}`,
      ip: clientIp(req),
    });

    return { ok: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ): void {
    const removed = this.projects.remove(id);

    this.audit.record({
      actorId: actor.id,
      actorName: actor.username,
      action: 'project.delete',
      target: removed.slug,
      ip: clientIp(req),
    });
  }

  /**
   * The rendered page as text/html, for opening in a new tab. Asset paths are
   * absolute because this URL lives under /api/, not at the site root.
   */
  @Get(':id/preview')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('X-Robots-Tag', 'noindex')
  preview(@Param('id', ParseIntPipe) id: number): string {
    return this.projects.preview(id);
  }
}
