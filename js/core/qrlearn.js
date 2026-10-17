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
    { n: 3, id: 'bits', title: 'Bits', blurb: 'Modes, the bit stream, zig-zag placement and masks.', ready: true },
    { n: 4, id: 'ecc', title: 'Error correction', blurb: 'Reed–Solomon blocks and how much damage a code survives.', ready: true },
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
    { id: 'bits.modes', level: 3, label: 'Which mode' },
    { id: 'bits.cost', level: 3, label: 'Bits per character' },
    { id: 'bits.stream', level: 3, label: 'The bit stream' },
    { id: 'bits.placement', level: 3, label: 'Zig-zag placement' },
    { id: 'bits.masks', level: 3, label: 'Mask patterns' },
    { id: 'ecc.budget', level: 4, label: 'Repair budget' },
    { id: 'ecc.levels', level: 4, label: 'Level percentages' },
    { id: 'ecc.blocks', level: 4, label: 'Blocks & interleaving' },
    { id: 'ecc.survive', level: 4, label: 'Will it still scan?' },
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

  const MODE_NAMES = { numeric: 'Numeric', alnum: 'Alphanumeric', byte: 'Byte', kanji: 'Kanji' };
  Object.assign(GENERATORS, {
    'bits.modes': r => {
      const t = pick(r, [
        ['4006381333931', 'numeric', 'Only digits: numeric mode packs three into 10 bits.'],
        ['0800 555 0199'.replace(/ /g, ''), 'numeric', 'Only digits: numeric mode.'],
        ['HELLO WORLD', 'alnum', 'Upper-case letters, digits, space and $%*+-./: fit the 45-character alphanumeric set.'],
        ['HTTPS://BENCH.EXAMPLE/QR', 'alnum', 'An upper-case URL fits alphanumeric mode, which is why some printers shout their links.'],
        ['ROOM 12B-4', 'alnum', 'Upper-case, digits, space and “-” are all in the alphanumeric set.'],
        ['https://bench.example/qr', 'byte', 'Lower-case letters are not in the alphanumeric set, so it falls back to byte mode.'],
        ['Café 5€', 'byte', 'Accents and symbols need byte mode (UTF-8).'],
        ['WIFI:T:WPA;S:Home;P:pw;;', 'byte', 'The semicolons and lower-case letters force byte mode.'],
      ]);
      return { skill: 'bits.modes', prompt: `Which mode encodes “${t[0]}” most compactly?`, code: { text: t[0], ec: 'M' }, highlight: [], choices: ['Numeric', 'Alphanumeric', 'Byte', 'Kanji'], answer: MODE_NAMES[t[1]], why: t[2] };
    },
    'bits.cost': r => {
      const mode = pick(r, ['numeric', 'alnum', 'byte']);
      const n = 3 + Math.floor(r() * 8);
      const text = mode === 'numeric' ? Array.from({ length: n }, () => Math.floor(r() * 10)).join('') : mode === 'alnum' ? Array.from({ length: n }, () => pick(r, 'ABCDEFGHJKLMNPRSTUVWXYZ'.split(''))).join('') : Array.from({ length: n }, () => pick(r, 'abcdefghjkmnpqrstuvwxyz'.split(''))).join('');
      const bits = mode === 'numeric' ? Math.floor(n / 3) * 10 + [0, 4, 7][n % 3] : mode === 'alnum' ? Math.floor(n / 2) * 11 + (n % 2) * 6 : n * 8;
      const why = mode === 'numeric' ? `Digits go in threes: 10 bits per 3, then 7 for a pair or 4 for one left over. ${n} digits = ${bits} bits.`
        : mode === 'alnum' ? `Characters go in pairs: 11 bits per pair (45 × first + second), 6 for a single one left over. ${n} characters = ${bits} bits.`
        : `Byte mode spends 8 bits per byte. ${n} ASCII characters = ${bits} bits.`;
      const pool = [...new Set([bits, bits + 2, bits - 2, n * 8, Math.ceil(n * 5.5), Math.ceil(n * 3.33), n * 6, n * 11].filter(x => x > 0).map(String))];
      return { skill: 'bits.cost', prompt: `In ${MODE_NAMES[mode].toLowerCase()} mode, how many data bits do the ${n} characters “${text}” take (not counting the header)?`, code: { text, ec: 'M', mode }, highlight: [], choices: choicesWith(r, String(bits), pool), answer: String(bits), why };
    },
    'bits.stream': r => {
      const q = pick(r, [
        { prompt: 'What comes right after the 4-bit mode indicator?', answer: 'The character count', pool: ['The character count', 'The data', 'The mask number', 'The error-correction bytes'], why: 'Mode (4 bits), then how many characters follow (9–16 bits, depending on mode and version), then the data.' },
        { prompt: 'After the data and its 0000 terminator, how is the rest of the space filled?', answer: 'Alternating bytes 0xEC and 0x11', pool: ['Alternating bytes 0xEC and 0x11', 'Zeros', 'Random noise', 'A copy of the data'], why: '11101100 and 00010001 alternate as padding, so a short message never leaves long runs of one colour.' },
        { prompt: 'Where is the first data bit placed?', answer: 'The bottom-right corner', pool: ['The bottom-right corner', 'The top-left corner', 'The centre', 'Next to the timing pattern'], why: 'Placement starts bottom-right and snakes up and down in two-module-wide columns towards the left.' },
        { prompt: 'In byte mode, how is “é” stored?', answer: 'As two UTF-8 bytes', pool: ['As two UTF-8 bytes', 'As one byte', 'As alphanumeric', 'It can’t be stored'], why: 'Byte mode carries raw bytes. Modern scanners read them as UTF-8, where é is 0xC3 0xA9.' },
        { prompt: 'Why does the character count field get longer in bigger versions?', answer: 'Bigger codes can hold more characters', pool: ['Bigger codes can hold more characters', 'To fill space', 'For error correction', 'It doesn’t'], why: 'A version 40 code holds up to 7,089 digits, which needs 14 bits to count. Version 1 needs only 10.' },
      ]);
      return { skill: 'bits.stream', prompt: q.prompt, code: { text: 'BIT STREAM', ec: 'M' }, highlight: [], choices: shuffle(r, q.pool), answer: q.answer, why: q.why };
    },
    'bits.placement': r => {
      const code = { text: samplePayload(r, 8 + Math.floor(r() * 8)), ec: 'L', version: 1 };
      const e = Q.encode(code.text, code);
      // a codeword that sits wholly inside one two-column strip
      const cands = [];
      for (let cw = 0; cw < e.stream.length; cw++) {
        const cells = [];
        for (let i = 0; i < e.size * e.size; i++) if (e.codeword[i] === cw) cells.push([i % e.size, Math.floor(i / e.size)]);
        const cols = new Set(cells.map(([x]) => (x > 6 ? x - 1 : x) >> 1));
        if (cols.size === 1 && cells.length === 8) cands.push({ cw, cells });
      }
      const c = pick(r, cands);
      const order = c.cells.map(([x, y]) => e.placement.indexOf(y * e.size + x));
      const first = c.cells[order.indexOf(Math.min(...order))], last = c.cells[order.indexOf(Math.max(...order))];
      const answer = first[1] > last[1] ? 'Upwards' : 'Downwards';
      return { skill: 'bits.placement', prompt: `The highlighted modules are codeword ${c.cw + 1}. Which way were its 8 bits laid down?`, code, highlight: c.cells, choices: ['Upwards', 'Downwards', 'Left to right', 'Right to left'], answer, why: 'Bits fill two-module-wide columns, right module then left, and the direction flips each column: up, down, up … starting at the bottom right.' };
    },
    'bits.masks': r => {
      const mask = Math.floor(r() * 8);
      const opts = choicesWith(r, mask, [0, 1, 2, 3, 4, 5, 6, 7]);
      return { skill: 'bits.masks', prompt: 'This is the pattern a mask flips over the data area. Which formula draws it? (x is the column, y the row, from 0 at the top left.)', code: { text: 'MASK', ec: 'L', version: 2 }, maskOnly: mask, highlight: [], choices: opts.map(m => `${m}: ${Q.MASK_FORMULAS[m]}`), answer: `${mask}: ${Q.MASK_FORMULAS[mask]}`, why: `Every module where ${Q.MASK_FORMULAS[mask]} is flipped. Masks break up big blocks and finder-like patterns; the encoder tries all eight and keeps the lowest penalty.` };
    },
    'ecc.budget': r => {
      const n = pick(r, [10, 16, 18, 22, 26, 28, 30]);
      return { skill: 'ecc.budget', prompt: `A block carries ${n} error-correction codewords. How many wrong codewords can it repair, if it doesn’t know where they are?`, code: { text: 'REPAIR', ec: 'H' }, highlight: [], choices: shuffle(r, [String(n / 2), String(n), String(Math.floor(n / 4)), String(n * 2)]), answer: String(n / 2), why: `Reed–Solomon needs two check codewords per unknown error: one to find it, one to fix it. ${n} → ${n / 2}. If the scanner knows which are missing (erasures), it can rebuild up to ${n}.` };
    },
    'ecc.levels': r => {
      const ec = pick(r, ['L', 'M', 'Q', 'H']);
      return { skill: 'ecc.levels', prompt: `Roughly what share of its codewords can a level ${ec} code rebuild?`, code: { text: 'LEVELS', ec }, highlight: [], choices: ['7%', '15%', '25%', '30%'], answer: `${Q.EC[ec].recover}%`, why: 'L ≈ 7%, M ≈ 15%, Q ≈ 25%, H ≈ 30%. More repair means fewer bytes left for data at the same size.' };
    },
    'ecc.blocks': r => {
      const q = pick(r, [
        { prompt: 'Why are the blocks’ codewords interleaved (block 1, block 2, block 1, block 2 …) before placement?', answer: 'So one scratch spreads across blocks', pool: ['So one scratch spreads across blocks', 'To make it look random', 'To save space', 'So it reads faster'], why: 'Neighbouring codewords belong to different blocks, so a local scratch costs each block a little instead of one block a lot.' },
        { prompt: 'A code reports “block 3 has more damage than it can repair”. What happens?', answer: 'The whole code fails to read', pool: ['The whole code fails to read', 'Only block 3’s text is missing', 'It reads with typos', 'It retries with a lower level'], why: 'Every block must repair. One unrecoverable block and the message is lost.' },
        { prompt: 'Why do big versions split their codewords into many blocks?', answer: 'Reed–Solomon over bytes caps a block at 255 codewords', pool: ['Reed–Solomon over bytes caps a block at 255 codewords', 'To print faster', 'Each block is a separate message', 'For the mask'], why: 'Byte-sized Reed–Solomon works on blocks of at most 255. Big codes use many shorter blocks, which also keeps decoding fast.' },
      ]);
      return { skill: 'ecc.blocks', prompt: q.prompt, code: { text: 'BLOCKS', ec: 'Q', version: 5 }, highlight: [], choices: shuffle(r, q.pool), answer: q.answer, why: q.why };
    },
    'ecc.survive': r => {
      const ec = pick(r, ['L', 'M', 'Q', 'H']);
      const code = { text: samplePayload(r, 14 + Math.floor(r() * 10)), ec, version: 3 };
      const e = Q.encode(code.text, code);
      const want = r() < 0.5;
      let flips = [], ok = null;
      // Grow a blob from a random data module until the outcome is the one we want, or give up
      for (let attempt = 0; attempt < 6; attempt++) {
        const cx = 9 + Math.floor(r() * (e.size - 18)), cy = 9 + Math.floor(r() * (e.size - 18));
        const radius = 1.5 + r() * 4.5;
        flips = [];
        for (let y = 0; y < e.size; y++) for (let x = 0; x < e.size; x++) if (Math.hypot(x - cx, y - cy) <= radius && e.role[y * e.size + x] === Q.ROLE.data && r() < 0.7) flips.push([x, y]);
        const m = e.modules.slice();
        for (const [x, y] of flips) m[y * e.size + x] ^= 1;
        ok = Q.decodeMatrix(m).ok;
        if (ok === want) break;
      }
      return { skill: 'ecc.survive', prompt: `Level ${ec}, version 3. The highlighted modules have been flipped. Will it still scan?`, code, flips, highlight: flips, choices: ['Yes', 'No'], answer: ok ? 'Yes' : 'No', why: ok ? `Every block stayed within its repair budget (level ${ec} repairs ~${Q.EC[ec].recover}%).` : `At least one block lost more codewords than its check bytes can rebuild. A higher level, or less damage, would save it.` };
    },
  });

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
