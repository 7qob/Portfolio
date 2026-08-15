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
project-*.html      one page per project
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
  lede, the sections that explain it, screenshot, then the facts strip and the
  links (reference). `project-template.html` carries the full catalogue.
- `.reading` on a prose container is what supplies body line-height and inline
  link styling. Link lists and pagers are **siblings** of it, never children.

## Content rules

- No lorem ipsum, no invented projects, no stock images, no fake data.
- Do not invent personal details. The Impressum's Name / Kontakt / Ort fields
  are deliberately empty for the owner to fill in. The Datenschutz section is
  written, because that is a factual description of the system rather than
  personal data.
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

## Things that will bite you

- **The repo is public.** No secret, no database, no vault document may ever
  be committed. A commit is permanent even if a later commit deletes the file.
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
