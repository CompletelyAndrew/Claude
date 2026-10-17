/* Bench · qr.js
 * QR Code model 2, versions 1–40: encoder, Reed–Solomon, and a matrix
 * decoder that keeps every intermediate step so lessons can show them.
 * Every module also gets a role (finder, timing, format, data …) and the
 * data codeword it belongs to, which is what the overlays draw from.
 */
(function (root) {
  'use strict';

  // ---- Tables (ISO/IEC 18004), index 0 unused ---------------------------------
  const EC = {
    L: { ord: 0, bits: 1, recover: 7 },
    M: { ord: 1, bits: 0, recover: 15 },
    Q: { ord: 2, bits: 3, recover: 25 },
    H: { ord: 3, bits: 2, recover: 30 },
  };
  const EC_BY_BITS = ['M', 'L', 'H', 'Q'];
  const ECC_PER_BLOCK = [
    [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const NUM_BLOCKS = [
    [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  const MODES = {
    numeric: { bits: 0x1, count: [10, 12, 14] },
    alnum: { bits: 0x2, count: [9, 11, 13] },
    byte: { bits: 0x4, count: [8, 16, 16] },
    kanji: { bits: 0x8, count: [8, 10, 12] },
    eci: { bits: 0x7 },
  };
  const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const countBits = (mode, version) => MODES[mode].count[version <= 9 ? 0 : version <= 26 ? 1 : 2];

  // Module roles, in the order lessons introduce them
  const ROLE = { data: 0, finder: 1, separator: 2, timing: 3, alignment: 4, format: 5, version: 6, dark: 7, remainder: 8 };
  const ROLE_NAMES = Object.keys(ROLE);

  const sizeOf = v => v * 4 + 17;
  const versionOf = size => (size - 17) / 4;

  function rawDataModules(v) {
    let n = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const a = Math.floor(v / 7) + 2;
      n -= (25 * a - 10) * a - 55;
      if (v >= 7) n -= 36;
    }
    return n;
  }
  const totalCodewords = v => Math.floor(rawDataModules(v) / 8);
  const dataCodewords = (v, ec) => totalCodewords(v) - ECC_PER_BLOCK[EC[ec].ord][v] * NUM_BLOCKS[EC[ec].ord][v];

  function blockLayout(v, ec) {
    const o = EC[ec].ord;
    const n = NUM_BLOCKS[o][v], ecc = ECC_PER_BLOCK[o][v], total = totalCodewords(v);
    const shortLen = Math.floor(total / n), numShort = n - (total % n);
    const blocks = [];
    for (let i = 0; i < n; i++) blocks.push({ data: shortLen - ecc + (i < numShort ? 0 : 1), ecc });
    return blocks;
  }

  function alignmentPositions(v) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2;
    const step = Math.floor((v * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const out = [6];
    for (let pos = sizeOf(v) - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  // ---- GF(256) and Reed–Solomon ------------------------------------------------------
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const div = (a, b) => { if (!b) throw new Error('divide by zero'); return a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0; };

  // Generator with roots α^0 … α^(n-1), highest degree first, leading 1 dropped
  const genCache = {};
  function generator(n) {
    if (genCache[n]) return genCache[n];
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
      g = next;
    }
    return (genCache[n] = g.slice(1));
  }

  function rsEncode(data, n) {
    const g = generator(n), rem = new Array(n).fill(0);
    for (const b of data) {
      const f = b ^ rem.shift();
      rem.push(0);
      for (let i = 0; i < n; i++) rem[i] ^= mul(g[i], f);
    }
    return rem;
  }

  // Correct a whole block (data + ecc) in place. Returns positions fixed, or null if past repair.
  function rsCorrect(block, n) {
    const N = block.length;
    const S = [];
    let clean = true;
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < N; k++) s = mul(s, EXP[j]) ^ block[k];
      S.push(s);
      if (s) clean = false;
    }
    if (clean) return [];
    // Berlekamp–Massey → error locator Λ (lowest degree first)
    let C = [1], B = [1], L = 0, m = 1, b = 1;
    for (let i = 0; i < n; i++) {
      let d = S[i];
      for (let k = 1; k <= L; k++) d ^= mul(C[k] || 0, S[i - k]);
      if (d === 0) { m++; continue; }
      const coef = div(d, b), T = C.slice();
      const len = Math.max(C.length, B.length + m);
      while (C.length < len) C.push(0);
      for (let k = 0; k < B.length; k++) C[k + m] ^= mul(coef, B[k]);
      if (2 * L <= i) { L = i + 1 - L; B = T; b = d; m = 1; } else m++;
    }
    if (L * 2 > n) return null;
    const evalAt = (p, x) => { let y = 0; for (let k = p.length - 1; k >= 0; k--) y = mul(y, x) ^ p[k]; return y; };
    // Ω = S·Λ mod x^n
    const omega = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k <= i && k < C.length; k++) omega[i] ^= mul(C[k], S[i - k]);
    const deriv = C.map((c, k) => (k % 2 ? c : 0)).slice(1);
    const fixed = [];
    for (let p = 0; p < N; p++) {
      const xInv = EXP[(255 - p) % 255];
      if (evalAt(C, xInv) !== 0) continue;
      const den = evalAt(deriv, xInv);
      if (!den) return null;
      const e = mul(EXP[p], div(evalAt(omega, xInv), den));
      const k = N - 1 - p;
      block[k] ^= e;
      fixed.push(k);
    }
    if (fixed.length !== L) return null;
    return fixed.sort((a, z) => a - z);
  }

  // ---- BCH: format and version information -------------------------------------------
  function formatBits(ec, mask) {
    const data = (EC[ec].bits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }
  function versionBits(v) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    return (v << 12) | rem;
  }
  const popcount = x => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };
  function readFormat(bits) {
    let best = null;
    for (const ec of 'LMQH') for (let mask = 0; mask < 8; mask++) {
      const d = popcount(bits ^ formatBits(ec, mask));
      if (!best || d < best.distance) best = { ec, mask, distance: d };
    }
    return best.distance <= 3 ? best : null;
  }

  // ---- Masks ---------------------------------------------------------------------------
  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const MASK_FORMULAS = ['(x + y) mod 2 = 0', 'y mod 2 = 0', 'x mod 3 = 0', '(x + y) mod 3 = 0', '(⌊x/3⌋ + ⌊y/2⌋) mod 2 = 0', 'xy mod 2 + xy mod 3 = 0', '(xy mod 2 + xy mod 3) mod 2 = 0', '((x + y) mod 2 + xy mod 3) mod 2 = 0'];

  // ---- The empty grid: function patterns and roles -----------------------------------------
  // Matrix layout: modules[y * size + x], 1 = dark.
  function skeleton(v) {
    const size = sizeOf(v), n = size * size;
    const modules = new Uint8Array(n), role = new Uint8Array(n), fn = new Uint8Array(n);
    const set = (x, y, dark, r) => { const i = y * size + x; modules[i] = dark ? 1 : 0; role[i] = r; fn[i] = 1; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0, ROLE.timing); set(i, 6, i % 2 === 0, ROLE.timing); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4, d === 4 ? ROLE.separator : ROLE.finder);
      }
    }
    const align = alignmentPositions(v), last = align.length - 1;
    for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, ROLE.alignment);
    }
    // Reserve format areas (filled later), the always-dark module, and version blocks
    for (const [x, y] of formatPositions(size).flat()) set(x, y, false, ROLE.format);
    set(8, size - 8, true, ROLE.dark);
    if (v >= 7) {
      const vb = versionBits(v);
      for (let i = 0; i < 18; i++) {
        const bit = (vb >>> i) & 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, bit, ROLE.version); set(b, a, bit, ROLE.version);
      }
    }
    return { version: v, size, modules, role, fn };
  }

  // Where format bit i (0 = least significant) lives, for both copies
  function formatPositions(size) {
    const a = [], b = [];
    for (let i = 0; i <= 5; i++) a.push([8, i]);
    a.push([8, 7], [8, 8], [7, 8]);
    for (let i = 9; i < 15; i++) a.push([14 - i, 8]);
    for (let i = 0; i < 8; i++) b.push([size - 1 - i, 8]);
    for (let i = 8; i < 15; i++) b.push([8, size - 15 + i]);
    return [a, b];
  }

  // Data modules in placement order: two-column zig-zag from the bottom right
  function placementOrder(sk) {
    const { size, fn } = sk, out = [];
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const upward = ((right + 1) & 2) === 0;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = upward ? size - 1 - vert : vert;
        if (!fn[y * size + x]) out.push(y * size + x);
      }
    }
    return out;
  }

  function writeFormat(sk, ec, mask) {
    const bits = formatBits(ec, mask);
    for (const copy of formatPositions(sk.size)) copy.forEach(([x, y], i) => { sk.modules[y * sk.size + x] = (bits >>> i) & 1; });
  }

  function applyMask(sk, mask) {
    const { size, modules, fn } = sk, f = MASKS[mask];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!fn[i] && f(x, y)) modules[i] ^= 1;
    }
  }

  // ---- Penalty (ISO 18004 §7.8.3) ------------------------------------------------------------
  function penalty(modules, size) {
    const at = (x, y) => modules[y * size + x];
    let n1 = 0, n2 = 0, n3 = 0, dark = 0;
    const PAT = [1, 0, 1, 1, 1, 0, 1];
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        let run = 1;
        const line = [];
        for (let b = 0; b < size; b++) line.push(pass ? at(a, b) : at(b, a));
        for (let b = 1; b <= size; b++) {
          if (b < size && line[b] === line[b - 1]) run++;
          else { if (run >= 5) n1 += 3 + run - 5; run = 1; }
        }
        // Finder-like 1:1:3:1:1 with four light modules on either side (outside the grid counts as light)
        for (let b = -4; b < size; b++) {
          const get = k => (k < 0 || k >= size ? 0 : line[k]);
          let match = true;
          for (let k = 0; k < 7 && match; k++) if (get(b + k) !== PAT[k]) match = false;
          if (!match) continue;
          const lightBefore = [1, 2, 3, 4].every(k => get(b - k) === 0);
          const lightAfter = [7, 8, 9, 10].every(k => get(b + k) === 0);
          if (lightBefore) n3 += 40;
          if (lightAfter) n3 += 40;
        }
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) n2 += 3;
    }
    for (let i = 0; i < modules.length; i++) dark += modules[i];
    const pct = (dark * 100) / modules.length;
    const n4 = Math.floor(Math.abs(pct - 50) / 5) * 10;
    return { total: n1 + n2 + n3 + n4, runs: n1, blocks: n2, finderLike: n3, balance: n4, darkPct: pct };
  }

  // ---- Segments ----------------------------------------------------------------------------------
  const utf8 = s => Array.from(new TextEncoder().encode(s));
  function bestMode(text) {
    if (/^[0-9]*$/.test(text)) return 'numeric';
    if ([...text].every(c => ALNUM.includes(c))) return 'alnum';
    return 'byte';
  }
  function segmentBits(text, mode, version) {
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    let count;
    if (mode === 'byte') count = utf8(text).length; else count = text.length;
    push(MODES[mode].bits, 4);
    push(count, countBits(mode, version));
    if (mode === 'numeric') for (let i = 0; i < text.length; i += 3) { const g = text.slice(i, i + 3); push(+g, g.length * 3 + 1); }
    else if (mode === 'alnum') for (let i = 0; i < text.length; i += 2) {
      if (i + 1 < text.length) push(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
      else push(ALNUM.indexOf(text[i]), 6);
    }
    else for (const b of utf8(text)) push(b, 8);
    return { bits, count };
  }

  // How many characters of a mode fit in a version/EC (handy for capacity lessons)
  function capacity(v, ec, mode = 'byte') {
    const avail = dataCodewords(v, ec) * 8 - 4 - countBits(mode, v);
    if (mode === 'numeric') { const g = Math.floor(avail / 10), r = avail % 10; return g * 3 + (r >= 7 ? 2 : r >= 4 ? 1 : 0); }
    if (mode === 'alnum') { const g = Math.floor(avail / 11), r = avail % 11; return g * 2 + (r >= 6 ? 1 : 0); }
    if (mode === 'kanji') return Math.floor(avail / 13);
    return Math.floor(avail / 8);
  }

  // ---- Encode ------------------------------------------------------------------------------------------
  // encode(text, { ec: 'M', mask: 'auto'|0-7, minVersion, version, mode })
  function encode(text, opts = {}) {
    text = String(text);
    const ec = opts.ec || 'M';
    if (!EC[ec]) throw new Error(`Unknown error-correction level ${ec}`);
    const mode = opts.mode || bestMode(text);
    let version = null, seg = null;
    for (let v = opts.version || opts.minVersion || 1; v <= (opts.version || 40); v++) {
      const s = segmentBits(text, mode, v);
      if (s.count < 2 ** countBits(mode, v) && s.bits.length <= dataCodewords(v, ec) * 8) { version = v; seg = s; break; }
    }
    if (!version) throw new Error(opts.version ? `Too long for version ${opts.version}-${ec}` : 'Too long for any QR code at this error-correction level');
    const capBits = dataCodewords(version, ec) * 8;
    const bits = seg.bits.slice();
    const terminator = Math.min(4, capBits - bits.length);
    for (let i = 0; i < terminator; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const dataLen = bits.length / 8;
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    for (let pad = 0xec; data.length < capBits / 8; pad ^= 0xec ^ 0x11) data.push(pad);

    // Split into blocks, add EC codewords, interleave
    const layout = blockLayout(version, ec);
    let k = 0;
    const blocks = layout.map(b => { const d = data.slice(k, (k += b.data)); return { data: d, ecc: rsEncode(d, b.ecc) }; });
    const stream = [], owner = [];
    const maxData = Math.max(...layout.map(b => b.data));
    for (let i = 0; i < maxData; i++) blocks.forEach((b, bi) => { if (i < b.data.length) { stream.push(b.data[i]); owner.push({ block: bi, index: i, ecc: false }); } });
    for (let i = 0; i < layout[0].ecc; i++) blocks.forEach((b, bi) => { stream.push(b.ecc[i]); owner.push({ block: bi, index: i, ecc: true }); });

    // Place
    const sk = skeleton(version);
    const order = placementOrder(sk);
    const codeword = new Int16Array(sk.size * sk.size).fill(-1);
    order.forEach((idx, i) => {
      const cw = i >> 3;
      if (cw < stream.length) { sk.modules[idx] = (stream[cw] >>> (7 - (i & 7))) & 1; codeword[idx] = cw; }
      else sk.role[idx] = ROLE.remainder;
    });
    const unmasked = sk.modules.slice();

    // Pick the mask with the lowest penalty unless one was asked for
    const penalties = [];
    let mask = opts.mask === 'auto' || opts.mask == null ? -1 : +opts.mask;
    for (let m = 0; m < 8; m++) {
      const trial = { ...sk, modules: unmasked.slice() };
      applyMask(trial, m); writeFormat(trial, ec, m);
      penalties.push(penalty(trial.modules, sk.size));
    }
    if (mask < 0) mask = penalties.reduce((best, p, m) => (p.total < penalties[best].total ? m : best), 0);
    applyMask(sk, mask);
    writeFormat(sk, ec, mask);

    return {
      text, version, size: sk.size, ec, mask, mode,
      modules: sk.modules, role: sk.role, codeword, unmasked,
      segments: [{ mode, count: seg.count, bits: seg.bits.length, text }],
      bits: { segment: seg.bits.length, terminator, padBits: dataLen * 8 - seg.bits.length - terminator, padBytes: data.length - dataLen, capacity: capBits },
      data, blocks, stream, owner, penalties, placement: order,
      format: formatBits(ec, mask),
    };
  }

  // ---- Decode a module grid ------------------------------------------------------------------------------
  // grid: Uint8Array/array of 0|1 (row-major) or array of rows. Returns { ok, text, steps… } or { ok:false, error, stage }.
  function decodeMatrix(grid, sizeHint) {
    let size, modules;
    if (Array.isArray(grid) && Array.isArray(grid[0])) { size = grid.length; modules = Uint8Array.from(grid.flat(), b => (b ? 1 : 0)); }
    else { modules = Uint8Array.from(grid, b => (b ? 1 : 0)); size = sizeHint || Math.round(Math.sqrt(modules.length)); }
    const version = versionOf(size);
    if (!Number.isInteger(version) || version < 1 || version > 40) return { ok: false, stage: 'size', error: `A ${size}×${size} grid isn't a QR size (21, 25, 29 … 177).` };
    const at = (x, y) => modules[y * size + x];

    // Format: try each copy, then both against all 32 valid words
    const copies = formatPositions(size).map(copy => copy.reduce((acc, [x, y], i) => acc | (at(x, y) << i), 0));
    let format = null, formatCopy = -1;
    copies.forEach((bits, i) => { const f = readFormat(bits); if (f && (!format || f.distance < format.distance)) { format = f; formatCopy = i; } });
    if (!format) return { ok: false, stage: 'format', error: 'Both copies of the format information are too damaged to read.', copies };

    const sk = skeleton(version);
    const order = placementOrder(sk);
    const f = MASKS[format.mask];
    const raw = [];
    let byte = 0;
    order.forEach((idx, i) => {
      const x = idx % size, y = Math.floor(idx / size);
      byte = (byte << 1) | (at(x, y) ^ (f(x, y) ? 1 : 0));
      if ((i & 7) === 7) { raw.push(byte); byte = 0; }
    });
    const total = totalCodewords(version);
    raw.length = total;

    // De-interleave
    const layout = blockLayout(version, format.ec);
    const blocks = layout.map(b => ({ data: [], ecc: [], len: b.data, n: b.ecc }));
    let p = 0;
    const maxData = Math.max(...layout.map(b => b.data));
    for (let i = 0; i < maxData; i++) blocks.forEach(b => { if (i < b.len) b.data.push(raw[p++]); });
    for (let i = 0; i < layout[0].ecc; i++) blocks.forEach(b => { b.ecc.push(raw[p++]); });

    const corrections = [];
    const data = [];
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi], cw = b.data.concat(b.ecc);
      const fixed = rsCorrect(cw, b.n);
      if (fixed === null) return { ok: false, stage: 'ecc', error: `Block ${bi + 1} of ${blocks.length} has more damage than its ${b.n} error-correction codewords can repair.`, version, ec: format.ec, mask: format.mask, block: bi };
      corrections.push(fixed.length);
      data.push(...cw.slice(0, b.len));
    }

    const parsed = parseSegments(data, version);
    if (!parsed.ok) return { ...parsed, version, ec: format.ec, mask: format.mask };
    return {
      ok: true, text: parsed.text, segments: parsed.segments, version, size, ec: format.ec, mask: format.mask,
      formatDistance: format.distance, formatCopy, corrections, corrected: corrections.reduce((a, b) => a + b, 0),
      capacity: corrections.map((_, i) => Math.floor(blocks[i].n / 2)), data, raw,
    };
  }

  function parseSegments(bytes, version) {
    let pos = 0;
    const total = bytes.length * 8;
    const read = n => { let v = 0; for (let i = 0; i < n; i++) { v = (v << 1) | ((bytes[pos >> 3] >>> (7 - (pos & 7))) & 1); pos++; } return v; };
    const segments = [];
    let text = '', eci = null;
    while (pos + 4 <= total) {
      const m = read(4);
      if (m === 0) break;
      const mode = Object.keys(MODES).find(k => MODES[k].bits === m);
      if (!mode) return { ok: false, stage: 'data', error: `Unknown mode indicator ${m.toString(2).padStart(4, '0')}.` };
      if (mode === 'eci') {
        let v = read(8);
        if ((v & 0xc0) === 0x80) v = ((v & 0x3f) << 8) | read(8);
        else if ((v & 0xe0) === 0xc0) v = ((v & 0x1f) << 16) | read(16);
        eci = v; segments.push({ mode, value: v });
        continue;
      }
      const count = read(countBits(mode, version));
      let s = '';
      if (mode === 'numeric') {
        for (let left = count; left > 0; left -= 3) { const n = Math.min(3, left); s += String(read(n * 3 + 1)).padStart(n, '0'); }
      } else if (mode === 'alnum') {
        for (let left = count; left > 0; left -= 2) {
          if (left >= 2) { const v = read(11); s += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45]; } else s += ALNUM[read(6)];
        }
      } else if (mode === 'byte') {
        const b = [];
        for (let i = 0; i < count; i++) b.push(read(8));
        s = decodeBytes(b, eci);
      } else {
        // Kanji: 13-bit Shift JIS values. Without a Shift JIS table we show the code points.
        const codes = [];
        for (let i = 0; i < count; i++) { const v = read(13); const c = Math.floor(v / 0xc0) * 0x100 + (v % 0xc0); codes.push(c + (c + 0x8140 <= 0x9ffc ? 0x8140 : 0xc140)); }
        s = codes.map(c => `[SJIS ${c.toString(16)}]`).join('');
      }
      if (pos > total) return { ok: false, stage: 'data', error: 'The data ran past the end of the code.' };
      segments.push({ mode, count, text: s });
      text += s;
    }
    return { ok: true, text, segments };
  }

  function decodeBytes(bytes, eci) {
    const u8 = Uint8Array.from(bytes);
    if (eci === 3 || eci === 1) return Array.from(u8, b => String.fromCharCode(b)).join(''); // ISO-8859-1
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
    catch (e) { return Array.from(u8, b => String.fromCharCode(b)).join(''); }
  }

  const api = {
    EC, EC_BY_BITS, MODES, ALNUM, ROLE, ROLE_NAMES, MASKS, MASK_FORMULAS,
    sizeOf, versionOf, totalCodewords, dataCodewords, blockLayout, alignmentPositions, capacity, countBits, bestMode,
    rsEncode, rsCorrect, formatBits, versionBits, readFormat, formatPositions, penalty, skeleton, placementOrder,
    encode, decodeMatrix, parseSegments,
  };
  root.Bench = root.Bench || {};
  root.Bench.qr = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
