/* Bench · kit.js
 * Browser-side helpers shared by every module: element builder, icons,
 * persisted store, toasts, downloads and small formatters.
 */
(function (root) {
  'use strict';
  const Bench = (root.Bench = root.Bench || {});

  // ---- h(): tiny hyperscript ------------------------------------------------
  const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'indeterminate']);
  function h(tag, props, ...children) {
    const [name, ...classes] = tag.split('.');
    const el = document.createElement(name || 'div');
    if (classes.length) el.className = classes.join(' ');
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className += (el.className ? ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') el.innerHTML = v;
        else if (PROPS.has(k)) el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // ---- Icons: one stroke set, 24px grid, 1.75 stroke --------------------------
  const ICONS = {
    today: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4M8 13h3v3H8z',
    tasks: 'M9 6h11M9 12h11M9 18h11M4 5.5l1 1 2-2M4 11.5l1 1 2-2M4 17.5l1 1 2-2',
    notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
    focus: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M10 2h4',
    ledger: 'M4 19h16M6 16V10M10 16V6M14 16v-4M18 16V8',
    gamelab: 'M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6h-6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M15.5 12h.01M17.5 14h.01',
    trips: 'M3 12l18-8-6 17-3-7-9-2zM12 14l3-3',
    toolbox: 'M3 9h18v10H3zM8 9V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18M10 12v2M14 12v2',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    play: 'M7 4l13 8-13 8z',
    pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
    reset: 'M4 4v6h6M20 12a8 8 0 1 1-2.3-5.7L20 9',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    check: 'M5 12l5 5 9-10',
    dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 15.5h.01M12 12h.01M15.5 8.5h.01M8.5 15.5h.01',
    grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
    palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5h2A4.5 4.5 0 0 0 21 11c0-4.4-4-8-9-8zM7.5 11h.01M10 7.5h.01M15 7.5h.01',
    curve: 'M3 20C10 20 9 4 21 4M3 20h18M3 4v16',
    music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    invoice: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
    bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
    sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
    keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    x: 'M6 6l12 12M18 6L6 18',
    pin: 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  };
  function icon(name, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name] || ICONS.sparkle);
    svg.appendChild(p);
    return svg;
  }

  // ---- Store: one JSON document in localStorage, with subscribers -----------
  const KEY = 'bench:v1';
  const listeners = new Set();
  let state = {};
  let memoryOnly = false;
  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (e) { state = {}; memoryOnly = true; }
    return state;
  }
  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { memoryOnly = true; }
    }, 120);
  }
  const store = {
    get: (slice, fallback) => (slice in state ? state[slice] : fallback),
    // Notify a snapshot of listeners so one that subscribes during notify doesn't fire this round
    set(slice, value) { state[slice] = value; persist(); [...listeners].forEach(fn => fn(slice)); },
    update(slice, fn, fallback) { store.set(slice, fn(store.get(slice, fallback))); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot: () => JSON.parse(JSON.stringify(state)),
    replace(next) { state = next || {}; persist(); [...listeners].forEach(fn => fn('*')); },
    get memoryOnly() { return memoryOnly; },
    load,
  };

  // ---- Feedback -----------------------------------------------------------------
  function toast(message, action) {
    let host = document.querySelector('.toasts');
    if (!host) { host = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(host); }
    const el = h('div.toast', null, message);
    if (action) el.appendChild(h('button', { onclick: () => { action.run(); el.remove(); } }, action.label));
    host.appendChild(el);
    setTimeout(() => el.remove(), action ? 6000 : 2600);
  }

  async function copy(text, label = 'Copied') {
    try { await navigator.clipboard.writeText(text); toast(label); return true; }
    catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      toast(ok ? label : 'Select the text and copy it by hand');
      return ok;
    }
  }

  function download(filename, data, type = 'text/plain') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function pickFile(accept) {
    return new Promise(resolve => {
      const input = h('input', { type: 'file', accept, style: { display: 'none' } });
      input.addEventListener('change', () => {
        const f = input.files[0];
        if (!f) return resolve(null);
        const r = new FileReader();
        r.onload = () => resolve({ name: f.name, text: r.result });
        r.readAsText(f);
        input.remove();
      });
      document.body.appendChild(input); input.click();
    });
  }

  // ---- Formatting -----------------------------------------------------------------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  function fmtDue(iso, hasTime) {
    if (!iso) return '';
    const d = new Date(iso);
    const t0 = today();
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - t0) / 864e5);
    let day;
    if (days === 0) day = 'Today';
    else if (days === 1) day = 'Tomorrow';
    else if (days === -1) day = 'Yesterday';
    else if (days > 1 && days < 7) day = d.toLocaleDateString(undefined, { weekday: 'short' });
    else day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return hasTime ? `${day} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : day;
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  Object.assign(Bench, { h, append, icon, ICONS, store, toast, copy, download, pickFile, uid, today, sameDay, fmtDue, debounce });
})(window);
