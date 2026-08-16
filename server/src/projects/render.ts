/**
 * block[] -> HTML. Pure functions, no Nest, no I/O.
 *
 * The output is a plain static page: it loads style.css and script.js and
 * nothing else, works over file://, and makes zero API calls — exactly like
 * the hand-written pages it stands beside. Every class emitted here already
 * exists in style.css; this file adds no CSS and expects none.
 *
 * Security stance: every author-supplied value passes through esc() before it
 * can reach the page. The only markup an author can produce is [text](url)
 * and `code`, applied AFTER escaping, with the href checked against SAFE_HREF
 * — so no raw HTML from the form ever reaches a visitor, and neither does a
 * javascript: link. "An admin typed it" is not the same as "it is well-formed".
 */

import {
  Block,
  Chip,
  DatarowBlock,
  FigureBlock,
  FilesBlock,
  LinksBlock,
  MediaBlock,
  SAFE_HREF,
} from './blocks';

export interface MediaRef {
  filename: string;
  originalName: string | null;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/** Must throw when the id is unknown — publish checks first, this is backstop. */
export type MediaLookup = (id: number) => MediaRef;

export interface PageProject {
  slug: string;
  title: string;
  status: string | null;
  palette: string | null;
  lede: string | null;
  cardBlurb: string | null;
  chips: Chip[];
  blocks: Block[];
}

export interface Neighbour {
  slug: string;
  title: string;
}

export interface RenderOptions {
  /**
   * '' for published pages (relative, file://-safe, same as the hand-written
   * pages), '/' for the preview endpoint, whose own URL lives under /api/.
   */
  assetPrefix?: string;
}

/** The four palettes style.css defines. A new one needs a CSS line first. */
export const PALETTES: ReadonlySet<string> = new Set(['comfy', 'ignite', 'kobui', 'stalkr']);

export const STATUSES: ReadonlySet<string> = new Set(['WIP', 'Featured']);

// ---------------------------------------------------------------------------
// Escaping and the two inline forms
// ---------------------------------------------------------------------------

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

/**
 * Prose fields only. Escape first, then exactly two transforms on the escaped
 * text: `code` and [label](url). An unsafe url leaves the whole thing as
 * literal text rather than guessing at intent.
 */
export function inline(value: string): string {
  let out = esc(value);
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]\n]+)\]\(([^()\s]+)\)/g, (match, label: string, href: string) => {
    if (!SAFE_HREF.test(href)) return match;
    const external = /^https?:\/\//i.test(href);
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  return out;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB'];
  let value = bytes;
  let u = 0;
  while (value >= 1024 && u < units.length - 1) {
    value /= 1024;
    u++;
  }
  return (u > 0 && value < 10 ? value.toFixed(1) : String(Math.round(value))) + ' ' + units[u];
}

// ---------------------------------------------------------------------------
// SVG catalogue. Server-side constants copied verbatim from the hand-written
// pages — never author input. Chip icons are addressed by name from the form.
// ---------------------------------------------------------------------------

const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

function svg(paths: string, size?: number): string {
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return `<svg ${SVG_ATTRS}${dims}>${paths}</svg>`;
}

/** Chip icons, keyed by the name the admin form offers. */
export const CHIP_ICONS: Record<string, string> = {
  nodes:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/>',
  image:
    '<rect x="3" y="3" width="18" height="18"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  python:
    '<path d="M12.2 11.5H7.3A3.3 3.3 0 0 1 4 8.2V6.3A3.3 3.3 0 0 1 7.3 3h4.9a3.3 3.3 0 0 1 3.3 3.3v2.4"/><path d="M11.8 12.5h4.9a3.3 3.3 0 0 1 3.3 3.3v1.9a3.3 3.3 0 0 1-3.3 3.3h-4.9a3.3 3.3 0 0 1-3.3-3.3v-2.4"/><path d="M7.6 6.2h.01M16.4 17.8h.01"/>',
  rust: '<circle cx="12" cy="12" r="6.3"/><circle cx="12" cy="12" r="2.4"/><g stroke-width="2.6" stroke-linecap="butt"><path d="M12 5.7V2.5M12 18.3v3.2M5.7 12H2.5M18.3 12h3.2M7.55 7.55L5.28 5.28M16.45 16.45l2.27 2.27M16.45 7.55l2.27-2.27M7.55 16.45l-2.27 2.27"/></g>',
  proxy:
    '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  stream: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  react:
    '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10" ry="4.2"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)"/>',
  typescript:
    '<rect x="2.5" y="2.5" width="19" height="19"/><g stroke-width="1.8"><path d="M6 12.4h6.4M9.2 12.4V19"/><path d="M19.9 13.6a2.1 2.1 0 0 0-3.5 1.5c0 1.9 3.5 1.2 3.5 3.1a2.1 2.1 0 0 1-3.5 1.4"/></g>',
  kobold:
    '<rect x="4" y="4" width="16" height="16"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  node: '<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/>',
};

