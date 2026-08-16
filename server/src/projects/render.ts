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
 * The one style attribute this file emits is re-checked here against the hex
 * regex rather than trusted from the record, for the same reason.
 */

import { ACCENT_HEX, Block, Chip, MediaBlock, SAFE_HREF, TextBlock } from './blocks';

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
  accent: string | null;
  homeSlot: string | null;
  repoUrl: string | null;
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

/** The markers renderHome() writes between, and nothing outside them. */
export const HOME_START = '<!-- projects:start -->';
export const HOME_END = '<!-- projects:end -->';

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

/**
 * Markup is built at its own natural indentation and placed by whatever
 * contains it. Without this every fragment would have to know how deeply it
 * was going to be nested, which is how the per-type renderers ended up with
 * their indentation baked in and drifting.
 */
function indent(html: string, pad: string): string {
  return html
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n');
}

// ---------------------------------------------------------------------------
// SVG catalogue. Server-side constants copied verbatim from the hand-written
// pages — never author input. Chip icons are addressed by name from the form.
// ---------------------------------------------------------------------------

const SVG_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** Attribute order follows the hand-written pages: xmlns, size, then the rest. */
function svg(paths: string, size?: number): string {
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${dims} ${SVG_ATTRS}>${paths}</svg>`;
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

const ICON_CHEVRON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

const ICON_BOX_ARROW =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

const ICON_STAR = svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', 14);

const ICON_FOLDER = svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', 14);

/** Written relative to the frame that holds it; indent() places it. */
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

function chipList(chips: Chip[], pad: string): string {
  if (!chips.length) return '';
  const items = chips
    .map((c) => {
      const paths = c.icon ? CHIP_ICONS[c.icon] : undefined;
      // .chip svg sizes these to 14px anyway; the attributes are there so the
      // chip row does not jump while the stylesheet is still loading.
      const icon = paths ? svg(paths, 14) : '';
      return `  <li class="chip">${icon}${esc(c.label)}</li>`;
    })
    .join('\n');
  return indent(`<ul class="chips">\n${items}\n</ul>`, pad) + '\n';
}

/**
 * The project's colour, as a class and an inline custom property.
 *
 * `.is-custom` derives the shade and the tint from `--edge-brand` with
 * color-mix, once, for both themes — which is what replaced four hand-written
 * palettes of three hex values each. The value is re-tested here rather than
 * trusted: the DTO checked what arrived over HTTP, this checks what is about
 * to be interpolated into a style attribute on a public page, and those are
 * different moments with a database in between.
 */
function accentAttrs(accent: string | null): { cls: string; style: string } {
  if (!accent || !ACCENT_HEX.test(accent)) return { cls: '', style: '' };
  return { cls: ' is-custom', style: ` style="--edge-brand:${accent.toLowerCase()}"` };
}

// ---------------------------------------------------------------------------
// The two bands
// ---------------------------------------------------------------------------

/**
 * Every top-level block on a project page is a band: a hairline along the top,
 * a heading, and its content. `collapsible` picks which of the two shells that
 * band wears — an ordinary <section>, or the <details> that keeps everything
 * inside it (bytes included) behind one click.
 */
function band(opts: {
  id: string;
  heading: string;
  inner: string;
  collapsible: boolean;
  hint?: string;
  bodyClass?: string;
}): string {
  if (!opts.collapsible) {
    return `      <section class="project__section" aria-labelledby="${opts.id}">
        <h2 class="section-label" id="${opts.id}">${esc(opts.heading)}</h2>
${indent(opts.inner, '        ')}
      </section>
`;
  }

  const hint = opts.hint ? `\n          <span class="reveal__hint">${opts.hint}</span>` : '';

  return `      <details class="reveal">
        <summary class="reveal__summary">
          <h2 class="section-label">${esc(opts.heading)}</h2>${hint}
          <span class="reveal__mark" aria-hidden="true">
            ${ICON_CHEVRON}
          </span>
        </summary>

        <div class="reveal__body${opts.bodyClass ?? ''}">
${indent(opts.inner, '          ')}
        </div>
      </details>
`;
}

function renderTextBand(b: TextBlock, id: string): string {
  return band({
    id,
    heading: b.heading,
    inner: b.body.map((par) => `<p>${inline(par)}</p>`).join('\n'),
    collapsible: b.collapsible,
    // A folded text band is prose with no .mediarow__text of its own to carry
    // the reading class, so it takes it directly.
    bodyClass: ' reading',
  });
}

function mediaSrc(m: MediaRef, p: string): string {
  return `${p}assets/up/${esc(m.filename)}`;
}

function dims(m: MediaRef): string {
  return m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
}

function renderMediaBand(b: MediaBlock, id: string, media: MediaLookup, p: string): string {
  const totalBytes = b.rows.reduce((sum, r) => sum + media(r.mediaId).sizeBytes, 0);
  const n = b.rows.length;

  const rows = b.rows
    .map((row) => {
      const m = media(row.mediaId);
      const wide = row.layout === 'below' ? ' mediarow--wide' : '';
      const text = `  <div class="mediarow__text reading">
    <h3 class="mediarow__title">${esc(row.title)}</h3>
${row.body.map((par) => `    <p>${inline(par)}</p>`).join('\n')}
  </div>`;

      if (m.mime === 'video/mp4') {
        // The MP4 shape: a frame wrapping the video, the two clip buttons and
        // the progress track — initClipToggles() drives these off the
        // data-clip-* attributes, unchanged.
        const frame = `<video class="mediarow__media" src="${mediaSrc(m, p)}"${dims(m)} autoplay loop muted playsinline preload="none" aria-label="${esc(row.alt)}"></video>
${CLIP_CONTROLS}`;
        return `<div class="mediarow${wide}">
  <div class="mediarow__frame">
${indent(frame, '    ')}
  </div>
${text}
</div>`;
      }

      // The image/GIF shape: a bare lazy <img> as a direct child of the row.
      // Inside a closed <details> it has no layout box, so nothing is
      // downloaded until the band is opened.
      return `<div class="mediarow${wide}">
  <img class="mediarow__media" src="${mediaSrc(m, p)}"${dims(m)} loading="lazy" decoding="async" alt="${esc(row.alt)}">
${text}
</div>`;
    })
    .join('\n\n');

  return band({
    id,
    heading: b.heading,
    inner: rows,
    collapsible: b.collapsible,
    // Computed from the real files on disk, never typed by the author —
    // someone on mobile data is entitled to know before they tap.
    hint: `${n} clip${n === 1 ? '' : 's'} &middot; ${formatBytes(totalBytes)}`,
  });
}

function renderBlock(b: Block, index: number, media: MediaLookup, p: string): string {
  const id = `lbl-b${index}`;
  return b.type === 'text' ? renderTextBand(b, id) : renderMediaBand(b, id, media, p);
}

/**
 * The repository, as the last thing before the pager. A .linklist with one
 * item rather than a new block type: the shape of the page should not depend
 * on how many links a project happens to have, and this needs no new CSS.
 */
function repoLink(url: string): string {
  const label = url.replace(/^https:\/\//i, '').replace(/\/+$/, '');
  return `    <nav class="linklist" aria-labelledby="lbl-repo">
      <h2 class="section-label" id="lbl-repo">Source</h2>
      <ul>
        <li>
          <a href="${esc(url)}" target="_blank" rel="noopener">
            <span class="linklist__label">${esc(label)}</span>
            ${ICON_EXTERNAL}
            <span class="linklist__note">The repository this page describes.</span>
          </a>
        </li>
      </ul>
    </nav>
`;
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

  const status = project.status ? ` <span class="status">${esc(project.status)}</span>` : '';

  const accent = accentAttrs(project.accent);

  let html = head(project.title, 'article', p);
  html += '\n';
  html += header(p);
  html += `
  <div class="page-head page-head--project${accent.cls}"${accent.style}>
    <h1 class="page-head__title" id="page-title">${esc(project.title)}${status}</h1>
${chipList(project.chips, '    ')}  </div>

  <main class="page-body page-body--project" aria-labelledby="page-title">
    <article class="project reading">

`;
  if (project.lede) {
    html += `      <p class="project__lede">${inline(project.lede)}</p>\n\n`;
  }

  html += project.blocks.map((b, i) => renderBlock(b, i, media, p)).join('\n');
  html += `
    </article>

`;

  // The fixed tail, enforced by code rather than by discipline: the bands the
  // author wrote, then the repository, then the pager.
  if (project.repoUrl) html += repoLink(project.repoUrl);

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

/**
 * The card a project wears on both index pages. Same parts everywhere — the
 * stretched link, the arrow, the label, the name, the chips, the blurb — so a
 * project is recognisably the same object on the bento and on projects.html.
 */
function projectCard(
  proj: PageProject,
  opts: { tag: 'li' | 'section'; extraClass: string; large: boolean; wrapBody: boolean; p: string },
): string {
  const id = `p-${esc(proj.slug)}`;
  const accent = accentAttrs(proj.accent);
  const featured = proj.status === 'Featured';
  const label = featured ? `${ICON_STAR}Featured` : `${ICON_FOLDER}Project`;
  const wip = proj.status === 'WIP' ? `\n        <span class="status">WIP</span>` : '';
  const blurb = proj.cardBlurb ?? proj.lede ?? '';
  const nameClass = `project-box__name${opts.large ? ' project-box__name--lg' : ''}`;

  // On the bento the label is the labelling element (it holds the id and the
  // card's name is a plain span); on projects.html the name is the heading.
  const bento = opts.tag === 'section';
  const labelId = bento ? ` id="${id}"` : '';
  const name = bento
    ? `        <span class="${nameClass}">${esc(proj.title)}</span>`
    : `        <h2 class="${nameClass}" id="${id}">${esc(proj.title)}</h2>`;

  const body = `${chipList(proj.chips, '        ')}        <p class="box__text">${inline(blurb)}</p>`;

  return `      <${opts.tag} class="box box--link box--edge${accent.cls}${opts.extraClass}"${accent.style} aria-labelledby="${id}">
        <a class="stretched-link" href="${opts.p}project-${esc(proj.slug)}.html" aria-label="${esc(proj.title)} — project page"></a>
        <span class="box-arrow" aria-hidden="true">
          ${ICON_BOX_ARROW}
        </span>
        <h2 class="box__label"${labelId}>${label}</h2>
        <div class="project-box__head">
${name}${wip}
        </div>
${opts.wrapBody ? `        <div class="box__body">\n${indent(body, '  ')}\n        </div>` : body}
      </${opts.tag}>`;
}

export function renderProjectsIndex(projects: PageProject[], opts: RenderOptions = {}): string {
  const p = opts.assetPrefix ?? '';

  const cards = projects
    .map((proj) =>
      projectCard(proj, {
        tag: 'li',
        // Featured and WIP cards take a full row so they sit level; the plain
        // ones share it — the same split the hand-written grid used.
        extraClass: proj.status ? ' is-wide' : '',
        large: proj.status === 'Featured',
        wrapBody: false,
        p,
      }),
    )
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

/**
 * The home page, which is hand-written everywhere except its project cards.
 *
 * Two edits and no others: the region between the two markers becomes one
 * card per slotted project, and the bento's data-projects count becomes the
 * number of them — that attribute is what selects the grid's area map, so
 * three projects reflow into a full grid instead of leaving a hole. The hero,
 * the about card, the contribution graph and the link stack are never read,
 * never parsed and never touched. Publishing is a splice, not a re-render.
 */
export function renderHome(template: string, projects: PageProject[], opts: RenderOptions = {}): string {
  const p = opts.assetPrefix ?? '';

  const start = template.indexOf(HOME_START);
  const end = template.indexOf(HOME_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `The home template has no ${HOME_START} / ${HOME_END} pair, so there is ` +
        'nowhere to write the project cards.',
    );
  }

  const cards = projects
    .map((proj) =>
      projectCard(proj, {
        tag: 'section',
        extraClass: ` area-${proj.homeSlot ?? ''}`,
        large: proj.homeSlot === 'feature',
        wrapBody: true,
        p,
      }),
    )
    .join('\n\n');

  const before = template.slice(0, start + HOME_START.length);
  const after = template.slice(end);
  const html = cards ? `${before}\n\n${cards}\n\n    ${after}` : `${before}\n    ${after}`;

  // Anchored on the opening tag, so the count cannot be rewritten anywhere
  // else a similar attribute might appear. A replacer function, because a
  // string replacement would read $& and friends out of the card markup.
  return html.replace(
    /(<main class="bento"[^>]*\bdata-projects=")\d+(")/,
    (_match, head: string, tail: string) => `${head}${projects.length}${tail}`,
  );
}
