/* Bench · tools.js
 * Pure helpers behind the Toolbox: units, encoders, JSON, time, dice.
 */
(function (root) {
  'use strict';

  // ---- Units: each family converts through a base unit -------------------
  const UNITS = {
    length: { base: 'm', units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, px: 0.0254 / 96 } },
    mass: { base: 'kg', units: { g: 0.001, kg: 1, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 } },
    volume: { base: 'l', units: { ml: 0.001, l: 1, tsp: 0.00492892, tbsp: 0.0147868, 'fl oz': 0.0295735, cup: 0.236588, gal: 3.78541 } },
    speed: { base: 'm/s', units: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 0.514444 } },
    data: { base: 'B', units: { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 } },
    time: { base: 's', units: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800, frame60: 1 / 60, frame30: 1 / 30 } },
    temperature: { base: 'C', units: { C: 1, F: 1, K: 1 } },
  };

  function convert(value, from, to, family) {
    const v = +value;
    if (!isFinite(v)) return NaN;
    if (family === 'temperature') {
      const c = from === 'C' ? v : from === 'F' ? (v - 32) * 5 / 9 : v - 273.15;
      return to === 'C' ? c : to === 'F' ? c * 9 / 5 + 32 : c + 273.15;
    }
    const u = UNITS[family].units;
    return (v * u[from]) / u[to];
  }

  // ---- Encoders ------------------------------------------------------------
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

  function decodeJWT(token) {
    const parts = String(token).trim().split('.');
    if (parts.length < 2) throw new Error('A JWT has three parts separated by dots.');
    const pad = s => s + '='.repeat((4 - (s.length % 4)) % 4);
    return { header: JSON.parse(b64decode(pad(parts[0]))), payload: JSON.parse(b64decode(pad(parts[1]))) };
  }

  // ---- JSON ----------------------------------------------------------------
  function jsonCheck(text, indent = 2) {
    try {
      const value = JSON.parse(text);
      return { ok: true, value, pretty: JSON.stringify(value, null, indent), minified: JSON.stringify(value) };
    } catch (e) {
      const m = String(e.message).match(/position (\d+)/);
      let line = null, col = null;
      if (m) {
        const pos = +m[1];
        const before = text.slice(0, pos).split('\n');
        line = before.length; col = before[before.length - 1].length + 1;
      }
      return { ok: false, error: e.message, line, col };
    }
  }

  // ---- Time ----------------------------------------------------------------
  function parseTimestamp(input) {
    const s = String(input).trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      const n = +s;
      // seconds vs milliseconds: anything past year ~2286 in seconds is ms
      return new Date(Math.abs(n) > 1e11 ? n : n * 1000);
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function relative(date, now = new Date()) {
    const diff = (date - now) / 1000;
    const abs = Math.abs(diff);
    const table = [[60, 'second', 1], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400], [2629800, 'week', 604800], [31557600, 'month', 2629800], [Infinity, 'year', 31557600]];
    for (const [limit, unit, div] of table) {
      if (abs < limit) {
        try { return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(diff / div), unit); }
        catch (e) { return Math.round(diff / div) + ' ' + unit + 's'; }
      }
    }
    return '';
  }

  // ---- Dice ----------------------------------------------------------------
  // "3d6+2", "d20", "4d6kh3" (keep highest 3), "2d20kl1" (disadvantage)
  function roll(expr, rand = Math.random) {
    const s = String(expr).toLowerCase().replace(/\s+/g, '');
    const re = /([+-]?)(\d*)d(\d+)(k[hl]\d+)?|([+-]?)(\d+)/g;
    let total = 0, parts = [], m, matched = '';
    while ((m = re.exec(s))) {
      matched += m[0];
      if (m[3]) {
        const sign = m[1] === '-' ? -1 : 1;
        const n = Math.min(+(m[2] || 1), 100), sides = +m[3];
        const rolls = Array.from({ length: n }, () => 1 + Math.floor(rand() * sides));
        let kept = rolls.slice();
        if (m[4]) {
          const k = +m[4].slice(2);
          const sorted = rolls.slice().sort((a, b) => a - b);
          kept = m[4][1] === 'h' ? sorted.slice(-k) : sorted.slice(0, k);
        }
        const sum = kept.reduce((a, b) => a + b, 0) * sign;
        total += sum;
        parts.push({ term: m[0].replace(/^\+/, ''), rolls, kept, sum });
      } else if (m[6]) {
        const v = (m[5] === '-' ? -1 : 1) * +m[6];
        total += v;
        parts.push({ term: m[0], sum: v });
      }
    }
    if (!parts.length || matched !== s) throw new Error('Try a roll like 3d6+2, d20 or 4d6kh3.');
    return { total, parts };
  }

  // ---- Calculator: recursive descent, no eval -----------------------------
  // Supports + - * / % ^, parentheses, unary minus, pi, e and a few functions.
  function calc(input) {
    const src = String(input).replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').toLowerCase();
    const FN = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, log: Math.log10, ln: Math.log };
    const CONST = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
    let i = 0;
    const peek = () => src[i];
    const fail = () => { throw new Error('Could not read that sum.'); };
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') v = src[i++] === '+' ? v + term() : v - term();
      return v;
    }
    function term() {
      let v = power();
      while (peek() === '*' || peek() === '/' || peek() === '%') {
        const op = src[i++];
        const r = power();
        v = op === '*' ? v * r : op === '/' ? v / r : v % r;
      }
      return v;
    }
    function power() {
      const b = unary();
      if (peek() === '^') { i++; return Math.pow(b, power()); }
      return b;
    }
    function unary() {
      if (peek() === '-') { i++; return -unary(); }
      if (peek() === '+') { i++; return unary(); }
      return atom();
    }
    function atom() {
      if (peek() === '(') { i++; const v = expr(); if (src[i++] !== ')') fail(); return v; }
      const num = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/);
      if (num) { i += num[0].length; return parseFloat(num[0]); }
      const word = src.slice(i).match(/^[a-z]+/);
      if (word) {
        i += word[0].length;
        if (word[0] in CONST) return CONST[word[0]];
        if (word[0] in FN && peek() === '(') { i++; const v = expr(); if (src[i++] !== ')') fail(); return FN[word[0]](v); }
      }
      return fail();
    }
    if (!src) fail();
    const v = expr();
    if (i !== src.length || !isFinite(v)) fail();
    return +v.toPrecision(12);
  }

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function slugify(s) {
    return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function caseConvert(s) {
    const words = String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w.toLowerCase());
    const cap = w => w[0].toUpperCase() + w.slice(1);
    return {
      camel: words.map((w, i) => (i ? cap(w) : w)).join(''),
      pascal: words.map(cap).join(''),
      snake: words.join('_'),
      constant: words.join('_').toUpperCase(),
      kebab: words.join('-'),
      title: words.map(cap).join(' '),
    };
  }

  const api = { UNITS, convert, calc, b64encode, b64decode, decodeJWT, jsonCheck, parseTimestamp, relative, roll, uuid, slugify, caseConvert };
  root.Bench = root.Bench || {};
  root.Bench.tools = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
