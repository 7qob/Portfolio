/**
 * The block format: what a project's body is made of, and the gate every
 * incoming payload passes before it is stored.
 *
 * Each type maps 1:1 onto a content block that already exists in style.css —
 * the catalogue documented in project-template.html. Nothing here renders;
 * normalising is a separate concern from emitting HTML (render.ts) so that a
 * record read back from the database is already known to be well-formed.
 *
 * Validation is hand-rolled rather than class-validator because the payload
 * is a discriminated union three levels deep, which decorators express badly
 * and error-message quality matters here: the author is a human in a form,
 * and "blocks[3].rows[1].alt must be a string" is actionable where a bare
 * 400 is not.
 */

export interface NoteRef {
  text: string;
  accent: boolean;
}

export interface SectionBlock {
  type: 'section';
  heading: string;
  body: string[];
  note: NoteRef | null;
}

export interface StepsBlock {
  type: 'steps';
  heading: string;
  items: { lead: string | null; text: string }[];
}

export interface FeaturesBlock {
  type: 'features';
  heading: string;
  items: string[];
}

export interface TableBlock {
  type: 'table';
  heading: string;
  columns: string[];
  rows: string[][];
}

export interface FigureBlock {
  type: 'figure';
  mediaId: number;
  alt: string;
  caption: string;
}

export interface MediaRow {
  mediaId: number;
  alt: string;
  title: string;
  body: string[];
  wide: boolean;
}

export interface MediaBlock {
  type: 'media';
  heading: string;
  rows: MediaRow[];
}

export interface DatarowBlock {
  type: 'datarow';
  cells: { key: string; value: string }[];
}

export interface FilesBlock {
  type: 'files';
  heading: string;
  items: { mediaId: number; label: string; note: string | null }[];
}

export interface LinksBlock {
  type: 'links';
  heading: string;
  items: { label: string; href: string; note: string | null }[];
}

export type Block =
  | SectionBlock
  | StepsBlock
  | FeaturesBlock
  | TableBlock
  | FigureBlock
  | MediaBlock
  | DatarowBlock
  | FilesBlock
  | LinksBlock;

export interface Chip {
  label: string;
  icon: string | null;
}

/** Raised on any malformed payload; the service maps it to a 400. */
export class BlockError extends Error {}

/**
 * Only these schemes and shapes may become an href. Everything else stays
 * literal text, so a stored payload can never smuggle javascript: into a
 * generated page.
 */
export const SAFE_HREF = /^(https?:\/\/|\/|#|[a-z0-9][a-z0-9._-]*\.html)/i;

// ---------------------------------------------------------------------------
// Primitive checks. `at` names the offending field in the error, path-style.
// ---------------------------------------------------------------------------

const LIMITS = {
  blocks: 64,
  heading: 120,
  paragraph: 4000,
  short: 300,
  items: 60,
  columns: 8,
  rows: 80,
  cells: 6,
  chips: 10,
} as const;

function fail(at: string, why: string): never {
  throw new BlockError(`${at}: ${why}`);
}

function obj(v: unknown, at: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(at, 'must be an object');
  return v as Record<string, unknown>;
}

function arr(v: unknown, at: string, max: number): unknown[] {
  if (!Array.isArray(v)) fail(at, 'must be an array');
  if (v.length > max) fail(at, `too long (max ${max})`);
  return v;
}

function str(v: unknown, at: string, max: number): string {
  if (typeof v !== 'string') fail(at, 'must be a string');
  const out = v.trim();
  if (!out) fail(at, 'must not be empty');
  if (out.length > max) fail(at, `too long (max ${max} characters)`);
  return out;
}

function optStr(v: unknown, at: string, max: number): string | null {
  if (v === undefined || v === null || v === '') return null;
  return str(v, at, max);
}

function mediaId(v: unknown, at: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    fail(at, 'must reference an uploaded file');
  }
  return v;
}

function note(v: unknown, at: string): NoteRef | null {
  if (v === undefined || v === null) return null;
  const o = obj(v, at);
  return {
    text: str(o.text, `${at}.text`, LIMITS.paragraph),
    accent: o.accent === true,
  };
}