export const CHIP_ICON_NAMES: ReadonlySet<string> = new Set(Object.keys(CHIP_ICONS));

const ICON_MOON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

const ICON_EXTERNAL = svg('<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>', 13);

const ICON_DOWNLOAD = svg(
  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  13,
);

const ICON_CHEVRON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

const ICON_BOX_ARROW =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

const ICON_STAR = svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', 14);

const ICON_FOLDER = svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', 14);

const CLIP_CONTROLS = `<button class="clip-btn clip-btn--play" type="button" data-clip-toggle aria-label="Pause clip">
                <span data-clip-icon="pause">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/></svg>
                </span>
                <span data-clip-icon="play" hidden>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 4 20 12 6 20"/></svg>
                </span>
              </button>
              <button class="clip-btn clip-btn--full" type="button" data-clip-fullscreen aria-label="Fullscreen">
                <span data-clip-icon="enter">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 3 3 3 3 9"/><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><polyline points="15 21 21 21 21 15"/></svg>
                </span>
                <span data-clip-icon="exit" hidden>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 9 9 9 9 3"/><polyline points="21 9 15 9 15 3"/><polyline points="3 15 9 15 9 21"/><polyline points="21 15 15 15 15 21"/></svg>
                </span>
              </button>
              <div class="clip-track" data-clip-track aria-hidden="true"><span class="clip-track__fill" data-clip-fill></span></div>`;

// ---------------------------------------------------------------------------
// Page shell — byte-for-byte the same head, header and footer as the
// hand-written pages, so a generated page is indistinguishable in the browser.
// ---------------------------------------------------------------------------

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='.5' y='.5' width='31' height='31' fill='%230e0e0e' stroke='%232a2a2a'/%3E%3Crect x='9' y='9' width='14' height='14' fill='%23ff1e2f'/%3E%3C/svg%3E";

function head(title: string, ogType: string, p: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} · kiraa1q</title>
  <meta name="description" content="">

  <!-- Open Graph (empty — fill before sharing) -->
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="">
  <meta property="og:description" content="">
  <meta property="og:image" content="">
  <meta property="og:url" content="">

  <link rel="icon" href="${FAVICON}">
  <link rel="stylesheet" href="${p}style.css">

  <!-- Apply the saved theme before first paint, so a light-mode visitor
       never sees a dark flash when moving between pages. -->
  <script>
    try {
      if (localStorage.getItem("theme") === "light") {
        document.documentElement.classList.add("light");
      }
    } catch (e) {}
  </script>
</head>
<body>
`;
}

function header(p: string): string {
  return `  <!-- The site's one navigation. Byte-identical on every page except for
       which link carries aria-current, so "where can I go" never depends on
       "where am I". Sticky on mobile — see .site-header in style.css. -->
  <header class="site-header">
    <nav class="site-nav" aria-label="Main">
      <a href="${p}index.html">Home</a>
      <a href="${p}projects.html" aria-current="page">Projects</a>
      <a href="${p}about.html">About</a>
      <a href="${p}vault/index.html">Vault</a>
    </nav>
    <button class="icon-btn" type="button" id="theme-toggle" aria-label="Toggle dark/bright" aria-pressed="false">
      <span data-theme-icon>
        ${ICON_MOON}
      </span>
    </button>
  </header>
