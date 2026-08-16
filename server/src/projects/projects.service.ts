import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

import { config } from '../config';
import { DatabaseService } from '../db/database.service';
import {
  Block,
  BlockError,
  Chip,
  collectMediaIds,
  normalizeBlocks,
  normalizeChips,
} from './blocks';
import {
  CHIP_ICON_NAMES,
  MediaLookup,
  MediaRef,
  Neighbour,
  PageProject,
  renderProjectPage,
  renderProjectsIndex,
} from './render';

export interface ProjectRow {
  id: number;
  slug: string;
  title: string;
  status: string | null;
  palette: string | null;
  lede: string | null;
  card_blurb: string | null;
  chips: string;
  blocks: string;
  sort_order: number;
  visible: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MediaRow {
  id: number;
  filename: string;
  original_name: string | null;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

/**
 * The only filenames the writer will ever emit. Belt on top of the slug
 * CHECK's braces: even a row that somehow held a bad slug cannot make this
 * regex produce a path.
 */
const PAGE_NAME = /^(project-[a-z0-9-]{1,48}\.html|projects\.html)$/;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly database: DatabaseService) {
    // Dev convenience; in production this is the mounted /site/pages and
    // already exists. Failing here (read-only fs, missing mount) is fatal on
    // first publish, not on boot — publishing is the operation that needs it.
    try {
      mkdirSync(resolve(config.site.pagesDir), { recursive: true });
    } catch {
      this.logger.warn(`Could not create pages directory ${config.site.pagesDir}`);
    }
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  list() {
    const rows = this.database.db
      .prepare('SELECT * FROM projects ORDER BY sort_order, title COLLATE NOCASE')
      .all() as ProjectRow[];
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      status: r.status,
      sortOrder: r.sort_order,
      visible: r.visible === 1,
      publishedAt: r.published_at,
      updatedAt: r.updated_at,
    }));
  }

  get(id: number) {
    const row = this.findById(id);
    if (!row) throw new NotFoundException('No such project.');
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      palette: row.palette,
      lede: row.lede,
      cardBlurb: row.card_blurb,
      chips: JSON.parse(row.chips) as Chip[],
      blocks: JSON.parse(row.blocks) as Block[],
      sortOrder: row.sort_order,
      visible: row.visible === 1,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    };
  }

  findById(id: number): ProjectRow | undefined {
    return this.database.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | ProjectRow
      | undefined;
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  create(input: { slug: string; title: string }): { id: number } {
    try {
      const info = this.database.db
        .prepare('INSERT INTO projects (slug, title) VALUES (?, ?)')
        .run(input.slug, input.title);
      return { id: Number(info.lastInsertRowid) };
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        throw new ConflictException('A project with that slug already exists.');
      }
      throw err;
    }
  }

  update(
    id: number,
    input: {
      slug?: string;
      title?: string;
      status?: string | null;
      palette?: string | null;
      lede?: string | null;
      cardBlurb?: string | null;
      chips?: unknown;
      blocks?: unknown;
      sortOrder?: number;
      visible?: boolean;
    },
  ): void {
    const row = this.findById(id);
    if (!row) throw new NotFoundException('No such project.');

    if (input.slug !== undefined && input.slug !== row.slug && row.published_at) {
      // The slug is the published file's name. Renaming it live would strand
      // the old file and break every link to it; unpublish first.
      throw new BadRequestException('Unpublish before changing the slug.');
    }

    let chips: Chip[] | undefined;
    let blocks: Block[] | undefined;
    try {
      if (input.chips !== undefined) chips = normalizeChips(input.chips, CHIP_ICON_NAMES);
      if (input.blocks !== undefined) blocks = normalizeBlocks(input.blocks);
    } catch (err) {
      if (err instanceof BlockError) throw new BadRequestException(err.message);
      throw err;
    }

    this.database.db
      .prepare(
        `UPDATE projects SET
           slug = ?, title = ?, status = ?, palette = ?, lede = ?, card_blurb = ?,
           chips = ?, blocks = ?, sort_order = ?, visible = ?,
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        input.slug ?? row.slug,
        input.title ?? row.title,
        input.status === undefined ? row.status : input.status,
        input.palette === undefined ? row.palette : input.palette,
        input.lede === undefined ? row.lede : input.lede,
        input.cardBlurb === undefined ? row.card_blurb : input.cardBlurb,
        chips === undefined ? row.chips : JSON.stringify(chips),
        blocks === undefined ? row.blocks : JSON.stringify(blocks),
        input.sortOrder ?? row.sort_order,
        input.visible === undefined ? row.visible : input.visible ? 1 : 0,
        id,
      );
  }

  remove(id: number): ProjectRow {
    const row = this.findById(id);
    if (!row) throw new NotFoundException('No such project.');
    if (row.published_at) this.unpublish(id);
    this.database.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return row;
  }

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  publish(id: number): void {
    const row = this.findById(id);
    if (!row) throw new NotFoundException('No such project.');

    // Refuse before touching disk if the page depends on missing uploads.
    const blocks = JSON.parse(row.blocks) as Block[];
    this.mediaLookupFor(blocks);

    this.database.db
      .prepare(`UPDATE projects SET published_at = datetime('now') WHERE id = ?`)
      .run(id);

    this.renderAllPublished();
  }

  unpublish(id: number): void {
    const row = this.findById(id);
    if (!row) throw new NotFoundException('No such project.');

    this.database.db.prepare('UPDATE projects SET published_at = NULL WHERE id = ?').run(id);

    const path = this.resolvePagePath(`project-${row.slug}.html`);
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      this.logger.warn(`Could not remove ${path}`);
    }

    this.renderAllPublished();
  }

  /** The preview the editor opens in a new tab — absolute asset paths. */
  preview(id: number): string {
    const row = this.findById(id);
    if (!row) throw new NotFoundException('No such project.');

    const { prev, next } = this.neighboursOf(row);
    return renderProjectPage(
      this.toPage(row),
      prev,
      next,
      this.mediaLookupFor(JSON.parse(row.blocks) as Block[]),
      { assetPrefix: '/' },
    );
  }

  /**
   * Publish re-renders everything published rather than just the neighbours:
   * a sort_order change can re-chain any pager, and at this site's size
   * re-rendering the world costs milliseconds. Fewer cases, no stale chains.
   */
  private renderAllPublished(): void {
    const rows = this.database.db
      .prepare(
        `SELECT * FROM projects WHERE published_at IS NOT NULL
          ORDER BY sort_order, title COLLATE NOCASE`,
      )
      .all() as ProjectRow[];

    const chain = rows.filter((r) => r.visible === 1);

    for (const row of rows) {
      const { prev, next } = this.neighboursIn(chain, row);
      const html = renderProjectPage(
        this.toPage(row),
        prev,
        next,
        this.mediaLookupFor(JSON.parse(row.blocks) as Block[]),
      );
      this.writePage(`project-${row.slug}.html`, html);
    }

    this.writePage('projects.html', renderProjectsIndex(chain.map((r) => this.toPage(r))));
  }

  private toPage(row: ProjectRow): PageProject {
    return {
      slug: row.slug,
      title: row.title,
      status: row.status,
      palette: row.palette,
      lede: row.lede,
      cardBlurb: row.card_blurb,
      chips: JSON.parse(row.chips) as Chip[],
      blocks: JSON.parse(row.blocks) as Block[],
    };
  }

  private neighboursOf(row: ProjectRow): { prev: Neighbour | null; next: Neighbour | null } {
    const chain = this.database.db
      .prepare(
        `SELECT * FROM projects WHERE published_at IS NOT NULL AND visible = 1
          ORDER BY sort_order, title COLLATE NOCASE`,
      )
      .all() as ProjectRow[];
    return this.neighboursIn(chain, row);
  }

  private neighboursIn(
    chain: ProjectRow[],
    row: ProjectRow,
  ): { prev: Neighbour | null; next: Neighbour | null } {
    const i = chain.findIndex((r) => r.id === row.id);
    if (i === -1) return { prev: null, next: null };
    const toNeighbour = (r: ProjectRow | undefined): Neighbour | null =>
      r ? { slug: r.slug, title: r.title } : null;
    return { prev: toNeighbour(chain[i - 1]), next: toNeighbour(chain[i + 1]) };
  }

  /**
   * Loads every media row the blocks reference, and throws a 400 naming the
   * missing ids if any upload has since been deleted.
   */
  private mediaLookupFor(blocks: Block[]): MediaLookup {
    const ids = collectMediaIds(blocks);
    const map = new Map<number, MediaRef>();

    for (const id of ids) {
      const m = this.database.db.prepare('SELECT * FROM media WHERE id = ?').get(id) as
        | MediaRow
        | undefined;
      if (m) {
        map.set(id, {
          filename: m.filename,
          originalName: m.original_name,
          mime: m.mime,
          sizeBytes: m.size_bytes,
          width: m.width,
          height: m.height,
        });
      }
    }

    const missing = ids.filter((id) => !map.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `The page references uploads that no longer exist (media id ${missing.join(', ')}).`,
      );
    }

    return (id) => {
      const ref = map.get(id);
      if (!ref) throw new BadRequestException(`Unknown media id ${id}.`);
      return ref;
    };
  }

  // -------------------------------------------------------------------------
  // Disk
  // -------------------------------------------------------------------------

  /** Same last-line-of-defence shape as VaultService.resolvePath. */
  private resolvePagePath(name: string): string {
    const safeName = basename(name);
    if (!PAGE_NAME.test(safeName)) {
      throw new BadRequestException('Refusing to write that filename.');
    }

    const root = resolve(config.site.pagesDir);
    const path = resolve(join(root, safeName));

    if (!path.startsWith(root + sep)) {
      this.logger.warn(`Refused a path outside the pages directory: ${name}`);
      throw new BadRequestException('Refusing to write that filename.');
    }

    return path;
  }

  /** Write-then-rename, so a reader never sees a half-written page. */
  private writePage(name: string, html: string): void {
    const path = this.resolvePagePath(name);
    const tmp = path + '.tmp';
    writeFileSync(tmp, html, 'utf8');
    renameSync(tmp, path);
  }
}
