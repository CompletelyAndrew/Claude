// Unit tests for Bench's pure core. Run with `npm test` (node --test, no deps).
const test = require('node:test');
const assert = require('node:assert/strict');

const md = require('../js/core/markdown.js');
const qa = require('../js/core/quickadd.js');
const ledger = require('../js/core/ledger.js');
const color = require('../js/core/color.js');
const easing = require('../js/core/easing.js');
const tools = require('../js/core/tools.js');

// Wednesday 7 Oct 2026, 10:00 local
const NOW = new Date(2026, 9, 7, 10, 0, 0);
const ymd = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

test('markdown: escapes raw HTML', () => {
  const out = md.render('<script>alert(1)</script>');
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('markdown: blocks javascript: links', () => {
  assert.ok(md.render('[x](javascript:alert(1))').includes('href="#"'));
});

test('markdown: headings, lists, tasks, code, tables', () => {
  const out = md.render('# Title\n\n- [x] done\n- [ ] todo\n\n```gd\nvar x := 1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.match(out, /<h1>Title<\/h1>/);
  assert.match(out, /<li class="task done">/);
  assert.match(out, /<pre data-lang="gd"><code>var x := 1<\/code><\/pre>/);
  assert.match(out, /<th>a<\/th>/);
  assert.match(out, /<td>2<\/td>/);
});

test('markdown: inline code is not formatted', () => {
  assert.match(md.render('`**not bold**`'), /<code>\*\*not bold\*\*<\/code>/);
});

test('markdown: wiki links', () => {
  assert.deepEqual(md.links('See [[Tank AI]] and [[Line Load|the puzzle]].'), ['Tank AI', 'Line Load']);
  assert.match(md.render('[[Tank AI]]'), /data-note="Tank AI"/);
});

test('quickadd: tags, priority, weekday and time', () => {
  const t = qa.parse('Playtest Line Load fri 3pm !high #games', NOW);
  assert.equal(t.title, 'Playtest Line Load');
  assert.deepEqual(t.tags, ['games']);
  assert.equal(t.priority, 3);
  assert.equal(ymd(t.due), '2026-10-9');
  assert.equal(t.due.getHours(), 15);
  assert.equal(t.hasTime, true);
});

test('quickadd: tomorrow, repeat, bang priority', () => {
  const t = qa.parse('Reconcile expenses tomorrow every month !!', NOW);
  assert.equal(t.title, 'Reconcile expenses');
  assert.equal(ymd(t.due), '2026-10-8');
  assert.equal(t.repeat, 'month');
  assert.equal(t.priority, 2);
  assert.equal(t.hasTime, false);
});

test('quickadd: same weekday means next week; month names roll forward', () => {
  assert.equal(ymd(qa.parse('x wed', NOW).due), '2026-10-14');
  assert.equal(ymd(qa.parse('x mar 3', NOW).due), '2027-3-3');
  assert.equal(ymd(qa.parse('x in 3 days', NOW).due), '2026-10-10');
});

test('quickadd: bare numbers stay in the title', () => {
  const t = qa.parse('Buy 2 controllers', NOW);
  assert.equal(t.title, 'Buy 2 controllers');
  assert.equal(t.due, null);
});

test('quickadd: nextDue for weekdays skips weekends', () => {
  const fri = new Date(2026, 9, 9);
  assert.equal(qa.nextDue(fri, 'weekday').getDay(), 1);
});

test('ledger: cents parsing handles symbols, parens and EU format', () => {
  assert.equal(ledger.toCents('$1,234.56'), 123456);
  assert.equal(ledger.toCents('(12.50)'), -1250);
  assert.equal(ledger.toCents('1.234,56 €'), 123456);
  assert.equal(ledger.toCents(-3.1), -310);
});

test('ledger: summarize and budgets', () => {
  const tx = [
    { date: '2026-10-01', amount: 500000, category: 'Income' },
    { date: '2026-10-02', amount: -1200, category: 'Dining' },
    { date: '2026-10-03', amount: -800, category: 'Dining' },
    { date: '2026-09-30', amount: -9999, category: 'Dining' },
  ];
  const s = ledger.summarize(tx, '2026-10');
  assert.equal(s.income, 500000);
  assert.equal(s.expense, 2000);
  assert.equal(s.categories[0].name, 'Dining');
  const b = ledger.budgets(tx, { Dining: 2400 }, '2026-10');
  assert.equal(b[0].state, 'near');
});

test('ledger: CSV round trip with quotes and commas', () => {
  const rows = [['Date', 'Payee', 'Amount'], ['2026-10-01', 'Steam, Inc "store"', '-19.99']];
  assert.deepEqual(ledger.parseCSV(ledger.toCSV(rows)), rows);
});

test('ledger: bank import with debit/credit columns', () => {
  const csv = 'Posted Date,Description,Debit,Credit\n10/02/2026,SPOTIFY USA,10.99,\n10/03/2026,PAYROLL,,2500.00\n';
  const tx = ledger.importBank(csv);
  assert.equal(tx.length, 2);
  assert.equal(tx[0].amount, -1099);
  assert.equal(tx[0].category, 'Subscriptions');
  assert.equal(tx[1].amount, 250000);
});

test('ledger: invoice totals', () => {
  const t = ledger.invoiceTotals([{ qty: 10, rate: '85' }, { qty: 1, rate: '120.50' }], 8.25, 10);
  assert.equal(t.subtotal, 97050);
  assert.equal(t.discount, 9705);
  assert.equal(t.tax, 7206);
  assert.equal(t.total, 94551);
});

test('color: conversions round trip', () => {
  for (const hex of ['#f2c94c', '#16191d', '#3a7bd5']) {
    assert.equal(color.hslToHex(color.hexToHsl(hex)), hex);
  }
});

test('color: contrast ratio', () => {
  assert.equal(Math.round(color.contrast('#000000', '#ffffff')), 21);
  assert.equal(color.rating(4.6), 'AA');
});

test('color: ramp gets lighter', () => {
  const r = color.ramp('#c0392b', 5).map(h => color.hexToHsl(h).l);
  for (let i = 1; i < r.length; i++) assert.ok(r[i] > r[i - 1]);
});

test('easing: every curve starts at 0 and ends at 1', () => {
  for (const n of easing.names) {
    assert.ok(Math.abs(easing.fns[n](0)) < 1e-9, n);
    assert.ok(Math.abs(easing.fns[n](1) - 1) < 1e-9, n);
  }
  const ease = easing.bezier(0.25, 0.1, 0.25, 1);
  assert.ok(Math.abs(ease(0.5) - 0.8024) < 0.01);
});

test('easing: engine snippets', () => {
  const s = easing.snippets('outBack');
  assert.match(s.godot, /TRANS_BACK/);
  assert.match(s.godot, /EASE_OUT/);
  assert.match(s.unity, /Ease\.OutBack/);
});

test('tools: unit conversion', () => {
  assert.equal(tools.convert(100, 'C', 'F', 'temperature'), 212);
  assert.ok(Math.abs(tools.convert(1, 'mi', 'km', 'length') - 1.609344) < 1e-9);
  assert.equal(tools.convert(1, 'GiB', 'MiB', 'data'), 1024);
});

test('tools: base64 handles unicode', () => {
  assert.equal(tools.b64decode(tools.b64encode('héllo ✓')), 'héllo ✓');
});

test('tools: json check reports position', () => {
  const r = tools.jsonCheck('{\n  "a": 1,\n}');
  assert.equal(r.ok, false);
  assert.equal(tools.jsonCheck('{"a":[1,2]}').minified, '{"a":[1,2]}');
});

test('tools: timestamps in seconds and ms', () => {
  assert.equal(tools.parseTimestamp('1700000000').getTime(), 1700000000000);
  assert.equal(tools.parseTimestamp('1700000000000').getTime(), 1700000000000);
});

test('tools: dice with keep-highest and modifiers', () => {
  let i = 0;
  const seq = [0.0, 0.5, 0.99, 0.2]; // d6 → 1, 4, 6, 2
  const r = tools.roll('4d6kh3+2', () => seq[i++]);
  assert.equal(r.total, 4 + 6 + 2 + 2);
  assert.throws(() => tools.roll('banana'));
});

test('tools: case conversion', () => {
  const c = tools.caseConvert('playerMaxHealth');
  assert.equal(c.snake, 'player_max_health');
  assert.equal(c.constant, 'PLAYER_MAX_HEALTH');
  assert.equal(c.pascal, 'PlayerMaxHealth');
});

test('tools: calculator precedence, powers and functions', () => {
  assert.equal(tools.calc('1920/1080'), 1.77777777778);
  assert.equal(tools.calc('2+3*4'), 14);
  assert.equal(tools.calc('2^3^2'), 512);
  assert.equal(tools.calc('-(2+3)*2'), -10);
  assert.equal(tools.calc('sqrt(16) + round(2.6)'), 7);
  assert.throws(() => tools.calc('alert(1)'));
  assert.throws(() => tools.calc('2+'));
});

test('easing: inOut curves map to the right engine names', () => {
  const s = easing.snippets('inOutQuad');
  assert.match(s.godot, /TRANS_QUAD/);
  assert.match(s.godot, /EASE_IN_OUT/);
  assert.match(s.unity, /Ease\.InOutQuad/);
});
