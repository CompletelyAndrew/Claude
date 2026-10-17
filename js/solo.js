/* Bench · solo.js
 * A one-module shell, so a Bench module can also ship as its own app
 * (qr.html → dist/qr.html). It offers the same Bench.module / navigate /
 * takeArg contract as app.js, with no rail, palette or other modules.
 * Data lives in the same store, so on one origin progress is shared
 * with the full Bench.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, toast } = Bench;

  const modules = [];
  let mod = null, page = null, cleanup = null, pendingArg = null, themeSetByUs = false;

  Bench.module = def => { modules.push(def); };
  Bench.modules = modules;
  Bench.takeArg = () => { const a = pendingArg; pendingArg = null; return a; };
  Bench.navigate = (id, arg) => { pendingArg = arg ?? null; render(); };
  Bench.paintNav = () => {};

  function applyTheme() {
    const t = store.get('settings', {}).theme || 'system';
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

  function render() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
    const main = document.getElementById('main');
    page = h('div.page');
    main.replaceChildren(page);
    try { cleanup = mod.render(page, { navigate: Bench.navigate }); }
    catch (e) {
      console.error(e);
      cleanup = null;
      page.replaceChildren(h('div.sheet', null, h('div.empty', null, h('b', null, `${mod.title} hit an error`), String(e.message || e))));
    }
  }

  // id: the module to run; tagline and mark are the app's own branding
  Bench.startSolo = function startSolo(id, { tagline = '', mark = null } = {}) {
    store.load();
    applyTheme();
    mod = modules.find(m => m.id === id) || modules[0];
    document.documentElement.classList.add('solo');
    document.title = mod.title;
    const themeBtn = h('button.btn.ghost.sm', { type: 'button', 'aria-label': 'Change theme', onclick: () => { cycleTheme(); paintTheme(); } });
    const paintTheme = () => {
      const t = store.get('settings', {}).theme || 'system';
      themeBtn.replaceChildren(icon(t === 'dark' ? 'moon' : 'sun'), t === 'system' ? 'Auto' : t[0].toUpperCase() + t.slice(1));
    };
    paintTheme();
    // Link back to the full workbench when it sits next to us (not inside an Artifact)
    const benchHref = Bench.ARTIFACT ? null : Bench.SINGLE_FILE ? `bench.html#${mod.id}` : `index.html#${mod.id}`;
    const brand = h('div.brand.solo-brand', null, h('span.solo-mark', { html: mark || '' }),
      h('span', null, h('b', null, mod.title), tagline ? h('small', null, tagline) : null));
    document.getElementById('app').replaceChildren(h('div.solo-shell', null,
      h('header.solo-top', null, brand, h('div.actions', null, themeBtn,
        benchHref ? h('a.btn.ghost.sm', { href: benchHref, title: 'Open the full Bench workbench' }, icon('grid'), 'Bench') : null)),
      h('main.main.solo-main', { id: 'main', tabindex: '-1' })));
    document.addEventListener('keydown', e => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 't') { cycleTheme(); paintTheme(); }
      else if (mod.onKey) mod.onKey(e);
    });
    render();
    if (store.memoryOnly) toast('Storage is blocked here, so progress lasts until you close the tab');
    if ('serviceWorker' in navigator && location.protocol === 'https:' && !Bench.SINGLE_FILE) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ });
    }
  };
})(window.Bench);