function paragraphs(v: unknown, at: string): string[] {
  return arr(v, at, LIMITS.items).map((p, i) => str(p, `${at}[${i}]`, LIMITS.paragraph));
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export function normalizeBlocks(input: unknown): Block[] {
  const list = arr(input, 'blocks', LIMITS.blocks);

  return list.map((raw, i) => {
    const at = `blocks[${i}]`;
    const b = obj(raw, at);

    switch (b.type) {
      case 'section':
        return {
          type: 'section',
          heading: str(b.heading, `${at}.heading`, LIMITS.heading),
          body: paragraphs(b.body, `${at}.body`),
          note: note(b.note, `${at}.note`),
        } satisfies SectionBlock;

      case 'steps':
        return {
          type: 'steps',
          heading: str(b.heading, `${at}.heading`, LIMITS.heading),
          items: arr(b.items, `${at}.items`, LIMITS.items).map((it, j) => {
            const o = obj(it, `${at}.items[${j}]`);
            return {
              lead: optStr(o.lead, `${at}.items[${j}].lead`, LIMITS.heading),
              text: str(o.text, `${at}.items[${j}].text`, LIMITS.paragraph),
            };
          }),
        } satisfies StepsBlock;

      case 'features':
        return {
          type: 'features',
          heading: str(b.heading, `${at}.heading`, LIMITS.heading),
          items: arr(b.items, `${at}.items`, LIMITS.items).map((it, j) =>
            str(it, `${at}.items[${j}]`, LIMITS.short),
          ),
        } satisfies FeaturesBlock;

      case 'table': {
        const rawColumns = arr(b.columns, `${at}.columns`, LIMITS.columns);
        if (!rawColumns.length) fail(`${at}.columns`, 'a table needs at least one column');
        const columns = rawColumns.map((c, j) => str(c, `${at}.columns[${j}]`, LIMITS.heading));
        return {
          type: 'table',
          heading: str(b.heading, `${at}.heading`, LIMITS.heading),
          columns,
          rows: arr(b.rows, `${at}.rows`, LIMITS.rows).map((row, j) => {
            const cells = arr(row, `${at}.rows[${j}]`, LIMITS.columns).map((c, k) =>
              str(c, `${at}.rows[${j}][${k}]`, LIMITS.short),
            );
            if (cells.length !== columns.length) {
              fail(`${at}.rows[${j}]`, `must have ${columns.length} cells to match the columns`);
            }
            return cells;
          }),
        } satisfies TableBlock;
      }

      case 'figure':
        return {
          type: 'figure',
          mediaId: mediaId(b.mediaId, `${at}.mediaId`),
          alt: str(b.alt, `${at}.alt`, LIMITS.paragraph),
          caption: str(b.caption, `${at}.caption`, LIMITS.short),
        } satisfies FigureBlock;

      case 'media':
        return {
          type: 'media',
          heading: str(b.heading, `${at}.heading`, LIMITS.heading),
          rows: arr(b.rows, `${at}.rows`, LIMITS.items).map((row, j) => {
            const o = obj(row, `${at}.rows[${j}]`);
            return {
              mediaId: mediaId(o.mediaId, `${at}.rows[${j}].mediaId`),
              alt: str(o.alt, `${at}.rows[${j}].alt`, LIMITS.paragraph),
              title: str(o.title, `${at}.rows[${j}].title`, LIMITS.heading),
              body: paragraphs(o.body, `${at}.rows[${j}].body`),
              wide: o.wide === true,
            };
          }),
        } satisfies MediaBlock;

      case 'datarow':
        return {
          type: 'datarow',
          cells: arr(b.cells, `${at}.cells`, LIMITS.cells).map((cell, j) => {
            const o = obj(cell, `${at}.cells[${j}]`);
            return {
              key: str(o.key, `${at}.cells[${j}].key`, LIMITS.heading),
              value: str(o.value, `${at}.cells[${j}].value`, LIMITS.short),
            };
          }),
        } satisfies DatarowBlock;

      case 'files':
        return {
          type: 'files',
          heading: str(b.heading, `${at}.heading`, LIMITS.heading),
          items: arr(b.items, `${at}.items`, LIMITS.items).map((it, j) => {
            const o = obj(it, `${at}.items[${j}]`);
            return {
              mediaId: mediaId(o.mediaId, `${at}.items[${j}].mediaId`),
              label: str(o.label, `${at}.items[${j}].label`, LIMITS.heading),
              note: optStr(o.note, `${at}.items[${j}].note`, LIMITS.short),
            };
          }),
        } satisfies FilesBlock;

      case 'links':
        return {
          type: 'links',
          heading: str(b.heading, `${at}.heading`, LIMITS.heading),
          items: arr(b.items, `${at}.items`, LIMITS.items).map((it, j) => {
            const o = obj(it, `${at}.items[${j}]`);
            const href = str(o.href, `${at}.items[${j}].href`, 600);
            if (!SAFE_HREF.test(href)) {
              fail(`${at}.items[${j}].href`, 'must be https://, a site path or a #fragment');
            }
            return {
              label: str(o.label, `${at}.items[${j}].label`, LIMITS.heading),
              href,
              note: optStr(o.note, `${at}.items[${j}].note`, LIMITS.short),
            };
          }),
        } satisfies LinksBlock;

      default:
        fail(`${at}.type`, `unknown block type "${String(b.type)}"`);
    }
  });
}

/** Chip icons come from the renderer's own catalogue, never from the form. */
export function normalizeChips(input: unknown, iconNames: ReadonlySet<string>): Chip[] {
  return arr(input, 'chips', LIMITS.chips).map((raw, i) => {
    const o = obj(raw, `chips[${i}]`);
    const icon = optStr(o.icon, `chips[${i}].icon`, 40);
    if (icon !== null && !iconNames.has(icon)) {
      fail(`chips[${i}].icon`, `unknown icon "${icon}"`);
    }
    return { label: str(o.label, `chips[${i}].label`, 60), icon };
  });
}

/** Every media id a page depends on — publish refuses if any is missing. */
export function collectMediaIds(blocks: Block[]): number[] {
  const ids = new Set<number>();
  for (const b of blocks) {
    if (b.type === 'figure') ids.add(b.mediaId);
    else if (b.type === 'media') b.rows.forEach((r) => ids.add(r.mediaId));
    else if (b.type === 'files') b.items.forEach((it) => ids.add(it.mediaId));
  }
  return [...ids];
}