`;
}

function footer(p: string): string {
  return `  <!-- Legal + credit only. Navigation is in the header. -->
  <footer class="site-footer">
    <span class="site-footer__meta">&copy; <span id="year"></span> kiraa1q &middot; v1.0.0</span>
    <a href="${p}impressum.html">Impressum</a>
    <a href="https://github.com/kiraa1q" target="_blank" rel="noopener">GitHub<svg class="footer-arrow" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></a>
  </footer>

  <script src="${p}script.js"></script>
</body>
</html>
`;
}

function chipList(chips: Chip[]): string {
  if (!chips.length) return '';
  const items = chips
    .map((c) => {
      const paths = c.icon ? CHIP_ICONS[c.icon] : undefined;
      const icon = paths ? svg(paths) : '';
      return `      <li class="chip">${icon}${esc(c.label)}</li>`;
    })
    .join('\n');
  return `    <ul class="chips">\n${items}\n    </ul>\n`;
}

// ---------------------------------------------------------------------------
// The blocks
// ---------------------------------------------------------------------------

function sectionLabel(id: string, heading: string): string {
  return `<h2 class="section-label" id="${id}">${esc(heading)}</h2>`;
}

function renderNote(n: { text: string; accent: boolean } | null): string {
  if (!n) return '';
  return `        <div class="note${n.accent ? ' note--accent' : ''}">${inline(n.text)}</div>\n`;
}

function mediaSrc(m: MediaRef, p: string): string {
  return `${p}assets/up/${esc(m.filename)}`;
}

function dims(m: MediaRef): string {
  return m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
}

function renderFigure(b: FigureBlock, media: MediaLookup, p: string): string {
  const m = media(b.mediaId);
  return `      <!-- The <figure> self-hides if its image is missing (see initFigures in
           script.js), so the page is never scarred by a missing file. -->
      <figure class="figure">
        <img src="${mediaSrc(m, p)}" alt="${esc(b.alt)}"${dims(m)} loading="lazy" decoding="async">
        <figcaption>${inline(b.caption)}</figcaption>
      </figure>
`;
}

function renderMediaBand(b: MediaBlock, media: MediaLookup, p: string): string {
  const totalBytes = b.rows.reduce((sum, r) => sum + media(r.mediaId).sizeBytes, 0);
  const n = b.rows.length;
  const hint = `${n} clip${n === 1 ? '' : 's'} &middot; ${formatBytes(totalBytes)}`;

  const rows = b.rows
    .map((row) => {
      const m = media(row.mediaId);
      const text = `            <div class="mediarow__text reading">
              <h3 class="mediarow__title">${esc(row.title)}</h3>
${row.body.map((par) => `              <p>${inline(par)}</p>`).join('\n')}
            </div>`;

      if (m.mime === 'video/mp4') {
        // The MP4 shape (project-comfyui.html): a frame wrapping the video,
        // the two clip buttons and the progress track — initClipToggles()
        // drives these off the data-clip-* attributes, unchanged.
        return `          <div class="mediarow${row.wide ? ' mediarow--wide' : ''}">
            <div class="mediarow__frame">
              <video class="mediarow__media" src="${mediaSrc(m, p)}"${dims(m)} autoplay loop muted playsinline preload="none" aria-label="${esc(row.alt)}"></video>
              ${CLIP_CONTROLS}
            </div>
${text}
          </div>`;
      }

      // The GIF/image shape (about.html): a bare lazy <img> as a direct child
      // of the row. Inside the closed <details> it has no layout box, so
      // nothing is downloaded until the band is opened.
      return `          <div class="mediarow${row.wide ? ' mediarow--wide' : ''}">
            <img class="mediarow__media" src="${mediaSrc(m, p)}"${dims(m)} loading="lazy" decoding="async" alt="${esc(row.alt)}">
${text}
          </div>`;
    })
    .join('\n\n');

  return `      <!-- Closed on purpose: inside a closed <details> a lazy image has no
           layout box, so nothing below is fetched until the reader asks. -->
      <details class="reveal">
        <summary class="reveal__summary">
          <h2 class="section-label">${esc(b.heading)}</h2>
          <span class="reveal__hint">${hint}</span>
          <span class="reveal__mark" aria-hidden="true">
            ${ICON_CHEVRON}
          </span>
        </summary>

        <div class="reveal__body">
${rows}
        </div>
      </details>
