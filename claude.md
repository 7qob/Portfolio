# CLAUDE.md — kira1q.dev

## What this is

A personal portfolio site, plus a small private area for job applications.
It started as an empty scaffold; it is now a real site with real content and
a backend. This file used to describe the scaffold and was wrong on nearly
every point — if something here contradicts the code, the code is right and
this file should be fixed.

## Shape of the repo

```
index.html          bento home page
projects.html       project index
project-*.html      one page per project (hand-written; the admin panel can
                    also publish generated ones — see "Project pages from
                    the admin panel" below)
about.html          about
impressum.html      legal + Datenschutz (school requirement)
login.html          sign-in for the vault
admin.html          admin panel (admins only)
vault/index.html    private document list — an empty shell, filled by the API
style.css           all styling, one file
script.js           shared behaviour, loaded by every page
admin.js            admin panel only
server/             NestJS + TypeScript API (see below)
deploy/             nginx config and Pi deployment notes
docs/               planning notes
```

## Stack

**Front end: static HTML + CSS + JS. No framework, no build step, no bundler.**
That constraint still holds and is worth keeping — the site is ~50 KB and
opens from disk.

**Back end: NestJS + TypeScript in a Docker container**, added when the vault
moved from one shared Basic Auth password to per-person accounts. It is the
only part with a build step and dependencies.

The two halves are deliberately separable. `index.html`, `projects.html`,
`about.html`, `impressum.html` and the project pages are pure static and work
over `file://` or on GitHub Pages with no backend at all. Only the vault,
login and admin pages need the API, and each degrades to a plain message
rather than a broken screen when it is absent. **Keep it that way** — do not
introduce an API call into a page that does not need one.

## Two languages

The site is English by default with a German version of every text, switched by
the **DE / EN button in the header**, next to the theme toggle. The choice is
kept in `localStorage.lang` and `<html lang>` follows it.

There is **no dictionary file and no build step**. The rules:

- **The markup is the English.** The German lives beside it in a `data-de`
  attribute on the same element, so a sentence and its translation are edited in
  one place and cannot drift apart. `applyLang()` in `script.js` swaps them.
- **Three attribute twins**: `data-de-label` for `aria-label`, `data-de-alt` for
  `alt`, `data-de-title` for `title`. That is the whole list.
- **The swap is `innerHTML`**, so a `data-de` may carry the same inline markup
  its element does — use a single-quoted attribute when it contains `"`.
  It is author-written, from this repo, as trusted as the tag it sits on. Never
  point it at anything a user typed; the admin panel's `textContent` rule is
  untouched by this.
- **Do not nest `data-de` inside `data-de`** — the outer swap replaces the inner
  element.
