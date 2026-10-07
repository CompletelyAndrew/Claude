/* Bench · Settings
 * Theme, currency, backups, sample data and the keyboard map.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, toast } = Bench;

  function render(page) {
    const s = store.get('settings', {});
    const ledger = store.get('ledger', {});
    const theme = s.theme || 'system';
    const confirmHost = h('div');
    const samples = ['tasks', 'notes', 'trips'].reduce((a, k) => a + store.get(k, []).filter(x => x.sample).length, 0) +
      (ledger.txns || []).filter(x => x.sample).length;

    const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NZD', 'MXN', 'BRL', 'INR'];
    const mod = Bench.isMac() ? '⌘' : 'Ctrl';
    const keys = [
      [`${mod} K  or  /`, 'Command bar: jump anywhere, run anything'],
      ['n', 'New task in plain English'],
      ['g then h t n f', 'Go to Today, Tasks, Notes, Focus'],
      ['g then l x m r', 'Go to Game Lab, Toolbox, Ledger, Trips'],
      ['t', 'Cycle theme'],
      ['Space', 'Start or pause the focus timer (on Focus)'],
      ['B E G I', 'Pen, eraser, fill, picker (in the sprite editor)'],
      [`${mod} Z`, 'Undo in the sprite editor'],
      [`${mod} B`, 'Bold selection (in a note)'],
      ['+ text', 'In the command bar: add a task'],
      ['= 1920/1080', 'In the command bar: calculate'],
    ];

    page.append(
      h('header.page-head', null, h('div', null, h('div.eyebrow', null, 'Bench'), h('h1', null, 'Settings'))),
      h('div.grid.cols-2', null,
        h('div.stack', { style: { gap: '18px' } },
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Appearance')),
            h('div.sheet-body.stack', null,
              h('div.seg', { role: 'group', 'aria-label': 'Theme' }, ['system', 'light', 'dark'].map(t => h('button', { type: 'button', 'aria-pressed': String(theme === t), onclick: () => {
                store.update('settings', x => ({ ...x, theme: t }), {});
                if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
                Bench.navigate('settings');
              } }, t === 'system' ? 'Match system' : t[0].toUpperCase() + t.slice(1)))),
              h('label.field', null, h('span', null, 'Currency'),
                h('select.input', { id: 'set-currency', style: { maxWidth: '200px' }, onchange: e => { store.set('ledger', { ...store.get('ledger', {}), currency: e.target.value }); toast(`Amounts now show in ${e.target.value}`); } },
                  currencies.map(c => h('option', { value: c, selected: (ledger.currency || 'USD') === c }, c)))))),
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Your data')),
            h('div.sheet-body.stack', null,
              h('p.muted', { style: { fontSize: 'var(--t-sm)' } }, 'Everything lives in this browser’s storage. Nothing is sent anywhere. Download a backup to move between devices.'),
              h('div.row', null,
                h('button.btn.primary', { type: 'button', onclick: Bench.exportBackup }, icon('download'), 'Download backup'),
                h('button.btn', { type: 'button', onclick: Bench.importBackup }, icon('upload'), 'Restore from file'),
                h('button.btn.ghost', { type: 'button', onclick: () => Bench.copy(JSON.stringify({ app: 'bench', version: 1, state: store.snapshot() }), 'Backup JSON copied') }, icon('copy'), 'Copy JSON')),
              samples ? h('div.row', { style: { borderTop: '1px solid var(--line)', paddingTop: '12px' } },
                h('span', { style: { fontSize: 'var(--t-sm)' } }, h('b', null, samples), ' sample items are mixed in with your data.'), h('span.spacer'),
                h('button.btn.sm', { type: 'button', onclick: () => { const before = store.snapshot(); Bench.clearSamples(); toast('Samples cleared', { label: 'Undo', run: () => { store.replace(before); Bench.navigate('settings'); } }); Bench.navigate('settings'); } }, 'Clear samples')) : null,
              h('div.row', { style: { borderTop: '1px solid var(--line)', paddingTop: '12px' } },
                h('span.muted', { style: { fontSize: 'var(--t-sm)' } }, 'Start over with the sample workspace.'), h('span.spacer'),
                h('button.btn.sm.ghost.danger', { type: 'button', onclick: () => confirmHost.replaceChildren(h('div.confirm', null, 'Erase everything and reload the samples?', h('span.spacer'),
                  h('button.btn.sm', { type: 'button', onclick: () => confirmHost.replaceChildren() }, 'Cancel'),
                  h('button.btn.sm.dark', { type: 'button', onclick: () => { const before = store.snapshot(); store.replace({}); Bench.seed(); store.set('seeded', true); toast('Workspace reset', { label: 'Undo', run: () => { store.replace(before); Bench.navigate('today'); } }); Bench.navigate('today'); } }, 'Erase'))) }, 'Reset workspace')),
              confirmHost))),
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Keyboard')),
          h('table.data', null, h('tbody', null, keys.map(([k, d]) => h('tr', null, h('td', { style: { whiteSpace: 'nowrap', width: '1%' } }, h('kbd', null, k)), h('td.muted', null, d))))))),
      h('p.faint', { style: { fontSize: 'var(--t-xs)', textAlign: 'center' } }, 'Bench · built with Claude Code · plain HTML, CSS and JavaScript, no dependencies'));
  }

  Bench.module({ id: 'settings', title: 'Settings', icon: 'keyboard', group: 'system', key: 's', render });
})(window.Bench);
