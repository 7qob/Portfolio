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
vault-locked.html   retired, redirects to login.html
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

## Design rules (unchanged, still binding)

- Retro, KISS, classic. Not soft, not rounded, no glassmorphism.
- Dark theme by default, light theme via the header toggle. Colours are
  CSS variables; only the primitives are overridden for light.
- **1px borders on every box. `border-radius: 0`. No box-shadows.** Depth
  comes from the border and the panel/background contrast, nothing else.
- Spacing off a single `--space` unit and `--gap`. Reading flow uses
  `--stack-lg` / `--stack-md` / `--stack-sm`; `--gap` is for grids.
- Serif type (`--font`). The type scale is sized for it.
- Visible `:focus-visible` states everywhere, not just `:hover`.
- Home page bento grid uses `grid-template-areas` and is height-locked to one
  screen on desktop; boxes scroll internally rather than the page. Overflow is
  **measured at runtime**, never assumed at author time.

### Subpage rules (project pages, about, impressum, projects index)

These three are what stop a subpage drifting back into the ragged, eight-
measure column it was before.

- **Two measures, never more.** Text is capped at `--measure`; only
  screenshots and tables reach `--measure-wide`. Do not put a `max-width` on
  an individual block — it inherits the right one already. If a page has more
  than two right edges, something added its own.
- **Every top-level block in an article is a band**: hairline along the top,
  `--stack-md` of air under it, `--stack-lg` to the next band. That is
  `.project__section`, `.figure`, `.datarow` and `.linklist`. The lede is the
  only block above the first seam.
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
never goes stale.

The home page is a **splice, not a render**. `renderHome()` reads the template,
replaces the region between `<!-- projects:start -->` and
`<!-- projects:end -->` with one card per placed project, and rewrites the
`data-projects="N"` count on `<main class="bento">` — which is what picks the
grid's area map, so the bento stays full at four projects and at one.
Everything else in `index.html` is hand-written and never parsed. Its base is
`PAGES_DIR/index.html` if one exists, else `HOME_TEMPLATE`.

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
still be read. They carry no accent — the palette classes they name no longer
exist — so they wear the site accent.

`index.html` and `projects.html` are rsynced as before, but nginx serves the
generated copies first for those two URLs (`location = /` in
`deploy/nginx-kira1q.dev.conf`); the rsynced ones are the template and the
never-published fallback.

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
- **Commits carry no AI attribution.** Author is `kiraa1q`, no
  `Co-Authored-By` trailer, no mention of Claude anywhere.

## Deployment

GitHub Actions builds the arm64 image on pushes touching `server/` and
publishes to GHCR. The Pi pulls it. The static site is rsynced separately.
Full runbook in `deploy/README.md`.
