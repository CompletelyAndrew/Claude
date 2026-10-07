/* Bench · Focus
 * Pomodoro timer that survives reloads, generated ambient noise (no
 * audio files), a session log and a 12-week heatmap.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, toast } = Bench;

  const MODES = { work: 'Focus', short: 'Short break', long: 'Long break' };
  const getFocus = () => store.get('focus', { settings: { work: 25, short: 5, long: 15 }, sessions: [] });
  const run = () => store.get('focusRun', { mode: 'work', running: false, endsAt: null, remaining: null, label: '', count: 0 });
  const setRun = r => store.set('focusRun', r);
  const lengthOf = mode => (getFocus().settings[mode] || 25) * 60;

  function remaining(r = run()) {
    if (r.running && r.endsAt) return Math.max(0, Math.round((r.endsAt - Date.now()) / 1000));
    return r.remaining ?? lengthOf(r.mode);
  }

  function start() { const r = run(); setRun({ ...r, running: true, endsAt: Date.now() + remaining(r) * 1000 }); unlockAudio(); }
  function pause() { const r = run(); setRun({ ...r, running: false, remaining: remaining(r), endsAt: null }); }
  function reset(mode) { const r = run(); setRun({ ...r, mode: mode || r.mode, running: false, endsAt: null, remaining: null }); }

  function complete() {
    const r = run();
    if (r.mode === 'work') {
      const f = getFocus();
      const mins = Math.round(lengthOf('work') / 60);
      store.set('focus', { ...f, sessions: [...f.sessions, { start: new Date(Date.now() - mins * 60000).toISOString(), minutes: mins, label: r.label || 'Focus' }] });
      const count = (r.count || 0) + 1;
      const next = count % 4 === 0 ? 'long' : 'short';
      setRun({ ...r, count, mode: next, running: false, endsAt: null, remaining: null });
      notify('Focus session done', `Take a ${MODES[next].toLowerCase()}.`);
    } else {
      setRun({ ...r, mode: 'work', running: false, endsAt: null, remaining: null });
      notify('Break is over', 'Back to it.');
    }
  }

  function notify(title, body) {
    chime();
    toast(`${title}. ${body}`);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch (e) { /* not allowed here */ }
  }

  // ---- Global ticker: runs while the app is open, on any page ---------------
  let tickTimer = null;
  function tick() {
    const r = run();
    if (r.running && remaining(r) <= 0) complete();
    const live = run();
    const secs = remaining(live);
    document.title = live.running ? `${fmt(secs)} · ${MODES[live.mode]}` : (Bench.baseTitle || document.title);
    if (live.running && Bench.paintNav) Bench.paintNav();
    if (Bench.emitFocusTick) Bench.emitFocusTick(secs, live);
  }
  function ensureTicker() { if (!tickTimer) tickTimer = setInterval(tick, 500); }
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ---- Audio: chime + procedurally generated noise ------------------------------
  let ctx = null, noise = null, gain = null;
  function audio() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    return ctx;
  }
  function unlockAudio() { const a = audio(); if (a && a.state === 'suspended') a.resume(); }
  function chime() {
    const a = audio(); if (!a) return;
    [660, 880, 1320].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = a.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 1.2);
    });
  }
  function makeNoise(kind) {
    const a = audio(); if (!a) return null;
    const len = a.sampleRate * 4;
    const buf = a.createBuffer(2, len, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else d[i] = w * 0.3;
      }
    }
    const src = a.createBufferSource();
    src.buffer = buf; src.loop = true;
    let node = src;
    if (kind === 'rain') {
      // White noise through a band-pass, with slow random swells
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 500;
      lfo.connect(lg).connect(bp.frequency); lfo.start();
      src.connect(bp); node = bp;
    }
    return { src, node };
  }
  function playNoise(kind, vol) {
    stopNoise();
    if (kind === 'off') return;
    const a = audio(); if (!a) { toast('Audio is not available in this browser'); return; }
    unlockAudio();
    const n = makeNoise(kind);
    gain = a.createGain(); gain.gain.value = vol;
    n.node.connect(gain).connect(a.destination);
    n.src.start();
    noise = n;
  }
  function stopNoise() { if (noise) { try { noise.src.stop(); } catch (e) { /* already stopped */ } noise = null; } }

  // ---- View ------------------------------------------------------------------------
  function ring(progress) {
    const R = 112, C = 2 * Math.PI * R;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 260 260');
    svg.setAttribute('class', 'chart');
    svg.style.maxWidth = '300px';
    svg.style.margin = '0 auto';
    svg.innerHTML = `<circle cx="130" cy="130" r="${R}" fill="none" stroke="var(--sunken)" stroke-width="14"/>` +
      `<circle class="ring-fg" cx="130" cy="130" r="${R}" fill="none" stroke="var(--mark)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - progress)}" transform="rotate(-90 130 130)"/>`;
    // ticks every minute-ish around the dial
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const r1 = i % 5 === 0 ? 86 : 90, r2 = 95;
      svg.innerHTML += `<line x1="${130 + Math.cos(a) * r1}" y1="${130 + Math.sin(a) * r1}" x2="${130 + Math.cos(a) * r2}" y2="${130 + Math.sin(a) * r2}" stroke="var(--line-2)" stroke-width="${i % 5 === 0 ? 2 : 1}"/>`;
    }
    return { svg, set: p => svg.querySelector('.ring-fg').setAttribute('stroke-dashoffset', String(C * (1 - p))) };
  }

  function heatmap(sessions) {
    const weeks = 12, cell = 14, gap = 3;
    const end = Bench.today();
    const start = new Date(end); start.setDate(end.getDate() - (weeks * 7 - 1) - ((end.getDay() + 6) % 7 === 6 ? 0 : 0));
    // align to Monday
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const byDay = {};
    for (const s of sessions) { const k = Bench.ledger.isoDay(new Date(s.start)); byDay[k] = (byDay[k] || 0) + s.minutes; }
    const W = 20 + (weeks + 1) * (cell + gap), H = 7 * (cell + gap) + 4;
    let html = '';
    ['M', 'W', 'F'].forEach((l, i) => { html += `<text x="0" y="${(i * 2) * (cell + gap) + cell - 2}">${l}</text>`; });
    const d = new Date(start);
    let col = 0;
    while (d <= end) {
      const row = (d.getDay() + 6) % 7;
      const m = byDay[Bench.ledger.isoDay(d)] || 0;
      const level = m === 0 ? 0 : m < 30 ? 0.3 : m < 60 ? 0.55 : m < 120 ? 0.8 : 1;
      html += `<rect x="${20 + col * (cell + gap)}" y="${row * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${level ? 'var(--mark)' : 'var(--sunken)'}" opacity="${level || 1}"><title>${d.toDateString()}: ${m} min</title></rect>`;
      if (row === 6) col++;
      d.setDate(d.getDate() + 1);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Focus minutes per day for the last 12 weeks');
    svg.innerHTML = html;
    return svg;
  }

  let noiseKind = 'off', noiseVol = 0.35;

  function render(page) {
    const r0 = run();
    const label = h('input.input', { id: 'focus-label', type: 'text', placeholder: 'What are you working on?', value: r0.label || '' });
    label.addEventListener('input', Bench.debounce(() => setRun({ ...run(), label: label.value }), 250));

    const big = h('div', { style: { font: '700 clamp(3rem, 9vw, 4.5rem)/1 var(--f-display)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' } });
    const modeLine = h('div.eyebrow');
    const dial = ring(0);
    const playBtn = h('button.btn.primary', { type: 'button', style: { minWidth: '120px', padding: '12px 18px', fontSize: 'var(--t-md)' } });
    const seg = h('div.seg', { role: 'group', 'aria-label': 'Timer mode' });

    let lastKey = '';
    playBtn.onclick = () => (run().running ? pause() : start());
    function paint(secs = remaining(), r = run()) {
      const total = lengthOf(r.mode);
      big.textContent = fmt(secs);
      dial.set(1 - secs / total);
      // Rebuild controls only when their state changes, not on every tick
      const key = [r.mode, r.running, secs < total, r.count].join('|');
      if (key === lastKey) return;
      lastKey = key;
      modeLine.textContent = `${MODES[r.mode]} · round ${((r.count || 0) % 4) + 1} of 4`;
      playBtn.replaceChildren(icon(r.running ? 'pause' : 'play'), r.running ? 'Pause' : (secs < total ? 'Resume' : 'Start'));
      seg.replaceChildren(...Object.entries(MODES).map(([k, v]) => h('button', { type: 'button', 'aria-pressed': String(r.mode === k), onclick: () => reset(k) }, v)));
    }
    Bench.emitFocusTick = (secs, r) => paint(secs, r);
    paint();
    const unsub = store.subscribe(k => { if (k === 'focusRun') paint(); });

    const f = getFocus();
    const lengths = h('div.grid', { style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' } },
      ...Object.keys(MODES).map(k => h('label.field', null, h('span', null, MODES[k]),
        h('input.input.num', { id: 'len-' + k, type: 'number', min: 1, max: 180, value: f.settings[k], onchange: e => {
          const v = Math.max(1, Math.min(180, +e.target.value || 1));
          const cur = getFocus(); store.set('focus', { ...cur, settings: { ...cur.settings, [k]: v } });
          if (!run().running) reset(); paint();
        } }))));

    const vol = h('input', { id: 'noise-vol', type: 'range', min: 0, max: 1, step: 0.01, value: noiseVol, 'aria-label': 'Volume', oninput: e => { noiseVol = +e.target.value; if (gain) gain.gain.value = noiseVol; } });
    const noiseSeg = h('div.seg', { role: 'group', 'aria-label': 'Ambient sound' });
    const paintNoise = () => noiseSeg.replaceChildren(...['off', 'brown', 'pink', 'rain', 'white'].map(k =>
      h('button', { type: 'button', 'aria-pressed': String(noiseKind === k), onclick: () => { noiseKind = k; playNoise(k, noiseVol); paintNoise(); } }, k[0].toUpperCase() + k.slice(1))));
    paintNoise();

    const sessions = f.sessions || [];
    const today = sessions.filter(s => Bench.sameDay(new Date(s.start), new Date()));
    const recent = sessions.slice().sort((a, b) => b.start.localeCompare(a.start)).slice(0, 8);
    const byLabel = Object.entries(sessions.reduce((acc, s) => { acc[s.label] = (acc[s.label] || 0) + s.minutes; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxLabel = byLabel.length ? byLabel[0][1] : 1;

    page.append(
      h('header.page-head', null, h('div', null, h('div.eyebrow', null, 'Daily'), h('h1', null, 'Focus')),
        h('div.actions', null, h('span.chip.num', null, `${today.length} session${today.length === 1 ? '' : 's'} today`))),
      h('div.grid.cols-main', null,
        h('section.sheet', null,
          h('div.sheet-head', null, seg),
          h('div.sheet-body.stack', { style: { alignItems: 'center', textAlign: 'center', gap: '16px', paddingBlock: '26px' } },
            h('div', { style: { position: 'relative', width: '100%', maxWidth: '300px' } }, dial.svg,
              h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', gap: '8px' } }, modeLine, big)),
            h('div', { style: { width: '100%', maxWidth: '380px' } }, h('label.visually-hidden', { for: 'focus-label' }, 'Working on'), label),
            h('div.row', { style: { justifyContent: 'center' } }, playBtn,
              h('button.btn', { type: 'button', onclick: () => reset() }, icon('reset'), 'Reset'),
              h('button.btn.ghost', { type: 'button', onclick: complete }, 'Skip', icon('arrow'))),
            h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Space starts and pauses. The timer keeps running if you switch pages or reload.'))),
        h('div.stack', { style: { gap: '18px' } },
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Ambient sound')),
            h('div.sheet-body.stack', null, noiseSeg, h('label.field', null, h('span', null, 'Volume'), vol),
              h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Generated live in your browser, so it loops without seams. Prefer music? ',
                h('a', { href: 'https://open.spotify.com/search/deep%20focus/playlists', target: '_blank', rel: 'noopener' }, 'Find a focus playlist on Spotify'), '.'))),
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Lengths (minutes)')), h('div.sheet-body', null, lengths)))),
      h('div.grid.cols-2', null,
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Last 12 weeks')), h('div.sheet-body', null, heatmap(sessions),
          h('div.legend', { style: { marginTop: '10px' } }, h('span', null, h('i', { style: { background: 'var(--sunken)' } }), 'none'), h('span', null, h('i', { style: { background: 'var(--mark)', opacity: 0.3 } }), '< 30m'), h('span', null, h('i', { style: { background: 'var(--mark)' } }), '2h+')))),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Where the time went')),
          byLabel.length ? h('ul.list', null, byLabel.map(([name, mins]) => h('li', null, h('div.grow', null,
            h('div.row', null, h('span.title', null, name), h('span.spacer'), h('span.mono.num.faint', { style: { fontSize: 'var(--t-xs)' } }, Bench.fmtMins(mins))),
            h('div.meter', { style: { marginTop: '6px' } }, h('i', { style: { width: (mins / maxLabel) * 100 + '%' } }))))))
            : h('div.empty', null, h('b', null, 'No sessions yet'), 'Finish one and it shows up here.'),
          recent.length ? h('div', { style: { padding: '4px 18px 14px' }, class: 'meta' }, 'Latest: ', recent.slice(0, 3).map(s => h('span.chip', null, `${s.label} · ${Bench.tools.relative(new Date(s.start))}`))) : null)));

    return () => { Bench.emitFocusTick = null; unsub(); };
  }

  Bench.module({
    id: 'focus', title: 'Focus', icon: 'focus', group: 'daily', key: 'f',
    badge: () => { const r = run(); return r.running ? fmt(remaining(r)) : ''; },
    render(page, ctx) {
      const cleanup = render(page, ctx);
      if (Bench.focusAutoStart) { Bench.focusAutoStart = false; if (!run().running) start(); }
      return cleanup;
    },
    onKey(e) { if (e.key === ' ') { e.preventDefault(); run().running ? pause() : start(); } },
    commands: () => [
      { label: run().running ? 'Pause focus timer' : 'Start focus timer', icon: 'play', run: () => (run().running ? pause() : start()) },
      { label: 'Start a 5 minute break', icon: 'clock', run: () => { reset('short'); start(); } },
    ],
  });

  ensureTicker();
})(window.Bench);
