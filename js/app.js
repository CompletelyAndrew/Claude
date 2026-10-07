/* Bench · app.js
 * The shell: module registry, hash router, rail navigation, command
 * palette, keyboard shortcuts, theme and backups. Modules register
 * themselves with Bench.module({...}) and know nothing about each other.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, toast } = Bench;

  const modules = [];
  const GROUPS = { daily: 'Daily', make: 'Make', life: 'Life', system: '' };

  Bench.module = def => { modules.push(def); };
  Bench.modules = modules;

  // ---------------------------------------------------------------- routing
  let current = null;       // { id, cleanup }
  let pendingArg = null;    // in-memory deep link payload, e.g. a note id

  function navigate(id, arg) {
    pendingArg = arg ?? null;
    if (location.hash.slice(1) === id) route();
    else location.hash = id;
  }
  Bench.navigate = navigate;
  Bench.takeArg = () => { const a = pendingArg; pendingArg = null; return a; };

  function route() {
    const id = location.hash.slice(1) || 'today';
    const mod = modules.find(m => m.id === id) || modules[0];
    if (current && current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
    const main = document.getElementById('main');
    const sameModule = current && current.id === mod.id;
    const keepScroll = sameModule ? main.scrollTop : 0;
    main.replaceChildren();
    const page = h('div.page');
    main.appendChild(page);
    let cleanup = null;
    try { cleanup = mod.render(page, { navigate }); }
    catch (e) {
      console.error(e);
      page.replaceChildren(h('div.sheet', null, h('div.empty', null, h('b', null, `${mod.title} hit an error`), String(e.message || e))));
    }
    current = { id: mod.id, cleanup };
    main.scrollTop = keepScroll;
    Bench.baseTitle = document.title = mod.id === 'today' ? 'Bench' : `${mod.title} · Bench`;
    try { localStorage.setItem('bench:last', mod.id); } catch (e) { /* storage blocked */ }
    paintNav();
  }

  // ---------------------------------------------------------------- shell
  function brandMark() {
    // The mark: a bench seen from the front. Ink legs, highlighter top.
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      '<rect x="1" y="1" width="30" height="30" rx="8" fill="var(--ink)"/>' +
      '<rect x="6" y="10" width="20" height="5" rx="1.5" fill="var(--mark)"/>' +
      '<rect x="8.5" y="15" width="3" height="9" rx="1" fill="var(--paper)"/>' +
      '<rect x="20.5" y="15" width="3" height="9" rx="1" fill="var(--paper)"/>' +
      '<rect x="11.5" y="19" width="9" height="2" rx="1" fill="var(--paper)" opacity=".55"/>';
    return svg;
  }

  function brand() {
    return h('a.brand', { href: '#today', 'aria-label': 'Bench home' }, brandMark(),
      h('span', null, h('b', null, 'Bench'), h('small', null, 'tools for making things')));
  }

  function themeButton(cls = 'btn ghost sm') {
    const btn = h('button', { class: cls, type: 'button', 'aria-label': 'Change theme', onclick: cycleTheme });
    const paint = () => {
      const t = store.get('settings', {}).theme || 'system';
      btn.replaceChildren(icon(t === 'dark' ? 'moon' : 'sun'), t === 'system' ? 'Auto' : t[0].toUpperCase() + t.slice(1));
    };
    paint();
    store.subscribe(s => { if (s === 'settings' || s === '*') paint(); });
    return btn;
  }

  function buildShell() {
    const app = document.getElementById('app');
    const nav = h('nav.nav', { 'aria-label': 'Modules' });
    let lastGroup = null;
    for (const m of modules.filter(x => x.group !== 'system')) {
      if (m.group !== lastGroup) { lastGroup = m.group; nav.appendChild(h('div.nav-group.eyebrow', null, GROUPS[m.group])); }
      nav.appendChild(h('a', { href: '#' + m.id, 'data-id': m.id }, icon(m.icon), h('span', null, m.title), h('span.count')));
    }
    const rail = h('aside.rail', null,
      brand(), nav,
      h('div.rail-foot', null,
        h('button.search-btn', { type: 'button', onclick: openPalette }, icon('search'), 'Search', h('kbd', null, isMac() ? '⌘K' : 'Ctrl K')),
        h('div.row', null, themeButton(), h('span.spacer'),
          h('a', { class: 'btn ghost sm', href: '#settings', title: 'Settings and backup' }, icon('keyboard'), 'Settings'))));

    const mobileTop = h('header.mobile-top', null, brand(),
      h('div.actions', null,
        h('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Search', onclick: openPalette }, icon('search')),
        h('a', { class: 'btn ghost icon', href: '#settings', 'aria-label': 'Settings' }, icon('keyboard'))));
    const mobileBar = h('nav.mobile-bar', { 'aria-label': 'Modules' },
      modules.filter(m => m.group !== 'system').map(m =>
        h('a', { href: '#' + m.id, 'data-id': m.id }, icon(m.icon), m.short || m.title)));

    app.replaceChildren(h('div.shell', null, rail, mobileTop, h('main.main', { id: 'main', tabindex: '-1' }), mobileBar));
  }

  Bench.paintNav = () => paintNav();
  function paintNav() {
    document.querySelectorAll('[data-id]').forEach(a => {
      const on = current && a.dataset.id === current.id;
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      const m = modules.find(x => x.id === a.dataset.id);
      const c = a.querySelector('.count');
      if (c && m && m.badge) c.textContent = m.badge() || '';
    });
  }

  // ---------------------------------------------------------------- theme
  let themeSetByUs = false;
  function applyTheme() {
    const t = store.get('settings', {}).theme || 'system';
    // On "system", only clear a theme we set ourselves, so a host page's choice survives
    if (t === 'system') { if (themeSetByUs) document.documentElement.removeAttribute('data-theme'); themeSetByUs = false; }
    else { document.documentElement.setAttribute('data-theme', t); themeSetByUs = true; }
  }
  function cycleTheme() {
    const order = ['system', 'light', 'dark'];
    store.update('settings', s => {
      const t = order[(order.indexOf(s.theme || 'system') + 1) % order.length];
      toast(t === 'system' ? 'Theme follows your system' : `${t[0].toUpperCase() + t.slice(1)} theme`);
      return { ...s, theme: t };
    }, {});
    applyTheme();
  }
  Bench.cycleTheme = cycleTheme;
  Bench.applyTheme = applyTheme;

  // ---------------------------------------------------------------- backup
  Bench.exportBackup = () => {
    const data = JSON.stringify({ app: 'bench', version: 1, exported: new Date().toISOString(), state: store.snapshot() }, null, 2);
    Bench.download(`bench-backup-${new Date().toISOString().slice(0, 10)}.json`, data, 'application/json');
    toast('Backup downloaded');
    return data;
  };
  Bench.importBackup = async () => {
    const f = await Bench.pickFile('application/json,.json');
    if (!f) return;
    try {
      const parsed = JSON.parse(f.text);
      if (parsed.app !== 'bench' || !parsed.state) throw new Error('This file is not a Bench backup.');
      const before = store.snapshot();
      store.replace(parsed.state);
      applyTheme(); route();
      toast(`Restored from ${f.name}`, { label: 'Undo', run: () => { store.replace(before); applyTheme(); route(); } });
    } catch (e) { toast(e.message || 'Could not read that file'); }
  };

  // ---------------------------------------------------------------- palette
  let paletteOpen = false;
  function commands() {
    const out = [];
    for (const m of modules) {
      out.push({ label: `Go to ${m.title}`, icon: m.icon, hint: m.key ? `g ${m.key}` : '', run: () => navigate(m.id) });
      if (m.commands) for (const c of m.commands()) out.push({ icon: m.icon, ...c });
    }
    out.push({ label: 'Cycle theme', icon: 'sun', hint: 't', run: cycleTheme });
    out.push({ label: 'Download backup', icon: 'download', run: Bench.exportBackup });
    out.push({ label: 'Restore backup from file', icon: 'upload', run: Bench.importBackup });
    out.push({ label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: () => navigate('settings') });
    return out;
  }
  function searchAll(q) {
    const out = [];
    for (const m of modules) if (m.search) for (const r of m.search(q)) out.push({ icon: m.icon, ...r });
    return out;
  }
  function score(label, q) {
    const l = label.toLowerCase();
    if (!q) return 1;
    if (l.startsWith(q)) return 3;
    if (l.includes(' ' + q)) return 2.5;
    if (l.includes(q)) return 2;
    // subsequence match: "nt" → "New task"
    let i = 0;
    for (const ch of l) if (ch === q[i]) i++;
    return i === q.length ? 1 : 0;
  }

  function openPalette(prefill = '') {
    if (paletteOpen) return;
    paletteOpen = true;
    const prev = document.activeElement;
    const input = h('input', { type: 'text', placeholder: 'Type a command, or search tasks, notes, tools…', 'aria-label': 'Command', autocomplete: 'off', spellcheck: 'false', value: typeof prefill === 'string' ? prefill : '' });
    const list = h('ul', { role: 'listbox' });
    const overlay = h('div.overlay', { onmousedown: e => { if (e.target === overlay) close(); } },
      h('div.palette', { role: 'dialog', 'aria-label': 'Command palette' }, input, list,
        h('div.palette-foot', null, h('span', null, h('kbd', null, '↑↓'), ' move'), h('span', null, h('kbd', null, '↵'), ' run'), h('span', null, h('kbd', null, 'esc'), ' close'),
          h('span', { style: { marginLeft: 'auto' } }, 'Tip: type “+ buy milk fri” to add a task'))));
    let items = [], sel = 0;

    function paint() {
      const q = input.value.trim().toLowerCase();
      if (q.startsWith('+')) {
        const text = input.value.trim().slice(1).trim();
        const p = Bench.quickadd.parse(text || 'New task');
        items = [{ label: `Add task “${p.title}”${p.due ? ' · ' + Bench.fmtDue(p.due, p.hasTime) : ''}${p.tags.length ? ' · #' + p.tags.join(' #') : ''}`, icon: 'plus', hint: 'Tasks', run: () => { Bench.addTask(text); } }];
      } else if (q.startsWith('=')) {
        let val;
        try { val = safeMath(q.slice(1)); } catch (e) { val = null; }
        items = [{ label: val == null ? 'Keep typing a sum, like = 1920/1080' : `= ${val}`, icon: 'sparkle', hint: 'Copy', run: () => val != null && Bench.copy(String(val)) }];
      } else {
        const scored = commands().map(c => ({ c, s: score(c.label, q) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.c);
        items = (q ? [...scored.slice(0, 8), ...searchAll(q).slice(0, 12)] : scored.slice(0, 14));
      }
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.replaceChildren(...items.map((it, i) => h('li', { role: 'option', 'aria-selected': String(i === sel), onmousemove: () => { if (sel !== i) { sel = i; paint(); } }, onclick: () => run(i) },
        icon(it.icon || 'arrow'), h('span', null, it.label, it.sub ? h('span.faint', null, '  ' + it.sub) : null), it.hint ? h('span.hint', null, it.hint) : null)));
      if (!items.length) list.replaceChildren(h('li', { 'aria-disabled': 'true' }, h('span.faint', null, 'Nothing matches. Start with + to add a task, or = to calculate.')));
      const el = list.children[sel];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
    function run(i) { const it = items[i]; close(); if (it) it.run(); }
    function close() { overlay.remove(); paletteOpen = false; if (prev && prev.focus) prev.focus(); }
    input.addEventListener('input', () => { sel = 0; paint(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { run(sel); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); e.preventDefault(); }
    });
    document.body.appendChild(overlay);
    paint();
    input.focus();
  }
  Bench.openPalette = openPalette;

  const safeMath = expr => Bench.tools.calc(expr);

  // ---------------------------------------------------------------- keys
  let gPending = false, gTimer = null;
  function onKey(e) {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || paletteOpen) return;
    if (gPending) {
      gPending = false; clearTimeout(gTimer);
      const m = modules.find(x => x.key === e.key.toLowerCase());
      if (m) { navigate(m.id); e.preventDefault(); }
      return;
    }
    if (e.key === 'g') { gPending = true; gTimer = setTimeout(() => { gPending = false; }, 900); return; }
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'n') { e.preventDefault(); openPalette('+ '); return; }
    if (e.key === 't') { cycleTheme(); return; }
    if (e.key === '?') { navigate('settings'); return; }
    if (current) {
      const m = modules.find(x => x.id === current.id);
      if (m && m.onKey) m.onKey(e);
    }
  }
  function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent); }
  Bench.isMac = isMac;

  // ---------------------------------------------------------------- boot
  Bench.start = function start() {
    store.load();
    if (!store.get('seeded') && Bench.seed) { Bench.seed(); store.set('seeded', true); }
    applyTheme();
    buildShell();
    store.subscribe(() => paintNav());
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', onKey);
    if (!location.hash) {
      let last = null;
      try { last = localStorage.getItem('bench:last'); } catch (e) { /* storage blocked */ }
      if (last && modules.some(m => m.id === last)) history.replaceState(null, '', '#' + last);
    }
    route();
    if (store.memoryOnly) toast('Storage is blocked here, so changes last until you close the tab');
    if ('serviceWorker' in navigator && location.protocol === 'https:' && !Bench.SINGLE_FILE) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ });
    }
  };
})(window.Bench);