- **Strings that exist only in JS use `t(en, de)`** rather than a key. Text that
  JS wrote is re-written on a switch: `setText()` for a plain message,
  `onLangChange()` for anything that has to be redrawn (the contributions graph,
  the vault rows, the filter bar's count).
- **The button is built by `script.js`**, not written into every page — the same
  reason the projects filter is: without JS it could switch nothing.
- **Product names are not translated.** React, Rust, KoboldCpp, Vault, GitHub,
  Impressum and the project names read the same in both languages, and the
  filter chips are built from them.
- The Impressum was the one page written in German. It is flipped, not
  rewritten: the German is verbatim in `data-de`, the English is the markup.

`render.ts` emits the same `data-de` attributes on the chrome it generates —
nav, pager, `Source`, the reveal hint, the `Featured` / `Project` eyebrow. What
comes **out of the database is not translated**: a project's heading, lede,
blurb and paragraphs are published in the language they were authored in. A
bilingual CMS would mean a second column per field, and the panel does not have
one.

## Design rules (unchanged, still binding)

- Retro, KISS, classic. Not soft, not rounded, no glassmorphism.
- Dark theme by default, light theme via the header toggle. Colours are
  CSS variables; only the primitives are overridden for light.
- **Everything sits on one centred rail, `--shell`, and the public site has
  exactly one value for it.** The header, the masthead, the body and the footer
  all take it, which is the only reason the site reads as centred rather than as
  a column pinned to the left edge of a wide screen. `.is-admin` is the only
  page left that overrides the token — a tool full of tables, and not a page
  anyone walks to from the home page. **The home page used to widen the rail and
  must not again**: the header and the footer are the same chrome on every page,
  so a page-scoped rail moves the brand and the nav sideways the moment a visitor
  clicks Projects. For the same reason `html` carries `scrollbar-gutter: stable`
  — the home page is locked to one screen and the subpages scroll, and without a
  reserved gutter the rail slides half a scrollbar between them. A block that
  wants to be narrower than the rail centres itself inside it with
  `width: 100%` + `max-width` + `margin-inline: auto` — the `width` is
  load-bearing, because an auto-width box with auto margins is sized to its
  content instead of to its cap.
- **A page-scoped type scale goes on the page's content, never on `<body>`.**
  The home page reads one step down the `--fs-*` scale; those tokens sit on
  `.bento`, because a `--fs-caption` on the body would resize the brand, the nav
  and the footer along with the cards.
- **The masthead is the only place the words themselves are centred.** Body
  copy keeps its left edge: a centred column of prose costs the eye the start
  of every line.
- **1px borders on every box. `border-radius: 0`. No box-shadows.** Depth
  comes from the border and the panel/background contrast, nothing else. The
  contributions heatmap is the one sanctioned exception, through `--gh-radius`:
  its cells are a few pixels across, where a hard corner reads as a stray pixel
  rather than as a square. It steps down with `--gh-gap` on short screens. Do
  not spend the exception anywhere else.
- Spacing off a single `--space` unit and `--gap`. Reading flow uses
  `--stack-lg` / `--stack-md` / `--stack-sm`; `--gap` is for grids.
- **Two faces, both already on the machine.** `--font` is the serif
  everything is read in (Iowan Old Style / Charter / Georgia / Noto Serif — the
  stack lands on a real book face on every platform and never on Times).
  `--font-mono` is the caption role: eyebrows, chips, nav, brand, footer,
  status, hints. If a string labels something it is mono; if it is read it is
  serif. There is no webfont and no third face.
- Visible `:focus-visible` states everywhere, not just `:hover`.
- Home page bento grid uses `grid-template-areas` and is height-locked to one
  screen on desktop; boxes scroll internally rather than the page. Overflow is
  **measured at runtime**, never assumed at author time.

### The header

Three tracks: brand left, nav centred, switches right (`1fr auto 1fr`, so the
nav is centred on the page rather than on what the switches left over). **The
brand is the home link — that is why there is no Home item in the nav.** It is
the word `7qob` and nothing else: the accent square that used to sit beside it
is gone, and the hover it carried moved onto the word. Every switch lives in
`.site-controls`; `script.js` puts the language button and the sign-out button
there too, so the grid keeps its three tracks however many switches exist.

On a phone the header becomes two rows — brand and switches, then the nav
across the full width as **equal columns**. Each item gets the same share, so a
fifth one (Admin, once signed in) costs no layout, nothing shrinks, nothing
scrolls and there is no hamburger to open. It is sticky, and `width: auto` is
load-bearing there: the shell's `width: 100%` fights the negative margins and
the bar stops short of the right edge without it.

### Subpage rules (project pages, about, impressum, projects index)

These three are what stop a subpage drifting back into the ragged, eight-
measure column it was before.

- **Two measures, never more.** Text is capped at `--measure`; only
  screenshots and tables reach `--measure-wide`. Do not put a `max-width` on
  an individual block — it inherits the right one already. If a page has more
  than two right edges, something added its own.
- **Every top-level block in an article is a band**: hairline along the top,
  `--stack-md` of air under it, `--stack-lg` to the next band. That is
  `.project__section`, `.reveal`, `.figure`, `.datarow` and `.linklist`. The
  lede is the only block above the first seam.
- **The projects index is a bento of cards.** One `.project-card` per project
  in a two-column `.project-grid`, and the card is the home page's card: same
  `.box`, same `.box--edge` rim, same `.box-arrow`, same eyebrow and chips in
  the same order, so the two indexes read as one system. The cover bleeds to
  the rim — the card carries no padding, `.project-card__body` does — and is
  cropped to 16:9, so differently shaped screenshots do not give the grid
  several rhythms.
- **Under every cover sits `.shot-plate`.** It shows through when a project has
  no picture yet, and `initFigures()` uncovers it by removing an `<img>` whose
  file 404s. A missing screenshot costs a card its picture, never its cell.
- **A wide card closes the grid.** `.project-card--feature` (the first project,
  from the markup) always spans the row with its cover beside the words. When
  an **even** number of cards is showing, the last one would sit alone in a
  two-column row, so it goes wide as well — mirrored, cover on the right, so
  the two do not read as a repeat. `layoutCards()` in `script.js` decides that
  from what is actually visible, which is what keeps the grid closed while a
  filter is on; the `:last-child:nth-child(even)` rule in the stylesheet is the
  same answer for a page without JS. Only the feature reads at hero size.
- **The index's filter bar is built by `script.js` from the chips already in
  the cards.** The technologies are never written down twice, and a page with
  no JS shows the whole list rather than buttons that do nothing. It is the
  one piece of the index that is not in the markup. On a phone it is a single
  swipeable rail rather than five wrapped rows — which is why `.page-body` sets
  `grid-template-columns: minmax(0, 1fr)`: an auto track would be sized by the
  rail's full content and stretch the page instead of scrolling inside it.
- **A page ends on an `.endcap`**: a hairline, a `.section-label` and a
  `.linkrow` of `.link-box`es — the same pair about.html closes on, and the
  same component the home page's links column is built from.
- **Every subpage masthead is: eyebrow, title, lede** — `.page-head__label` in
  the caption role with an accent rule either side, then the h1, then one
  sentence. A project page's eyebrow is its `Featured` / `Project` card label,
  which is why `Featured` is no longer also a badge on the name.
- **Five type sizes, all from `--fs-*` tokens**: `--fs-name`, `--fs-subtitle`,
  `--fs-heading`, `--fs-lede`, `--fs-body`, plus `--fs-caption` for labels. A
  literal `rem` value in a rule is a bug.
- Order on a project page is fixed: title and chips in the head (identity),
  lede, the bands that explain it, then the repository link (reference), then
  the pager. `project-template.html` carries the full CSS catalogue; a
  generated page uses the part of it that survived the rebuild —
  `.project__section`, `.reveal`, `.mediarow` and `.linklist`.
- `.reading` on a prose container is what supplies body line-height and inline
  link styling. Link lists and pagers are **siblings** of it, never children.

## Content rules

- No lorem ipsum, no invented projects, no stock images, no fake data.
- Do not invent personal details. The Impressum's Name / Kontakt / Ort fields
  are filled in by the owner and by nobody else: a name, a contact address and
  a place, and deliberately no street, postcode or phone number. The
  Datenschutz section is written, because that is a factual description of the
  system rather than personal data.
- No widgets needing a third-party backend (message board, map, Last.fm,
  Discord). The contributions graph is the one third-party call, it needs no
  token, and it degrades to cached or absent without breaking the page.
- **No em-dashes in anything a visitor reads.** Not in page copy, not in a
  `data-de`, not in an `aria-label`, not in a string `script.js`, `admin.js` or
  `render.ts` puts on a screen. Use a comma, a colon, a semicolon, brackets or a
  full stop, whichever the sentence actually wants. Where a dash was standing in
  for an empty value (an admin table cell, a placeholder `<option>`) the site's
  middle dot or a parenthesised word takes over. Source comments are not copy and
  still use them.
- **One sentence case for one component.** Every `.link-box__note` is a
  capitalised sentence ending in a full stop, in both languages; they used to be
  a mix of lowercase fragments and sentences, sitting side by side in the same
  column. The same goes for the `data-de` twin of anything you fix: a casing
  change that lands on only one language is half a change.
- The `.section-label`, `.box__label`, `.page-head__label`, nav and footer roles
  are uppercased **by the stylesheet**. Write them sentence case in the markup
  and let the CSS do it, so the source stays readable and one rule decides.

## The backend, in one paragraph

`server/` is a NestJS service behind nginx at `/api/`, holding a SQLite
database of accounts, sessions, login attempts, vault documents, downloads and
an audit log. Passwords are argon2id. Sessions are opaque random tokens stored
as SHA-256, in an `HttpOnly; Secure; SameSite=Lax` cookie. There is **no
secret anywhere in the service** — nothing is signed, so the image can be
public and the compose file has no credentials in it. Accounts are issued by
an admin and the password is generated server-side and shown exactly once.
Vault documents live in `/var/lib/kira1q/vault-files/` on the Pi, outside the
web root, and are streamed only after a session check.

## Project pages from the admin panel

The panel's **Projects** section is a small CMS for project pages. A project is
head fields plus a linear stack of blocks, stored as JSON in SQLite. There are
**two block types and there is no third**: `text` (a heading and paragraphs)
and `media` (a heading and rows of image/GIF/MP4, each with its own words).
Both carry `collapsible`, which wraps the band in the site's closed
`<details>`. `section`, `steps`, `features`, `table`, `figure`, `datarow`,
`files` and `links` were removed in the rebuild — a project page is a
description, some words and some pictures.

**Publish** writes **three** things server-side (`server/src/projects/
render.ts`): `project-<slug>.html` per published project, a regenerated
`projects.html`, and `index.html` — the home page. Pagers are derived from
`sort_order`, so neighbouring pages re-render on every publish and the chain
never goes stale. `projectIndexCard()` renders the index, `projectCard()`
renders the bento cells, and they are separate on purpose — the index card has
a cover and room to breathe, the bento cell has neither.

The home page is a **splice, not a render**. `renderHome()` reads the template,
replaces the region between `<!-- projects:start -->` and
`<!-- projects:end -->` with one card per placed project, and rewrites the
`data-projects="N"` count on `<main class="bento">` — which is what picks the
grid's area map, so the bento stays full at four projects and at one.
Everything else in `index.html` is hand-written and never parsed. Its base is
`PAGES_DIR/index.html` if one exists, else `HOME_TEMPLATE`.

A project's index picture is **one upload id in `cover_media_id`**, chosen in
the panel and shown on the index row and nowhere else — not on the bento card,
not on the project page. Publish refuses if it has been deleted, and
`MediaService.remove` refuses to delete an upload a project still covers with.

A project's colour is **one `#rrggbb` in the `accent` column**, emitted as
`class="… is-custom" style="--edge-brand:…"`. The four `.is-comfy` /
`.is-ignite` / `.is-kobui` / `.is-stalkr` palettes are gone; `.is-custom`
derives the shade and tint with `color-mix`, per theme. Adding a project is no
longer a stylesheet edit, and that is the whole point — do not reintroduce a
named palette.

Which cell of the bento a project holds is `home_slot`
(`feature` | `tall` | `smallA` | `smallB`), unique among non-NULL values by
index. Assigning an occupied cell **swaps** the two projects. The cards are
compacted into the first N cells when fewer than four are placed, so the grid
never renders a hole.

Rules the implementation enforces — keep them enforced:

- **Generated pages make zero API calls.** They are ordinary static files
  that work over `file://`, exactly like the hand-written ones. Authoring
  touches the API; the published page never does.
- **The renderer emits only markup that style.css already styles.** A new
  block type that needs a new CSS rule is a design change, not a feature. The
  target output is `docs/preview-project-sample.html`, which is the spec: the
  renderer reproduces it tag for tag, and if the two disagree one of them is
  wrong.
- **The one style attribute is a regex-validated hex.** `accent` is checked in
  the DTO on the way in and again in the renderer on the way out, because
  there is a database between those two moments.
- **Everything the form sends is escaped before it reaches a page.** The only
  inline markup is `[text](url)` and `` `code` ``, applied after escaping,
  with hrefs checked against an allowlist. No raw HTML from the form, ever.
- **Uploads are content-addressed.** The panel can upload media
  (PNG/JPEG/WebP/GIF/MP4/JSON/PDF, magic bytes verified server-side); files
  are stored as `<sha256[0:16]>.<ext>` under `MEDIA_DIR` and served from
  `assets/up/`. The client never chooses a filename. Vault documents are
  separate: the Documents tab creates items and uploads their PDFs
  (magic-byte checked, stored as `<slug>.pdf` under `VAULT_FILES_DIR`, which
  is therefore mounted rw); WinSCP to the Pi remains only as a fallback.
- Image/video dimensions are measured in the browser before upload and become
  the `width`/`height` attributes; the `reveal` band's "N clips · X MB" hint
  is computed from real sizes, never typed.

The four original `project-*.html` files are still on disk and still answer
their URLs, but nothing links to them any more: the home page's cards, the
projects index and the pagers all come from the database. They are kept so old
links do not break, and they are the one place the pre-rebuild markup can
still be read. They carry no accent — the palette classes were
stripped with the rest of them — so they wear the site accent.

`index.html` and `projects.html` are rsynced as before, but nginx serves the
generated copies first for those two URLs (`location = /` in
`deploy/nginx-kira1q.dev.conf`); the rsynced ones are the template and the
never-published fallback.

## Comments

The front end carries **few comments on purpose**. What stays is what you would
have to guess at while changing a value: the token annotations in `:root`, the
knobs (`--edge-mix`, `data-projects`, the gradient's angle and stops, the fixed
20rem `.mediarow` rail), the traps (a `minmax(0,1fr)` floor breaking the desktop
lock, an undefined gradient stop voiding the border), and the invariants
(escaping in `render.ts`, the vault list being empty for a reason). What went is
the archaeology — how a rule used to look and why it changed. Do not restore it;
that is what `git log` is for. New comments follow the same test: would someone
adjusting this line get it wrong without you.

## Things that will bite you

- **The repo is public.** No secret, no database, no vault document may ever
  be committed. A commit is permanent even if a later commit deletes the file.
- **Pages authored in the panel live only in the SQLite database on the Pi** —
  and so do the home page's project cards, since the rebuild. For them,
  `git clone` is no longer a complete backup of the site's content. Treat
  panel-authored content as existing in exactly one place; the file under
  `PAGES_DIR` is output, not a copy of the source.
- **The vault page must not name its documents.** The list comes from the API
  after authentication. It was hardcoded once, which told anyone who viewed
  source what documents existed. Do not put it back. There is a check for this
  in `deploy/README.md` §3.6.
- **In the admin panel, use `textContent`, never `innerHTML`.** It displays
  user-agent strings and usernames from failed logins — attacker-chosen text
  the server stored verbatim, as it should.
- **`Secure` cookies mean login does not work over plain HTTP**, including
  `http://192.168.0.56/` on the LAN. Test through `https://kira1q.dev`.
- **Native modules.** `better-sqlite3` and `argon2` need a compiler. They are
  built in CI inside the Docker image and never on the Pi — and they will not
  install on a Node version without prebuilds unless Python is present.
- **Commits carry no AI attribution.** Author is `7qob`, no
  `Co-Authored-By` trailer, no mention of Claude anywhere.
- **A generated page carries only the German the renderer knows.** The chrome
  switches; the project's own words do not, because they are database text.
- **A markup change in the renderer needs a Publish to take effect.** The
  generated `projects.html` on the Pi was written by the renderer that shipped
  before it. After deploying the picture-rail index, publish once — the live
  page is still asking for `.project-row`, which no longer exists in
  `style.css`, and no card will carry a cover until it is republished. The same
  Publish is what drops the brand square from the generated pages — the static
  files lost it with the edit, the generated ones carry the old header until
  the renderer runs again.

## Deployment

GitHub Actions builds the arm64 image on pushes touching `server/` and
publishes to GHCR. The Pi pulls it. The static site is rsynced separately.
Full runbook in `deploy/README.md`.
