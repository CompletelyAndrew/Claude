/* Bench · QR Codes
 * A course that turns into a tool. Path shows the six-level roadmap and
 * what's due; Learn holds the lessons and drills; Inspect and Make are
 * the everyday tools, and they explain less as your skills grow.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, toast } = Bench;
  const Q = Bench.qr, L = Bench.qrlearn, P = Bench.qrpayload;

  const today = () => Bench.ledger.isoDay(new Date());
  const progress = () => { const s = store.get('qr', null); return s && s.skills ? s : L.empty(); };
  const ui = () => ({ tab: 'path', level: 1, explain: 'auto', inspect: 'https://bit.ly/3menu-table12', ...store.get('qr:ui', {}) });
  const setUi = patch => store.set('qr:ui', { ...ui(), ...patch });
  const readySkills = () => L.SKILLS.filter(s => L.LEVELS[s.level - 1].ready).map(s => s.id);

  // ---------------------------------------------------------------- the code itself
  // Renders a symbol as SVG. Highlighted modules get the highlighter behind them;
  // dark ones are inset so the yellow still shows around them.
  function codeSvg(e, { highlight = [], quiet = 4, label, markQuiet } = {}) {
    const n = e.size, S = n + quiet * 2;
    const hl = new Set(highlight.map(([x, y]) => y * n + x));
    let marks = '', ink = '';
    for (const i of hl) marks += `M${i % n} ${Math.floor(i / n)}h1v1h-1z`;
    for (let y = 0; y < n; y++) {
      let run = 0;
      for (let x = 0; x <= n; x++) {
        const i = y * n + x, dark = x < n && e.modules[i] && !hl.has(i);
        if (dark) { run++; continue; }
        if (run) { ink += `M${x - run} ${y}h${run}v1h-${run}z`; run = 0; }
        if (x < n && e.modules[i] && hl.has(i)) ink += `M${x + 0.17} ${y + 0.17}h.66v.66h-.66z`;
      }
    }
    const aria = String(label || `QR code, version ${e.version}`).replace(/[<>&"]/g, '');
    return `<svg viewBox="${-quiet} ${-quiet} ${S} ${S}" role="img" aria-label="${aria}" shape-rendering="crispEdges">` +
      `<rect class="qr-off" x="${-quiet}" y="${-quiet}" width="${S}" height="${S}"/>` +
      (markQuiet ? `<path class="qr-hl" fill-rule="evenodd" d="M${-quiet} ${-quiet}h${S}v${S}h-${S}zM0 0v${n}h${n}v-${n}z"/>` : '') +
      (marks ? `<path class="qr-hl" d="${marks}"/>` : '') + `<path class="qr-on" d="${ink}"/></svg>`;
  }

  function plate(e, opts = {}) {
    const el = h('div.qr-plate', { html: codeSvg(e, opts), style: opts.max ? { maxWidth: opts.max } : null });
    if (opts.onCell) {
      const quiet = opts.quiet ?? 4;
      const cellAt = ev => {
        const r = el.getBoundingClientRect(), S = e.size + quiet * 2;
        return [Math.floor(((ev.clientX - r.left) / r.width) * S) - quiet, Math.floor(((ev.clientY - r.top) / r.height) * S) - quiet];
      };
      let down = false;
      el.addEventListener('pointerdown', ev => { down = true; el.setPointerCapture?.(ev.pointerId); opts.onCell(cellAt(ev), 'down'); ev.preventDefault(); });
      el.addEventListener('pointermove', ev => { if (down) opts.onCell(cellAt(ev), 'move'); });
      const up = () => { down = false; };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
    return el;
  }

  const roleCells = (e, role) => { const out = [], R = Q.ROLE[role]; for (let i = 0; i < e.size * e.size; i++) if (e.role[i] === R) out.push([i % e.size, Math.floor(i / e.size)]); return out; };
  const pct = x => `${Math.round(x * 100)}%`;
  const boxDots = box => '●'.repeat(Math.min(box, L.MASTERED)) + '○'.repeat(Math.max(0, L.MASTERED - box));

  // ---------------------------------------------------------------- parts of the symbol
  const PARTS = [
    { id: 'finder', name: 'Finder patterns', why: L.WHY.finder },
    { id: 'separator', name: 'Separators', why: 'A one-module light ring around each finder, so the finder never touches data and its 1:1:3:1:1 stripes stay clean.' },
    { id: 'timing', name: 'Timing patterns', why: L.WHY.timing },
    { id: 'alignment', name: 'Alignment patterns', why: L.WHY.alignment },
    { id: 'format', name: 'Format information', why: L.WHY.format },
    { id: 'dark', name: 'Dark module', why: 'One module beside the bottom-left finder is always dark. It is part of the spec, not data. Handy for checking you have the code the right way round.' },
    { id: 'version', name: 'Version information', why: L.WHY.version },
    { id: 'data', name: 'Data & error correction', why: L.WHY.data + ' Everything not reserved is data: your message first, then the Reed–Solomon bytes that let a damaged code be repaired.' },
    { id: 'remainder', name: 'Remainder bits', why: 'A few leftover modules in some versions that do not fill a whole byte. They are always 0 before masking.' },
    { id: 'quiet', name: 'Quiet zone', why: 'The empty margin, at least 4 modules wide. It is not part of the grid, but without it a scanner cannot separate the code from its surroundings.' },
  ];

  // ---------------------------------------------------------------- drills
  function drillPanel({ pool, title = 'Practice', onAnswer }) {
    const body = h('div.sheet-body.stack');
    const sheet = h('section.sheet', null, h('div.sheet-head', null, h('h2', null, title), h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Answers move skills between review boxes')), body);
    let count = 0;
    function next() {
      const p = progress();
      const ids = pool();
      const id = L.nextSkill(p, today(), ids) || ids[Math.floor(Math.random() * ids.length)];
      const d = L.drill(id, (Date.now() + count++ * 7919) >>> 0);
      const e = Q.encode(d.code.text, d.code);
      const feedback = h('div', { 'aria-live': 'polite' });
      let answered = false;
      const buttons = d.choices.map((c, i) => h('button.btn.qr-choice', { type: 'button', id: `qr-choice-${i}`, onclick: () => answer(c) }, c));
      function answer(c) {
        if (answered) return;
        answered = true;
        const ok = c === d.answer;
        store.set('qr', L.record(progress(), id, ok, today()));
        buttons.forEach(b => { b.disabled = true; if (b.textContent === d.answer) b.classList.add('right'); else if (b.textContent === c) b.classList.add('wrong'); });
        const box = L.boxOf(progress(), id);
        feedback.replaceChildren(h('div.stack', null,
          h('div.row', null, h('span', { class: `chip ${ok ? 'good' : 'bad'}` }, ok ? icon('check') : icon('x'), ok ? 'Right' : `It was “${d.answer}”`),
            h('span.faint.mono', { style: { fontSize: 'var(--t-xs)' }, title: 'Review box' }, `${L.skill(id).label} ${boxDots(box)}`)),
          h('p.muted', null, d.why),
          h('div.row', null, h('button.btn.primary', { type: 'button', id: 'qr-next', onclick: next }, 'Next', icon('arrow')))));
        if (onAnswer) onAnswer(ok);
        feedback.querySelector('button').focus();
      }
      body.replaceChildren(
        h('div.eyebrow', null, L.skill(id).label),
        h('p', { style: { fontWeight: 600 } }, d.prompt),
        plate(e, { highlight: d.highlight, markQuiet: id === 'anatomy.quiet', max: '300px', label: 'Drill code' }),
        h('div.qr-choices', null, buttons), feedback);
    }
    next();
    return sheet;
  }

  // ---------------------------------------------------------------- Path
  function pathTab(go) {
    const p = progress(), t = today(), ready = readySkills();
    const mastered = ready.filter(id => L.isMastered(p, id)).length;
    const due = L.dueSkills(p, t, ready).length;
    const rec = L.recommendedLevel(p);
    const stats = h('section.sheet', null, h('div.stats', null,
      stat('Skills mastered', `${mastered}/${ready.length}`, 'at box 4 or above'),
      stat('Due today', String(due), due ? 'quick reviews waiting' : 'all caught up'),
      stat('Streak', `${L.streak(p, t)}d`, 'days in a row'),
      stat('Answers', String(p.log.length), `${p.log.filter(x => x.ok).length} right`)));

    const route = h('ol.qr-route', null, L.LEVELS.map(lv => {
      const prog = L.levelProgress(p, lv.n);
      const skills = L.SKILLS.filter(s => s.level === lv.n);
      return h('li', { class: `sheet qr-level${lv.n === rec ? ' now' : ''}${lv.ready ? '' : ' later'}` },
        h('div.qr-level-n', null, String(lv.n)),
        h('div.grow', null,
          h('div.row', null, h('h3', null, lv.title), lv.n === rec ? h('span.chip.mark', null, 'Next up') : null, !lv.ready ? h('span.chip', null, 'In preparation') : null),
          h('p.muted', null, lv.blurb),
          lv.ready ? h('div.qr-bar', { role: 'progressbar', 'aria-valuenow': Math.round(prog * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `${lv.title} mastery` }, h('i', { style: { width: pct(prog) } })) : null,
          skills.length ? h('div.row.qr-skills', null, skills.map(s => h('span.chip', { title: `Review box ${L.boxOf(p, s.id)} of 5` }, s.label, ' ', h('span.mono', null, boxDots(L.boxOf(p, s.id)))))) : null),
        lv.ready ? h('button', { class: `btn ${lv.n === rec ? 'primary' : ''}`, type: 'button', id: `qr-open-${lv.n}`, onclick: () => go('learn', { level: lv.n }) }, prog > 0 ? 'Continue' : 'Start', icon('arrow')) : null);
    }));

    const mode = ui().explain;
    const dial = h('section.sheet', null,
      h('div.sheet-head', null, h('h2', null, 'From teacher to tool'), h('span.chip', null, `Tools now: ${{ explain: 'explaining', predict: 'quizzing', hide: 'facts only' }[L.scaffold(p, ready, mode)]}`)),
      h('div.sheet-body.stack', null,
        h('p.muted', null, 'Inspect and Make explain everything at first. As skills reach mastery they start asking you to predict before they reveal, and finally just show the facts, like reading a book’s cover. Override it here.'),
        explainSeg(() => go('path'))));

    const review = due ? h('section.sheet', null, h('div.sheet-body.row', null, h('b', null, `${due} skill${due > 1 ? 's' : ''} due for review`), h('span.spacer'), h('button.btn.primary', { type: 'button', id: 'qr-review', onclick: () => go('learn', { level: 'review' }) }, 'Review now'))) : null;
    return [stats, review, h('div.qr-path', null, route, dial)];
  }
  function stat(k, v, d) { return h('div.stat', null, h('div.eyebrow', null, k), h('div.v', null, v), h('div.d', null, d)); }

  function explainSeg(after) {
    const cur = ui().explain;
    return h('div.seg', { role: 'group', 'aria-label': 'How much the tools explain' },
      [['auto', 'Auto'], ['explain', 'Explain'], ['predict', 'Quiz me'], ['hide', 'Facts only']].map(([v, label]) =>
        h('button', { type: 'button', id: `qr-explain-${v}`, 'aria-pressed': String(cur === v), onclick: () => { setUi({ explain: v }); if (after) after(); } }, label)));
  }

  // ---------------------------------------------------------------- Learn
  function learnTab(go) {
    const lv = ui().level;
    const levelSeg = h('div.seg', { role: 'group', 'aria-label': 'Lesson' },
      L.LEVELS.filter(l => l.ready).map(l => h('button', { type: 'button', id: `qr-level-${l.n}`, 'aria-pressed': String(lv === l.n), onclick: () => go('learn', { level: l.n }) }, `${l.n} · ${l.title}`)),
      h('button', { type: 'button', id: 'qr-level-review', 'aria-pressed': String(lv === 'review'), onclick: () => go('learn', { level: 'review' }) }, 'Review'));
    if (lv === 'review') return [levelSeg, drillPanel({ title: 'Review', pool: readySkills })];
    const lesson = lv === 2 ? coverLesson() : anatomyLesson();
    return [levelSeg, ...lesson, drillPanel({ title: `Practice · Level ${lv}`, pool: () => L.levelSkills(lv) })];
  }

  // Level 1: tap any module to learn what it is; then break the code and see when it stops reading
  function anatomyLesson() {
    let text = 'https://bench.example/qr', minVersion = 2, ec = 'M', part = 'finder', breaking = false;
    let e, flipped = new Set(), paintTo = null;
    const view = h('div.qr-stage'), info = h('div.stack'), status = h('div', { 'aria-live': 'polite' });
    const partsSeg = h('div.qr-parts', { role: 'group', 'aria-label': 'Parts' });
    const build = () => { e = Q.encode(text, { ec, minVersion }); flipped = new Set(); };

    function current() {
      if (!flipped.size) return e;
      const m = e.modules.slice();
      for (const i of flipped) m[i] ^= 1;
      return { ...e, modules: m };
    }
    function paint() {
      const c = current();
      const highlight = breaking ? [...flipped].map(i => [i % e.size, Math.floor(i / e.size)]) : part === 'quiet' ? [] : roleCells(e, part);
      view.replaceChildren(plate(c, { highlight, onCell, markQuiet: !breaking && part === 'quiet', label: breaking ? 'Code you can damage' : 'Tap a module to see what it is' }));
      view.classList.toggle('breaking', breaking);
      partsSeg.replaceChildren(...PARTS.map(pt => {
        const n = pt.id === 'quiet' ? 0 : roleCells(e, pt.id).length;
        const absent = pt.id !== 'quiet' && !n;
        return h('button', { type: 'button', id: `qr-part-${pt.id}`, 'aria-pressed': String(!breaking && part === pt.id), disabled: absent, title: absent ? `Version ${e.version} has none` : '', onclick: () => { part = pt.id; breaking = false; paint(); } }, pt.name);
      }));
      const pt = PARTS.find(x => x.id === part);
      const count = part === 'quiet' ? `${(e.size + 8) ** 2 - e.size ** 2} modules of margin` : `${roleCells(e, part).length} modules`;
      info.replaceChildren(
        breaking ? h('div.stack', null, h('h3', null, 'Break it'), h('p.muted', null, 'Tap or drag across the code to flip modules. Error correction repairs the damage until a block runs out of repair bytes. Paste a logo at level M, then try again at H.'),
          h('div.seg', { role: 'group', 'aria-label': 'Error-correction level' }, 'LMQH'.split('').map(x => h('button', { type: 'button', id: `qr-break-ec-${x}`, 'aria-pressed': String(ec === x), onclick: () => { ec = x; build(); paint(); } }, `${x} · ${Q.EC[x].recover}%`))))
          : h('div.stack', null, h('div.row', null, h('h3', null, pt.name), h('span.chip.mono', null, count)), h('p', null, pt.why)),
        h('div.row', null,
          h('button', { class: `btn sm ${breaking ? 'dark' : ''}`, type: 'button', id: 'qr-break', 'aria-pressed': String(breaking), onclick: () => { breaking = !breaking; paint(); } }, breaking ? 'Back to exploring' : 'Break it'),
          breaking ? h('button.btn.sm', { type: 'button', id: 'qr-logo', onclick: () => { cover(0.1); } }, 'Paste a logo') : null,
          breaking ? h('button.btn.sm', { type: 'button', id: 'qr-scratch', onclick: () => { scratch(0.04); } }, 'Scratch it') : null,
          breaking ? h('button.btn.sm.ghost', { type: 'button', id: 'qr-repair', onclick: () => { flipped = new Set(); paint(); } }, icon('reset'), 'Repair') : null));
      status.replaceChildren(breaking || flipped.size ? decodeStatus(c) : h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, `Version ${e.version} · ${e.size}×${e.size} · level ${e.ec} · mask ${e.mask}`));
    }
    function onCell([x, y], phase) {
      const inGrid = x >= 0 && y >= 0 && x < e.size && y < e.size;
      if (!breaking) {
        if (phase !== 'down') return;
        part = inGrid ? Q.ROLE_NAMES[e.role[y * e.size + x]] : 'quiet';
        paint();
        return;
      }
      if (!inGrid) return;
      const i = y * e.size + x;
      if (phase === 'down') paintTo = !flipped.has(i);
      if (paintTo && !flipped.has(i)) flipped.add(i); else if (!paintTo && flipped.has(i)) flipped.delete(i); else return;
      paint();
    }
    function cover(frac) {
      const s = Math.round(e.size * Math.sqrt(frac)), o = Math.floor((e.size - s) / 2);
      for (let y = o; y < o + s; y++) for (let x = o; x < o + s; x++) { const i = y * e.size + x; if (e.modules[i]) flipped.add(i); }
      paint();
    }
    function scratch(frac) {
      for (let i = 0; i < e.size * e.size; i++) if (Math.random() < frac) { if (flipped.has(i)) flipped.delete(i); else flipped.add(i); }
      paint();
    }

    const textIn = h('input.input', { id: 'qr-anatomy-text', value: text, 'aria-label': 'Text to encode', oninput: Bench.debounce(ev => { text = ev.target.value || ' '; build(); paint(); }, 200) });
    const vSeg = h('div.seg', { role: 'group', 'aria-label': 'Minimum version' }, [[1, 'v1'], [2, 'v2'], [7, 'v7']].map(([v, label]) =>
      h('button', { type: 'button', id: `qr-anatomy-v${v}`, 'aria-pressed': String(minVersion === v), onclick: ev => { minVersion = v; ev.target.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === ev.target))); build(); paint(); } }, label)));
    build(); paint();
    return [h('div.grid.qr-lesson', null,
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Anatomy'), h('div.actions', null, vSeg)), h('div.sheet-body.stack', null, view, status, h('div.field', null, h('span', null, 'Encode'), textIn))),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'The parts')), h('div.sheet-body.stack', null, partsSeg, info)))];
  }

  function decodeStatus(c) {
    const d = Q.decodeMatrix(c.modules);
    if (d.ok) {
      const worst = Math.max(...d.corrections.map((n, i) => n / d.capacity[i]));
      return h('div.stack', null,
        h('div.row', null, h('span.chip.good', null, icon('check'), 'Still reads'), h('span.mono', { style: { fontSize: 'var(--t-xs)', overflowWrap: 'anywhere' } }, d.text.slice(0, 60))),
        h('div.faint', { style: { fontSize: 'var(--t-xs)' } }, d.corrected ? `Repaired ${d.corrected} codeword${d.corrected > 1 ? 's' : ''}. The worst block used ${pct(worst)} of its repair budget.` : 'Nothing needed repair.'),
        h('div.qr-bar', { 'aria-hidden': 'true' }, h('i', { style: { width: pct(worst), background: worst > 0.8 ? 'var(--warn)' : 'var(--ink)' } })));
    }
    return h('div.stack', null, h('span.chip.bad', null, 'Unreadable'), h('div.muted', { style: { fontSize: 'var(--t-sm)' } }, d.error));
  }

  // Level 2: read the version, EC level, mask and likely contents from the outside
  function coverLesson() {
    // 1 · size → version
    let v = 3;
    const vView = h('div.qr-stage'), vFacts = h('div.stack');
    const vPaint = () => {
      const e = Q.encode('1', { ec: 'L', version: v });
      vView.replaceChildren(plate(e, { max: '280px', label: `Version ${v}` }));
      const al = Q.alignmentPositions(v).length, alignCount = al ? al * al - 3 : 0;
      vFacts.replaceChildren(
        h('div.qr-formula.mono', null, `${e.size} = 17 + 4 × ${v}`),
        h('p.muted', null, `Version ${v} is ${e.size} modules across, with ${alignCount ? `${alignCount} alignment pattern${alignCount > 1 ? 's' : ''}` : 'no alignment patterns'}${v >= 7 ? ' and version blocks beside two finders' : ''}.`),
        h('table.qr-table', null, h('thead', null, h('tr', null, h('th', null, 'Level'), h('th', null, 'Bytes'), h('th', null, 'Digits'))),
          h('tbody', null, 'LMQH'.split('').map(ec => h('tr', null, h('td', null, ec), h('td.num', null, Q.capacity(v, ec)), h('td.num', null, Q.capacity(v, ec, 'numeric')))))));
    };
    const slider = h('input', { type: 'range', id: 'qr-cover-version', min: 1, max: 40, value: v, 'aria-label': 'Version', oninput: ev => { v = +ev.target.value; vPaint(); } });
    vPaint();

    // 2 · the format strip
    let ec = 'Q', mask = 3;
    const fView = h('div.qr-stage'), fBits = h('div.stack');
    const fPaint = () => {
      const e = Q.encode('READ THE STRIP', { ec, mask });
      const cells = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8]];
      fView.replaceChildren(plate(e, { highlight: cells, max: '280px', label: 'Format strip highlighted' }));
      const raw = cells.map(([x, y]) => e.modules[y * e.size + x]);
      const xor = [1, 0, 1, 0, 1], plain = raw.map((b, i) => b ^ xor[i]);
      fBits.replaceChildren(h('table.qr-table.qr-bits', null,
        h('tbody', null,
          h('tr', null, h('th', null, 'Modules'), ...raw.map(b => h('td.mono', null, b))),
          h('tr', null, h('th', null, 'XOR'), ...xor.map(b => h('td.mono.faint', null, b))),
          h('tr', null, h('th', null, '= value'), ...plain.map((b, i) => h('td', { class: `mono ${i < 2 ? 'qr-ec-bit' : ''}` }, b))))),
        h('p', null, h('b', null, `EC ${Q.EC_BY_BITS[(plain[0] << 1) | plain[1]]}`), ` (${plain.slice(0, 2).join('')}) · `, h('b', null, `mask ${(plain[2] << 2) | (plain[3] << 1) | plain[4]}`), ` (${plain.slice(2).join('')}): ${Q.MASK_FORMULAS[mask]}`));
    };
    const ecSeg = h('div.seg', { role: 'group', 'aria-label': 'Error-correction level' }, 'LMQH'.split('').map(x =>
      h('button', { type: 'button', id: `qr-strip-ec-${x}`, 'aria-pressed': String(ec === x), onclick: evt => { ec = x; press(evt); fPaint(); } }, x)));
    const maskSel = h('select.input', { id: 'qr-strip-mask', 'aria-label': 'Mask', onchange: evt => { mask = +evt.target.value; fPaint(); } },
      Q.MASKS.map((_, i) => h('option', { value: i, selected: i === mask }, `Mask ${i}`)));
    fPaint();

    // 3 · density → contents
    const samples = [
      ['Product number', '4006381333931'],
      ['Short link', 'https://bit.ly/3xQz9Lm'],
      ['Wi-Fi login', P.build.wifi({ ssid: 'Cafe Luna Guest', password: 'espresso-2026' })],
      ['Tracked web link', 'https://shop.example/autumn-sale?utm_source=poster&utm_medium=qr&utm_campaign=oct26&store=118'],
      ['Contact card', P.build.contact({ name: 'Ada Example', phone: '+1 555 0100 2233', email: 'ada@studio.example', org: 'Example Studio', url: 'https://studio.example' })],
    ];
    const gallery = h('div.qr-gallery', null, samples.map(([name, text]) => {
      const e = Q.encode(text, { ec: 'M' });
      return h('figure', null, plate(e, { label: name }), h('figcaption', null, h('b', null, name), h('span.faint.mono', null, `v${e.version} · ${text.length} chars`)));
    }));

    const ecRows = [['L', '7%', 'Most capacity. Clean screens.'], ['M', '15%', 'The everyday default.'], ['Q', '25%', 'Packaging, outdoor print.'], ['H', '30%', 'Logos in the middle, rough handling.']];
    return [
      h('div.grid.qr-lesson', null,
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '1 · Size gives the version')), h('div.sheet-body.stack', null, vView, h('label.field', { for: 'qr-cover-version' }, h('span', null, `Version`), slider))),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Counting without counting')), h('div.sheet-body.stack', null,
          h('p', null, 'Every version adds 4 modules to each side. You rarely need to count them all. On small codes (up to version 6), count the modules of a timing pattern between two finders and add 16, or count alignment bullseyes: none means version 1, one means 2–6, six means 7–13.'),
          vFacts))),
      h('div.grid.qr-lesson', null,
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '2 · The format strip')), h('div.sheet-body.stack', null, fView, h('div.row', null, ecSeg, maskSel))),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Read five modules')), h('div.sheet-body.stack', null,
          h('p', null, 'Under the top-left finder, the first five modules of row 8 (counting from 0, just below the separator) hold the error-correction level and the mask. They are XOR-ed with 1 0 1 0 1 so they are never all light. Undo that and you can read them by eye.'),
          fBits))),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '3 · Density hints at the contents')), h('div.sheet-body.stack', null,
        h('p.muted', null, 'Same level (M), different payloads. A tiny code is a number or a short link, often one that forwards somewhere else. A dense one carries the whole thing: a long tracked URL, a contact card, a paragraph.'), gallery)),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '4 · Picking a level')), h('div.sheet-body', null,
        h('table.qr-table', null, h('thead', null, h('tr', null, h('th', null, 'Level'), h('th', null, 'Repairs'), h('th', null, 'Bytes at v5'), h('th', null, 'Use it for'))),
          h('tbody', null, ecRows.map(([x, rep, use]) => h('tr', null, h('td', null, h('b', null, x)), h('td.num', null, rep), h('td.num', null, Q.capacity(5, x)), h('td', null, use)))))))];
  }
  function press(evt) { evt.target.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === evt.target))); }

  // ---------------------------------------------------------------- Inspect
  const EXAMPLES = [
    ['Menu link', 'https://cafe-luna.example/menu?table=12'],
    ['Short link', 'https://bit.ly/3menu-table12'],
    ['Wi-Fi', 'WIFI:T:WPA;S:Cafe Luna Guest;P:espresso-2026;;'],
    ['Parking sticker', 'http://parking-pay-verify.com/pay?zone=4'],
    ['2FA setup', 'otpauth://totp/Acme:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme'],
    ['Product', 'https://id.gs1.org/01/09506000134352'],
  ];

  function inspectTab(go) {
    const p = progress();
    const input = h('textarea.input.mono', { id: 'qr-inspect-text', rows: 3, spellcheck: 'false', value: ui().inspect, 'aria-label': 'QR contents' });
    const left = h('div.stack'), right = h('div.stack');
    const paint = () => {
      const text = input.value;
      setUi({ inspect: text });
      let e;
      try { e = Q.encode(text || ' ', { ec: 'M' }); } catch (err) { left.replaceChildren(h('div.empty', null, h('b', null, 'Too long'), err.message)); right.replaceChildren(); return; }
      left.replaceChildren(plate(e, { max: '320px', label: 'Inspected code' }), coverReading(e, p));
      right.replaceChildren(leadsTo(P.classify(text)));
    };
    input.addEventListener('input', Bench.debounce(paint, 200));
    paint();
    return [
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'What’s inside'), h('div.actions', null, explainSeg(() => go('inspect')))),
        h('div.sheet-body.stack', null, input, h('div.row.qr-examples', null, h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Try:'),
          EXAMPLES.map(([name, t], i) => h('button.chip', { type: 'button', id: `qr-example-${i}`, onclick: () => { input.value = t; paint(); } }, name))),
          h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Camera and photo scanning are coming in the next update. For now, paste what your phone’s scanner shows you.'))),
      h('div.grid.qr-lesson', null, h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Cover reading')), h('div.sheet-body', null, left)),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Where it leads')), h('div.sheet-body', null, right)))];
  }

  // The facts a reader can get from the outside, explained, quizzed or just listed
  function coverReading(e, p) {
    const used = e.bits.segment, cap = e.bits.capacity;
    const facts = [
      { k: 'Version', v: `${e.version} (${e.size}×${e.size})`, skill: 'cover.version', why: `${e.size} = 17 + 4 × ${e.version}.` },
      { k: 'Error correction', v: `${e.ec} · repairs ~${Q.EC[e.ec].recover}%`, skill: 'cover.ec', why: 'Read from the format strip under the top-left finder.' },
      { k: 'Mask', v: String(e.mask), skill: 'cover.mask', why: `Chosen for the lowest penalty: ${Q.MASK_FORMULAS[e.mask]}.` },
      { k: 'Mode', v: { numeric: 'Numeric', alnum: 'Alphanumeric', byte: 'Byte (UTF-8)', kanji: 'Kanji' }[e.mode], skill: 'cover.contents', why: e.mode === 'byte' ? 'Lower-case or symbols force byte mode, 8 bits a character.' : 'A compact mode: fewer bits per character.' },
      { k: 'Fill', v: `${pct(used / cap)} of ${cap / 8} bytes`, skill: 'cover.contents', why: 'How full the version is. A bigger payload would need a bigger version.' },
    ];
    const mode = L.scaffold(p, ['cover.version', 'cover.ec', 'cover.mask', 'cover.contents'], ui().explain);
    if (mode === 'hide') return h('p.mono.qr-oneline', null, `v${e.version} · ${e.size}² · ${e.ec} · mask ${e.mask} · ${e.mode} · ${pct(used / cap)} full`);
    return h('dl.qr-facts', null, facts.map((f, i) => {
      const value = h('dd', null, f.v);
      if (mode === 'predict') {
        const btn = h('button.btn.sm.ghost', { type: 'button', id: `qr-reveal-${i}`, onclick: () => btn.replaceWith(h('span', null, f.v)) }, 'Guess, then reveal');
        value.replaceChildren(btn);
      } else value.append(h('div.faint', { style: { fontSize: 'var(--t-xs)' } }, f.why));
      return [h('dt', null, f.k, h('span.mono.faint', { title: 'Your review box' }, ' ', boxDots(L.boxOf(p, f.skill)))), value];
    }));
  }

  function leadsTo(c) {
    const worst = c.flags.some(f => f.level === 'bad') ? 'bad' : c.flags.some(f => f.level === 'warn') ? 'warn' : 'good';
    return h('div.stack', null,
      h('div.row', null, h('span', { class: `chip ${worst}` }, worst === 'good' ? icon('check') : null, c.label), h('span.faint.mono', { style: { fontSize: 'var(--t-xs)' } }, `${c.length} chars`)),
      h('p', { style: { fontWeight: 600 } }, c.action),
      c.fields.length ? h('dl.qr-facts', null, c.fields.map(([k, v]) => [h('dt', null, k), h('dd.mono', { style: { overflowWrap: 'anywhere' } }, v)])) : null,
      c.flags.length ? h('ul.list.qr-flags', null, c.flags.map(f => h('li', null, h('span', { class: `chip ${f.level === 'info' ? 'blue' : f.level}` }, f.level === 'info' ? 'Note' : f.level === 'warn' ? 'Careful' : 'Danger'), h('span.grow', null, f.msg))))
        : h('p.faint', { style: { fontSize: 'var(--t-sm)' } }, 'No warning signs. Still check the address your phone shows before you open it.'));
  }

  // ---------------------------------------------------------------- Make
  const KINDS = [
    { id: 'url', label: 'Link', fields: [['url', 'Address', 'https://']] },
    { id: 'text', label: 'Text', fields: [['text', 'Text', '', 'area']] },
    { id: 'wifi', label: 'Wi-Fi', fields: [['ssid', 'Network name', ''], ['password', 'Password', ''], ['auth', 'Security', 'WPA', ['WPA', 'WEP', 'none']]] },
    { id: 'contact', label: 'Contact', fields: [['name', 'Name', ''], ['phone', 'Phone', ''], ['email', 'Email', ''], ['org', 'Organisation', ''], ['url', 'Website', '']] },
    { id: 'email', label: 'Email', fields: [['to', 'To', ''], ['subject', 'Subject', ''], ['body', 'Message', '', 'area']] },
    { id: 'sms', label: 'SMS', fields: [['to', 'Number', ''], ['body', 'Message', '', 'area']] },
    { id: 'tel', label: 'Phone', fields: [['to', 'Number', '']] },
    { id: 'geo', label: 'Location', fields: [['lat', 'Latitude', '51.5007'], ['lng', 'Longitude', '-0.1246'], ['label', 'Label', '']] },
  ];

  function makeTab(go) {
    const st = { kind: 'url', ec: 'M', mask: 'auto', values: { url: { url: 'https://bench.example/qr' } }, ...store.get('qr:make', {}) };
    const save = () => store.set('qr:make', st);
    const form = h('div.stack'), out = h('div.stack'), kindSeg = h('div.seg', { role: 'group', 'aria-label': 'What to encode' });
    const payload = () => P.build[st.kind]({ ...Object.fromEntries(KINDS.find(k => k.id === st.kind).fields.map(([k, , def]) => [k, Array.isArray(def) ? def[0] : def])), ...(st.values[st.kind] || {}) });

    function paintForm() {
      kindSeg.replaceChildren(...KINDS.map(k => h('button', { type: 'button', id: `qr-make-${k.id}`, 'aria-pressed': String(st.kind === k.id), onclick: () => { st.kind = k.id; save(); paintForm(); paintOut(); } }, k.label)));
      const kind = KINDS.find(k => k.id === st.kind), vals = st.values[st.kind] || (st.values[st.kind] = {});
      form.replaceChildren(...kind.fields.map(([key, label, def, type]) => {
        const id = `qr-field-${st.kind}-${key}`;
        const set = ev => { vals[key] = ev.target.value; save(); paintOut(); };
        let ctl;
        if (Array.isArray(type)) ctl = h('select.input', { id, onchange: set }, type.map(o => h('option', { value: o, selected: (vals[key] ?? def) === o }, o === 'none' ? 'None (open)' : o)));
        else if (type === 'area') ctl = h('textarea.input', { id, rows: 3, value: vals[key] ?? def, oninput: Bench.debounce(set, 150) });
        else ctl = h('input.input', { id, value: vals[key] ?? def, oninput: Bench.debounce(set, 150), autocomplete: 'off' });
        return h('label.field', { for: id }, h('span', null, label), ctl);
      }),
      h('div.row', null,
        h('div.field', null, h('span', null, 'Error correction'), h('div.seg', { role: 'group', 'aria-label': 'Error correction' }, 'LMQH'.split('').map(x => h('button', { type: 'button', id: `qr-make-ec-${x}`, 'aria-pressed': String(st.ec === x), onclick: ev => { st.ec = x; save(); press(ev); paintOut(); } }, x)))),
        h('label.field', { for: 'qr-make-mask' }, h('span', null, 'Mask'), h('select.input', { id: 'qr-make-mask', onchange: ev => { st.mask = ev.target.value; save(); paintOut(); } },
          h('option', { value: 'auto', selected: st.mask === 'auto' }, 'Auto (lowest penalty)'), Q.MASKS.map((_, i) => h('option', { value: i, selected: String(st.mask) === String(i) }, `Mask ${i}`))))));
    }

    function paintOut() {
      const text = payload();
      let e;
      try { e = Q.encode(text || ' ', { ec: st.ec, mask: st.mask }); }
      catch (err) { out.replaceChildren(h('div.empty', null, h('b', null, 'Too long'), err.message)); return; }
      const c = P.classify(text);
      const mode = L.scaffold(progress(), ['cover.choose', 'cover.contents'], ui().explain);
      const note = mode === 'hide' ? null : h('p.faint', { style: { fontSize: 'var(--t-xs)' } },
        `${text.length} characters in ${e.mode} mode fill ${pct(e.bits.segment / e.bits.capacity)} of version ${e.version} at level ${e.ec}. ${st.ec === 'H' ? 'H leaves room for a logo.' : st.ec === 'L' ? 'L keeps it small but fragile.' : ''} Mask ${e.mask} scored ${e.penalties[e.mask].total} penalty points${st.mask === 'auto' ? ', the lowest of the eight' : ''}.`);
      out.replaceChildren(
        plate(e, { max: '340px', label: `QR code for ${c.label}` }),
        h('div.row', null, h('span.chip', null, c.label), h('span.mono.faint', { style: { fontSize: 'var(--t-xs)' } }, `v${e.version} · ${e.size}×${e.size} · ${e.ec} · mask ${e.mask}`)),
        note,
        c.flags.filter(f => f.level !== 'info').map(f => h('div.row', null, h('span', { class: `chip ${f.level}` }, f.level === 'bad' ? 'Danger' : 'Careful'), h('span.muted', { style: { fontSize: 'var(--t-sm)' } }, f.msg))),
        h('div.row', null,
          h('button.btn.primary', { type: 'button', id: 'qr-download-png', onclick: () => downloadPng(e) }, icon('download'), 'PNG'),
          h('button.btn', { type: 'button', id: 'qr-download-svg', onclick: () => Bench.download('qr-code.svg', exportSvg(e), 'image/svg+xml') }, icon('download'), 'SVG'),
          h('button.btn.ghost', { type: 'button', id: 'qr-copy', onclick: () => Bench.copy(text, 'Contents copied') }, icon('copy'), 'Copy contents'),
          h('button.btn.ghost', { type: 'button', id: 'qr-to-inspect', onclick: () => { setUi({ inspect: text }); go('inspect'); } }, 'Inspect', icon('arrow'))));
    }
    paintForm(); paintOut();
    return [h('div.grid.qr-lesson', null,
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Make a code')), h('div.sheet-body.stack', null, kindSeg, form)),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Your code')), h('div.sheet-body', null, out)))];
  }

  function exportSvg(e) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + codeSvg(e, { label: 'QR code' })
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" ')
      .replace('class="qr-off"', 'fill="#ffffff"').replace('class="qr-on"', 'fill="#000000"');
  }
  function downloadPng(e, scale = 12, quiet = 4) {
    const S = (e.size + quiet * 2) * scale;
    const c = h('canvas', { width: S, height: S }), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.fillStyle = '#000';
    for (let y = 0; y < e.size; y++) for (let x = 0; x < e.size; x++) if (e.modules[y * e.size + x]) g.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    c.toBlob(b => { if (b) Bench.download('qr-code.png', b); else toast('Could not make a PNG here'); }, 'image/png');
  }

  // ---------------------------------------------------------------- page
  const TABS = [['path', 'Path'], ['learn', 'Learn'], ['inspect', 'Inspect'], ['make', 'Make']];
  function render(page) {
    const arg = Bench.takeArg();
    if (arg && typeof arg === 'object') setUi(arg);
    const tabs = h('div.tabs', { role: 'tablist' }), body = h('div.stack', { style: { gap: '22px' } });
    const go = (tab, patch = {}) => { setUi({ tab, ...patch }); paint(); window.scrollTo?.(0, 0); };
    function paint() {
      const t = ui().tab;
      tabs.replaceChildren(...TABS.map(([id, label]) => h('button', { type: 'button', role: 'tab', id: `qr-tab-${id}`, 'aria-selected': String(t === id), onclick: () => go(id) }, label)));
      const fn = { path: pathTab, learn: learnTab, inspect: inspectTab, make: makeTab }[t] || pathTab;
      body.replaceChildren(...fn(go).flat().filter(Boolean));
    }
    const lv = L.recommendedLevel(progress());
    page.append(h('header.page-head', null,
      h('div', null, h('div.eyebrow', null, 'Learn'), h('h1', null, 'QR Codes')),
      h('div.actions', null, h('span.chip.mark', null, `Level ${lv} · ${L.LEVELS[lv - 1].title}`))), tabs, body);
    paint();
    return null;
  }

  Bench.module({
    id: 'qr', title: 'QR Codes', short: 'QR', icon: 'qr', group: 'make', key: 'q',
    render,
    badge: () => { const n = L.dueSkills(progress(), today(), readySkills()).length; return n ? String(n) : ''; },
    commands: () => [
      { label: 'Continue QR lesson', run: () => Bench.navigate('qr', { tab: 'learn', level: L.recommendedLevel(progress()) }) },
      { label: 'Review due QR skills', run: () => Bench.navigate('qr', { tab: 'learn', level: 'review' }) },
      { label: 'Make a QR code', run: () => Bench.navigate('qr', { tab: 'make' }) },
      { label: 'Inspect QR contents', run: () => Bench.navigate('qr', { tab: 'inspect' }) },
    ],
  });
})(window.Bench);
