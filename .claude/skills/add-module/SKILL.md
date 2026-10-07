---
name: add-module
description: Add a new module (page) to Bench — registers it in the rail, command palette and build, with tests for its logic and a smoke-test pass. Use when asked to add a new tool, page, tracker or section to Bench.
---

# Add a Bench module

1. **Pure logic first.** If the module computes anything (parsing, money, dates, scoring), put it in `js/core/<name>.js` using the same wrapper as `js/core/tools.js` (attach to `root.Bench.<name>`, export via `module.exports`). Write tests in `tests/core.test.js` and run `npm test` until green.

2. **Module file.** Create `js/modules/<id>.js`:

   ```js
   (function (Bench) {
     'use strict';
     const { h, icon, store, toast } = Bench;
     function render(page, { navigate }) {
       page.append(
         h('header.page-head', null, h('div', null, h('div.eyebrow', null, 'Make'), h('h1', null, 'Title'))),
         h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Section')), h('div.sheet-body', null, '…')));
       const unsub = store.subscribe(s => { /* repaint on your slice */ });
       return unsub; // cleanup: unsubscribe, clear intervals, cancel rAF
     }
     Bench.module({
       id: '<id>', title: 'Title', short: 'Tab', icon: '<icon>', group: 'daily' | 'make' | 'life', key: '<g-shortcut letter>',
       render,
       badge: () => '',                         // optional rail counter
       commands: () => [{ label: '…', run() {} }], // optional command palette entries
       search: q => [],                         // optional palette search results
     });
   })(window.Bench);
   ```

   - Pick an unused `key` (taken: h t n f l x m r s).
   - Add an icon path to `ICONS` in `js/core/kit.js` if none fits (24px grid, stroke only).
   - Use existing classes: `.sheet`, `.sheet-head`, `.sheet-body`, `.list`, `.stats/.stat`, `.chip`, `.btn(.primary|.ghost|.sm)`, `.seg`, `.tabs`, `.field`, `.input`. No new colours; use tokens.
   - Give every input a stable `id`. Data that should survive goes in `store` under a new slice.

3. **Wire it up.** Add the `<script>` tag to `index.html` inside `<!-- build:js -->` (order = rail order within its group) and add the path to `SHELL` in `sw.js`. If it has sample data, extend `js/seed.js` and `Bench.clearSamples`.

4. **Verify.** Add the id to `MODULES` in `tools/smoke.mjs`, then:

   ```bash
   npm test && npm run build && npm run smoke
   ```

   Open the new screenshots in `dist/shots/` (desktop and phone, both themes) and fix anything clipped, overflowing or low-contrast.

5. Update the module table in `README.md`.
