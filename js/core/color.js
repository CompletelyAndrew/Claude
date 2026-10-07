/* Bench · color.js
 * Color conversion, WCAG contrast, and palette generation for the Game Lab.
 */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function hexToRgb(hex) {
    let h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex({ r, g, b }) {
    return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToRgb({ h, s, l }) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
  }

  const hexToHsl = hex => { const rgb = hexToRgb(hex); return rgb && rgbToHsl(rgb); };
  const hslToHex = hsl => rgbToHex(hslToRgb(hsl));

  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const ch = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  }

  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function rating(ratio) {
    if (ratio >= 7) return 'AAA';
    if (ratio >= 4.5) return 'AA';
    if (ratio >= 3) return 'AA Large';
    return 'Fail';
  }

  // Harmony schemes from a base color.
  function harmony(hex, scheme = 'analogous') {
    const base = hexToHsl(hex);
    if (!base) return [];
    const offsets = {
      analogous: [-30, -15, 0, 15, 30],
      complementary: [0, 180, 0, 180, 0],
      triadic: [0, 120, 240, 0, 120],
      split: [0, 150, 210, 0, 150],
      tetradic: [0, 90, 180, 270, 0],
      mono: [0, 0, 0, 0, 0],
    }[scheme] || [0];
    const lights = scheme === 'mono' ? [20, 35, 50, 65, 80] : [base.l, base.l, base.l, clamp(base.l + 18, 0, 92), clamp(base.l - 18, 8, 100)];
    return offsets.map((o, i) => hslToHex({ h: base.h + o, s: base.s, l: lights[i] }));
  }

  // A pixel-art ramp: hue shifts warm in highlights and cool in shadows,
  // the classic technique for lively sprite shading.
  function ramp(hex, steps = 6) {
    const base = hexToHsl(hex);
    if (!base) return [];
    const out = [];
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0.5 : i / (steps - 1); // 0 = darkest
      const shift = (t - 0.5) * 40;                  // shadows toward blue, lights toward yellow
      const hue = base.h + (base.h > 60 && base.h < 240 ? -shift : shift);
      out.push(hslToHex({
        h: hue,
        s: clamp(base.s + (0.5 - Math.abs(t - 0.5)) * 20 - 5, 5, 100),
        l: clamp(12 + t * 76, 0, 100),
      }));
    }
    return out;
  }

  const api = { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, hexToHsl, hslToHex, luminance, contrast, rating, harmony, ramp };
  root.Bench = root.Bench || {};
  root.Bench.color = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
