# Bench

**Tools for making things.** Tasks, notes, focus time, money, trips and a game-dev lab in one offline web app. No accounts, no server, no dependencies. Your data stays in your browser.

Open `dist/bench.html` straight from disk, or run `npm start` and visit http://localhost:8080.

The QR Codes module also runs as its own app: `dist/qr.html` (or `qr.html` when served). It is installable separately with its own icon. On the same site it shares progress with Bench, and Path → Back up progress moves it anywhere else.

| Module | What it does |
|---|---|
| **Today** | What's due, focus minutes this week, net for the month, next trip, budget alerts, a scratchpad that remembers. |
| **Tasks** | Type in plain English: `Playtest build fri 3pm !high #games every week`. Dates, times, priority, tags and repeats are parsed as you type. Smart views and tag filters. |
| **Notes** | Markdown with live preview, `[[wiki links]]` between notes, backlinks, pinning, export to `.md`. |
| **Focus** | Pomodoro timer that survives reloads, generated brown/pink/rain noise, a 12-week heatmap and where your time went. |
| **Game Lab** | Animated pixel sprite editor (frames, onion skin, mirror, fill, PNG and sprite-sheet export), palette harmonies with hue-shifted shading ramps (copy as GDScript, Unity C#, `.gpl`), WCAG contrast check, an easing explorer that writes Godot 4 / DOTween / CSS code, and a dice roller with a 20,000-roll distribution chart. |
| **Toolbox** | JSON validator/formatter, Base64/URL/HTML encoders, JWT decoder, Unix timestamps, unit converter (including 60fps frames), text case converter, UUIDs and passwords. |
| **QR Codes** | A course that turns into a tool. Six levels toward reading any code "by its cover" (four built so far): **Anatomy** (tap any module; break a code and watch it still read), **Read the cover** (version, EC level and mask by eye), **Bits** (modes, the bit stream, zig-zag placement, the eight masks and their penalty scores) and **Error correction** (blocks, interleaving, a damage lab, Reed–Solomon you can corrupt byte by byte), with spaced-repetition drills. **Scan** reads codes from the camera, a photo or a pasted image with its own decoder, shows how it found them, and never opens a link by itself. **Inspect** says what a payload does and flags traps (shorteners, lookalike domains, raw IPs, `http`). **Make** builds link, Wi-Fi, contact, email, SMS, phone and location codes as PNG/SVG. The tools explain less as you master the skills. Also ships as its own app: `qr.html` / `dist/qr.html`. |
| **Ledger** | Monthly overview with a six-month chart, transactions with bank CSV import and auto-categorising, category budgets, and an invoice builder. |
| **Trips** | Day-by-day itinerary, grouped packing list, destination clock, a currency converter, Booking.com search, and travel spend pulled from the Ledger. |

### Everywhere
- **Command bar**: `Ctrl K` / `⌘K` or `/`. Jump to anything, search tasks and notes, run actions. Start with `+` to add a task, `=` to calculate (`= 1920/1080`).
- **Keys**: `n` new task · `g` then `h t n f l x q m r` to switch modules · `t` theme · `?` shortcut list.
- **Themes**: light, dark, or follow the system.
- **Backups**: Settings → Download backup / Restore. Sample data is tagged and can be cleared in one click.
- **Installable**: served over HTTPS it registers a service worker and works offline as a PWA.

## Development

```bash
npm test         # 42 unit tests for the pure core (node --test, zero deps)
npm run build    # → dist/bench.html + dist/qr.html (single offline files) and their -artifact versions
npm run smoke    # Playwright: every module × desktop/phone × light/dark, plus interaction checks
npm start        # serve the source tree
```

```
index.html            entry; build markers tell tools/build.mjs what to inline
css/bench.css         the brand: tokens, components, light + dark
js/core/              pure logic, unit-tested in Node (markdown, quickadd, ledger, color, easing, tools, qr, qrscan, qrpayload, qrlearn)
js/core/kit.js        DOM helpers, icons, persisted store, toasts
js/app.js             shell: registry, router, command palette, shortcuts, theme, backups
js/solo.js            one-module shell, so a module can ship as its own app (qr.html)
js/modules/           one file per module
tools/build.mjs       inliner, no bundler
tools/smoke.mjs       browser end-to-end checks + screenshots
.github/workflows/    CI: tests in 3 time zones, build, smoke, deploy to GitHub Pages from main
CLAUDE.md             project notes for Claude Code
.claude/skills/       /add-module skill for extending Bench
```

## Brand

A workbench: a quiet rail of drawers, sheets laid on faint graph paper, and one highlighter yellow that marks what matters right now (due today, the running timer, the active item). Ink for structure, ballpoint blue for focus rings and tags. Type is Bricolage Grotesque for display, Hanken Grotesk for reading, JetBrains Mono for numbers and labels. Every colour is a token with a designed dark counterpart.

---

Built with [Claude Code](https://claude.ai/code).
