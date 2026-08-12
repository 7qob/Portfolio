# CLAUDE.md — Portfolio Scaffold

## Goal
Build the **bare scaffold** of a personal portfolio website. Real page structure and real boxes, but **completely empty** — no placeholder text, no lorem ipsum, no dummy data, no fake images. Just the HTML structure, the bento grid, borders, and CSS tokens. The owner fills in content later.

## Stack (hard constraints)
- Static **HTML + CSS + JS only**. No framework, no build step, no bundler, no npm.
- Must open via `file://` (no server required) and host on GitHub Pages / Cloudflare Pages.
- One shared `style.css`. Minimal `script.js` (only if needed for mobile nav / smooth scroll).
- No backend, no APIs, no databases.

## Files to create
```
index.html       -> bento home page
projects.html    -> subpage (empty content area)
about.html       -> subpage (empty content area)
impressum.html   -> subpage, legal info (school requirement)
style.css        -> shared tokens + grid + box styles
script.js        -> minimal, optional
```

## Design direction
- Aesthetic: **retro, KISS, classic**. NOT soft/rounded/glassmorphism.
- **Dark theme.** Pick any sensible dark palette; exact colors do not matter. Put them in CSS variables.
- **1px borders** on every box. **border-radius: 0** everywhere. No box-shadows.
- Monospace or classic font pairing fits the retro tone. Free / Google Fonts only.
- Generous, consistent spacing via a single spacing unit variable.

## CSS tokens (define as :root variables, build everything off them)
- `--bg`, `--text`, `--border`, `--accent`
- `--border-width: 1px`
- `--radius: 0`
- `--space: 8px` (spacing unit)
- font-family variables

## Home page layout (index.html)
- **7-column × 5-row bento grid.** Use `display: grid` with **`grid-template-areas`** exactly as below. This is final — do not rearrange.

```css
grid-template-columns: repeat(7, 1fr);
grid-template-areas:
  "name      name      tools     tools     github    github    buttons"
  "about     about     tools     tools     techstack techstack buttons"
  "about     about     projects  projects  techstack techstack buttons"
  "interests interests projects  projects  techstack techstack buttons"
  "interests interests projects  projects  techstack techstack buttons";
```

- 8 boxes, each a 1px-bordered cell, **empty inside** (a small static section label like `ABOUT ME` is fine, but NO body content): `name`, `about`, `tools`, `techstack`, `projects`, `interests`, `github`, `buttons`.
- `name` = hero/name area. `buttons` = vertical link column (GitHub / email / etc. — empty bordered slots, no real links). `github` = contributions graph (see below).
- **Nav = clickable bento boxes.** `about` -> about.html, `projects` -> projects.html. Use real `<a>`. Give clickable boxes a hover state (invert border/colors) + `cursor: pointer` so they read as interactive.

## GitHub box
- Static contributions graph via image, no JS/token:
  `<img src="https://ghchart.rshah.org/USERNAME" alt="GitHub contributions">`
- Leave `USERNAME` as-is for the owner to replace. (Note in a comment that this is a third-party service.)

## Subpages (projects.html, about.html, impressum.html)
- **No top nav bar.** Single back control: a `<a href="index.html">` styled as `<-` arrow, top-left, with padding for a tap target.
- Empty `<main>` content area, semantic structure only.
- impressum.html: empty labeled sections for the fields (Name, Kontakt/Email, Ort/Datum) — NO real personal data, do not invent any. Avoid a full home address.

## Footer (shared, every page)
- Full-width, 1px top border. Empty slots for: © year, Impressum link (-> impressum.html), GitHub link. Impressum link should be real (it points to the existing page); others empty.

## Responsive
- 7-col desktop grid collapses to 2 columns (~768px) then 1 column (mobile). Stacking order should stay sensible (name, about, projects, then the rest).
- Mobile-first or add one/two breakpoints. Keep it simple.

## Head / quality (do per page)
- `<html lang="de">`, `<meta viewport>`, `<title>`, empty `<meta name="description">`.
- Semantic tags: `<header>`/`<nav>`, `<main>`, `<footer>`, `<section>`.
- Open Graph tags present but empty (for link previews when shared with employers).
- Visible `:focus` states, not just `:hover`.

## Do NOT
- Do not add placeholder/dummy text, fake projects, lorem ipsum, or stock images.
- Do not add a message board, map, Last.fm, or Discord widgets (they need a backend).
- Do not use a framework or any build tooling.