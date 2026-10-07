# Bench — notes for Claude

Bench is a zero-dependency, offline web app: one shell plus independent modules.
Plain HTML/CSS/JS loaded with classic `<script>` tags so it also runs from `file://`.

## Commands
- `npm test` — unit tests for the pure core (`node --test`, no deps). Run under a couple of `TZ=` values when touching dates.
- `npm run build` — inlines everything into `dist/bench.html` (offline single file) and `dist/bench-artifact.html` (body-only, for claude.ai Artifacts).
- `npm run smoke` — Playwright drives `dist/bench.html` at desktop + phone, light + dark; fails on console errors or sideways scroll. Screenshots land in `dist/shots/`.
- `npm start` — serve the source tree on :8080.

## Layout
- `js/core/*.js` — pure logic (markdown, quickadd, ledger, color, easing, tools). UMD-ish: attach to `Bench` in the browser, `module.exports` in Node. **No DOM here**; test everything here.
- `js/core/kit.js` — browser helpers: `h()` element builder, `icon()`, `store`, `toast`, `copy`, `download`.
- `js/app.js` — registry, hash router, command palette, shortcuts, theme, backups.
- `js/modules/*.js` — one file per module, each calls `Bench.module({...})`. Modules never import each other; they share data through `store` slices.
- `js/seed.js` — first-run sample data, every record has `sample: true`.
- `css/bench.css` — the brand. All colours are tokens on `:root` with dark overrides in both the media query and `[data-theme="dark"]`.

## Conventions
- Money is integer cents. Dates for ledger/trips are `YYYY-MM-DD` strings; never pass them to `new Date()` without a time (UTC shift). Use `Bench.ledger.isoDay()`.
- `store.set(slice, value)` notifies subscribers; a module's `render` returns its cleanup (unsubscribe, clear timers).
- Every form control gets a stable `id`. Icons come from `ICONS` in `kit.js` (24px grid, 1.75 stroke).
- Brand: graph-paper ground, ink, one highlighter yellow (`--mark`) for "what matters now". Display face Bricolage Grotesque, body Hanken Grotesk, data in JetBrains Mono. Don't add new accent colours.
- No `eval`/`new Function` (artifact CSP). The calculator is a recursive-descent parser in `tools.js`.
- After UI changes: `npm run build && npm run smoke`, then look at the screenshots.

## Adding a module
Use the project skill: `/add-module`.