`;
}

function renderDatarow(b: DatarowBlock): string {
  const cells = b.cells
    .map(
      (c) => `        <div class="datarow__cell">
          <dt>${esc(c.key)}</dt>
          <dd>${inline(c.value)}</dd>
        </div>`,
    )
    .join('\n');
  return `      <dl class="datarow">\n${cells}\n      </dl>\n`;
}

function renderLinklist(
  b: FilesBlock | LinksBlock,
  id: string,
  media: MediaLookup,
  p: string,
): string {
  const rows: { href: string; attrs: string; icon: string; label: string; note: string | null }[] =
    b.type === 'files'
      ? b.items.map((it) => {
          const m = media(it.mediaId);
          return {
            href: mediaSrc(m, p),
            // download names the saved file after the original upload, not
            // the content hash the server stores it under.
            attrs: ` download="${esc(m.originalName ?? m.filename)}"`,
            icon: ICON_DOWNLOAD,
            label: it.label,
            note: it.note,
          };
        })
      : b.items.map((it) => ({
          href: esc(it.href),
          attrs: /^https?:\/\//i.test(it.href) ? ' target="_blank" rel="noopener"' : '',
          icon: ICON_EXTERNAL,
          label: it.label,
          note: it.note,
        }));

  const items = rows
    .map((it) => {
      const noteSpan = it.note
        ? `\n            <span class="linklist__note">${esc(it.note)}</span>`
        : '';
      return `        <li>
          <a href="${it.href}"${it.attrs}>
            <span class="linklist__label">${esc(it.label)}</span>
            ${it.icon}${noteSpan}
          </a>
        </li>`;
    })
    .join('\n');

  return `    <nav class="linklist" aria-labelledby="${id}">
      ${sectionLabel(id, b.heading)}
      <ul>
${items}
      </ul>
    </nav>
`;
}

function renderBodyBlock(b: Block, index: number, media: MediaLookup, p: string): string {
  const id = `lbl-b${index}`;
  switch (b.type) {
    case 'section':
      return `      <section class="project__section" aria-labelledby="${id}">
        ${sectionLabel(id, b.heading)}
${b.body.map((par) => `        <p>${inline(par)}</p>`).join('\n')}
${renderNote(b.note)}      </section>
`;
    case 'steps':
      return `      <section class="project__section" aria-labelledby="${id}">
        ${sectionLabel(id, b.heading)}
        <ol class="steps">
${b.items
  .map((it) => {
    const lead = it.lead ? `<b>${esc(it.lead)} — </b>` : '';
    return `          <li><span>${lead}${inline(it.text)}</span></li>`;
  })
  .join('\n')}
        </ol>
      </section>
`;
    case 'features':
      return `      <section class="project__section" aria-labelledby="${id}">
        ${sectionLabel(id, b.heading)}
        <ul class="feature-list">
${b.items.map((it) => `          <li>${inline(it)}</li>`).join('\n')}
        </ul>
      </section>
