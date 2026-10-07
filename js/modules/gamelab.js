/* Bench · Game Lab
 * Tools for game makers: an animated pixel sprite editor, palette and
 * shading ramps, an easing explorer that writes Godot/Unity/CSS code,
 * and a dice roller for design math.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, toast } = Bench;
  const C = Bench.color, E = Bench.easing;

  let tab = 'sprite';

  // ============================================================ Sprite editor
  const PICO8 = ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'];

  function defaultSprite() {
    // A little tank, because of course.
    const W = 16, H = 16;
    const px = Array(W * H).fill(null);
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; };
    for (let x = 3; x <= 12; x++) for (let y = 6; y <= 10; y++) put(x, y, '#008751');
    for (let x = 2; x <= 13; x++) { put(x, 11, '#5f574f'); put(x, 12, '#1d2b53'); }
    for (let x = 3; x <= 12; x += 3) put(x, 12, '#c2c3c7');
    for (let x = 6; x <= 9; x++) for (let y = 3; y <= 6; y++) put(x, y, '#00e436');
    for (let x = 10; x <= 14; x++) put(x, 4, '#5f574f');
    put(4, 7, '#00e436'); put(7, 4, '#ffec27');
    const f2 = px.slice();
    for (let x = 10; x <= 14; x++) f2[4 * W + x] = null;
    for (let x = 10; x <= 13; x++) f2[4 * W + x] = '#5f574f';
    f2[4 * W + 14] = '#ffa300'; f2[3 * W + 14] = '#ffec27'; f2[5 * W + 14] = '#ffec27';
    return { w: W, h: H, frames: [px, f2], palette: PICO8, fps: 4 };
  }

  function spriteTab() {
    let sp = store.get('sprite') || defaultSprite();
    let frame = 0, tool = 'pen', colorSel = sp.palette[11], mirror = false, onion = true, grid = true;
    const undo = [], redo = [];
    const persist = Bench.debounce(() => store.set('sprite', sp), 250);

    const canvas = h('canvas', { width: 512, height: 512, style: { width: '100%', maxWidth: '512px', aspectRatio: '1', imageRendering: 'pixelated', touchAction: 'none', cursor: 'crosshair', borderRadius: 'var(--r-sm)', display: 'block' }, 'aria-label': 'Sprite canvas' });
    const g = canvas.getContext('2d');
    const previewCanvas = h('canvas', { width: sp.w, height: sp.h, style: { width: '128px', height: '128px', imageRendering: 'pixelated', background: 'var(--sunken)', borderRadius: 'var(--r-sm)' } });
    const pg = previewCanvas.getContext('2d');

    function checker(ctx, w, h2, size) {
      for (let y = 0; y < h2; y += size) for (let x = 0; x < w; x += size) {
        ctx.fillStyle = ((x + y) / size) % 2 ? '#d9dad5' : '#ecede8';
        ctx.fillRect(x, y, size, size);
      }
    }
    function draw() {
      const cell = canvas.width / sp.w;
      checker(g, canvas.width, canvas.height, cell / 2);
      if (onion && sp.frames.length > 1) {
        const prev = sp.frames[(frame - 1 + sp.frames.length) % sp.frames.length];
        g.globalAlpha = 0.22;
        prev.forEach((c, i) => { if (c) { g.fillStyle = c; g.fillRect((i % sp.w) * cell, Math.floor(i / sp.w) * cell, cell, cell); } });
        g.globalAlpha = 1;
      }
      sp.frames[frame].forEach((c, i) => { if (c) { g.fillStyle = c; g.fillRect((i % sp.w) * cell, Math.floor(i / sp.w) * cell, cell, cell); } });
      if (grid) {
        g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
        for (let i = 1; i < sp.w; i++) { g.beginPath(); g.moveTo(i * cell + .5, 0); g.lineTo(i * cell + .5, canvas.height); g.stroke(); }
        for (let i = 1; i < sp.h; i++) { g.beginPath(); g.moveTo(0, i * cell + .5); g.lineTo(canvas.width, i * cell + .5); g.stroke(); }
        if (mirror) { g.strokeStyle = 'rgba(36,73,199,.6)'; g.beginPath(); g.moveTo(canvas.width / 2, 0); g.lineTo(canvas.width / 2, canvas.height); g.stroke(); }
      }
    }

    function snapshot() { undo.push(JSON.stringify(sp.frames)); if (undo.length > 80) undo.shift(); redo.length = 0; }
    function setPx(x, y, c) {
      const f = sp.frames[frame];
      f[y * sp.w + x] = c;
      if (mirror) f[y * sp.w + (sp.w - 1 - x)] = c;
    }
    function fill(x, y, c) {
      const f = sp.frames[frame], target = f[y * sp.w + x];
      if (target === c) return;
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cy < 0 || cx >= sp.w || cy >= sp.h || f[cy * sp.w + cx] !== target) continue;
        f[cy * sp.w + cx] = c;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
    }
    function cellAt(e) {
      const r = canvas.getBoundingClientRect();
      return [Math.floor(((e.clientX - r.left) / r.width) * sp.w), Math.floor(((e.clientY - r.top) / r.height) * sp.h)];
    }
    let painting = false, last = null;
    function apply(e) {
      const [x, y] = cellAt(e);
      if (x < 0 || y < 0 || x >= sp.w || y >= sp.h) return;
      if (tool === 'pick') { const c = sp.frames[frame][y * sp.w + x]; if (c) { colorSel = c; tool = 'pen'; paintSide(); } return; }
      if (tool === 'fill') { fill(x, y, colorSel); return; }
      const c = tool === 'erase' ? null : colorSel;
      // Bresenham between samples so fast strokes stay continuous
      if (last) {
        let [x0, y0] = last; const dx = Math.abs(x - x0), dy = -Math.abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1;
        let err = dx + dy;
        for (;;) { setPx(x0, y0, c); if (x0 === x && y0 === y) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
      } else setPx(x, y, c);
      last = [x, y];
    }
    canvas.addEventListener('pointerdown', e => { snapshot(); painting = true; last = null; canvas.setPointerCapture(e.pointerId); apply(e); draw(); persist(); });
    canvas.addEventListener('pointermove', e => { if (painting) { apply(e); draw(); } });
    canvas.addEventListener('pointerup', () => { painting = false; last = null; persist(); paintFrames(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(sp.frames)); sp.frames = JSON.parse(undo.pop()); frame = Math.min(frame, sp.frames.length - 1); draw(); paintFrames(); persist(); }
    function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(sp.frames)); sp.frames = JSON.parse(redo.pop()); draw(); paintFrames(); persist(); }

    // Animation preview
    let animFrame = 0;
    const anim = setInterval(() => {
      animFrame = (animFrame + 1) % sp.frames.length;
      pg.clearRect(0, 0, sp.w, sp.h);
      sp.frames[animFrame].forEach((c, i) => { if (c) { pg.fillStyle = c; pg.fillRect(i % sp.w, Math.floor(i / sp.w), 1, 1); } });
    }, 1000 / Math.max(1, sp.fps));

    // Export
    function toCanvas(scale, frames = [sp.frames[frame]]) {
      const out = document.createElement('canvas');
      out.width = sp.w * scale * frames.length; out.height = sp.h * scale;
      const o = out.getContext('2d');
      frames.forEach((f, fi) => f.forEach((c, i) => { if (c) { o.fillStyle = c; o.fillRect(fi * sp.w * scale + (i % sp.w) * scale, Math.floor(i / sp.w) * scale, scale, scale); } }));
      return out;
    }
    const exportPNG = (sheet) => toCanvas(scaleSel.value | 0, sheet ? sp.frames : undefined).toBlob(b => { Bench.download(sheet ? `sprite-sheet-${sp.frames.length}f.png` : `sprite-f${frame + 1}.png`, b); toast(sheet ? 'Sprite sheet exported' : 'Frame exported'); });

    // Side panel
    const side = h('div.stack', { style: { gap: '14px' } });
    const framesHost = h('div.row');
    const scaleSel = h('select.input', { id: 'sprite-scale', style: { width: 'auto' } }, [1, 2, 4, 8, 16].map(s => h('option', { value: s, selected: s === 8 }, `${s}×`)));
    function thumb(f, i) {
      const c = h('canvas', { width: sp.w, height: sp.h, style: { width: '44px', height: '44px', imageRendering: 'pixelated', background: 'var(--sunken)', borderRadius: '6px', outline: i === frame ? '2px solid var(--ink)' : '1px solid var(--line)', cursor: 'pointer' }, title: `Frame ${i + 1}` });
      const t = c.getContext('2d');
      f.forEach((col, j) => { if (col) { t.fillStyle = col; t.fillRect(j % sp.w, Math.floor(j / sp.w), 1, 1); } });
      c.addEventListener('click', () => { frame = i; draw(); paintFrames(); });
      return c;
    }
    function paintFrames() {
      framesHost.replaceChildren(...sp.frames.map(thumb),
        sp.frames.length < 8 ? h('button.btn.sm', { type: 'button', title: 'Duplicate this frame', onclick: () => { snapshot(); sp.frames.splice(frame + 1, 0, sp.frames[frame].slice()); frame++; draw(); paintFrames(); persist(); } }, icon('plus')) : null,
        sp.frames.length > 1 ? h('button.btn.sm.ghost.danger', { type: 'button', title: 'Delete this frame', onclick: () => { snapshot(); sp.frames.splice(frame, 1); frame = Math.max(0, frame - 1); draw(); paintFrames(); persist(); } }, icon('trash')) : null);
    }
    function paintSide() {
      const tools = [['pen', 'Pen', 'B'], ['erase', 'Eraser', 'E'], ['fill', 'Fill', 'G'], ['pick', 'Pick', 'I']];
      side.replaceChildren(
        h('div.field', null, h('span', null, 'Tool'), h('div.seg', { role: 'group' }, tools.map(([id, label, k]) => h('button', { type: 'button', 'aria-pressed': String(tool === id), title: `${label} (${k})`, onclick: () => { tool = id; paintSide(); } }, label)))),
        h('div.field', null, h('span', null, 'Colour'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px' } }, sp.palette.map(c => h('button', {
            type: 'button', 'aria-label': c, title: c, onclick: () => { colorSel = c; if (tool === 'erase' || tool === 'pick') tool = 'pen'; paintSide(); },
            style: { aspectRatio: '1', background: c, border: c === colorSel ? '2px solid var(--ink)' : '1px solid var(--line)', borderRadius: '5px', cursor: 'pointer', boxShadow: c === colorSel ? '0 0 0 2px var(--surface) inset' : 'none' },
          }))),
          h('div.row', { style: { marginTop: '6px' } }, h('input.swatch-input', { id: 'sprite-color', type: 'color', value: colorSel, 'aria-label': 'Custom colour', oninput: e => { colorSel = e.target.value; } }),
            h('button.btn.sm', { type: 'button', onclick: () => { if (!sp.palette.includes(colorSel)) { sp.palette = [...sp.palette.slice(-31), colorSel]; persist(); paintSide(); } } }, 'Add to palette'),
            h('button.btn.sm.ghost', { type: 'button', onclick: () => { sp.palette = PICO8.slice(); persist(); paintSide(); } }, 'PICO-8'))),
        h('div.row', null,
          toggle('Mirror', mirror, v => { mirror = v; draw(); }), toggle('Onion skin', onion, v => { onion = v; draw(); }), toggle('Grid', grid, v => { grid = v; draw(); })),
        h('div.field', null, h('span', null, `Frames · ${sp.fps} fps`), framesHost,
          h('input', { id: 'sprite-fps', type: 'range', min: 1, max: 24, value: sp.fps, 'aria-label': 'Frames per second', oninput: e => { sp.fps = +e.target.value; persist(); paintSide(); } })),
        h('div.row', { style: { alignItems: 'flex-end' } }, previewCanvas, h('div.stack', { style: { gap: '6px' } },
          h('div.row', null, h('label.visually-hidden', { for: 'sprite-scale' }, 'Export scale'), scaleSel, h('button.btn.sm', { type: 'button', onclick: () => exportPNG(false) }, icon('download'), 'PNG')),
          h('button.btn.sm', { type: 'button', onclick: () => exportPNG(true) }, icon('download'), 'Sprite sheet'),
          h('button.btn.sm.ghost', { type: 'button', onclick: () => Bench.copy(toCanvas(scaleSel.value | 0).toDataURL(), 'PNG data URL copied') }, icon('copy'), 'Data URL'))));
      paintFrames();
    }
    function toggle(label, val, fn) {
      const id = 'sp-' + label.toLowerCase().replace(/\s/g, '-');
      return h('label', { for: id, style: { display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: 'var(--t-sm)', cursor: 'pointer' } },
        h('input', { id, type: 'checkbox', checked: val, onchange: e => fn(e.target.checked) }), label);
    }
    paintSide();
    draw();

    const sizeSeg = h('div.seg', { role: 'group', 'aria-label': 'Canvas size' }, [16, 24, 32].map(n => h('button', { type: 'button', 'aria-pressed': String(sp.w === n), onclick: () => {
      if (n === sp.w) return;
      snapshot();
      sp = { ...sp, w: n, h: n, frames: sp.frames.map(f => { const out = Array(n * n).fill(null); for (let y = 0; y < Math.min(n, sp.h); y++) for (let x = 0; x < Math.min(n, sp.w); x++) out[y * n + x] = f[y * sp.w + x]; return out; }) };
      previewCanvas.width = n; previewCanvas.height = n; persist(); Bench.navigate('gamelab');
    } }, `${n}px`)));

    const keys = e => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return true; }
      const map = { b: 'pen', e: 'erase', g: 'fill', i: 'pick' };
      if (map[k] && !e.metaKey && !e.ctrlKey) { tool = map[k]; paintSide(); return true; }
      if (k === 'arrowright' || k === '.') { frame = (frame + 1) % sp.frames.length; draw(); paintFrames(); return true; }
      if (k === 'arrowleft' || k === ',') { frame = (frame - 1 + sp.frames.length) % sp.frames.length; draw(); paintFrames(); return true; }
      return false;
    };
    const keyListener = e => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      // Handled keys stop here so "g" means Fill, not the global "go to" prefix
      if (keys(e)) e.stopPropagation();
    };
    document.addEventListener('keydown', keyListener, true);

    const el = h('div.grid', { style: { gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }, class: 'lab-grid' },
      h('section.sheet', null,
        h('div.sheet-head', null, sizeSeg, h('div.actions', null,
          h('button.btn.ghost.sm', { type: 'button', onclick: doUndo, title: 'Undo (Ctrl+Z)' }, icon('reset'), 'Undo'),
          h('button.btn.ghost.sm', { type: 'button', onclick: doRedo, title: 'Redo (Ctrl+Shift+Z)' }, 'Redo'),
          h('button.btn.ghost.sm.danger', { type: 'button', onclick: () => { snapshot(); sp.frames[frame] = Array(sp.w * sp.h).fill(null); draw(); paintFrames(); persist(); toast('Frame cleared', { label: 'Undo', run: doUndo }); } }, 'Clear'))),
        h('div.sheet-body', null, canvas,
          h('p.faint', { style: { fontSize: 'var(--t-xs)', marginTop: '10px' } }, 'B pen · E eraser · G fill · I pick · ← → frames · Ctrl+Z undo'))),
      h('section.sheet', null, h('div.sheet-body', null, side)));
    el._cleanup = () => { clearInterval(anim); document.removeEventListener('keydown', keyListener, true); };
    return el;
  }

  // ============================================================ Palette
  function paletteTab() {
    const st = store.get('labPalette', { base: '#2f7d4f', scheme: 'analogous', fg: '#17191c', bg: '#f5cf3d' });
    const save = () => store.set('labPalette', st);
    const host = h('div.stack', { style: { gap: '18px' } });

    function swatchRow(colors, big) {
      return h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${colors.length}, minmax(0, 1fr))`, borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--line)' } },
        colors.map(c => h('button', {
          type: 'button', title: `Copy ${c}`, onclick: () => Bench.copy(c, `${c} copied`),
          style: { background: c, height: big ? '110px' : '64px', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'flex-end', padding: '8px', color: C.luminance(c) > 0.35 ? '#17191c' : '#ffffff', font: '600 11px var(--f-mono)' },
        }, c)));
    }

    function paint() {
      const harmony = C.harmony(st.base, st.scheme);
      const ramp = C.ramp(st.base, 7);
      const ratio = C.contrast(st.fg, st.bg);
      const rate = C.rating(ratio);
      const hsl = C.hexToHsl(st.base), rgb = C.hexToRgb(st.base);
      const toGodot = cs => `const PALETTE := [\n${cs.map(c => `\tColor("${c}"),`).join('\n')}\n]`;
      const toUnity = cs => cs.map((c, i) => { const r = C.hexToRgb(c); return `public static readonly Color C${i} = new Color(${(r.r / 255).toFixed(3)}f, ${(r.g / 255).toFixed(3)}f, ${(r.b / 255).toFixed(3)}f);`; }).join('\n');
      const toGPL = cs => `GIMP Palette\nName: Bench\n#\n${cs.map(c => { const r = C.hexToRgb(c); return `${String(r.r).padStart(3)} ${String(r.g).padStart(3)} ${String(r.b).padStart(3)}\t${c}`; }).join('\n')}`;

      host.replaceChildren(
        h('section.sheet', null,
          h('div.sheet-head', null,
            h('input.swatch-input', { id: 'pal-base', type: 'color', value: st.base, 'aria-label': 'Base colour', oninput: e => { st.base = e.target.value; save(); paint(); } }),
            h('div', null, h('div', { style: { fontWeight: 650 } }, st.base.toUpperCase()), h('div.faint.mono', { style: { fontSize: 'var(--t-xs)' } }, `rgb(${rgb.r} ${rgb.g} ${rgb.b}) · hsl(${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%)`)),
            h('div.actions', null, h('button.btn.sm', { type: 'button', onclick: () => { st.base = C.hslToHex({ h: Math.random() * 360, s: 45 + Math.random() * 40, l: 35 + Math.random() * 25 }); save(); paint(); } }, icon('dice'), 'Surprise me'))),
          h('div.sheet-body.stack', null,
            h('div.seg', { role: 'group', 'aria-label': 'Harmony' }, ['analogous', 'complementary', 'split', 'triadic', 'tetradic', 'mono'].map(s =>
              h('button', { type: 'button', 'aria-pressed': String(st.scheme === s), onclick: () => { st.scheme = s; save(); paint(); } }, s[0].toUpperCase() + s.slice(1)))),
            swatchRow(harmony, true))),
        h('div.grid.cols-2', null,
          h('section.sheet', null,
            h('div.sheet-head', null, h('h2', null, 'Shading ramp'), h('div.actions', null, h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Hue-shifted for pixel art'))),
            h('div.sheet-body.stack', null, swatchRow(ramp),
              h('div.row', null,
                h('button.btn.sm', { type: 'button', onclick: () => Bench.copy(toGodot(ramp), 'GDScript copied') }, icon('copy'), 'GDScript'),
                h('button.btn.sm', { type: 'button', onclick: () => Bench.copy(toUnity(ramp), 'C# copied') }, icon('copy'), 'Unity C#'),
                h('button.btn.sm', { type: 'button', onclick: () => Bench.download('bench-ramp.gpl', toGPL(ramp)) }, icon('download'), '.gpl'),
                h('button.btn.sm', { type: 'button', onclick: () => { const sp = store.get('sprite') || defaultSprite(); sp.palette = [...new Set([...ramp, ...harmony])]; store.set('sprite', sp); toast('Sprite palette replaced', { label: 'Open', run: () => { tab = 'sprite'; Bench.navigate('gamelab'); } }); } }, icon('grid'), 'Use in sprite')))),
          h('section.sheet', null,
            h('div.sheet-head', null, h('h2', null, 'Contrast check'), h('div.actions', null, h('span', { class: 'chip ' + (rate === 'Fail' ? 'bad' : rate === 'AA Large' ? 'warn' : 'good') }, `${ratio.toFixed(2)} : 1 · ${rate}`))),
            h('div.sheet-body.stack', null,
              h('div', { style: { background: st.bg, color: st.fg, borderRadius: 'var(--r-md)', padding: '18px', border: '1px solid var(--line)' } },
                h('div', { style: { font: '700 var(--t-xl) var(--f-display)' } }, 'Press Start'), h('div', { style: { fontSize: 'var(--t-sm)' } }, 'HUD text has to read over busy art.')),
              h('div.row', null,
                h('label.row', { for: 'pal-fg' }, h('input.swatch-input', { id: 'pal-fg', type: 'color', value: st.fg, oninput: e => { st.fg = e.target.value; save(); paint(); } }), 'Text'),
                h('label.row', { for: 'pal-bg' }, h('input.swatch-input', { id: 'pal-bg', type: 'color', value: st.bg, oninput: e => { st.bg = e.target.value; save(); paint(); } }), 'Background'),
                h('button.btn.sm.ghost', { type: 'button', onclick: () => { [st.fg, st.bg] = [st.bg, st.fg]; save(); paint(); } }, 'Swap'))))));
    }
    paint();
    return host;
  }

  // ============================================================ Easing
  function easingTab() {
    let name = store.get('labEase', 'outBack');
    let duration = 600;
    const host = h('div.grid.cols-2');
    const W = 300, H = 300, pad = 40;

    function curveSvg(fn) {
      const pts = [];
      for (let i = 0; i <= 120; i++) { const x = i / 120; pts.push([pad + x * (W - 2 * pad), H - pad - fn(x) * (H - 2 * pad)]); }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('class', 'chart');
      svg.style.maxWidth = '360px';
      svg.innerHTML =
        `<rect x="${pad}" y="${pad}" width="${W - 2 * pad}" height="${H - 2 * pad}" fill="none" stroke="var(--line)"/>` +
        `<line class="gridline" x1="${pad}" x2="${W - pad}" y1="${H / 2}" y2="${H / 2}" stroke-dasharray="3 4"/>` +
        `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${pad}" stroke="var(--line-2)" stroke-dasharray="3 4"/>` +
        `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<circle class="dot" r="6" fill="var(--mark)" stroke="var(--ink)" stroke-width="2" cx="${pad}" cy="${H - pad}"/>` +
        `<text x="${pad}" y="${H - pad + 18}">0</text><text x="${W - pad}" y="${H - pad + 18}" text-anchor="end">time 1</text>` +
        `<text x="${pad - 8}" y="${pad + 4}" text-anchor="end">1</text>`;
      return svg;
    }

    let raf = 0;
    function paint() {
      cancelAnimationFrame(raf);
      const fn = E.fns[name];
      const svg = curveSvg(fn);
      const dot = svg.querySelector('.dot');
      const track = h('div', { style: { position: 'relative', height: '56px', background: 'var(--sunken)', borderRadius: 'var(--r-md)' } });
      const block = h('div', { style: { position: 'absolute', top: '10px', left: '10px', width: '36px', height: '36px', background: 'var(--mark)', border: '2px solid var(--ink)', borderRadius: '8px' } });
      const scaleBox = h('div', { style: { width: '56px', height: '56px', background: 'var(--ink)', borderRadius: '12px', margin: '0 auto' } });
      track.appendChild(block);
      const snip = E.snippets(name);
      const t0 = performance.now();
      const loop = now => {
        const cycle = duration + 500;
        const p = ((now - t0) % cycle) / duration;
        const x = Math.min(1, p);
        const v = fn(x);
        block.style.left = `calc(10px + ${v} * (100% - 56px))`;
        scaleBox.style.transform = `scale(${0.3 + 0.7 * v}) rotate(${v * 90}deg)`;
        dot.setAttribute('cx', pad + x * (W - 2 * pad));
        dot.setAttribute('cy', H - pad - v * (H - 2 * pad));
        raf = requestAnimationFrame(loop);
      };
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(loop);

      const code = (label, text) => h('div.field', null, h('span', null, label),
        h('div', { style: { position: 'relative' } }, h('pre', { class: 'mono', style: { margin: 0, background: 'var(--sunken)', padding: '10px 12px', borderRadius: 'var(--r-sm)', overflowX: 'auto', fontSize: 'var(--t-xs)' } }, text),
          h('button.btn.sm.ghost', { type: 'button', style: { position: 'absolute', top: '4px', right: '4px' }, 'aria-label': `Copy ${label}`, onclick: () => Bench.copy(text, `${label} copied`) }, icon('copy'))));

      const groups = {};
      E.names.forEach(n => { const k = n === 'linear' ? 'Linear' : n.replace(/^(inOut|in|out)/, ''); (groups[k] = groups[k] || []).push(n); });

      host.replaceChildren(
        h('section.sheet', null,
          h('div.sheet-head', null, h('h2', { class: 'mono' }, name), h('div.actions', null, h('label.row', { for: 'ease-dur', style: { fontSize: 'var(--t-sm)' } }, h('span.faint', null, `${duration}ms`),
            h('input', { id: 'ease-dur', type: 'range', min: 150, max: 2000, step: 50, value: duration, style: { width: '120px' }, oninput: e => { duration = +e.target.value; paint(); } })))),
          h('div.sheet-body.stack', null, svg, track, h('div', { style: { padding: '18px 0' } }, scaleBox))),
        h('div.stack', { style: { gap: '18px' } },
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Curves')),
            h('div.sheet-body.stack', { style: { gap: '8px' } }, Object.entries(groups).map(([g, ns]) => h('div.row', null,
              h('span.eyebrow', { style: { width: '64px' } }, g),
              ns.map(n => h('button', { type: 'button', class: 'chip ' + (n === name ? 'mark' : ''), style: { border: 0, cursor: 'pointer' }, 'aria-pressed': String(n === name), onclick: () => { name = n; store.set('labEase', n); paint(); } },
                n === 'linear' ? 'linear' : n.match(/^(inOut|in|out)/)[1])))))),
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Paste into your engine')),
            h('div.sheet-body.stack', null, code('Godot 4', snip.godot), code('Unity + DOTween', snip.unity), code('CSS', snip.css)))));
    }
    paint();
    host._cleanup = () => cancelAnimationFrame(raf);
    return host;
  }

  // ============================================================ Dice
  function diceTab() {
    const history = store.get('labDice', []);
    const input = h('input.input.mono', { id: 'dice-expr', type: 'text', value: '4d6kh3', placeholder: '3d6+2', autocomplete: 'off' });
    const result = h('div');
    const hist = h('ul.list');
    const dist = h('div');

    function doRoll(expr) {
      try {
        const r = Bench.tools.roll(expr);
        result.replaceChildren(
          h('div', { style: { font: '750 4rem/1 var(--f-display)', letterSpacing: '-0.04em' }, class: 'num' }, String(r.total)),
          h('div.meta', { style: { marginTop: '10px' } }, r.parts.map(p => p.rolls
            ? h('span.chip', null, `${p.term}: `, p.rolls.map((v, i) => h('span', { style: { opacity: p.kept.length === p.rolls.length || p.kept.includes(v) ? 1 : 0.4 } }, v + (i < p.rolls.length - 1 ? ' ' : ''))))
            : h('span.chip', null, p.term))));
        history.unshift({ expr, total: r.total, at: Date.now() });
        history.length = Math.min(history.length, 12);
        store.set('labDice', history);
        paintHist();
        paintDist(expr);
      } catch (e) { result.replaceChildren(h('p.muted', null, e.message)); }
    }
    function paintHist() {
      hist.replaceChildren(...history.map(x => h('li', null, h('span.mono', null, x.expr), h('span.spacer'), h('b.num', null, x.total), h('span.faint', { style: { fontSize: 'var(--t-xs)', width: '6em', textAlign: 'right' } }, Bench.tools.relative(new Date(x.at))))));
      if (!history.length) hist.replaceChildren(h('li', null, h('span.faint', null, 'Rolls show up here.')));
    }
    // Monte Carlo distribution: 20k rolls, drawn as bars
    function paintDist(expr) {
      const counts = {}; let n = 20000, min = Infinity, max = -Infinity;
      try { for (let i = 0; i < n; i++) { const v = Bench.tools.roll(expr).total; counts[v] = (counts[v] || 0) + 1; min = Math.min(min, v); max = Math.max(max, v); } }
      catch (e) { dist.replaceChildren(); return; }
      if (max - min > 120) { dist.replaceChildren(h('p.faint', null, 'Range too wide to chart.')); return; }
      const peak = Math.max(...Object.values(counts));
      const mean = Object.entries(counts).reduce((a, [v, c]) => a + v * c, 0) / n;
      const W = 520, H = 140, bw = W / (max - min + 1);
      let s = '';
      for (let v = min; v <= max; v++) {
        const c = counts[v] || 0, bh = (c / peak) * (H - 22);
        s += `<rect x="${(v - min) * bw + 1}" y="${H - 18 - bh}" width="${Math.max(1, bw - 2)}" height="${bh}" fill="var(--ink)" opacity=".85"><title>${v}: ${(c / n * 100).toFixed(1)}%</title></rect>`;
        if ((max - min) < 30 || v % 5 === 0) s += `<text x="${(v - min) * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${v}</text>`;
      }
      const mx = (mean - min + 0.5) * bw;
      s += `<line x1="${mx}" x2="${mx}" y1="0" y2="${H - 18}" stroke="var(--mark)" stroke-width="3"/>`;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart'); svg.innerHTML = s;
      dist.replaceChildren(h('div.row', { style: { marginBottom: '8px' } }, h('span.chip', null, `mean ${mean.toFixed(2)}`), h('span.chip', null, `range ${min}–${max}`), h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, '20,000 simulated rolls')), svg);
    }
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doRoll(input.value); });
    paintHist();
    doRoll(input.value);
    history.shift(); store.set('labDice', history); paintHist(); // first roll is a demo, don't log it

    const presets = ['d20', '2d20kh1', '2d20kl1', '3d6', '4d6kh3', '2d6+3', 'd100', '8d6'];
    return h('div.grid.cols-main', null,
      h('section.sheet', null,
        h('div.sheet-head', null, h('div', { style: { flex: '1 1 160px' } }, h('label.visually-hidden', { for: 'dice-expr' }, 'Dice expression'), input),
          h('div.actions', null, h('button.btn.primary', { type: 'button', onclick: () => doRoll(input.value) }, icon('dice'), 'Roll'))),
        h('div.sheet-body.stack', null,
          h('div.row', null, presets.map(p => h('button.chip', { type: 'button', style: { border: 0, cursor: 'pointer' }, onclick: () => { input.value = p; doRoll(p); } }, p))),
          result, dist)),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'History')), hist));
  }

  // ============================================================ Module
  function render(page) {
    const body = h('div');
    const tabs = h('div.tabs', { role: 'tablist' });
    let cleanup = null;
    function paint() {
      if (cleanup) cleanup();
      tabs.replaceChildren(...[['sprite', 'Sprite editor'], ['palette', 'Palette'], ['easing', 'Easing'], ['dice', 'Dice']].map(([id, label]) =>
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; paint(); } }, label)));
      const el = tab === 'sprite' ? spriteTab() : tab === 'palette' ? paletteTab() : tab === 'easing' ? easingTab() : diceTab();
      cleanup = el._cleanup || null;
      body.replaceChildren(el);
    }
    paint();
    page.append(h('header.page-head', null, h('div', null, h('div.eyebrow', null, 'Make'), h('h1', null, 'Game Lab'))), tabs, body);
    return () => { if (cleanup) cleanup(); };
  }

  Bench.module({
    id: 'gamelab', title: 'Game Lab', short: 'Lab', icon: 'gamelab', group: 'make', key: 'l',
    render,
    commands: () => [
      { label: 'Draw a sprite', icon: 'grid', run: () => { tab = 'sprite'; Bench.navigate('gamelab'); } },
      { label: 'Generate a colour palette', icon: 'palette', run: () => { tab = 'palette'; Bench.navigate('gamelab'); } },
      { label: 'Preview easing curves', icon: 'curve', run: () => { tab = 'easing'; Bench.navigate('gamelab'); } },
      { label: 'Roll dice', icon: 'dice', run: () => { tab = 'dice'; Bench.navigate('gamelab'); } },
    ],
  });
})(window.Bench);
