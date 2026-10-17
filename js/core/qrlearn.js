/* Bench · qrlearn.js
 * The learner model behind the QR course: a skill map grouped into six
 * levels, Leitner-box spaced repetition, the "how much to explain" dial
 * that turns lessons into a plain tool, and seeded drill generators.
 * Dates are YYYY-MM-DD strings; today is always passed in.
 */
(function (root) {
  'use strict';
  const Q = typeof module !== 'undefined' && module.exports ? require('./qr.js') : root.Bench.qr;

  const LEVELS = [
    { n: 1, id: 'anatomy', title: 'Anatomy', blurb: 'Name every part of the symbol and what it is for.', ready: true },
    { n: 2, id: 'cover', title: 'Read the cover', blurb: 'Version, error correction, mask and rough size, read by eye.', ready: true },
    { n: 3, id: 'bits', title: 'Bits', blurb: 'Modes, the bit stream, zig-zag placement and masks.', ready: false },
    { n: 4, id: 'ecc', title: 'Error correction', blurb: 'Reed–Solomon blocks and how much damage a code survives.', ready: false },
    { n: 5, id: 'wild', title: 'In the wild', blurb: 'What codes hold, where you meet them and what they do.', ready: false },
    { n: 6, id: 'safe', title: 'Safety & mastery', blurb: 'Spot traps, decode by hand and read any code like a cover.', ready: false },
  ];

  const SKILLS = [
    { id: 'anatomy.finder', level: 1, label: 'Finder patterns' },
    { id: 'anatomy.timing', level: 1, label: 'Timing patterns' },
    { id: 'anatomy.alignment', level: 1, label: 'Alignment patterns' },
    { id: 'anatomy.format', level: 1, label: 'Format information' },
    { id: 'anatomy.version', level: 1, label: 'Version information' },
    { id: 'anatomy.quiet', level: 1, label: 'Quiet zone' },
    { id: 'anatomy.data', level: 1, label: 'Data codewords' },
    { id: 'cover.version', level: 2, label: 'Version from size' },
    { id: 'cover.ec', level: 2, label: 'EC level from the format strip' },
    { id: 'cover.mask', level: 2, label: 'Mask from the format strip' },
    { id: 'cover.contents', level: 2, label: 'Guess the contents from density' },
    { id: 'cover.choose', level: 2, label: 'Choosing an EC level' },
  ];
  const skill = id => SKILLS.find(s => s.id === id);

  // Days until the next review for each box. Box 4+ counts as mastered.
  const INTERVALS = [0, 1, 2, 4, 8, 16];
  const MAX_BOX = INTERVALS.length - 1;
  const MASTERED = 4;

  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
  }
  const dayDiff = (a, b) => {
    const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((p(b) - p(a)) / 864e5);
  };

  const empty = () => ({ skills: {}, log: [] });
  const boxOf = (state, id) => (state.skills[id] ? state.skills[id].box : 0);

  // A right answer moves the skill up a box; a wrong one drops it two
  function record(state, id, correct, today) {
    const prev = state.skills[id] || { box: 0, right: 0, wrong: 0 };
    const box = correct ? Math.min(MAX_BOX, prev.box + 1) : Math.max(0, prev.box - 2);
    const next = { box, right: prev.right + (correct ? 1 : 0), wrong: prev.wrong + (correct ? 0 : 1), due: addDays(today, correct ? INTERVALS[box] : 0), last: today };
    const log = state.log.concat([{ d: today, s: id, ok: !!correct }]).slice(-300);
    return { ...state, skills: { ...state.skills, [id]: next }, log };
  }

  const mastery = (state, ids) => (ids.length ? ids.reduce((a, id) => a + Math.min(boxOf(state, id), MASTERED), 0) / (ids.length * MASTERED) : 0);
  const levelSkills = n => SKILLS.filter(s => s.level === n).map(s => s.id);
  const levelProgress = (state, n) => mastery(state, levelSkills(n));
  const isMastered = (state, id) => boxOf(state, id) >= MASTERED;

  // How much should the tool explain this? explain → predict → hide
  function scaffold(state, ids, override) {
    if (override && override !== 'auto') return override;
    const avg = ids.reduce((a, id) => a + boxOf(state, id), 0) / Math.max(1, ids.length);
    return avg < 2 ? 'explain' : avg < MASTERED ? 'predict' : 'hide';
  }

  const isDue = (state, id, today) => !!state.skills[id] && state.skills[id].due <= today;
  const dueSkills = (state, today, pool = SKILLS.map(s => s.id)) => pool.filter(id => isDue(state, id, today));

  // Next skill to practise: anything due (weakest first), then the first unseen, then the weakest
  function nextSkill(state, today, pool = SKILLS.filter(s => LEVELS[s.level - 1].ready).map(s => s.id)) {
    const due = dueSkills(state, today, pool).sort((a, b) => boxOf(state, a) - boxOf(state, b));
    if (due.length) return due[0];
    const unseen = pool.find(id => !state.skills[id]);
    if (unseen) return unseen;
    return null;
  }

  // Consecutive days with at least one drill, ending today or yesterday
  function streak(state, today) {
    const days = new Set(state.log.map(e => e.d));
    let d = days.has(today) ? today : addDays(today, -1), n = 0;
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  function recommendedLevel(state) {
    for (const L of LEVELS) if (L.ready && levelProgress(state, L.n) < 0.75) return L.n;
    return (LEVELS.filter(l => l.ready).pop() || LEVELS[0]).n;
  }

  // ---- Drills ----------------------------------------------------------------------------------
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function shuffle(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const choicesWith = (r, answer, pool, n = 4) => shuffle(r, [answer, ...shuffle(r, pool.filter(x => x !== answer)).slice(0, n - 1)]);

  const WORDS = ['menu', 'table', 'park', 'ticket', 'gate', 'promo', 'event', 'pay', 'order', 'info', 'room', 'tour'];
  const DOMAINS = ['cafe-luna.com', 'citypark.org', 'museum.example', 'shop.example', 'transit.example', 'festival.example'];
  function samplePayload(r, chars) {
    let s = `https://${pick(r, DOMAINS)}/${pick(r, WORDS)}`;
    while (s.length < chars) s += (s.includes('?') ? '&' : '?') + pick(r, WORDS) + '=' + Math.floor(r() * 1e6).toString(36);
    return s.slice(0, chars);
  }

  const PART = { finder: 'Finder pattern', separator: 'Separator', timing: 'Timing pattern', alignment: 'Alignment pattern', format: 'Format information', version: 'Version information', data: 'Data codeword', dark: 'Dark module' };
  const PART_POOL = ['Finder pattern', 'Timing pattern', 'Alignment pattern', 'Format information', 'Version information', 'Data codeword', 'Separator'];
  const WHY = {
    finder: 'Three big squares in three corners. A scanner finds them first; their 1:1:3:1:1 stripes look the same at any angle, and the missing fourth corner tells it which way up the code is.',
    timing: 'The dotted line between the finders alternates dark/light. It tells the scanner how wide one module is, so it can count columns on a warped or tilted code.',
    alignment: 'Small bullseyes (from version 2 up) that let the scanner correct for curved or angled surfaces.',
    format: 'Fifteen bits beside the finders say which error-correction level and mask were used. They are stored twice, so one copy can be damaged.',
    version: 'Version 7 and up print the version number in two 6×3 blocks, because counting 45+ modules by eye or by camera is error-prone.',
    data: 'Eight modules in a 2-wide zig-zag make one codeword (one byte), holding either your data or error-correction bytes.',
  };

  // Each generator returns { skill, prompt, code: encode options, highlight: [[x,y]…], choices, answer, why }
  const GENERATORS = {
    'anatomy.finder': r => anatomy(r, 'finder', pick(r, [1, 2, 3])),
    'anatomy.timing': r => anatomy(r, 'timing', pick(r, [1, 2, 3])),
    'anatomy.alignment': r => anatomy(r, 'alignment', pick(r, [2, 3, 4, 5])),
    'anatomy.format': r => anatomy(r, 'format', pick(r, [1, 2, 3])),
    'anatomy.version': r => anatomy(r, 'version', 7),
    'anatomy.data': r => anatomy(r, 'data', pick(r, [1, 2])),
    'anatomy.quiet': r => {
      const q = pick(r, [
        { prompt: 'How wide must the empty margin (quiet zone) around a QR code be?', answer: '4 modules', pool: ['1 module', '2 modules', '4 modules', '10% of the width'] },
        { prompt: 'A code is printed edge-to-edge on a busy patterned poster. Why might it fail?', answer: 'No quiet zone, so the finders blend in', pool: ['No quiet zone, so the finders blend in', 'The colours are reversed', 'It needs a logo', 'Posters need version 40'] },
      ]);
      return { skill: 'anatomy.quiet', prompt: q.prompt, code: { text: 'QUIET ZONE', ec: 'M' }, quiet: 4, highlight: [], choices: shuffle(r, q.pool), answer: q.answer, why: 'The scanner needs a clean light border, 4 modules wide, to tell the finder patterns apart from whatever is printed around the code.' };
    },
    'cover.version': r => {
      const v = pick(r, [1, 2, 3, 4, 5, 6, 7, 8, 10]);
      const text = samplePayload(r, Math.max(4, Math.floor(Q.capacity(v, 'L') * (0.75 + r() * 0.2))));
      if (r() < 0.5) {
        const size = Q.sizeOf(v);
        return { skill: 'cover.version', prompt: `This code is ${size} modules across. Which version is it?`, code: { text, ec: 'L', version: v }, highlight: [], choices: choicesWith(r, String(v), ['1', '2', '3', '4', '5', '6', '7', '8', '10', '12']), answer: String(v), why: `Size = 17 + 4 × version, so version = (${size} − 17) ÷ 4 = ${v}.` };
      }
      const range = v === 1 ? 'Version 1' : v <= 6 ? 'Versions 2–6' : 'Versions 7–13';
      return { skill: 'cover.version', prompt: 'Count the small alignment bullseyes. Which versions could this be?', code: { text, ec: 'L', version: v }, highlight: [], choices: ['Version 1', 'Versions 2–6', 'Versions 7–13', 'Versions 14+'], answer: range, why: 'No bullseye: version 1. One: 2–6. Six (a 3×3 grid minus the three finder corners): 7–13. Then 13, 22 … as the grid grows. Codes 7+ also carry version blocks beside the finders.' };
    },
    'cover.ec': r => {
      const ec = pick(r, ['L', 'M', 'Q', 'H']);
      const code = { text: samplePayload(r, 12 + Math.floor(r() * 14)), ec };
      const e = Q.encode(code.text, code);
      const b = [(e.format >>> 14) & 1, (e.format >>> 13) & 1];
      return { skill: 'cover.ec', prompt: 'Read the two highlighted modules left to right (dark = 1), then flip the first bit. Which error-correction level is it?', code, highlight: [[0, 8], [1, 8]], choices: ['L', 'M', 'Q', 'H'], answer: ec, why: `They read ${b.join(' ')}. The format is XOR-ed with 10101…, so flip the first bit: ${b[0] ^ 1} ${b[1]}. 01 = L, 00 = M, 11 = Q, 10 = H.` };
    },
    'cover.mask': r => {
      const mask = Math.floor(r() * 8);
      const code = { text: samplePayload(r, 10 + Math.floor(r() * 12)), ec: pick(r, ['L', 'M']), mask };
      const e = Q.encode(code.text, code);
      const b = [12, 11, 10].map(i => (e.format >>> i) & 1);
      return { skill: 'cover.mask', prompt: 'The three highlighted modules hold the mask number, XOR-ed with 1 0 1. Which mask is it?', code, highlight: [[2, 8], [3, 8], [4, 8]], choices: choicesWith(r, String(mask), ['0', '1', '2', '3', '4', '5', '6', '7']), answer: String(mask), why: `They read ${b.join(' ')}. XOR with 1 0 1 gives ${b.map((x, i) => x ^ [1, 0, 1][i]).join(' ')} = mask ${mask}: ${Q.MASK_FORMULAS[mask]}.` };
    },
    'cover.contents': r => {
      const kinds = [
        { label: 'A product number', text: () => '4006381333931', why: 'A 13-digit barcode number in numeric mode fits in the smallest code.' },
        { label: 'A short link', text: () => `https://${pick(r, ['bit.ly', 'qrco.de', 't.ly'])}/${Math.floor(r() * 1e9).toString(36)}`, why: 'A short link is only 20–25 characters.' },
        { label: 'A full web address with tracking', text: () => samplePayload(r, 110 + Math.floor(r() * 30)), why: 'A long URL with tracking tags runs past 100 characters.' },
        { label: 'A contact card', text: () => ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Ada Example', 'N:Example;Ada;;;', 'ORG:Example Studio', 'TITLE:Producer', 'TEL:+1 555 0100 2233', 'EMAIL:ada@studio.example', 'URL:https://studio.example', 'ADR:;;1 Main St;Springfield;;12345;US', 'END:VCARD'].join('\n'), why: 'A vCard with phone, email, address and site is over 200 bytes.' },
      ];
      const k = pick(r, kinds), code = { text: k.text(), ec: 'M' };
      const v = Q.encode(code.text, code).version;
      return { skill: 'cover.contents', prompt: 'Judge by density alone: what is this code most likely holding?', code, highlight: [], choices: shuffle(r, kinds.map(x => x.label)), answer: k.label, why: `${k.why} That needs version ${v} (${Q.sizeOf(v)}×${Q.sizeOf(v)}). More data means more modules.` };
    },
    'cover.choose': r => {
      const q = pick(r, [
        { prompt: 'A code has a big logo pasted over its centre and still scans. Which level was most likely used?', answer: 'H (30%)', why: 'A logo destroys modules. H can rebuild about 30% of codewords, enough to cover a centred logo.' },
        { prompt: 'Which level gives the most capacity at a given size?', answer: 'L (7%)', why: 'L spends the fewest codewords on repair, leaving the most for data.' },
        { prompt: 'A code goes on shipping boxes that get scuffed and wet. Best pick?', answer: 'Q (25%)', why: 'Q (or H) survives real wear. M is the everyday default for clean print and screens.' },
        { prompt: 'A code shown on a clean screen, with no logo. A sensible default?', answer: 'M (15%)', why: 'M is the common default: decent repair without making the code much denser.' },
      ]);
      return { skill: 'cover.choose', prompt: q.prompt, code: { text: 'EC LEVELS', ec: q.answer[0] }, highlight: [], choices: ['L (7%)', 'M (15%)', 'Q (25%)', 'H (30%)'], answer: q.answer, why: q.why };
    },
  };

  function anatomy(r, part, v) {
    const code = { text: samplePayload(r, Math.max(6, Math.floor(Q.capacity(v, 'M') * 0.8))), ec: 'M', version: v };
    const e = Q.encode(code.text, code);
    const cells = cellsOf(e, part, r);
    return { skill: `anatomy.${part}`, prompt: 'Which part of the code is highlighted?', code, highlight: cells, choices: choicesWith(r, PART[part], PART_POOL), answer: PART[part], why: WHY[part] };
  }

  // One instance of a part: a single finder, one alignment pattern, one format copy, one codeword …
  function cellsOf(e, part, r = Math.random) {
    const { size, role, codeword } = e, R = Q.ROLE[part], cells = [];
    for (let i = 0; i < size * size; i++) if (role[i] === R) cells.push([i % size, Math.floor(i / size)]);
    if (part === 'finder' || part === 'separator') {
      const corner = Math.floor(r() * 3), near = (x, y) => (corner === 0 ? x < 9 && y < 9 : corner === 1 ? x > size - 10 && y < 9 : x < 9 && y > size - 10);
      return cells.filter(([x, y]) => near(x, y));
    }
    if (part === 'alignment') {
      const centres = Q.alignmentPositions(e.version);
      const all = [];
      for (const cx of centres) for (const cy of centres) if (cells.some(([x, y]) => x === cx && y === cy)) all.push([cx, cy]);
      const [cx, cy] = all[Math.floor(r() * all.length)];
      return cells.filter(([x, y]) => Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2);
    }
    if (part === 'format') return r() < 0.5 ? cells.filter(([x, y]) => x < 9 && y < 9) : cells.filter(([x, y]) => x > 8 || y > 8);
    if (part === 'version') return r() < 0.5 ? cells.filter(([x]) => x > 8) : cells.filter(([x]) => x < 8);
    if (part === 'timing') return r() < 0.5 ? cells.filter(([, y]) => y === 6) : cells.filter(([x]) => x === 6);
    if (part === 'data') {
      const cw = Math.floor(r() * Math.min(e.data.length, 10)) + 2;
      const out = [];
      for (let i = 0; i < size * size; i++) if (codeword[i] === cw) out.push([i % size, Math.floor(i / size)]);
      return out;
    }
    return cells;
  }

  function drill(id, seed = Date.now()) {
    const gen = GENERATORS[id];
    if (!gen) throw new Error(`No drill for ${id}`);
    const d = gen(rng(seed));
    return { ...d, seed };
  }

  const api = { LEVELS, SKILLS, INTERVALS, MASTERED, skill, empty, record, boxOf, mastery, levelSkills, levelProgress, isMastered, scaffold, isDue, dueSkills, nextSkill, streak, recommendedLevel, addDays, dayDiff, drill, cellsOf, rng, GENERATORS, WHY, PART };
  root.Bench = root.Bench || {};
  root.Bench.qrlearn = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