`;
    case 'table':
      return `      <section class="project__section" aria-labelledby="${id}">
        ${sectionLabel(id, b.heading)}
        <div class="table-wrap">
          <table class="spec-table">
            <thead><tr>${b.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
            <tbody>
${b.rows.map((row) => `            <tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n')}
            </tbody>
          </table>
        </div>
      </section>
`;
    case 'figure':
      return renderFigure(b, media, p);
    case 'media':
      return renderMediaBand(b, media, p);
    default:
      // datarow/files/links are placed by renderProjectPage, not here.
      return '';
  }
}

// ---------------------------------------------------------------------------
// Whole pages
// ---------------------------------------------------------------------------

export function renderProjectPage(
  project: PageProject,
  prev: Neighbour | null,
  next: Neighbour | null,
  media: MediaLookup,
  opts: RenderOptions = {},
): string {
  const p = opts.assetPrefix ?? '';

  // The fixed order from project-template.html, enforced by code instead of
  // by discipline: body blocks in author order, datarow last in the article,
  // then files and links as siblings, then the pager.
  const body = project.blocks.filter(
    (b) => b.type !== 'datarow' && b.type !== 'files' && b.type !== 'links',
  );
  const datarows = project.blocks.filter((b): b is DatarowBlock => b.type === 'datarow');
  const tails = project.blocks.filter(
    (b): b is FilesBlock | LinksBlock => b.type === 'files' || b.type === 'links',
  );

  const status = project.status
    ? ` <span class="status">${esc(project.status)}</span>`
    : '';
  const palette = project.palette && PALETTES.has(project.palette) ? ` is-${project.palette}` : '';

  let html = head(project.title, 'article', p);
  html += '\n';
  html += header(p);
  html += `
  <div class="page-head page-head--project${palette}">
    <h1 class="page-head__title" id="page-title">${esc(project.title)}${status}</h1>
${chipList(project.chips)}  </div>

  <main class="page-body page-body--project" aria-labelledby="page-title">
    <article class="project reading">

`;
  if (project.lede) {
    html += `      <p class="project__lede">${inline(project.lede)}</p>\n\n`;
  }

  html += body.map((b, i) => renderBodyBlock(b, i, media, p)).join('\n');
  html += datarows.map((b) => '\n' + renderDatarow(b)).join('');
  html += `
    </article>

`;
  html += tails.map((b, i) => renderLinklist(b, `lbl-t${i}`, media, p)).join('\n');

  if (prev || next) {
    const prevLink = prev
      ? `      <a class="pager__prev" href="${p}project-${esc(prev.slug)}.html">
        <span class="pager__dir">&larr; Previous</span>
        <span>${esc(prev.title)}</span>
      </a>\n`
      : '';
    const nextLink = next
      ? `      <a class="pager__next" href="${p}project-${esc(next.slug)}.html">
        <span class="pager__dir">Next &rarr;</span>
        <span>${esc(next.title)}</span>
      </a>\n`
      : '';
    html += `
    <nav class="pager" aria-label="More projects">
${prevLink}${nextLink}    </nav>
`;
  }

  html += `  </main>

`;
  html += footer(p);
  return html;
}

export function renderProjectsIndex(projects: PageProject[], opts: RenderOptions = {}): string {
  const p = opts.assetPrefix ?? '';

  const cards = projects
    .map((proj) => {
      const palette = proj.palette && PALETTES.has(proj.palette) ? ` is-${proj.palette}` : '';
      // Featured and WIP cards take a full row so they sit level; the plain
      // ones share it — the same split the hand-written grid used.
      const wide = proj.status ? ' is-wide' : '';
      const featured = proj.status === 'Featured';
      const label = featured
        ? `${ICON_STAR}Featured`
        : `${ICON_FOLDER}Project`;
      const wip = proj.status === 'WIP' ? `\n          <span class="status">WIP</span>` : '';
      const blurb = proj.cardBlurb ?? proj.lede ?? '';

      return `      <li class="box box--link box--edge${palette}${wide}" aria-labelledby="p-${esc(proj.slug)}">
        <a class="stretched-link" href="${p}project-${esc(proj.slug)}.html" aria-label="${esc(proj.title)} — project page"></a>
        <span class="box-arrow" aria-hidden="true">
          ${ICON_BOX_ARROW}
        </span>
        <span class="box__label">${label}</span>
        <div class="project-box__head">
          <h2 class="project-box__name${featured ? ' project-box__name--lg' : ''}" id="p-${esc(proj.slug)}">${esc(proj.title)}</h2>${wip}
        </div>
${chipList(proj.chips)}        <p class="box__text">${inline(blurb)}</p>
      </li>`;
    })
    .join('\n\n');

  let html = head('Projects', 'website', p);
  html += '\n';
  html += header(p);
  html += `
  <div class="page-head">
    <h1 class="page-head__title" id="page-title">Projects</h1>
    <p class="page-head__lede">Tools, servers and experiments — mostly things I wanted for myself first.</p>
  </div>

  <main class="page-body" aria-labelledby="page-title">

    <ul class="project-grid">

${cards}

    </ul>

    <nav class="linklist" aria-labelledby="lbl-links">
      <h2 class="section-label" id="lbl-links">Elsewhere</h2>
      <ul>
        <li>
          <a href="https://github.com/kiraa1q" target="_blank" rel="noopener">
            <span class="linklist__label">More on GitHub</span>
            ${ICON_EXTERNAL}
          </a>
        </li>
      </ul>
    </nav>
  </main>

`;
  html += footer(p);
  return html;
}
