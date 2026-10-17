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

// ---- QR -------------------------------------------------------------------------
const qr = require('../js/core/qr.js');
const qrp = require('../js/core/qrpayload.js');
const qrl = require('../js/core/qrlearn.js');

test('qr: HELLO WORLD 1-M matches the published codewords', () => {
  const e = qr.encode('HELLO WORLD', { ec: 'M' });
  assert.equal(e.version, 1);
  assert.equal(e.mode, 'alnum');
  assert.deepEqual(e.data, [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
  assert.deepEqual(e.blocks[0].ecc, [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('qr: format and version BCH words', () => {
  assert.equal(qr.formatBits('L', 0).toString(2).padStart(15, '0'), '111011111000100');
  assert.equal(qr.formatBits('M', 0).toString(2).padStart(15, '0'), '101010000010010');
  assert.equal(qr.formatBits('Q', 0).toString(2).padStart(15, '0'), '011010101011111');
  assert.equal(qr.formatBits('H', 7).toString(2).padStart(15, '0'), '000100000111011');
  assert.equal(qr.versionBits(7), 0x07c94);
  assert.equal(qr.versionBits(40), 0x28c69);
  assert.deepEqual(qr.readFormat(qr.formatBits('Q', 5) ^ 0b100000010000001), { ec: 'Q', mask: 5, distance: 3 });
});

test('qr: capacities match the ISO table', () => {
  assert.equal(qr.capacity(1, 'L', 'numeric'), 41);
  assert.equal(qr.capacity(1, 'H', 'alnum'), 10);
  assert.equal(qr.capacity(10, 'M', 'byte'), 213);
  assert.equal(qr.capacity(40, 'L', 'byte'), 2953);
  assert.equal(qr.capacity(40, 'H', 'numeric'), 3057);
  assert.deepEqual(qr.alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  for (let v = 1; v <= 40; v++) for (const ec of 'LMQH') {
    const blocks = qr.blockLayout(v, ec);
    assert.equal(blocks.reduce((a, b) => a + b.data + b.ecc, 0), qr.totalCodewords(v));
  }
});

test('qr: encode → decode round trips across modes, versions and levels', () => {
  const texts = ['0123456789', 'HTTPS://EXAMPLE.COM/A', 'https://example.com/menu?table=12', 'Ünïcødé ✓', 'x'.repeat(400), '7'.repeat(2000)];
  for (const t of texts) for (const ec of 'LMQH') {
    let e;
    try { e = qr.encode(t, { ec }); } catch (err) { continue; }
    const d = qr.decodeMatrix(e.modules);
    assert.ok(d.ok, `${t.slice(0, 10)} ${ec}: ${d.error}`);
    assert.equal(d.text, t);
    assert.equal(d.ec, ec);
    assert.equal(d.mask, e.mask);
  }
  for (let m = 0; m < 8; m++) assert.equal(qr.decodeMatrix(qr.encode('MASK', { mask: m }).modules).mask, m);
  assert.throws(() => qr.encode('x'.repeat(3000), { ec: 'H' }));
});

test('qr: roles cover every module', () => {
  const e = qr.encode('https://example.com', { ec: 'Q', version: 7 });
  const count = r => e.role.filter(x => x === qr.ROLE[r]).length;
  assert.equal(count('finder'), 3 * 49);
  assert.equal(count('version'), 36);
  assert.equal(count('format'), 30);
  assert.equal(count('dark'), 1);
  assert.equal(count('alignment'), 6 * 25);
  const dataModules = [...e.codeword].filter(c => c >= 0).length;
  assert.equal(dataModules, qr.totalCodewords(7) * 8);
});

test('qr: Reed–Solomon repairs up to its limit and refuses past it', () => {
  const data = Array.from({ length: 20 }, (_, i) => (i * 37 + 11) & 255);
  const n = 10;
  const clean = data.concat(qr.rsEncode(data, n));
  for (let errs = 0; errs <= n / 2; errs++) {
    const cw = clean.slice();
    for (let k = 0; k < errs; k++) cw[(k * 7 + 3) % cw.length] ^= 0x5a + k;
    const fixed = qr.rsCorrect(cw, n);
    assert.equal(fixed.length, errs);
    assert.deepEqual(cw, clean);
  }
  const broken = clean.slice();
  for (let k = 0; k < 6; k++) broken[k * 4] ^= 0xff;
  const res = qr.rsCorrect(broken, n);
  assert.ok(res === null || broken.join() !== clean.join());
});

test('qr: damaged symbols still decode; format copy can be lost', () => {
  const e = qr.encode('https://bench.example/qr?lesson=4', { ec: 'H' });
  const m = e.modules.slice();
  // Wipe a centred square, like a logo
  const c = Math.floor(e.size / 2);
  for (let y = c - 3; y <= c + 3; y++) for (let x = c - 3; x <= c + 3; x++) m[y * e.size + x] = 0;
  // and scratch five bits of the first format copy (flipping all 15 would make another valid word)
  for (const [x, y] of qr.formatPositions(e.size)[0].slice(0, 5)) m[y * e.size + x] ^= 1;
  const d = qr.decodeMatrix(m);
  assert.ok(d.ok, d.error);
  assert.equal(d.text, e.text);
  assert.ok(d.corrected > 0);
  assert.equal(d.formatCopy, 1);
  assert.equal(qr.decodeMatrix(new Uint8Array(22 * 22)).stage, 'size');
});

test('qrpayload: types and fields', () => {
  const wifi = qrp.classify('WIFI:T:WPA;S:My\\;Home;P:p@ss;;');
  assert.equal(wifi.type, 'wifi');
  assert.deepEqual(wifi.fields.slice(0, 3), [['Network', 'My;Home'], ['Security', 'WPA'], ['Password', 'p@ss']]);
  assert.equal(qrp.classify(qrp.build.wifi({ ssid: 'Cafe', auth: 'none' })).flags[0].code, 'open');
  const card = qrp.classify(qrp.build.contact({ name: 'Ada Example', phone: '+1 555', email: 'ada@x.io' }));
  assert.equal(card.type, 'vcard');
  assert.ok(card.action.includes('Ada Example'));
  assert.equal(qrp.classify('MECARD:N:Example,Ada;TEL:123;;').type, 'mecard');
  assert.equal(qrp.classify('geo:51.5007,-0.1246?q=Big%20Ben').fields[2][1], 'Big Ben');
  assert.equal(qrp.classify('SMSTO:12345:STOP').flags[0].code, 'shortcode');
  assert.equal(qrp.classify('mailto:a@b.co?subject=Hi').fields[1][1], 'Hi');
  assert.equal(qrp.classify('otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP&issuer=Acme').type, 'otp');
  assert.equal(qrp.classify('bitcoin:bc1qxyz?amount=0.01').type, 'crypto');
  assert.equal(qrp.classify('upi://pay?pa=shop@bank&pn=Shop&am=50').fields[0][1], 'Shop');
  assert.equal(qrp.classify('BCD\n002\n1\nSCT\nBICXX\nPayee Ltd\nDE89370400440532013000\nEUR12.50').type, 'epc');
  assert.equal(qrp.classify('BEGIN:VEVENT\nSUMMARY:Launch\nDTSTART:20261020T180000\nEND:VEVENT').fields[1][1], '2026-10-20 18:00');
  assert.equal(qrp.classify('4006381333931').type, 'gtin');
  assert.equal(qrp.classify('4006381333932').type, 'text');
  assert.equal(qrp.classify('https://id.gs1.org/01/09506000134352').kind, 'product');
  assert.equal(qrp.classify('https://apps.apple.com/app/id123').kind, 'app-store');
  assert.equal(qrp.classify('Just a note').type, 'text');
});

test('qrpayload: safety flags', () => {
  const codes = t => qrp.classify(t).flags.map(f => f.code);
  assert.deepEqual(codes('https://example.com/'), []);
  assert.ok(codes('http://example.com').includes('http'));
  assert.ok(codes('https://bit.ly/3abc').includes('shortener'));
  assert.ok(codes('https://qrco.de/bdX1').includes('dynamic'));
  assert.ok(codes('https://paypal.com@evil.example/login').includes('userinfo'));
  assert.ok(codes('http://192.168.4.20/pay').includes('ip'));
  assert.ok(codes('https://pаypal.com').includes('lookalike')); // Cyrillic а
  assert.ok(codes('https://paypal.com.secure-check.example/').includes('brand'));
  assert.deepEqual(codes('https://www.paypal.com/'), []);
  assert.ok(codes('https://parking-pay-verify.com/').includes('lure'));
  assert.ok(codes('https://files.example/app.apk').includes('download'));
  assert.ok(codes('https://shop.example/?utm_source=poster').includes('tracking'));
  assert.equal(qrp.classify('javascript:alert(1)').flags[0].level, 'bad');
});

test('qrlearn: Leitner boxes, due dates and scaffolding', () => {
  let s = qrl.empty();
  const day = '2026-10-17';
  assert.equal(qrl.nextSkill(s, day), 'anatomy.finder');
  assert.equal(qrl.scaffold(s, ['anatomy.finder']), 'explain');
  for (let i = 0; i < 4; i++) s = qrl.record(s, 'anatomy.finder', true, qrl.addDays(day, i));
  assert.equal(s.skills['anatomy.finder'].box, 4);
  assert.equal(s.skills['anatomy.finder'].due, qrl.addDays(qrl.addDays(day, 3), 8));
  assert.equal(qrl.scaffold(s, ['anatomy.finder']), 'hide');
  assert.equal(qrl.scaffold(s, ['anatomy.finder'], 'explain'), 'explain');
  assert.equal(qrl.streak(s, qrl.addDays(day, 3)), 4);
  assert.equal(qrl.streak(s, qrl.addDays(day, 5)), 0);
  s = qrl.record(s, 'anatomy.finder', false, qrl.addDays(day, 4));
  assert.equal(s.skills['anatomy.finder'].box, 2);
  assert.equal(qrl.scaffold(s, ['anatomy.finder']), 'predict');
  assert.ok(qrl.isDue(s, 'anatomy.finder', qrl.addDays(day, 4)));
  assert.equal(qrl.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(qrl.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(qrl.dayDiff('2026-10-17', '2026-11-17'), 31);
});

test('qrlearn: every drill is answerable and deterministic', () => {
  for (const s of qrl.SKILLS) for (let seed = 1; seed <= 25; seed++) {
    const d = qrl.drill(s.id, seed);
    assert.ok(d.choices.includes(d.answer), `${s.id}#${seed}: answer missing`);
    assert.equal(new Set(d.choices).size, d.choices.length);
    const e = qr.encode(d.code.text, d.code);
    for (const [x, y] of d.highlight) assert.ok(x >= 0 && y >= 0 && x < e.size && y < e.size);
    if (s.id.startsWith('anatomy.') && s.id !== 'anatomy.quiet') assert.ok(d.highlight.length > 0, s.id);
    assert.deepEqual(qrl.drill(s.id, seed), d);
  }
  // The format-strip drills really are readable from the highlighted modules
  for (let seed = 1; seed <= 40; seed++) {
    const d = qrl.drill('cover.ec', seed), e = qr.encode(d.code.text, d.code);
    const [a, b] = d.highlight.map(([x, y]) => e.modules[y * e.size + x]);
    assert.equal(qr.EC_BY_BITS[((a ^ 1) << 1) | b], d.answer);
    const m = qrl.drill('cover.mask', seed), em = qr.encode(m.code.text, m.code);
    const bits = m.highlight.map(([x, y]) => em.modules[y * em.size + x]);
    assert.equal(String(((bits[0] ^ 1) << 2) | (bits[1] << 1) | (bits[2] ^ 1)), m.answer);
  }
});
