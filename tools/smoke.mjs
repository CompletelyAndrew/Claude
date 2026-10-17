// End-to-end smoke test: loads the single-file build in Chromium, visits
// every module at desktop and phone widths in both themes, exercises the
// main interactions, and fails on console errors or sideways scrolling.
//   npm run build && npm run smoke            (screenshots → dist/shots/)
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(join(process.execPath, '../../lib/node_modules/playwright')); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'dist', 'bench.html');
if (!existsSync(file)) { console.error('Run `npm run build` first.'); process.exit(1); }
const shots = join(root, 'dist', 'shots');
mkdirSync(shots, { recursive: true });

const MODULES = ['today', 'tasks', 'notes', 'focus', 'gamelab', 'toolbox', 'qr', 'ledger', 'trips', 'settings'];
const failures = [];
const fail = msg => { failures.push(msg); console.log('  ✗ ' + msg); };
const ok = msg => console.log('  ✓ ' + msg);

const browser = await playwright.chromium.launch();

for (const [label, viewport, scheme] of [['desktop-light', { width: 1360, height: 900 }, 'light'], ['desktop-dark', { width: 1360, height: 900 }, 'dark'], ['phone-light', { width: 390, height: 844 }, 'light'], ['phone-dark', { width: 390, height: 844 }, 'dark']]) {
  console.log(`\n${label}`);
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
  // Offline and deterministic: block every non-file request (web fonts fall back to system faces)
  await ctx.route(url => !url.href.startsWith('file:'), route => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href + '#today', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.page');

  for (const id of MODULES) {
    await page.evaluate(i => { location.hash = i; }, id);
    await page.waitForTimeout(250);
    const heading = await page.locator('.page h1').first().textContent().catch(() => null);
    if (!heading) fail(`${id}: no heading rendered`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) fail(`${id}: page scrolls sideways by ${overflow}px`);
    const mainOverflow = await page.evaluate(() => { const m = document.getElementById('main'); return m.scrollWidth - m.clientWidth; });
    if (mainOverflow > 1) fail(`${id}: main area overflows by ${mainOverflow}px`);
    await page.screenshot({ path: join(shots, `${label}-${id}.png`), fullPage: false });
  }
  ok(`visited ${MODULES.length} modules`);

  if (label === 'desktop-light') {
    // Quick-add a task through the command bar
    await page.evaluate(() => { location.hash = 'today'; });
    await page.keyboard.press('Control+k');
    await page.keyboard.type('+ Smoke test task tomorrow 3pm !high #qa');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const saved = await page.evaluate(() => Bench.store.get('tasks').find(t => t.title === 'Smoke test task'));
    if (!saved || saved.priority !== 3 || !saved.tags.includes('qa') || !saved.hasTime) fail('quick-add task did not parse correctly'); else ok('quick-add via command bar');

    // Calculator in the palette
    await page.keyboard.press('Control+k');
    await page.keyboard.type('= 1920/1080');
    const calcText = await page.locator('.palette li').first().textContent();
    if (!calcText.includes('1.7777')) fail('calculator: ' + calcText); else ok('calculator in command bar');
    await page.keyboard.press('Escape');

    // g-then-key navigation
    await page.locator('body').click({ position: { x: 900, y: 10 } });
    await page.keyboard.press('g'); await page.keyboard.press('l');
    await page.waitForTimeout(200);
    if (!(await page.evaluate(() => location.hash)).includes('gamelab')) fail('g l did not open Game Lab'); else ok('g-key navigation');

    // Paint a pixel and check it persisted
    const canvas = page.locator('canvas[aria-label="Sprite canvas"]');
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + 4, box.y + 4);
    await page.waitForTimeout(400);
    const px = await page.evaluate(() => Bench.store.get('sprite').frames[0][0]);
    if (!px) fail('sprite pixel was not painted'); else ok('sprite editor paints and saves');
    await page.screenshot({ path: join(shots, 'interaction-sprite.png') });

    // Other Game Lab tabs
    for (const t of ['Palette', 'Easing', 'Dice']) {
      await page.getByRole('tab', { name: t }).click();
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(shots, `gamelab-${t.toLowerCase()}.png`) });
    }
    ok('Game Lab tabs render');

    // Ledger tabs
    await page.evaluate(() => { location.hash = 'ledger'; });
    for (const t of ['Transactions', 'Budgets', 'Invoice']) {
      await page.getByRole('tab', { name: t }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(shots, `ledger-${t.toLowerCase()}.png`) });
    }
    const total = await page.locator('.invoice-sheet').textContent();
    if (!/455\.00/.test(total)) fail('invoice total should be $455.00'); else ok('invoice totals');

    // Notes: wiki link navigation
    await page.evaluate(() => { location.hash = 'notes'; });
    await page.waitForTimeout(200);
    await page.locator('.list li', { hasText: 'Tanks design notes' }).click();
    await page.locator('a.wikilink', { hasText: 'Line Load ideas' }).first().click();
    await page.waitForTimeout(200);
    const noteTitle = await page.locator('#note-body').inputValue();
    if (!noteTitle.startsWith('# Line Load ideas')) fail('wiki link did not open the linked note'); else ok('wiki links between notes');

    // Toolbox tools
    await page.evaluate(() => { location.hash = 'toolbox'; });
    for (const t of ['Encode', 'JWT', 'Timestamps', 'Units', 'Text', 'IDs & passwords']) {
      await page.locator('.tool-grid li', { hasText: t }).first().click();
      await page.waitForTimeout(120);
    }
    ok('Toolbox tools render');

    // QR: every tab renders, a drill answer is recorded, Make's code decodes back to its contents
    await page.evaluate(() => { location.hash = 'qr'; });
    await page.waitForTimeout(200);
    for (const t of ['Learn', 'Scan', 'Inspect', 'Make', 'Path']) {
      await page.getByRole('tab', { name: t }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(shots, `qr-${t.toLowerCase()}.png`), fullPage: true });
    }
    // Every lesson renders
    await page.getByRole('tab', { name: 'Learn' }).click();
    for (const n of [2, 4, 3]) {
      await page.locator(`#qr-level-${n}`).click();
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(shots, `qr-level-${n}.png`), fullPage: true });
    }
    await page.locator('#qr-place-play').click();
    await page.waitForTimeout(700);
    await page.locator('#qr-level-4').click();
    await page.locator('#qr-ecc-blob').click();
    await page.locator('#qr-rs-0').click();
    if (!(await page.locator('.qr-rs + .row .chip.good').count())) fail('QR Reed–Solomon demo should repair one byte'); else ok('QR lessons 2–4 render and repair');
    await page.locator('#qr-level-1').click();
    await page.getByRole('tab', { name: 'Learn' }).click();
    await page.locator('#qr-choice-0').click();
    const answered = await page.evaluate(() => (Bench.store.get('qr') || { log: [] }).log.length);
    if (answered !== 1) fail('QR drill answer was not recorded'); else ok('QR drill records an answer');
    await page.locator('#qr-break').click();
    await page.locator('#qr-break-ec-H').click();
    await page.locator('#qr-logo').click();
    if (!(await page.locator('.qr-stage + div .chip.good').count())) fail('QR with a pasted logo should still read'); else ok('QR break-it lesson decodes live');
    await page.screenshot({ path: join(shots, 'qr-break.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Make' }).click();
    await page.locator('#qr-make-wifi').click();
    await page.locator('#qr-field-wifi-ssid').fill('Smoke Net');
    await page.waitForTimeout(300);
    const roundTrip = await page.evaluate(() => {
      const s = Bench.store.get('qr:make');
      const text = Bench.qrpayload.build.wifi(s.values.wifi);
      return Bench.qr.decodeMatrix(Bench.qr.encode(text, { ec: s.ec }).modules).text === text && text.includes('Smoke Net');
    });
    if (!roundTrip) fail('QR Make round trip failed'); else ok('QR Make builds a Wi-Fi code');
    // Photograph the code Make drew and feed it to the scanner as an uploaded photo
    const png = await page.locator('.qr-plate').first().screenshot();
    await page.getByRole('tab', { name: 'Scan' }).click();
    await page.locator('#qr-photo').setInputFiles({ name: 'code.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('#qr-scan-copy', { timeout: 5000 }).catch(() => null);
    const scanned = await page.evaluate(() => (Bench.store.get('qr:scans') || [])[0]);
    if (!scanned || !scanned.t.includes('Smoke Net')) fail('QR scanner did not read the uploaded photo'); else ok('QR scanner reads an uploaded photo');
    await page.screenshot({ path: join(shots, 'qr-scanned.png'), fullPage: true });
    await page.evaluate(() => { location.hash = 'today'; });

    // Focus timer starts and the nav shows the countdown
    await page.evaluate(() => { location.hash = 'focus'; });
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Start/ }).first().click();
    await page.waitForTimeout(1200);
    const title = await page.title();
    if (!/\d+:\d{2}/.test(title)) fail('focus timer did not start: ' + title); else ok('focus timer runs (' + title + ')');
    await page.getByRole('button', { name: /Pause/ }).first().click();

    // Persistence across reload
    await page.reload();
    await page.waitForSelector('.page');
    const persisted = await page.evaluate(() => Bench.store.get('tasks').some(t => t.title === 'Smoke test task'));
    if (!persisted) fail('data did not survive a reload'); else ok('data persists across reload');
  }

  if (errors.length) fail(`${label}: console errors:\n    ` + [...new Set(errors)].join('\n    '));
  else ok('no console errors');
  await ctx.close();
}

// The QR Codes module as its own app
for (const [label, viewport, scheme] of [['desktop-light', { width: 1360, height: 900 }, 'light'], ['phone-dark', { width: 390, height: 844 }, 'dark'], ['phone-light', { width: 390, height: 844 }, 'light']]) {
  console.log(`\nqr app ${label}`);
  const qrFile = join(root, 'dist', 'qr.html');
  if (!existsSync(qrFile)) { fail('dist/qr.html is missing'); break; }
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
  await ctx.route(url => !url.href.startsWith('file:'), route => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(qrFile).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.page h1');
  for (const t of ['Path', 'Learn', 'Scan', 'Inspect', 'Make']) {
    await page.getByRole('tab', { name: t }).click();
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) fail(`qr app ${t}: page scrolls sideways by ${overflow}px`);
    await page.screenshot({ path: join(shots, `qr-app-${label}-${t.toLowerCase()}.png`), fullPage: true });
  }
  ok('stand-alone QR app renders every tab');
  if (errors.length) fail(`qr app ${label}: console errors:\n    ` + [...new Set(errors)].join('\n    ')); else ok('no console errors');
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} problem(s)` : '\nAll smoke checks passed');
process.exit(failures.length ? 1 : 0);
