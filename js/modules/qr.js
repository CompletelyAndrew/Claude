/* Bench · QR Codes
 * A course that turns into a tool. Path shows the six-level roadmap and
 * what's due; Learn holds the lessons and drills; Inspect and Make are
 * the everyday tools, and they explain less as your skills grow.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, toast } = Bench;
  const Q = Bench.qr, L = Bench.qrlearn, P = Bench.qrpayload, S = Bench.qrscan;

  // Timers, the camera and listeners a tab starts; all stopped when the tab or page changes
  const live = new Set();
  const onStop = fn => { live.add(fn); return fn; };
  const stopAll = () => { for (const fn of live) { try { fn(); } catch (e) { console.error(e); } } live.clear(); };

  // replaceChildren, but flattening arrays and skipping null/false like h() does
  const fill = (el, ...kids) => { el.replaceChildren(); Bench.append(el, kids); return el; };
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
  // One question card. Records the answer unless record is false; calls done(ok) after.
  function question(d, { done, record = true, nextLabel = 'Next' } = {}) {
    const id = d.skill;
    const e = d.maskOnly != null ? Q.maskPattern(2, d.maskOnly) : Q.encode(d.code.text, d.code);
    const feedback = h('div', { 'aria-live': 'polite' });
    let answered = false;
    const buttons = d.choices.map((c, i) => h('button.btn.qr-choice', { type: 'button', id: `qr-choice-${i}`, onclick: () => answer(c) }, c));
    function answer(c) {
      if (answered) return;
      answered = true;
      const ok = c === d.answer;
      if (record) store.set('qr', L.record(progress(), id, ok, today()));
      buttons.forEach(b => { b.disabled = true; if (b.textContent === d.answer) b.classList.add('right'); else if (b.textContent === c) b.classList.add('wrong'); });
      const box = L.boxOf(progress(), id);
      fill(feedback, h('div.stack', null,
        h('div.row', null, h('span', { class: `chip ${ok ? 'good' : 'bad'}` }, ok ? icon('check') : icon('x'), ok ? 'Right' : `It was “${d.answer}”`),
          h('span.faint.mono', { style: { fontSize: 'var(--t-xs)' }, title: 'Review box' }, `${L.skill(id).label} ${boxDots(box)}`)),
        h('p.muted', null, d.why),
        done ? h('div.row', null, h('button.btn.primary', { type: 'button', id: 'qr-next', onclick: () => done(ok) }, nextLabel, icon('arrow'))) : null));
      const nb = feedback.querySelector('button');
      if (nb) nb.focus();
    }
    return h('div.stack', null,
      h('div.eyebrow', null, L.skill(id).label),
      h('p', { style: { fontWeight: 600 } }, d.prompt),
      d.payload ? h('pre.qr-payload', null, d.payload) : null,
      plate(e, { highlight: d.highlight, markQuiet: id === 'anatomy.quiet', max: d.payload ? '200px' : '300px', label: d.maskOnly != null ? 'Mask pattern' : 'Drill code' }),
      h('div.qr-choices', null, buttons), feedback);
  }

  function drillPanel({ pool, title = 'Practice' }) {
    const body = h('div.sheet-body');
    const sheet = h('section.sheet', null, h('div.sheet-head', null, h('h2', null, title), h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Answers move skills between review boxes')), body);
    let count = 0;
    function next() {
      const ids = pool();
      const id = L.nextSkill(progress(), today(), ids) || ids[Math.floor(Math.random() * ids.length)];
      fill(body, question(L.drill(id, (Date.now() + count++ * 7919) >>> 0), { done: next }));
    }
    next();
    return sheet;
  }

  // The final exam: twelve questions from every level, scored at the end
  function examView(go) {
    const body = h('div.sheet-body.stack');
    const plan = L.examPlan((Date.now() >>> 0) % 1e9);
    let i = 0, score = 0;
    const misses = [];
    function step() {
      if (i >= plan.length) return finish();
      const q = plan[i], d = L.drill(q.id, q.seed);
      fill(body, h('div.row', null, h('span.chip.mono', null, `${i + 1} / ${plan.length}`), h('div.qr-bar.grow', { 'aria-hidden': 'true' }, h('i', { style: { width: pct(i / plan.length) } }))),
        question(d, { nextLabel: i + 1 < plan.length ? 'Next question' : 'See my score', done: ok => { if (ok) score++; else misses.push(q.id); i++; step(); } }));
    }
    function finish() {
      const before = progress().exam;
      store.set('qr', L.recordExam(progress(), score, plan.length, today()));
      const passed = score / plan.length >= L.PASS;
      fill(body,
        h('div.qr-score', null, h('div.v', null, `${score}/${plan.length}`), h('div', null, h('h3', null, passed ? 'You can read a QR code like a book cover.' : score / plan.length >= 0.6 ? 'Not yet. Close, though.' : 'Not yet. Keep working through the levels.'),
          h('p.muted', null, passed ? (before && before.passed ? 'Passed again. The tools stay in facts-only mode unless you change it.' : 'Passed. From here the tools show you the facts and leave the reading to you.') : `You need ${Math.ceil(L.PASS * plan.length)} to pass. The skills you missed are now due for review.`))),
        misses.length ? h('div.row', null, h('span.faint', { style: { fontSize: 'var(--t-sm)' } }, 'To practise:'), [...new Set(misses)].map(id => h('span.chip', null, L.skill(id).label))) : null,
        h('div.row', null,
          h('button.btn.primary', { type: 'button', id: 'qr-exam-again', onclick: () => go('learn', { level: 'exam' }) }, icon('reset'), 'Another exam'),
          h('button.btn', { type: 'button', id: 'qr-exam-path', onclick: () => go('path') }, 'Back to the path')));
    }
    step();
    return [h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Final exam · Read it like a book'), h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, `Pass with ${Math.round(L.PASS * 100)}%`)), body)];
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
        explainSeg(() => go('path')),
        h('div.row', null,
          h('button.btn.sm', { type: 'button', id: 'qr-backup', onclick: backup }, icon('download'), 'Back up progress'),
          h('button.btn.sm.ghost', { type: 'button', id: 'qr-restore', onclick: () => restore(() => go('path')) }, icon('upload'), 'Restore')),
        h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Progress is kept in this browser. Back it up to move between Bench and the stand-alone QR app, or to another device.')));

    const ex = p.exam;
    const examCard = h('section.sheet', null,
      h('div.sheet-head', null, h('h2', null, 'Final exam'), ex && ex.passed ? h('span.chip.mark', null, icon('check'), 'Reader') : null),
      h('div.sheet-body.stack', null,
        h('p.muted', null, 'Twelve questions from all six levels: name the parts, read the cover, the bits, the damage, where it leads and whether to open it. Pass with 80%.'),
        ex ? h('div.faint', { style: { fontSize: 'var(--t-sm)' } }, `Best ${pct(ex.best)} over ${ex.attempts} attempt${ex.attempts > 1 ? 's' : ''}${ex.passed ? ` · passed ${ex.passed}` : ''}`) : null,
        h('div.row', null, h('button', { class: `btn ${rec === 6 && L.levelProgress(p, 6) >= 0.5 ? 'primary' : ''}`, type: 'button', id: 'qr-exam', onclick: () => go('learn', { level: 'exam' }) }, ex ? 'Take it again' : 'Take the exam', icon('arrow')))));
    const review = due ? h('section.sheet', null, h('div.sheet-body.row', null, h('b', null, `${due} skill${due > 1 ? 's' : ''} due for review`), h('span.spacer'), h('button.btn.primary', { type: 'button', id: 'qr-review', onclick: () => go('learn', { level: 'review' }) }, 'Review now'))) : null;
    return [stats, review, h('div.qr-path', null, route, h('div.stack', { style: { gap: '18px' } }, dial, examCard))];
  }
  const SLICES = ['qr', 'qr:ui', 'qr:make', 'qr:scans'];
  function backup() {
    const state = Object.fromEntries(SLICES.map(k => [k, store.get(k, null)]).filter(([, v]) => v != null));
    Bench.download(`qr-progress-${today()}.json`, JSON.stringify({ app: 'bench-qr', version: 1, exported: new Date().toISOString(), state }, null, 2), 'application/json');
  }
  async function restore(after) {
    const f = await Bench.pickFile('.json,application/json');
    if (!f) return;
    try {
      const data = JSON.parse(f.text);
      // A full Bench backup works too: take just the QR slices from it
      const state = data.app === 'bench-qr' ? data.state : data.app === 'bench' ? data.state : null;
      if (!state || !state.qr || !Array.isArray(state.qr.log)) throw new Error('No QR progress in that file');
      for (const k of SLICES) if (state[k] != null) store.set(k, state[k]);
      toast(`Restored ${state.qr.log.length} answers`);
      after();
    } catch (e) { toast(e.message || 'That file could not be read'); }
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
      h('button', { type: 'button', id: 'qr-level-review', 'aria-pressed': String(lv === 'review'), onclick: () => go('learn', { level: 'review' }) }, 'Review'),
      h('button', { type: 'button', id: 'qr-level-exam', 'aria-pressed': String(lv === 'exam'), onclick: () => go('learn', { level: 'exam' }) }, 'Exam'));
    if (lv === 'review') return [levelSeg, drillPanel({ title: 'Review', pool: readySkills })];
    if (lv === 'exam') return [levelSeg, ...examView(go)];
    const lesson = { 1: anatomyLesson, 2: coverLesson, 3: bitsLesson, 4: eccLesson, 5: wildLesson, 6: () => safeLesson(go) }[lv] || anatomyLesson;
    return [levelSeg, ...lesson(), drillPanel({ title: `Practice · Level ${lv}`, pool: () => L.levelSkills(lv) })];
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
      fill(view, plate(c, { highlight, onCell, markQuiet: !breaking && part === 'quiet', label: breaking ? 'Code you can damage' : 'Tap a module to see what it is' }));
      view.classList.toggle('breaking', breaking);
      fill(partsSeg, ...PARTS.map(pt => {
        const n = pt.id === 'quiet' ? 0 : roleCells(e, pt.id).length;
        const absent = pt.id !== 'quiet' && !n;
        return h('button', { type: 'button', id: `qr-part-${pt.id}`, 'aria-pressed': String(!breaking && part === pt.id), disabled: absent, title: absent ? `Version ${e.version} has none` : '', onclick: () => { part = pt.id; breaking = false; paint(); } }, pt.name);
      }));
      const pt = PARTS.find(x => x.id === part);
      const count = part === 'quiet' ? `${(e.size + 8) ** 2 - e.size ** 2} modules of margin` : `${roleCells(e, part).length} modules`;
      fill(info, 
        breaking ? h('div.stack', null, h('h3', null, 'Break it'), h('p.muted', null, 'Tap or drag across the code to flip modules. Error correction repairs the damage until a block runs out of repair bytes. Paste a logo at level M, then try again at H.'),
          h('div.seg', { role: 'group', 'aria-label': 'Error-correction level' }, 'LMQH'.split('').map(x => h('button', { type: 'button', id: `qr-break-ec-${x}`, 'aria-pressed': String(ec === x), onclick: () => { ec = x; build(); paint(); } }, `${x} · ${Q.EC[x].recover}%`))))
          : h('div.stack', null, h('div.row', null, h('h3', null, pt.name), h('span.chip.mono', null, count)), h('p', null, pt.why)),
        h('div.row', null,
          h('button', { class: `btn sm ${breaking ? 'dark' : ''}`, type: 'button', id: 'qr-break', 'aria-pressed': String(breaking), onclick: () => { breaking = !breaking; paint(); } }, breaking ? 'Back to exploring' : 'Break it'),
          breaking ? h('button.btn.sm', { type: 'button', id: 'qr-logo', onclick: () => { cover(0.1); } }, 'Paste a logo') : null,
          breaking ? h('button.btn.sm', { type: 'button', id: 'qr-scratch', onclick: () => { scratch(0.04); } }, 'Scratch it') : null,
          breaking ? h('button.btn.sm.ghost', { type: 'button', id: 'qr-repair', onclick: () => { flipped = new Set(); paint(); } }, icon('reset'), 'Repair') : null));
      fill(status, breaking || flipped.size ? decodeStatus(c) : h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, `Version ${e.version} · ${e.size}×${e.size} · level ${e.ec} · mask ${e.mask}`));
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
      fill(vView, plate(e, { max: '280px', label: `Version ${v}` }));
      const al = Q.alignmentPositions(v).length, alignCount = al ? al * al - 3 : 0;
      fill(vFacts, 
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
      fill(fView, plate(e, { highlight: cells, max: '280px', label: 'Format strip highlighted' }));
      const raw = cells.map(([x, y]) => e.modules[y * e.size + x]);
      const xor = [1, 0, 1, 0, 1], plain = raw.map((b, i) => b ^ xor[i]);
      fill(fBits, h('table.qr-table.qr-bits', null,
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

  // Level 3: from characters to bits to modules, and why the mask is there
  function bitsLesson() {
    let text = 'HELLO WORLD';
    const modesView = h('div'), streamView = h('div.stack'), placeView = h('div.qr-stage'), placeInfo = h('div.stack'), maskView = h('div.stack');
    let e, k = 0, playing = null, maskPick = null, patternOnly = false;
    const kSlider = h('input', { type: 'range', id: 'qr-place-k', min: 0, value: 0, 'aria-label': 'Codeword', oninput: ev => { k = +ev.target.value; paintPlace(); } });
    const playBtn = h('button.btn.sm', { type: 'button', id: 'qr-place-play', onclick: () => togglePlay() });

    function paintAll() {
      e = Q.encode(text || ' ', { ec: 'L' });
      k = Math.min(k, e.stream.length - 1);
      kSlider.max = e.stream.length - 1;
      paintModes(); paintStream(); paintPlace(); maskPick = null; paintMasks();
    }
    function paintModes() {
      const rows = ['numeric', 'alnum', 'byte'].map(mode => {
        let bits = null;
        try { bits = Q.encode(text || ' ', { ec: 'L', mode }).bits.segment; } catch (err) { bits = null; }
        const fits = mode === 'numeric' ? /^\d*$/.test(text) : mode === 'alnum' ? [...text].every(c => Q.ALNUM.includes(c)) : true;
        return h('tr', { class: e.mode === mode ? 'qr-row-on' : '' },
          h('td', null, h('b', null, { numeric: 'Numeric', alnum: 'Alphanumeric', byte: 'Byte' }[mode])),
          h('td.mono', null, { numeric: '0–9', alnum: '0–9 A–Z space $%*+-./:', byte: 'anything (UTF-8)' }[mode]),
          h('td.num', null, { numeric: '3⅓', alnum: '5½', byte: '8+' }[mode]),
          h('td.num', null, fits && bits != null ? `${bits}` : '—'));
      });
      fill(modesView, h('table.qr-table', null,
        h('thead', null, h('tr', null, h('th', null, 'Mode'), h('th', null, 'Characters'), h('th', null, 'Bits / char'), h('th', null, 'Bits here'))),
        h('tbody', null, rows)),
        h('p.faint', { style: { fontSize: 'var(--t-xs)', marginTop: '8px' } }, `“${text.slice(0, 40)}” uses ${{ numeric: 'numeric', alnum: 'alphanumeric', byte: 'byte' }[e.mode]} mode: the most compact one that can hold every character.`));
    }
    function paintStream() {
      const groups = Q.bitGroups(e);
      const names = { mode: 'Mode', count: 'Count', data: 'Data', terminator: 'Terminator', padbits: 'Pad bits', padbyte: 'Pad byte' };
      fill(streamView, 
        h('div.qr-bitstream', null, groups.slice(0, 60).map(g => h('span', { class: `qr-bitgroup ${g.kind}`, title: names[g.kind] }, h('small', null, g.label), h('code', null, g.bits)))),
        groups.length > 60 ? h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, `… and ${groups.length - 60} more groups.`) : null,
        h('p.muted', { style: { fontSize: 'var(--t-sm)' } }, `${e.bits.segment} bits of message, ${e.bits.terminator} terminator, ${e.bits.padBits} to finish the byte, then ${e.bits.padBytes} pad bytes fill version ${e.version}-L’s ${e.data.length} data codewords. Reed–Solomon then adds ${e.stream.length - e.data.length} check codewords.`),
        h('div.qr-bytes.mono', null, e.stream.map((b, i) => h('span', { class: i < e.data.length ? '' : 'ecc', title: `Codeword ${i + 1}` }, b.toString(16).padStart(2, '0').toUpperCase()))));
    }
    function paintPlace() {
      const cells = [];
      for (let i = 0; i < e.size * e.size; i++) if (e.codeword[i] === k) cells.push([i % e.size, Math.floor(i / e.size)]);
      fill(placeView, plate(e, { highlight: cells, max: '320px', label: `Codeword ${k + 1} highlighted` }));
      kSlider.value = k;
      const o = e.owner[k], b = e.stream[k];
      fill(placeInfo, 
        h('div.row', null, h('b', null, `Codeword ${k + 1} of ${e.stream.length}`), h('span', { class: `chip ${o.ecc ? 'blue' : 'mark'}` }, o.ecc ? 'error correction' : 'data'), h('span.chip.mono', null, `0x${b.toString(16).padStart(2, '0').toUpperCase()} = ${b.toString(2).padStart(8, '0')}`)),
        h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, `Block ${o.block + 1}, ${o.ecc ? 'check' : 'data'} byte ${o.index + 1}. The stored modules differ from these bits wherever mask ${e.mask} flips them.`));
      fill(playBtn, playing ? icon('pause') : icon('play'), playing ? 'Pause' : 'Play the zig-zag');
    }
    function togglePlay() {
      if (playing) { playing(); live.delete(playing); playing = null; paintPlace(); return; }
      const id = setInterval(() => { k = (k + 1) % e.stream.length; paintPlace(); }, 280);
      playing = onStop(() => clearInterval(id));
      paintPlace();
    }
    function paintMasks() {
      const trials = Q.MASKS.map((_, m) => Q.encode(text || ' ', { ec: 'L', mask: m }));
      const best = e.mask;
      const shown = maskPick ?? best;
      const t = trials[shown], pen = t.penalties[shown];
      fill(maskView, 
        h('div.qr-masks', null, trials.map((tr, m) => h('button', { type: 'button', id: `qr-mask-${m}`, class: `qr-mask${m === shown ? ' on' : ''}${m === best ? ' best' : ''}`, 'aria-pressed': String(m === shown), onclick: () => { maskPick = m; paintMasks(); } },
          plate(patternOnly ? Q.maskPattern(e.version, m) : tr, { quiet: 1, label: `Mask ${m}` }), h('span.mono', null, `${m} · ${tr.penalties[m].total}`)))),
        h('div.row', null, h('label.row', { for: 'qr-mask-pattern', style: { fontSize: 'var(--t-sm)' } }, h('input', { type: 'checkbox', id: 'qr-mask-pattern', checked: patternOnly, onchange: ev => { patternOnly = ev.target.checked; paintMasks(); } }), 'Show only the pattern each mask flips')),
        h('table.qr-table', null, h('tbody', null,
          h('tr', null, h('th', null, `Mask ${shown}`), h('td.mono', { colspan: 2 }, Q.MASK_FORMULAS[shown])),
          h('tr', null, h('td', null, 'Runs of 5+ same colour'), h('td.num', null, pen.runs), h('td.faint', null, '3 + 1 per extra module')),
          h('tr', null, h('td', null, '2×2 blocks'), h('td.num', null, pen.blocks), h('td.faint', null, '3 each')),
          h('tr', null, h('td', null, 'Finder look-alikes'), h('td.num', null, pen.finderLike), h('td.faint', null, '40 each')),
          h('tr', null, h('td', null, 'Dark/light balance'), h('td.num', null, pen.balance), h('td.faint', null, `${pen.darkPct.toFixed(1)}% dark`)),
          h('tr', null, h('th', null, 'Total'), h('td.num', null, h('b', null, pen.total)), h('td', null, shown === best ? h('span.chip.mark', null, 'lowest: chosen') : `${pen.total - trials[best].penalties[best].total} more than mask ${best}`)))));
    }

    const textIn = h('input.input', { id: 'qr-bits-text', value: text, 'aria-label': 'Text to encode', oninput: Bench.debounce(ev => { text = ev.target.value; paintAll(); }, 200) });
    const samples = h('div.row.qr-examples', null, [['Digits', '20261017'], ['Shouty URL', 'HTTPS://BENCH.EXAMPLE/QR'], ['Normal URL', 'https://bench.example/qr'], ['Emoji', 'Hi ☕']].map(([n, t], i) =>
      h('button.chip', { type: 'button', id: `qr-bits-sample-${i}`, onclick: () => { textIn.value = text = t; paintAll(); } }, n)));
    paintAll();
    return [
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '1 · Pick a mode')), h('div.sheet-body.stack', null,
        h('p', null, 'Before anything is drawn, the text becomes bits. QR has compact modes for digits and for upper-case text; anything else is byte mode. That’s why codes printed with SHOUTY URLs can be smaller.'),
        h('label.field', { for: 'qr-bits-text' }, h('span', null, 'Your text'), textIn), samples, modesView)),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '2 · The bit stream')), h('div.sheet-body.stack', null,
        h('p', null, 'Four bits name the mode, a count says how many characters follow, then the characters themselves. A terminator, a few zeros to finish the byte, and alternating pad bytes fill what’s left. Then it’s cut into 8-bit codewords.'), streamView)),
      h('div.grid.qr-lesson', null,
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '3 · Zig-zag placement')), h('div.sheet-body.stack', null, placeView, h('label.field', { for: 'qr-place-k' }, h('span', null, 'Codeword'), kSlider), h('div.row', null, playBtn))),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Two columns at a time')), h('div.sheet-body.stack', null,
          h('p', null, 'Codewords are laid into the free modules starting at the bottom right, in columns two modules wide: right then left, climbing up, then down the next column, then up again, skipping anything reserved. The vertical timing column is jumped over.'), placeInfo))),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '4 · Masks')), h('div.sheet-body.stack', null,
        h('p', null, 'Raw data can accidentally draw big blobs or something that looks like a finder. So the encoder XORs the data area with each of eight patterns, scores the results, and keeps the least troublesome. Tap a mask to see its score.'), maskView))];
  }

  // Level 4: blocks, the repair budget, and a damage lab
  function eccLesson() {
    let ec = 'M', version = 5, block = 0;
    const text = 'https://bench.example/qr/level-4?lesson=error-correction';
    let e, flipped = new Set(), paintTo = null;
    const blocksView = h('div.qr-stage'), blocksTable = h('div'), labView = h('div.qr-stage'), labBars = h('div.stack'), labStatus = h('div', { 'aria-live': 'polite' });
    const rsView = h('div.stack');
    let rsBlock = null;

    function build() { e = Q.encode(text, { ec, version }); flipped = new Set(); block = Math.min(block, Q.blockLayout(version, ec).length - 1); rsBlock = null; }
    function paintBlocks() {
      const cells = [];
      for (let i = 0; i < e.size * e.size; i++) if (e.codeword[i] >= 0 && e.owner[e.codeword[i]].block === block) cells.push([i % e.size, Math.floor(i / e.size)]);
      fill(blocksView, plate(e, { highlight: cells, max: '320px', label: `Block ${block + 1} highlighted` }));
      const layout = Q.blockLayout(version, ec);
      fill(blocksTable, h('table.qr-table', null,
        h('thead', null, h('tr', null, h('th', null, 'Block'), h('th', null, 'Data'), h('th', null, 'Check'), h('th', null, 'Repairs'))),
        h('tbody', null, layout.map((b, i) => h('tr', { class: i === block ? 'qr-row-on' : '' },
          h('td', null, h('button.btn.sm.ghost', { type: 'button', id: `qr-block-${i}`, 'aria-pressed': String(i === block), onclick: () => { block = i; paintBlocks(); } }, `Block ${i + 1}`)),
          h('td.num', null, b.data), h('td.num', null, b.ecc), h('td.num', null, `${Math.floor(b.ecc / 2)} codewords`))))),
        h('p.faint', { style: { fontSize: 'var(--t-xs)', marginTop: '8px' } }, `Version ${version}-${ec}: ${Q.totalCodewords(version)} codewords, ${Q.dataCodewords(version, ec)} of them data. Notice how a block’s modules are spread all over the symbol.`));
    }
    function current() { const m = e.modules.slice(); for (const i of flipped) m[i] ^= 1; return m; }
    function paintLab() {
      const m = current();
      fill(labView, plate({ ...e, modules: m }, { highlight: [...flipped].map(i => [i % e.size, Math.floor(i / e.size)]), onCell, max: '320px', label: 'Code you can damage' }));
      const dmg = Q.blockDamage(e, m);
      fill(labBars, ...dmg.map((b, i) => {
        const over = b.errors > b.budget;
        return h('div.qr-blockbar', null, h('span.mono', null, `B${i + 1}`),
          h('div.qr-bar', { 'aria-hidden': 'true' }, h('i', { style: { width: pct(Math.min(1, b.errors / Math.max(1, b.budget))), background: over ? 'var(--bad)' : b.errors / b.budget > 0.7 ? 'var(--warn)' : 'var(--ink)' } })),
          h('span.mono', { class: over ? 'qr-over' : '' }, `${b.errors}/${b.budget}`));
      }));
      fill(labStatus, decodeStatus({ modules: m }));
    }
    function onCell([x, y], phase) {
      if (x < 0 || y < 0 || x >= e.size || y >= e.size) return;
      const i = y * e.size + x;
      if (phase === 'down') paintTo = !flipped.has(i);
      if (paintTo && !flipped.has(i)) flipped.add(i); else if (!paintTo && flipped.has(i)) flipped.delete(i); else return;
      paintLab();
    }
    function blob() {
      const cx = 8 + Math.random() * (e.size - 16), cy = 8 + Math.random() * (e.size - 16);
      for (let y = 0; y < e.size; y++) for (let x = 0; x < e.size; x++) if (Math.hypot(x - cx, y - cy) < 3 && Math.random() < 0.8) flipped.add(y * e.size + x);
      paintLab();
    }
    function paintRs() {
      const layout = Q.blockLayout(version, ec), b0 = layout[0];
      if (!rsBlock) rsBlock = { orig: e.blocks[0].data.concat(e.blocks[0].ecc), cur: e.blocks[0].data.concat(e.blocks[0].ecc) };
      const work = rsBlock.cur.slice();
      const fixed = Q.rsCorrect(work, b0.ecc);
      const bad = rsBlock.cur.map((v, i) => v !== rsBlock.orig[i]);
      const nBad = bad.filter(Boolean).length;
      fill(rsView, 
        h('div.qr-bytes.mono.qr-rs', null, rsBlock.cur.map((v, i) => h('button', { type: 'button', id: `qr-rs-${i}`, class: `${i < b0.data ? '' : 'ecc'}${bad[i] ? ' hit' : ''}`, title: `${i < b0.data ? 'Data' : 'Check'} byte ${i + 1}: tap to corrupt`, onclick: () => { rsBlock.cur[i] = bad[i] ? rsBlock.orig[i] : rsBlock.orig[i] ^ (0x5a + i); paintRs(); } }, v.toString(16).padStart(2, '0').toUpperCase()))),
        h('div.row', null,
          fixed === null ? h('span.chip.bad', null, `${nBad} wrong: past repair`) : nBad ? h('span.chip.good', null, icon('check'), `Found and fixed ${fixed.length} byte${fixed.length > 1 ? 's' : ''}`) : h('span.chip', null, 'No errors: every check sum is zero'),
          h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, `Budget: ${Math.floor(b0.ecc / 2)} unknown errors`),
          nBad ? h('button.btn.sm.ghost', { type: 'button', id: 'qr-rs-reset', onclick: () => { rsBlock = null; paintRs(); } }, icon('reset'), 'Reset') : null));
    }
    function paintAll() { paintBlocks(); paintLab(); paintRs(); }
    const ecSeg = h('div.seg', { role: 'group', 'aria-label': 'Error-correction level' }, 'LMQH'.split('').map(x => h('button', { type: 'button', id: `qr-ecc-${x}`, 'aria-pressed': String(ec === x), onclick: ev => { ec = x; press(ev); build(); paintAll(); } }, `${x} · ${Q.EC[x].recover}%`)));
    const vSeg = h('div.seg', { role: 'group', 'aria-label': 'Version' }, [3, 5, 10].map(v => h('button', { type: 'button', id: `qr-ecc-v${v}`, 'aria-pressed': String(version === v), onclick: ev => { version = v; press(ev); build(); paintAll(); } }, `v${v}`)));
    build(); paintAll();
    return [
      h('section.sheet', null, h('div.sheet-body.row', null, h('span.faint', { style: { fontSize: 'var(--t-sm)' } }, 'Code for this lesson'), vSeg, ecSeg)),
      h('div.grid.qr-lesson', null,
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '1 · Blocks')), h('div.sheet-body.stack', null, blocksView)),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Split, then interleave')), h('div.sheet-body.stack', null,
          h('p', null, 'The data codewords are split into blocks, and each block gets its own Reed–Solomon check codewords. Then the blocks are interleaved: one codeword from each in turn. So a scratch in one place costs every block a little, instead of wiping out one.'), blocksTable))),
      h('div.grid.qr-lesson', null,
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '2 · Damage lab')), h('div.sheet-body.stack', null, labView, labStatus,
          h('div.row', null, h('button.btn.sm', { type: 'button', id: 'qr-ecc-blob', onclick: blob }, 'Add a smudge'),
            h('button.btn.sm.ghost', { type: 'button', id: 'qr-ecc-repair', onclick: () => { flipped = new Set(); paintLab(); } }, icon('reset'), 'Repair')))),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Each block’s budget')), h('div.sheet-body.stack', null,
          h('p', null, 'Drag across the code or add smudges. Each bar counts the codewords that block has lost against what it can repair: half its check codewords. The code reads only while every bar stays inside its budget.'), labBars))),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '3 · Inside one block')), h('div.sheet-body.stack', null,
        h('p', null, 'These are block 1’s bytes: data, then check bytes (highlighted). Tap bytes to corrupt them. Reed–Solomon treats the bytes as a polynomial and the check bytes make it divisible by a known one, so any change leaves a remainder that pinpoints which bytes are wrong and by how much, up to half the number of check bytes.'), rsView))];
  }

  // Level 5: what codes hold, where you meet them, and what a phone does with them
  const TIPS = {
    wifi: 'Check the network name matches the place you’re in. An open network lets others see your traffic.',
    contact: 'Nothing is saved until you tap Save. Check the name and number first.',
    email: 'It only drafts the email; you still press Send.',
    sms: 'It only drafts the text. Short numbers can sign you up to paid services.',
    call: 'Your phone shows the number before dialling. Check it.',
    map: 'It’s just coordinates. Check the place name before you set off.',
    event: 'Check the date, time and time zone before you add it.',
    otp: 'Only scan one when you started 2FA setup yourself, on the real site.',
    pay: 'Scanning a payment code sends money. Check payee and amount.',
    web: 'Read the domain before you open it (Level 6).',
    app: 'Check it’s the official store and the right developer.',
    text: 'Just a number or text. Your phone may offer a web search.',
  };
  const GROUPS = [['all', 'All'], ['connect', 'Connect'], ['plan', 'Places & time'], ['money', 'Money'], ['web', 'Web & apps'], ['security', 'Security']];
  const GROUP_OF = { wifi: 'connect', contact: 'connect', email: 'connect', sms: 'connect', call: 'connect', map: 'plan', event: 'plan', pay: 'money', web: 'web', app: 'web', text: 'web', otp: 'security' };

  function wildLesson() {
    let group = 'all';
    const guide = h('div.qr-guide'), seg = h('div.seg', { role: 'group', 'aria-label': 'Filter' });
    const paintGuide = () => {
      fill(seg, GROUPS.map(([id, label]) => h('button', { type: 'button', id: `qr-guide-${id}`, 'aria-pressed': String(group === id), onclick: () => { group = id; paintGuide(); } }, label)));
      fill(guide, L.WILD.filter(w => group === 'all' || GROUP_OF[w.act] === group).map(w => {
        const c = P.classify(w.text), e = Q.encode(w.text, { ec: 'M' });
        return h('article.qr-card', null,
          plate(e, { label: c.label, quiet: 2 }),
          h('div.stack', { style: { gap: '6px', minWidth: 0 } },
            h('div.row', null, h('b', null, c.label), h('span.chip', null, L.ACTIONS[w.act])),
            h('div.faint', { style: { fontSize: 'var(--t-xs)' } }, w.where),
            h('code.qr-snippet', null, w.text.length > 64 ? w.text.slice(0, 64) + '…' : w.text),
            h('p', { style: { fontSize: 'var(--t-sm)' } }, TIPS[w.act]),
            h('div', null, h('button.btn.sm.ghost', { type: 'button', onclick: () => { setUi({ inspect: w.text, tab: 'inspect' }); Bench.navigate('qr'); } }, 'Inspect', icon('arrow')))));
      }));
    };
    paintGuide();

    const staticText = 'https://cafe-luna.example/menus/autumn-2026/dinner?table=12&lang=en';
    const dynText = 'https://qrco.de/b7Kx';
    const pair = [[staticText, 'Static', 'The whole address is in the pattern. Nothing can change it, and it works as long as the site does.'], [dynText, 'Dynamic', 'A short link to a forwarding service. The owner can change the destination after printing, and can count scans. If the service lapses, the code dies.']];

    const others = [
      ['Data Matrix', 'Small square with an L-shaped solid edge', 'Medicine packs, electronics parts, postage'],
      ['Aztec', 'A single bullseye in the centre', 'Boarding passes, train tickets'],
      ['PDF417', 'A wide stack of barcode-like rows', 'Driving licences, IDs, some boarding passes'],
      ['Micro QR', 'One finder square only', 'Tiny parts, where space is tight'],
      ['rMQR', 'A long thin rectangle with finders at both ends', 'Narrow labels and edges'],
    ];
    return [
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '1 · Field guide'), h('div.actions', null, seg)), h('div.sheet-body.stack', null,
        h('p', null, 'A code is just text. What your phone does depends on how that text starts: https:// opens a browser, WIFI: offers to join, BEGIN:VCARD offers to save a contact, upi:// or BCD opens a payment. Learn the openings and you know what a code does before it does it.'), guide)),
      h('div.grid.qr-lesson', null, pair.map(([t, name, why]) => {
        const e = Q.encode(t, { ec: 'M' });
        return h('section.sheet', null, h('div.sheet-head', null, h('h2', null, `2 · ${name}`), h('span.chip.mono', null, `v${e.version} · ${e.size}×${e.size}`)), h('div.sheet-body.stack', null,
          plate(e, { max: '200px', label: `${name} code` }), h('code.qr-snippet', null, t), h('p', null, why)));
      })),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '3 · Not every square code is QR')), h('div.sheet-body', null,
        h('table.qr-table', null, h('thead', null, h('tr', null, h('th', null, 'Symbol'), h('th', null, 'How to spot it'), h('th', null, 'Where you meet it'))),
          h('tbody', null, others.map(([n, look, where]) => h('tr', null, h('td', null, h('b', null, n)), h('td', null, look), h('td', null, where))))),
        h('p.faint', { style: { fontSize: 'var(--t-xs)', marginTop: '10px' } }, 'Three finder squares in three corners means QR. Everything in this course applies to those.')))];
  }

  // Level 6: read links like an expert, spot traps, and decode a code with your own eyes
  function safeLesson(go) {
    const urlIn = h('input.input.mono', { id: 'qr-url', value: 'https://paypal.com.secure-login.example/signin?ref=qr', spellcheck: 'false', 'aria-label': 'Link to read' });
    const urlOut = h('div.stack');
    const paintUrl = () => {
      const parts = P.urlParts(urlIn.value);
      if (!parts) { fill(urlOut, h('p.faint', null, 'That doesn’t parse as a link.')); return; }
      const c = P.classify(urlIn.value), v = P.verdict(c);
      const names = { scheme: 'scheme', userinfo: 'ignored', subdomain: 'their label', owner: 'the real site', port: 'port', path: 'page', query: 'details', fragment: 'anchor' };
      fill(urlOut,
        h('div.qr-url', null, parts.parts.map(pt => h('span', { class: `qr-url-${pt.kind}` }, h('code', null, pt.text), h('small', null, names[pt.kind])))),
        h('div.row', null, h('span', { class: `chip ${v === 'fine' ? 'good' : v === 'careful' ? 'warn' : 'bad'}` }, L.VERDICT[v]), h('span', null, 'This opens ', h('b', null, parts.owner), parts.secure ? '' : ', unencrypted', '.')),
        c.flags.length ? h('ul.list.qr-flags', null, c.flags.map(f => h('li', null, h('span', { class: `chip ${f.level === 'info' ? 'blue' : f.level}` }, f.level === 'info' ? 'Note' : f.level === 'warn' ? 'Careful' : 'Danger'), h('span.grow', null, f.msg)))) : null);
    };
    urlIn.addEventListener('input', Bench.debounce(paintUrl, 150));
    paintUrl();
    const urlSamples = h('div.row.qr-examples', null, [['Lookalike', 'https://pаypal.com/'], ['@ trick', 'https://apple.com@id-verify.example/'], ['Real', 'https://www.bbc.co.uk/news'], ['Shortened', 'https://bit.ly/3xQz9Lm'], ['Raw IP', 'http://192.168.4.20/pay']].map(([n, u], i) =>
      h('button.chip', { type: 'button', id: `qr-url-sample-${i}`, onclick: () => { urlIn.value = u; paintUrl(); } }, n)));

    return [
      h('div.grid.qr-lesson', null,
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '1 · Read before you open')), h('div.sheet-body', null,
          h('ol.qr-steps', null,
            h('li', null, h('b', null, 'What is it?'), ' Link, Wi-Fi, contact, payment, login? The first characters tell you.'),
            h('li', null, h('b', null, 'Where does it go?'), ' Find the real site: the name just before the ending (.com, .co.uk). Ignore everything left of it and anything before an @.'),
            h('li', null, h('b', null, 'Does it fit the place?'), ' A menu should open a menu. A parking sign shouldn’t open a download.'),
            h('li', null, h('b', null, 'Has it been tampered with?'), ' Stickers over printed codes, codes in unexpected emails or parcels.'),
            h('li', null, h('b', null, 'Never type secrets after a scan.'), ' If it asks you to log in or pay, go to the site or app yourself instead.')))),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '2 · Anatomy of a link')), h('div.sheet-body.stack', null, urlIn, urlSamples, urlOut))),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '3 · Traps in the real world')), h('div.sheet-body.qr-traps', null,
        L.PHYSICAL.map((q, i) => h('details', { id: `qr-trap-${i}` }, h('summary', null, q.prompt), h('p', null, h('b', null, q.answer), '. ', q.why))))),
      ...handDecode()];
  }

  // Decode a version 1 numeric code one step at a time, then try one alone
  function handDecode() {
    let text, e, step = 0;
    const view = h('div.qr-stage'), side = h('div.stack');
    const bitsAt = (from, n) => e.placement.slice(from, from + n);
    const val = idxs => idxs.reduce((a, i) => (a << 1) | e.unmasked[i], 0);
    const cellsOf = idxs => idxs.map(i => [i % e.size, Math.floor(i / e.size)]);
    function newCode() {
      text = String(Math.floor(10 ** (2 + Math.random() * 3)));
      e = Q.encode(text, { ec: 'L', version: 1, mode: 'numeric' });
      step = 0;
    }
    function steps() {
      const out = [];
      const fb = [14, 13, 12, 11, 10].map(i => (e.format >>> i) & 1);
      out.push({ title: 'Read the format strip', cells: [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8]], masked: true, text: `The modules read ${fb.join(' ')}. XOR with 1 0 1 0 1 gives ${fb.map((b, i) => b ^ [1, 0, 1, 0, 1][i]).join(' ')}: level ${e.ec}, mask ${e.mask} (${Q.MASK_FORMULAS[e.mask]}).` });
      out.push({ title: 'Undo the mask', cells: [], masked: false, text: `Flip every data module where ${Q.MASK_FORMULAS[e.mask]}. Now the modules are the raw bits.` });
      out.push({ title: 'Mode: 4 bits', idx: bitsAt(0, 4), text: idx => `Start bottom-right; read right then left, moving up. ${idx.map(i => e.unmasked[i]).join('')} = numeric mode.` });
      out.push({ title: 'Count: 10 bits', idx: bitsAt(4, 10), text: idx => `${idx.map(i => e.unmasked[i]).join('')} = ${val(idx)} digits follow.` });
      let pos = 14, read = '';
      for (let i = 0; i < text.length; i += 3) {
        const g = text.slice(i, i + 3), n = g.length * 3 + 1, idx = bitsAt(pos, n);
        pos += n; read += g;
        const soFar = read;
        out.push({ title: `Digits: ${n} bits`, idx, text: ix => `${ix.map(j => e.unmasked[j]).join('')} = ${String(val(ix)).padStart(g.length, '0')}. So far: ${soFar}.` });
      }
      out.push({ title: 'Done', idx: bitsAt(pos, 4), text: () => `Then 0000, the terminator, and padding. The code says “${text}”.` });
      return out;
    }
    function paint() {
      const all = steps(), st = all[step];
      const shown = st.masked ? e : { ...e, modules: maskedOff() };
      const cells = st.cells || cellsOf(st.idx || []);
      fill(view, plate(shown, { highlight: cells, max: '300px', label: st.masked ? 'Masked code' : 'Unmasked bits' }));
      fill(side,
        h('div.row', null, h('span.chip.mono', null, `${step + 1} / ${all.length}`), h('b', null, st.title)),
        h('p', null, typeof st.text === 'function' ? st.text(st.idx) : st.text),
        h('div.row', null,
          h('button.btn.sm', { type: 'button', id: 'qr-hand-back', disabled: step === 0, onclick: () => { step--; paint(); } }, 'Back'),
          h('button.btn.sm.primary', { type: 'button', id: 'qr-hand-next', disabled: step === all.length - 1, onclick: () => { step++; paint(); } }, 'Next', icon('arrow')),
          h('button.btn.sm.ghost', { type: 'button', id: 'qr-hand-new', onclick: () => { newCode(); paint(); } }, icon('dice'), 'Another code')));
    }
    // The data area without the mask, function patterns as printed
    function maskedOff() {
      const m = e.modules.slice();
      for (let y = 0; y < e.size; y++) for (let x = 0; x < e.size; x++) { const i = y * e.size + x; if (e.codeword[i] >= 0 || e.role[i] === Q.ROLE.remainder) m[i] = e.unmasked[i]; }
      return m;
    }
    newCode(); paint();

    // Your turn
    let t2, e2, hint = false;
    const tryView = h('div.qr-stage'), tryOut = h('div', { 'aria-live': 'polite' });
    const tryIn = h('input.input.mono', { id: 'qr-hand-answer', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'The number in the code', placeholder: 'Digits' });
    function newTry() { t2 = String(Math.floor(10 + Math.random() * 990)); e2 = Q.encode(t2, { ec: 'L', version: 1, mode: 'numeric' }); hint = false; tryIn.value = ''; fill(tryOut); paintTry(); }
    function paintTry() {
      fill(tryView, plate(e2, { max: '260px', label: 'Code to decode by hand', highlight: hint ? e2.placement.slice(0, 14 + Math.ceil(t2.length / 3) * 10).map(i => [i % e2.size, Math.floor(i / e2.size)]) : [] }));
    }
    function check() {
      const ok = tryIn.value.trim() === t2;
      store.set('qr', L.record(progress(), 'safe.handdecode', ok, today()));
      fill(tryOut, h('span', { class: `chip ${ok ? 'good' : 'bad'}` }, ok ? icon('check') : icon('x'), ok ? 'Read by hand. Nicely done.' : `It holds ${t2}`));
    }
    tryIn.addEventListener('keydown', ev => { if (ev.key === 'Enter') check(); });
    newTry();
    return [
      h('div.grid.qr-lesson', null,
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, '4 · Decode one by hand')), h('div.sheet-body.stack', null, view)),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Step by step')), h('div.sheet-body.stack', null,
          h('p.muted', null, 'A version 1 code holding a few digits, read exactly the way a scanner does. Everything you’ve learnt in levels 1–4 in one go.'), side))),
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Your turn')), h('div.sheet-body.qr-try', null, tryView,
        h('div.stack', null,
          h('p', null, `This version 1 code, level L, holds a number. Read its format strip, undo the mask, and follow the zig-zag. What number is it?`),
          h('div.row', { style: { flexWrap: 'nowrap' } }, tryIn, h('button.btn.primary', { type: 'button', id: 'qr-hand-check', onclick: check }, 'Check')),
          tryOut,
          h('div.row', null,
            h('button.btn.sm.ghost', { type: 'button', id: 'qr-hand-hint', onclick: () => { hint = !hint; paintTry(); } }, 'Highlight the bits to read'),
            h('button.btn.sm.ghost', { type: 'button', id: 'qr-hand-try', onclick: newTry }, icon('dice'), 'Another one')))))];
  }

  // ---------------------------------------------------------------- Scan
  function scanTab(go) {
    const canvas = h('canvas.qr-photo', { 'aria-label': 'Camera or photo' });
    const video = h('video', { playsinline: true, muted: true, autoplay: true, style: { display: 'none' } });
    video.muted = true;
    const overlay = h('div.qr-overlay');
    const stage = h('div.qr-scanstage', null, h('div.qr-scanframe', null, canvas, overlay), h('div.qr-scanhint', null, icon('qr'), h('span', null, 'Point the camera at a code, choose a photo, or paste an image.')));
    const status = h('div', { 'aria-live': 'polite' });
    const result = h('div.stack');
    const camBtn = h('button.btn.primary', { type: 'button', id: 'qr-camera', onclick: () => (stream ? stopCamera() : startCamera()) });
    const fileIn = h('input', { type: 'file', id: 'qr-photo', accept: 'image/*', class: 'visually-hidden', onchange: ev => { const f = ev.target.files[0]; if (f) readFile(f); ev.target.value = ''; } });
    let stream = null, timer = null;

    const paintCam = () => fill(camBtn, icon(stream ? 'pause' : 'play'), stream ? 'Stop camera' : 'Use camera');
    paintCam();

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        fill(status, h('span.chip.warn', null, 'No camera here'), ' ', h('span.muted', { style: { fontSize: 'var(--t-sm)' } }, window.isSecureContext === false ? 'Browsers only allow the camera on https pages. Choose a photo instead.' : 'This browser or frame can’t use the camera. Choose a photo instead.'));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (err) {
        stream = null;
        fill(status, h('span.chip.warn', null, 'Camera unavailable'), ' ', h('span.muted', { style: { fontSize: 'var(--t-sm)' } }, err && err.name === 'NotAllowedError' ? 'Permission was denied. Allow the camera, or choose a photo instead.' : 'No camera could be opened. Choose a photo instead.'));
        return;
      }
      video.srcObject = stream;
      try { await video.play(); } catch (err) { /* autoplay will start it */ }
      stage.classList.add('live');
      paintCam();
      fill(status, h('span.faint', null, 'Looking for a code…'));
      const tick = () => {
        if (!stream) return;
        if (video.readyState >= 2 && video.videoWidth) {
          const img = grab(video, video.videoWidth, video.videoHeight, 720);
          const res = S.scan(img);
          drawOverlay(res, img);
          if (res.ok) { stopCamera(); show(res, 'camera'); return; }
          if (res.finders && res.finders.length) fill(status, h('span.faint', null, explainMiss(res)));
        }
        timer = setTimeout(tick, 140);
      };
      tick();
    }
    function stopCamera() {
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
      video.srcObject = null;
      stage.classList.remove('live');
      paintCam();
    }
    onStop(stopCamera);

    // Draw a frame or photo into the canvas (at most `max` px on a side) and return its pixels
    function grab(src, w, h0, max) {
      const k = Math.min(1, max / Math.max(w, h0));
      canvas.width = Math.round(w * k); canvas.height = Math.round(h0 * k);
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(src, 0, 0, canvas.width, canvas.height);
      stage.classList.add('has-image');
      return g.getImageData(0, 0, canvas.width, canvas.height);
    }

    function readFile(file) {
      stopCamera();
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let res = null, pixels = null;
        // Try a sharp large copy first, then smaller ones (big photos can be noisy)
        for (const max of [1200, 800, 500]) {
          pixels = grab(img, img.naturalWidth, img.naturalHeight, max);
          res = S.scan(pixels);
          if (res.ok) break;
        }
        URL.revokeObjectURL(url);
        drawOverlay(res, pixels);
        if (res.ok) show(res, 'photo');
        else { fill(result); fill(status, h('span.chip.bad', null, 'Not read'), ' ', h('span.muted', { style: { fontSize: 'var(--t-sm)' } }, explainMiss(res))); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); toast('That file isn’t an image this browser can open'); };
      img.src = url;
    }
    const onPaste = ev => {
      const item = [...(ev.clipboardData ? ev.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
      if (item) { ev.preventDefault(); readFile(item.getAsFile()); }
    };
    document.addEventListener('paste', onPaste);
    onStop(() => document.removeEventListener('paste', onPaste));

    function explainMiss(res) {
      const n = (res.finders || []).length;
      if (res.stage === 'finders') return n ? `Found ${n} finder square${n > 1 ? 's' : ''} so far. All three need to be in view with a little margin.` : 'No finder squares yet. Fill more of the frame with the code and hold steady.';
      if (res.stage === 'triangle') return 'Found square shapes, but not three in a QR layout. Move closer or straighten up.';
      if (res.stage === 'format') return 'Found the code, but the format strip by the finders is unreadable. Try more light or less glare.';
      if (res.stage === 'ecc') return 'Found the code and laid a grid on it, but too many modules came out wrong for error correction. Hold steadier, move closer, or flatten the code.';
      return res.error || 'No QR code found.';
    }

    function drawOverlay(res, img) {
      if (!img) { overlay.innerHTML = ''; return; }
      const W = img.width, H = img.height;
      let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
      if (res && res.corners) svg += `<polygon class="qr-ov-shadow" points="${res.corners.map(p => p.join(',')).join(' ')}"/><polygon class="qr-ov-line" points="${res.corners.map(p => p.join(',')).join(' ')}"/>`;
      for (const f of (res && res.finders) || []) svg += `<circle class="qr-ov-shadow" cx="${f.x}" cy="${f.y}" r="${f.size * 4}"/><circle class="qr-ov-line" cx="${f.x}" cy="${f.y}" r="${f.size * 4}"/>`;
      if (res && res.alignment) svg += `<circle class="qr-ov-line" cx="${res.alignment.x}" cy="${res.alignment.y}" r="${(res.finders[0].size || 4) * 2}"/>`;
      overlay.innerHTML = svg + '</svg>';
    }

    function show(res, source) {
      remember(res.text);
      const p = progress();
      const mode = L.scaffold(p, ['cover.version', 'cover.ec', 'cover.mask', 'ecc.budget'], ui().explain);
      const c = P.classify(res.text);
      const steps = [
        ['Finders', 'Three finder squares fix the corners and which way is up.' + (res.inverted ? ' This one is printed light-on-dark, so the scanner inverted it first.' : '') + (res.mirrored ? ' It was mirrored, as if seen from behind.' : '')],
        ['Size', `${res.size} modules across → version ${res.version}.` + (res.alignment ? ' The alignment bullseye corrected the perspective.' : '')],
        ['Format', `Error correction ${res.ec} (~${Q.EC[res.ec].recover}%), mask ${res.mask}.` + (res.formatDistance ? ` The format strip had ${res.formatDistance} bad bit${res.formatDistance > 1 ? 's' : ''}; BCH fixed ${res.formatDistance > 1 ? 'them' : 'it'}.` : '')],
        ['Repair', res.corrected ? `Reed–Solomon fixed ${res.corrected} codeword${res.corrected > 1 ? 's' : ''} across ${res.corrections.filter(Boolean).length} block${res.corrections.filter(Boolean).length > 1 ? 's' : ''}.` : 'Nothing needed repair.'],
        ['Data', `${res.segments.filter(sg => sg.mode !== 'eci').map(sg => `${sg.count} in ${sg.mode} mode`).join(', ')}: ${res.text.length} characters.`],
      ];
      const clean = { version: res.version, size: res.size, modules: Uint8Array.from(res.grid) };
      if (res.mirrored) { const t = new Uint8Array(res.size * res.size); for (let y = 0; y < res.size; y++) for (let x = 0; x < res.size; x++) t[x * res.size + y] = clean.modules[y * res.size + x]; clean.modules = t; }
      const how = mode === 'hide'
        ? h('p.mono.qr-oneline', null, `v${res.version} · ${res.size}² · ${res.ec} · mask ${res.mask} · repaired ${res.corrected}`)
        : h('ol.qr-steps', null, steps.map(([k, v], i) => h('li', null, h('b', null, k), ' ', mode === 'predict' && i > 0 && i < 4
          ? (() => { const b = h('button.btn.sm.ghost', { type: 'button', id: `qr-scan-reveal-${i}`, onclick: () => b.replaceWith(h('span', null, v)) }, 'Guess, then reveal'); return b; })()
          : h('span', null, v))));
      fill(status, h('span.chip.good', null, icon('check'), source === 'camera' ? 'Read from the camera' : 'Read from the photo'));
      const isLink = c.type === 'url' && /^https?:/i.test(c.href || '');
      const risky = c.flags.some(f => f.level === 'bad');
      fill(result, 
        h('div.grid.qr-lesson', null,
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'How it was read')), h('div.sheet-body.stack', null,
            plate(clean, { max: '220px', label: 'The grid the scanner sampled' }), how)),
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Where it leads')), h('div.sheet-body.stack', null, gatedLeadsTo(c, res.text),
            h('div.row', null,
              isLink ? h('a', { class: `btn ${risky ? 'danger' : 'primary'}`, id: 'qr-open-link', href: c.href, target: '_blank', rel: 'noopener noreferrer' }, risky ? 'Open anyway' : 'Open link', icon('arrow')) : null,
              h('button.btn', { type: 'button', id: 'qr-scan-copy', onclick: () => Bench.copy(res.text, 'Contents copied') }, icon('copy'), 'Copy'),
              h('button.btn.ghost', { type: 'button', id: 'qr-scan-inspect', onclick: () => { setUi({ inspect: res.text }); go('inspect'); } }, 'Inspect', icon('arrow')))))),
        history());
    }

    function remember(text) {
      store.update('qr:scans', list => [{ t: text, d: today() }, ...list.filter(x => x.t !== text)].slice(0, 30), []);
    }
    function history() {
      const list = store.get('qr:scans', []);
      if (!list.length) return null;
      return h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Recent scans'), h('div.actions', null, h('button.btn.sm.ghost', { type: 'button', id: 'qr-scans-clear', onclick: () => { store.set('qr:scans', []); result.lastChild && result.lastChild.remove(); } }, icon('trash'), 'Clear'))),
        h('ul.list', null, list.slice(0, 10).map((x, i) => {
          const c = P.classify(x.t);
          return h('li', null, h('span.chip', null, c.label), h('span.grow.title.mono', { style: { fontSize: 'var(--t-sm)' } }, x.t.length > 70 ? x.t.slice(0, 70) + '…' : x.t),
            h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, x.d),
            h('button.btn.sm.ghost', { type: 'button', id: `qr-scan-h-${i}`, onclick: () => { setUi({ inspect: x.t }); go('inspect'); } }, 'Inspect'));
        })));
    }

    fill(result, history() || '');
    return [
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Scan'), h('div.actions', null, camBtn,
        h('label.btn', { for: 'qr-photo' }, icon('upload'), 'Choose photo'), fileIn)),
        h('div.sheet-body.stack', null, stage, video, status,
          h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Everything is read here on your device; nothing is uploaded. Links never open by themselves. You see where they lead first.'))),
      result];
  }

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
      try { e = Q.encode(text || ' ', { ec: 'M' }); } catch (err) { fill(left, h('div.empty', null, h('b', null, 'Too long'), err.message)); fill(right); return; }
      fill(left, plate(e, { max: '320px', label: 'Inspected code' }), coverReading(e, p));
      fill(right, gatedLeadsTo(P.classify(text), text));
    };
    input.addEventListener('input', Bench.debounce(paint, 200));
    paint();
    return [
      h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'What’s inside'), h('div.actions', null, explainSeg(() => go('inspect')))),
        h('div.sheet-body.stack', null, input, h('div.row.qr-examples', null, h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Try:'),
          EXAMPLES.map(([name, t], i) => h('button.chip', { type: 'button', id: `qr-example-${i}`, onclick: () => { input.value = t; paint(); } }, name))),
          h('div.row', null, h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Have the code itself, not its text?'), h('button.btn.sm', { type: 'button', id: 'qr-to-scan', onclick: () => go('scan') }, icon('qr'), 'Scan it')))),
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
        fill(value, btn);
      } else value.append(h('div.faint', { style: { fontSize: 'var(--t-xs)' } }, f.why));
      return [h('dt', null, f.k, h('span.mono.faint', { title: 'Your review box' }, ' ', boxDots(L.boxOf(p, f.skill)))), value];
    }));
  }

  // In "quiz me" mode the tools ask before they tell: safe to open, or what will it do?
  // The answer counts as practice, so using the tool keeps teaching.
  const ACT_OF = { wifi: 'wifi', vcard: 'contact', mecard: 'contact', email: 'email', sms: 'sms', tel: 'call', geo: 'map', event: 'event', otp: 'otp', upi: 'pay', epc: 'pay', swiss: 'pay', crypto: 'pay', gtin: 'text', text: 'text', json: 'text' };
  const judged = new Set();
  function gatedLeadsTo(c, raw) {
    const mode = L.scaffold(progress(), ['safe.verdict', 'wild.types'], ui().explain);
    const isUrl = c.type === 'url';
    const act = isUrl ? (c.kind === 'app-store' ? 'app' : 'web') : ACT_OF[c.type];
    if (mode !== 'predict' || judged.has(raw) || (!isUrl && !act)) return leadsTo(c, mode);
    const box = h('div.stack');
    const skill = isUrl ? 'safe.verdict' : 'wild.types';
    const answer = isUrl ? L.VERDICT[P.verdict(c)] : L.ACTIONS[act];
    const choices = isUrl ? Object.values(L.VERDICT) : [...new Set([answer, ...Object.values(L.ACTIONS).filter(x => x !== answer).slice(0, 3)])];
    const pickOne = choice => {
      judged.add(raw);
      const ok = choice === answer;
      store.set('qr', L.record(progress(), skill, ok, today()));
      fill(box, h('div.row', null, h('span', { class: `chip ${ok ? 'good' : 'bad'}` }, ok ? icon('check') : icon('x'), ok ? `You said “${choice}”: right` : `You said “${choice}”; it’s “${answer}”`)), leadsTo(c, mode));
    };
    fill(box,
      h('p', { style: { fontWeight: 600 } }, isUrl ? 'Before you look: is this safe to open?' : 'Before you look: what will it do?'),
      h('div.qr-choices', null, choices.map((ch, i) => h('button.btn.qr-choice', { type: 'button', id: `qr-gate-${i}`, onclick: () => pickOne(ch) }, ch))),
      h('button.btn.sm.ghost', { type: 'button', id: 'qr-gate-skip', onclick: () => { judged.add(raw); fill(box, leadsTo(c, mode)); } }, 'Just show me'));
    return box;
  }

  function leadsTo(c, mode = 'explain') {
    if (mode === 'hide') {
      const v = P.verdict(c);
      return h('div.stack', null,
        h('div.row', null, h('span', { class: `chip ${v === 'fine' ? 'good' : v === 'careful' ? 'warn' : 'bad'}` }, L.VERDICT[v]), h('b', null, c.label), h('span.muted', null, c.action)),
        c.fields.length ? h('dl.qr-facts', null, c.fields.map(([k, val]) => [h('dt', null, k), h('dd.mono', { style: { overflowWrap: 'anywhere' } }, val)])) : null,
        c.flags.filter(f => f.level !== 'info').map(f => h('div.faint', { style: { fontSize: 'var(--t-xs)' } }, f.msg)));
    }
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
      fill(kindSeg, ...KINDS.map(k => h('button', { type: 'button', id: `qr-make-${k.id}`, 'aria-pressed': String(st.kind === k.id), onclick: () => { st.kind = k.id; save(); paintForm(); paintOut(); } }, k.label)));
      const kind = KINDS.find(k => k.id === st.kind), vals = st.values[st.kind] || (st.values[st.kind] = {});
      fill(form, ...kind.fields.map(([key, label, def, type]) => {
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
      catch (err) { fill(out, h('div.empty', null, h('b', null, 'Too long'), err.message)); return; }
      const c = P.classify(text);
      const mode = L.scaffold(progress(), ['cover.choose', 'cover.contents'], ui().explain);
      const note = mode === 'hide' ? null : h('p.faint', { style: { fontSize: 'var(--t-xs)' } },
        `${text.length} characters in ${e.mode} mode fill ${pct(e.bits.segment / e.bits.capacity)} of version ${e.version} at level ${e.ec}. ${st.ec === 'H' ? 'H leaves room for a logo.' : st.ec === 'L' ? 'L keeps it small but fragile.' : ''} Mask ${e.mask} scored ${e.penalties[e.mask].total} penalty points${st.mask === 'auto' ? ', the lowest of the eight' : ''}.`);
      fill(out, 
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
  const TABS = [['path', 'Path'], ['learn', 'Learn'], ['scan', 'Scan'], ['inspect', 'Inspect'], ['make', 'Make']];
  function render(page) {
    const arg = Bench.takeArg();
    if (arg && typeof arg === 'object') setUi(arg);
    const tabs = h('div.tabs', { role: 'tablist' }), body = h('div.stack', { style: { gap: '22px' } });
    const go = (tab, patch = {}) => { setUi({ tab, ...patch }); paint(); window.scrollTo?.(0, 0); };
    function paint() {
      const t = ui().tab;
      fill(tabs, ...TABS.map(([id, label]) => h('button', { type: 'button', role: 'tab', id: `qr-tab-${id}`, 'aria-selected': String(t === id), onclick: () => go(id) }, label)));
      stopAll();
      const fn = { path: pathTab, learn: learnTab, scan: scanTab, inspect: inspectTab, make: makeTab }[t] || pathTab;
      fill(body, ...fn(go).flat().filter(Boolean));
    }
    const lv = L.recommendedLevel(progress());
    page.append(h('header.page-head', null,
      h('div', null, h('div.eyebrow', null, 'Learn'), h('h1', null, 'QR Codes')),
      h('div.actions', null, progress().exam && progress().exam.passed ? h('span.chip.mark', null, icon('check'), 'Reader') : h('span.chip.mark', null, `Level ${lv} · ${L.LEVELS[lv - 1].title}`))), tabs, body);
    paint();
    return stopAll;
  }

  Bench.module({
    id: 'qr', title: 'QR Codes', short: 'QR', icon: 'qr', group: 'make', key: 'q',
    render,
    badge: () => { const n = L.dueSkills(progress(), today(), readySkills()).length; return n ? String(n) : ''; },
    commands: () => [
      { label: 'Continue QR lesson', run: () => Bench.navigate('qr', { tab: 'learn', level: L.recommendedLevel(progress()) }) },
      { label: 'Review due QR skills', run: () => Bench.navigate('qr', { tab: 'learn', level: 'review' }) },
      { label: 'Scan a QR code', run: () => Bench.navigate('qr', { tab: 'scan' }) },
      { label: 'Make a QR code', run: () => Bench.navigate('qr', { tab: 'make' }) },
      { label: 'Inspect QR contents', run: () => Bench.navigate('qr', { tab: 'inspect' }) },
    ],
  });
})(window.Bench);
