/* Bench · Toolbox
 * The small utilities you'd otherwise search the web for: JSON, encoders,
 * JWT, timestamps, units, text case, IDs and passwords. All offline.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store } = Bench;
  const T = Bench.tools;

  let active = 'json';

  const codeArea = (id, value, extra = {}) => h('textarea.input.mono', { id, value, spellcheck: 'false', rows: 10, ...extra });
  const out = (label, value, opts = {}) => h('div.field', null, h('span', null, label),
    h('div.row', { style: { flexWrap: 'nowrap' } },
      h('code', { class: 'input mono', style: { display: 'block', overflowX: 'auto', whiteSpace: opts.wrap ? 'pre-wrap' : 'nowrap', minHeight: '38px', background: 'var(--sunken)', borderColor: 'transparent', wordBreak: 'break-all' } }, value),
      h('button.btn.ghost.icon', { type: 'button', 'aria-label': `Copy ${label}`, onclick: () => Bench.copy(String(value), `${label} copied`) }, icon('copy'))));

  const TOOLS = [
    {
      id: 'json', label: 'JSON', desc: 'Validate, format, minify',
      render() {
        const ta = codeArea('json-in', store.get('tb:json', '{"player":{"name":"Ace","hp":100,"loadout":["cannon","smoke"]},"level":3}'));
        const status = h('div');
        const result = h('pre', { class: 'mono', style: { margin: 0, background: 'var(--sunken)', padding: '12px', borderRadius: 'var(--r-sm)', overflow: 'auto', maxHeight: '340px', fontSize: 'var(--t-sm)' } });
        let indent = 2;
        const paint = () => {
          store.set('tb:json', ta.value);
          const r = T.jsonCheck(ta.value, indent);
          if (r.ok) {
            const keys = JSON.stringify(r.value).match(/"[^"]*":/g);
            status.replaceChildren(h('span.chip.good', null, icon('check'), 'Valid JSON'), ' ', h('span.faint', { style: { fontSize: 'var(--t-xs)' } }, `${(keys || []).length} keys · ${new Blob([r.minified]).size} bytes minified`));
            result.textContent = r.pretty;
          } else {
            status.replaceChildren(h('span.chip.bad', null, 'Invalid'), ' ', h('span.muted', { style: { fontSize: 'var(--t-sm)' } }, r.line ? `Line ${r.line}, column ${r.col}: ` : '', r.error));
            result.textContent = '';
          }
        };
        ta.addEventListener('input', Bench.debounce(paint, 150));
        paint();
        return [h('label.visually-hidden', { for: 'json-in' }, 'JSON input'), ta, status,
          h('div.row', null,
            h('div.seg', { role: 'group', 'aria-label': 'Indent' }, [2, 4, '\t'].map(v => h('button', { type: 'button', 'aria-pressed': String(indent === v), onclick: e => { indent = v; e.target.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.target))); paint(); } }, v === '\t' ? 'Tabs' : `${v} spaces`))),
            h('button.btn.sm', { type: 'button', onclick: () => { const r = T.jsonCheck(ta.value, indent); if (r.ok) { ta.value = r.pretty; paint(); } } }, 'Format in place'),
            h('button.btn.sm', { type: 'button', onclick: () => { const r = T.jsonCheck(ta.value); if (r.ok) Bench.copy(r.minified, 'Minified JSON copied'); } }, icon('copy'), 'Copy minified')),
          result];
      },
    },
    {
      id: 'encode', label: 'Encode', desc: 'Base64, URL, HTML',
      render() {
        const ta = codeArea('enc-in', 'Tanks & Line Load → ✓ ready', { rows: 4 });
        const host = h('div.stack');
        const paint = () => {
          const v = ta.value;
          const safe = fn => { try { return fn(); } catch (e) { return '— not valid input —'; } };
          host.replaceChildren(
            out('Base64', safe(() => T.b64encode(v))), out('Base64 decoded', safe(() => T.b64decode(v))),
            out('URL encoded', encodeURIComponent(v)), out('URL decoded', safe(() => decodeURIComponent(v))),
            out('HTML escaped', Bench.md.escape(v)));
        };
        ta.addEventListener('input', paint); paint();
        return [h('label.visually-hidden', { for: 'enc-in' }, 'Text to encode'), ta, host];
      },
    },
    {
      id: 'jwt', label: 'JWT', desc: 'Decode a token',
      render() {
        const sample = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwbGF5ZXItNDIiLCJuYW1lIjoiQWNlIiwicm9sZSI6InRlc3RlciIsImlhdCI6MTc5MTQwMDAwMCwiZXhwIjoxNzkxNDg2NDAwfQ.signature';
        const ta = codeArea('jwt-in', sample, { rows: 4 });
        const host = h('div.stack');
        const paint = () => {
          try {
            const { header, payload } = T.decodeJWT(ta.value);
            const exp = payload.exp ? new Date(payload.exp * 1000) : null;
            host.replaceChildren(
              exp ? h('div', null, h('span', { class: 'chip ' + (exp < new Date() ? 'bad' : 'good') }, exp < new Date() ? 'Expired ' : 'Expires ', T.relative(exp))) : null,
              h('div.field', null, h('span', null, 'Header'), h('pre', { class: 'mono', style: { margin: 0, background: 'var(--sunken)', padding: '10px', borderRadius: 'var(--r-sm)', overflowX: 'auto' } }, JSON.stringify(header, null, 2))),
              h('div.field', null, h('span', null, 'Payload'), h('pre', { class: 'mono', style: { margin: 0, background: 'var(--sunken)', padding: '10px', borderRadius: 'var(--r-sm)', overflowX: 'auto' } }, JSON.stringify(payload, null, 2))),
              h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Decoded locally. The signature is not verified.'));
          } catch (e) { host.replaceChildren(h('p.muted', null, e.message || 'That does not look like a JWT.')); }
        };
        ta.addEventListener('input', paint); paint();
        return [h('label.visually-hidden', { for: 'jwt-in' }, 'Token'), ta, host];
      },
    },
    {
      id: 'time', label: 'Timestamps', desc: 'Unix ↔ dates',
      render() {
        const inp = h('input.input.mono', { id: 'ts-in', value: String(Math.floor(Date.now() / 1000)) });
        const host = h('div.stack');
        const paint = () => {
          const d = T.parseTimestamp(inp.value);
          if (!d) { host.replaceChildren(h('p.muted', null, 'Enter seconds, milliseconds, or a date like 2026-10-07 14:30.')); return; }
          host.replaceChildren(
            out('Local', d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })), out('ISO 8601 (UTC)', d.toISOString()),
            out('Unix seconds', String(Math.floor(d.getTime() / 1000))), out('Unix milliseconds', String(d.getTime())), out('Relative', T.relative(d)));
        };
        inp.addEventListener('input', paint); paint();
        return [h('div.row', { style: { flexWrap: 'nowrap' } }, h('label.visually-hidden', { for: 'ts-in' }, 'Timestamp'), inp, h('button.btn', { type: 'button', onclick: () => { inp.value = String(Math.floor(Date.now() / 1000)); paint(); } }, 'Now')), host];
      },
    },
    {
      id: 'units', label: 'Units', desc: 'Length, data, frames…',
      render() {
        let fam = store.get('tb:fam', 'length');
        const host = h('div.stack');
        const paint = () => {
          const units = Object.keys(T.UNITS[fam].units);
          const val = h('input.input.num', { id: 'unit-val', type: 'number', step: 'any', value: 1 });
          const from = h('select.input', { id: 'unit-from' }, units.map((u, i) => h('option', { value: u, selected: i === (fam === 'temperature' ? 1 : 0) }, u)));
          const table = h('div');
          const calc = () => {
            table.replaceChildren(h('table.data', null, h('tbody', null, units.filter(u => u !== from.value).map(u => {
              const r = T.convert(val.value, from.value, u, fam);
              const s = isFinite(r) ? (+r.toPrecision(8)).toLocaleString(undefined, { maximumFractionDigits: 8 }) : '—';
              return h('tr', null, h('td.amt', { style: { width: '60%' } }, s), h('td', null, h('span.chip', null, u)), h('td', { style: { width: '1%' } }, h('button.btn.ghost.icon', { type: 'button', 'aria-label': `Copy ${u}`, onclick: () => Bench.copy(String(+r.toPrecision(10))) }, icon('copy'))));
            }))));
          };
          val.addEventListener('input', calc); from.addEventListener('change', calc); calc();
          host.replaceChildren(
            h('div.seg', { role: 'group', 'aria-label': 'Unit family' }, Object.keys(T.UNITS).map(f => h('button', { type: 'button', 'aria-pressed': String(fam === f), onclick: () => { fam = f; store.set('tb:fam', f); paint(); } }, f[0].toUpperCase() + f.slice(1)))),
            h('div.grid', { style: { gridTemplateColumns: '1fr 140px', gap: '10px' } }, h('label.field', null, h('span', null, 'Value'), val), h('label.field', null, h('span', null, 'From'), from)),
            h('div.sheet', { style: { boxShadow: 'none' } }, table),
            fam === 'time' ? h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, 'frame60 and frame30 are single frames at 60 and 30 fps.') : null);
        };
        paint();
        return [host];
      },
    },
    {
      id: 'text', label: 'Text', desc: 'Case, slug, counts',
      render() {
        const ta = codeArea('text-in', 'player max health', { rows: 4 });
        const host = h('div.stack');
        const paint = () => {
          const c = T.caseConvert(ta.value);
          const words = Bench.md.wordCount(ta.value);
          host.replaceChildren(
            h('div.row', null, h('span.chip', null, `${ta.value.length} chars`), h('span.chip', null, `${words} words`), h('span.chip', null, `${ta.value.split('\n').length} lines`), h('span.chip', null, `${new Blob([ta.value]).size} bytes`)),
            h('div.grid.cols-2', { style: { gap: '10px' } }, out('camelCase', c.camel), out('PascalCase', c.pascal), out('snake_case', c.snake), out('CONSTANT_CASE', c.constant), out('kebab-case', c.kebab), out('Title Case', c.title)),
            out('URL slug', T.slugify(ta.value)));
        };
        ta.addEventListener('input', paint); paint();
        return [h('label.visually-hidden', { for: 'text-in' }, 'Text'), ta, host];
      },
    },
    {
      id: 'ids', label: 'IDs & passwords', desc: 'UUIDs, secrets',
      render() {
        const host = h('div.stack');
        let len = 20, symbols = true;
        const password = () => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' + (symbols ? '!@#$%^&*-_=+' : '');
          const arr = new Uint32Array(len);
          crypto.getRandomValues(arr);
          return Array.from(arr, n => chars[n % chars.length]).join('');
        };
        const paint = () => host.replaceChildren(
          out('UUID v4', T.uuid()), out('Password', password()),
          h('div.row', null,
            h('label.row', { for: 'pw-len', style: { fontSize: 'var(--t-sm)' } }, `Length ${len}`, h('input', { id: 'pw-len', type: 'range', min: 8, max: 64, value: len, style: { width: '140px' }, oninput: e => { len = +e.target.value; paint(); } })),
            h('label.row', { for: 'pw-sym', style: { fontSize: 'var(--t-sm)' } }, h('input', { id: 'pw-sym', type: 'checkbox', checked: symbols, onchange: e => { symbols = e.target.checked; paint(); } }), 'Symbols'),
            h('button.btn.sm', { type: 'button', onclick: paint }, icon('reset'), 'Regenerate')),
          out('Random seed (32-bit)', String(crypto.getRandomValues(new Uint32Array(1))[0])),
          h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Generated with your browser’s secure random source. Nothing leaves this page.'));
        paint();
        return [host];
      },
    },
  ];

  function render(page) {
    const nav = h('ul.list');
    const panel = h('div.sheet-body.stack', { style: { gap: '14px' } });
    const title = h('h2');
    const paint = () => {
      const tool = TOOLS.find(t => t.id === active) || TOOLS[0];
      nav.replaceChildren(...TOOLS.map(t => h('li', { style: { cursor: 'pointer', background: t.id === active ? 'var(--mark-soft)' : '', padding: '9px 16px' }, onclick: () => { active = t.id; paint(); } },
        h('div.grow', null, h('div', { style: { fontWeight: 600 } }, t.label), h('div.faint', { style: { fontSize: 'var(--t-xs)' } }, t.desc)))));
      title.textContent = tool.label;
      panel.replaceChildren(...tool.render());
    };
    paint();
    page.append(
      h('header.page-head', null, h('div', null, h('div.eyebrow', null, 'Make'), h('h1', null, 'Toolbox')),
        h('div.actions', null, h('span.faint', { style: { fontSize: 'var(--t-sm)' } }, 'Tip: type ', h('kbd', null, '='), ' in the command bar to calculate'))),
      h('div.grid', { style: { gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)' }, class: 'tool-grid' },
        h('nav.sheet', { style: { alignSelf: 'start' }, 'aria-label': 'Tools' }, nav),
        h('section.sheet', null, h('div.sheet-head', null, title), panel)));
  }

  Bench.module({
    id: 'toolbox', title: 'Toolbox', short: 'Tools', icon: 'toolbox', group: 'make', key: 'x',
    render,
    commands: () => TOOLS.map(t => ({ label: `${t.label}: ${t.desc}`, icon: 'toolbox', run: () => { active = t.id; Bench.navigate('toolbox'); } })),
  });
})(window.Bench);
