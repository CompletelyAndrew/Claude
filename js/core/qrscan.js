/* Bench · qrscan.js
 * Photo → module grid → text, with no libraries. The same steps a phone
 * takes: grey, adaptive threshold, find the three 1:1:3:1:1 finders, guess
 * the size, find the alignment bullseye, undo the perspective, sample.
 * Every step's result is returned so a lesson can draw it over the photo.
 * Input is a plain { width, height, data: RGBA } like canvas ImageData.
 */
(function (root) {
  'use strict';
  const Q = typeof module !== 'undefined' && module.exports ? require('./qr.js') : root.Bench.qr;

  // ---- 1 · grey + adaptive threshold (Bradley: darker than its neighbourhood) ----
  function binarize(img) {
    const { width: W, height: H, data } = img;
    const grey = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) grey[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    const integral = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { row += grey[y * W + x]; integral[(y + 1) * (W + 1) + x + 1] = integral[y * (W + 1) + x + 1] + row; }
    }
    const r = Math.max(8, Math.floor(Math.min(W, H) / 16));
    const bits = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const sum = integral[y1 * (W + 1) + x1] - integral[y0 * (W + 1) + x1] - integral[y1 * (W + 1) + x0] + integral[y0 * (W + 1) + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        bits[y * W + x] = grey[y * W + x] < mean * 0.88 ? 1 : 0;
      }
    }
    return { width: W, height: H, bits, grey };
  }

  // ---- 2 · finder patterns ----------------------------------------------------------
  const ratioOk = (s, tol = 0.6) => {
    const total = s[0] + s[1] + s[2] + s[3] + s[4];
    if (total < 7) return false;
    const m = total / 7, v = m * tol;
    return Math.abs(s[0] - m) < v && Math.abs(s[1] - m) < v && Math.abs(s[2] - 3 * m) < 3 * v && Math.abs(s[3] - m) < v && Math.abs(s[4] - m) < v;
  };

  // Walk out from a dark pixel along ±(dx, dy), measuring the five runs around it.
  // Returns the centre of the middle run and the module size, or null if it isn't 1:1:3:1:1.
  function centreAlong(b, cx, cy, dx, dy, maxRun) {
    const { width: W, height: H, bits } = b;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : bits[y * W + x]);
    if (at(cx, cy) !== 1) return null;
    const walk = sign => {
      const runs = [0, 0, 0];
      let x = cx + sign * dx, y = cy + sign * dy;
      for (let r = 0; r < 3; r++) {
        const want = r === 1 ? 0 : 1;
        while (at(x, y) === want && runs[r] <= maxRun) { runs[r]++; x += sign * dx; y += sign * dy; }
        if (runs[r] > maxRun || (r > 0 && runs[r] === 0)) return null;
        if (at(x, y) < 0 && r < 2) return null;
      }
      return runs;
    };
    const back = walk(-1), fwd = walk(1);
    if (!back || !fwd) return null;
    const runs = [back[2], back[1], back[0] + 1 + fwd[0], fwd[1], fwd[2]];
    if (!ratioOk(runs)) return null;
    const shift = (fwd[0] - back[0]) / 2;
    return { x: cx + dx * shift, y: cy + dy * shift, size: runs.reduce((p, q) => p + q, 0) / 7 };
  }

  function findFinders(b) {
    const { width: W, height: H, bits } = b;
    const found = [];
    const step = Math.max(1, Math.floor(H / 400));
    for (let y = 0; y < H; y += step) {
      // run-length encode the row
      const runs = [];
      let start = 0;
      for (let x = 1; x <= W; x++) if (x === W || bits[y * W + x] !== bits[y * W + start]) { runs.push([bits[y * W + start], x - start, start]); start = x; }
      for (let i = 0; i + 4 < runs.length; i++) {
        if (runs[i][0] !== 1) continue;
        const s = [runs[i][1], runs[i + 1][1], runs[i + 2][1], runs[i + 3][1], runs[i + 4][1]];
        if (!ratioOk(s)) continue;
        const cx = Math.round(runs[i + 2][2] + runs[i + 2][1] / 2 - 0.5);
        const max = Math.ceil(s[2] * 1.5);
        const vert = centreAlong(b, cx, y, 0, 1, max);
        if (!vert) continue;
        const hor = centreAlong(b, cx, Math.round(vert.y), 1, 0, max);
        if (!hor) continue;
        const vert2 = centreAlong(b, Math.round(hor.x), Math.round(vert.y), 0, 1, max);
        if (!vert2) continue;
        if (Math.abs(hor.size - vert2.size) > Math.max(hor.size, vert2.size) * 0.5) continue;
        // A real finder is concentric squares: it also reads 1:1:3:1:1 along both diagonals
        if (!centreAlong(b, Math.round(hor.x), Math.round(vert2.y), 1, 1, max * 1.5) || !centreAlong(b, Math.round(hor.x), Math.round(vert2.y), 1, -1, max * 1.5)) continue;
        add(found, { x: hor.x, y: vert2.y, size: (hor.size + vert2.size) / 2 });
      }
    }
    return found.sort((a, c) => c.count - a.count);
  }

  function add(list, f) {
    for (const g of list) {
      if (Math.hypot(g.x - f.x, g.y - f.y) < Math.max(g.size, f.size) * 3 && Math.abs(g.size - f.size) < Math.max(g.size, f.size) * 0.6) {
        g.x = (g.x * g.count + f.x) / (g.count + 1); g.y = (g.y * g.count + f.y) / (g.count + 1); g.size = (g.size * g.count + f.size) / (g.count + 1); g.count++;
        return;
      }
    }
    list.push({ ...f, count: 1 });
  }

  // Rank triples of finders by how well they form a right-angled isosceles triangle, oriented TL/TR/BL
  function pickThree(cands) {
    const c = cands.slice(0, 24);
    const all = [];
    let span = 0;
    for (const a of c) for (const z of c) span = Math.max(span, Math.hypot(a.x - z.x, a.y - z.y));
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) for (let k = j + 1; k < c.length; k++) {
      const pts = [c[i], c[j], c[k]];
      const sizes = pts.map(p => p.size), ms = Math.max(...sizes), mn = Math.min(...sizes);
      if (mn / ms < 0.5) continue;
      const d = (a, b2) => Math.hypot(a.x - b2.x, a.y - b2.y);
      // corner = vertex opposite the longest side
      const sides = [[d(pts[1], pts[2]), 0], [d(pts[0], pts[2]), 1], [d(pts[0], pts[1]), 2]].sort((a, b2) => b2[0] - a[0]);
      const tl = pts[sides[0][1]], others = pts.filter(p => p !== tl);
      const a = d(tl, others[0]), b2 = d(tl, others[1]);
      if (Math.min(a, b2) < ms * 7) continue;
      const iso = Math.abs(a - b2) / Math.max(a, b2);
      const right = Math.abs(sides[0][0] - Math.hypot(a, b2)) / sides[0][0];
      // Real finders sit at the outside of the code, so bigger triangles win ties
      const score = iso + right * 2 + (1 - mn / ms) * 0.5 - (Math.max(a, b2) / span) * 0.6;
      if (iso > 0.35 || right > 0.2) continue;
      let [tr, bl] = others;
      const cross = (tr.x - tl.x) * (bl.y - tl.y) - (tr.y - tl.y) * (bl.x - tl.x);
      if (cross < 0) [tr, bl] = [bl, tr];
      all.push({ tl, tr, bl, score });
    }
    return all.sort((a, z) => a.score - z.score);
  }

  // ---- 3 · geometry -----------------------------------------------------------------------
  // Homography from 4 source points to 4 destination points (solve 8×8)
  function homography(src, dst) {
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    const h = solve(A, B);
    if (!h) return null;
    const [a, b2, c, d, e, f, g, k] = h;
    return (x, y) => { const w = g * x + k * y + 1; return [(a * x + b2 * y + c) / w, (d * x + e * y + f) / w]; };
  }
  function solve(A, B) {
    const n = B.length, M = A.map((r, i) => [...r, B[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }

  // Look for the small 5×5 bullseye near where the bottom-right alignment pattern should be
  // ex/ey: unit vectors along the code's own x and y axes (from the finders), so rotation doesn't matter
  function findAlignment(b, est, modules, ex = [1, 0], ey = [0, 1]) {
    const { width: W, height: H, bits } = b;
    const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= W || y >= H ? 0 : bits[y * W + x]; };
    const sizes = [].concat(modules);
    const module = sizes[0];
    const R = Math.ceil(Math.max(...sizes) * 12);
    const found = [];
    const ring = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    for (let y = Math.round(est[1] - R); y <= est[1] + R; y++) for (let x = Math.round(est[0] - R); x <= est[0] + R; x++) {
      if (!at(x, y)) continue;
      // Perspective makes modules bigger or smaller down there, so try a few sizes
      let best = 0;
      for (const m of sizes) {
        let s = 0;
        for (const [i, j] of ring) {
          const ox = (i * ex[0] + j * ey[0]) * m, oy = (i * ex[1] + j * ey[1]) * m;
          if (!at(x + ox, y + oy)) s++;
          if (at(x + ox * 2, y + oy * 2)) s++;
        }
        best = Math.max(best, s);
      }
      if (best >= 15) found.push({ x, y, s: best, dist: Math.hypot(x - est[0], y - est[1]) });
    }
    // Nearest first; merge hits on the same bullseye
    found.sort((a, z) => a.dist - z.dist);
    const picks = [];
    for (const f of found) if (!picks.some(p => Math.hypot(p.x - f.x, p.y - f.y) < module * 2)) picks.push(f);
    return picks.slice(0, 6).map(best => refine(best));
    function refine(best) {
    // refine to the middle of the dark centre run
    const span = ([dx, dy]) => { let a = 0, c = 0; while (at(best.x - dx * (a + 1), best.y - dy * (a + 1)) && a < module * 2) a++; while (at(best.x + dx * (c + 1), best.y + dy * (c + 1)) && c < module * 2) c++; return (c - a) / 2; };
    const sx = span(ex), sy = span(ey);
    return { x: best.x + ex[0] * sx + ey[0] * sy, y: best.y + ex[1] * sx + ey[1] * sy, score: best.s };
    }
  }

  function sampleGrid(b, map, size) {
    const { width: W, height: H, bits } = b;
    const out = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let dark = 0, n = 0;
      for (const [ox, oy] of [[0.5, 0.5], [0.35, 0.35], [0.65, 0.35], [0.35, 0.65], [0.65, 0.65]]) {
        const [px, py] = map(x + ox, y + oy), ix = Math.round(px), iy = Math.round(py);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        dark += bits[iy * W + ix]; n++;
      }
      out[y * size + x] = n && dark * 2 > n ? 1 : 0;
    }
    return out;
  }

  // ---- 4 · put it together ------------------------------------------------------------------
  // Module size measured along the line from one finder towards another: the finder's
  // outer edge is 3.5 modules from its centre, whatever the rotation.
  function moduleAlong(b, p, q) {
    const { width: W, height: H, bits } = b;
    const len = Math.hypot(q.x - p.x, q.y - p.y), ux = (q.x - p.x) / len, uy = (q.y - p.y) / len;
    let state = 0; // 0 centre dark, 1 light ring, 2 dark ring
    for (let t = 0; t < len / 2; t += 0.5) {
      const x = Math.round(p.x + ux * t), y = Math.round(p.y + uy * t);
      if (x < 0 || y < 0 || x >= W || y >= H) return null;
      const v = bits[y * W + x];
      if (state === 0 && !v) state = 1;
      else if (state === 1 && v) state = 2;
      else if (state === 2 && !v) return t / 3.5;
    }
    return null;
  }

  function locate(b, tri) {
    const { tl, tr, bl } = tri;
    const avg = (...xs) => { const v = xs.filter(Boolean); return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null; };
    const fallback = (tl.size + tr.size + bl.size) / 3;
    const m1 = avg(moduleAlong(b, tl, tr), moduleAlong(b, tr, tl)) || fallback;
    const m2 = avg(moduleAlong(b, tl, bl), moduleAlong(b, bl, tl)) || fallback;
    let dim = Math.round((Math.hypot(tr.x - tl.x, tr.y - tl.y) / m1 + Math.hypot(bl.x - tl.x, bl.y - tl.y) / m2) / 2) + 7;
    switch (dim & 3) { case 0: dim++; break; case 2: dim--; break; case 3: dim -= 2; break; default: }
    return { dim, module: (m1 + m2) / 2 };
  }

  function tryDimension(b, tri, dim) {
    const { tl, tr, bl } = tri;
    const br = { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y };
    const v = Q.versionOf(dim);
    const module = ((Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(bl.x - tl.x, bl.y - tl.y)) / 2) / (dim - 7);
    let aligns = [];
    if (v >= 2) {
      const k = 1 - 3 / (dim - 7);
      const est = [tl.x + k * (br.x - tl.x), tl.y + k * (br.y - tl.y)];
      const unit = (p, q) => { const l = Math.hypot(q.x - p.x, q.y - p.y); return [(q.x - p.x) / l, (q.y - p.y) / l]; };
      // Module size near the bottom-right corner, extrapolated from how the finders shrink or grow
      const far = module * (tr.size * bl.size) / (tl.size * tl.size);
      aligns = findAlignment(b, est, [module, far, (module + far) / 2, far * 1.15], unit(tl, tr), unit(tl, bl));
    }
    let first = null;
    // Each alignment candidate, then the parallelogram guess for the fourth corner,
    // then nudges of that guess (a tilted version 1 has no bullseye to go on)
    const ex = [(tr.x - tl.x) / (dim - 7), (tr.y - tl.y) / (dim - 7)], ey = [(bl.x - tl.x) / (dim - 7), (bl.y - tl.y) / (dim - 7)];
    const nudges = [[0, 0]];
    for (const d of [1, 2, 3]) for (const [i, j] of [[1, 1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1], [1, -1], [-1, 1]]) nudges.push([i * d, j * d]);
    const tries = [...aligns.map(a => ({ align: a })), ...nudges.slice(0, aligns.length ? 1 : nudges.length).map(n => ({ nudge: n }))];
    for (const { align, nudge } of tries) {
      const corner = nudge && { x: br.x + nudge[0] * ex[0] + nudge[1] * ey[0], y: br.y + nudge[0] * ex[1] + nudge[1] * ey[1] };
      const map = align
        ? homography([[3.5, 3.5], [dim - 3.5, 3.5], [3.5, dim - 3.5], [dim - 6.5, dim - 6.5]], [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y], [align.x, align.y]])
        : homography([[3.5, 3.5], [dim - 3.5, 3.5], [3.5, dim - 3.5], [dim - 3.5, dim - 3.5]], [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y], [corner.x, corner.y]]);
      if (!map) continue;
      const modules = sampleGrid(b, map, dim);
      let result = Q.decodeMatrix(modules, dim), mirrored = false;
      if (!result.ok) {
        // A code seen from behind (or a mirrored print) is the transpose
        const t = new Uint8Array(dim * dim);
        for (let y = 0; y < dim; y++) for (let x = 0; x < dim; x++) t[x * dim + y] = modules[y * dim + x];
        const r2 = Q.decodeMatrix(t, dim);
        if (r2.ok) { result = r2; mirrored = true; }
      }
      const out = { result, modules, dim, align: align || null, mirrored, corners: [[0, 0], [dim, 0], [dim, dim], [0, dim]].map(([x, y]) => map(x, y)) };
      if (result.ok) return out;
      if (!first) first = out;
    }
    return first;
  }

  function scan(img, { tryInverted = true } = {}) {
    const steps = { width: img.width, height: img.height };
    for (const inverted of tryInverted ? [false, true] : [false]) {
      const b = binarize(img);
      if (inverted) for (let i = 0; i < b.bits.length; i++) b.bits[i] ^= 1;
      const finders = findFinders(b);
      steps.finders = finders.slice(0, 6).map(f => ({ x: f.x, y: f.y, size: f.size }));
      if (finders.length < 3) { steps.stage = 'finders'; continue; }
      const tris = pickThree(finders).slice(0, 6);
      if (!tris.length) { steps.stage = 'triangle'; continue; }
      let last = null, lastTri = null;
      for (const tri of tris) {
        const { dim } = locate(b, tri);
        for (const d of [dim, dim + 4, dim - 4, dim + 8, dim - 8]) {
          if (d < 21 || d > 177) continue;
          const t = tryDimension(b, tri, d);
          if (!t) continue;
          if (!last) { last = t; lastTri = tri; }
          if (t.result.ok) {
            return { ok: true, ...t.result, inverted, mirrored: t.mirrored, finders: [tri.tl, tri.tr, tri.bl].map(f => ({ x: f.x, y: f.y, size: f.size })), alignment: t.align, corners: t.corners, grid: t.modules, dim: d, binary: b };
          }
        }
      }
      if (last && !inverted) { steps.failed = { ok: false, stage: last.result.stage || 'decode', error: last.result.error, finders: [lastTri.tl, lastTri.tr, lastTri.bl], corners: last.corners, grid: last.modules, dim: last.dim, inverted, binary: b }; continue; }
      steps.stage = 'grid';
    }
    if (steps.failed) return steps.failed;
    const msg = { finders: 'No QR code found: couldn’t see three finder squares.', triangle: 'Found square shapes, but not three in a QR layout.', grid: 'Found the finders but couldn’t lay a grid over them.' };
    return { ok: false, stage: steps.stage, error: msg[steps.stage] || 'No QR code found.', finders: steps.finders || [] };
  }

  const api = { scan, binarize, findFinders, pickThree, homography, sampleGrid, locate, findAlignment, tryDimension };
  root.Bench = root.Bench || {};
  root.Bench.qrscan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
