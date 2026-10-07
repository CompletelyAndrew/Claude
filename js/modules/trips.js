/* Bench · Trips
 * Itinerary by day, a grouped packing list, local time at the destination,
 * a manual-rate currency converter and spend pulled from the Ledger.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, uid, toast } = Bench;
  const L = Bench.ledger;

  const all = () => store.get('trips', []);
  const save = list => store.set('trips', list);
  let activeId = null;

  const dayCount = t => Math.max(1, Math.round((new Date(t.end + 'T00:00') - new Date(t.start + 'T00:00')) / 864e5) + 1);
  const fmtDay = (iso, offset = 0) => { const d = new Date(iso + 'T00:00'); d.setDate(d.getDate() + offset); return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };

  function patch(id, fn) { save(all().map(t => (t.id === id ? fn(structuredClone(t)) : t))); }

  function newTrip() {
    const start = L.isoDay(new Date(Date.now() + 14 * 864e5)), end = L.isoDay(new Date(Date.now() + 16 * 864e5));
    const t = { id: uid(), name: 'New trip', place: '', start, end, budget: 0, tz: '', rate: '', currency: '',
      days: [{ title: '', items: [] }, { title: '', items: [] }, { title: '', items: [] }],
      packing: ['Passport or ID', 'Phone charger', 'Toothbrush', 'Headphones'].map(text => ({ id: uid(), text, group: 'Essentials', done: false })) };
    save([t, ...all()]);
    activeId = t.id;
    return t;
  }

  function render(page) {
    const arg = Bench.takeArg();
    if (arg) activeId = arg;
    const trips = all().slice().sort((a, b) => a.start.localeCompare(b.start));
    if (!trips.some(t => t.id === activeId)) activeId = (trips.find(t => new Date(t.end + 'T23:59') >= new Date()) || trips[0] || {}).id;
    const trip = trips.find(t => t.id === activeId);

    const list = h('ul.list', null, trips.map(t => {
      const days = Math.ceil((new Date(t.start + 'T00:00') - Bench.today()) / 864e5);
      const past = new Date(t.end + 'T23:59') < new Date();
      return h('li', { style: { cursor: 'pointer', background: t.id === activeId ? 'var(--mark-soft)' : '' }, onclick: () => { activeId = t.id; Bench.navigate('trips'); } },
        icon('pin'), h('div.grow', null, h('div.title', { style: { fontWeight: 600 } }, t.name),
          h('div.meta', null, t.place || 'Somewhere', ' · ', past ? 'done' : days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : 'now', t.sample ? h('span.sample-tag', null, 'Sample') : null)));
    }));

    page.append(
      h('header.page-head', null, h('div', null, h('div.eyebrow', null, 'Life'), h('h1', null, 'Trips')),
        h('div.actions', null, h('button.btn.primary', { type: 'button', onclick: () => { newTrip(); Bench.navigate('trips'); } }, icon('plus'), 'New trip'))),
      h('div.grid', { style: { gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)' }, class: 'trips-grid' },
        h('section.sheet', { style: { alignSelf: 'start' } }, trips.length ? list : h('div.empty', null, h('b', null, 'No trips yet'), 'Plan one with New trip.')),
        trip ? detail(trip) : h('div')));

    const unsub = store.subscribe(s => { if (s === '*') Bench.navigate('trips'); });
    return unsub;
  }

  function detail(t) {
    const set = (k, v) => patch(t.id, x => { x[k] = v; x.sample = false; return x; });
    const input = (key, opts = {}) => h('input.input', { id: `trip-${key}`, value: t[key] ?? '', onchange: e => { set(key, opts.type === 'number' ? +e.target.value : e.target.value); if (opts.rerender) Bench.navigate('trips', t.id); }, ...opts });

    const n = dayCount(t);
    const until = Math.ceil((new Date(t.start + 'T00:00') - Bench.today()) / 864e5);
    const packed = t.packing.filter(p => p.done).length;

    // Spending: Travel category in the Ledger between the trip's dates (plus 30 days before for bookings)
    const lead = L.isoDay(new Date(new Date(t.start + 'T00:00').getTime() - 30 * 864e5));
    const spent = (store.get('ledger', { txns: [] }).txns || []).filter(x => x.category === 'Travel' && x.amount < 0 && x.date >= lead && x.date <= t.end).reduce((a, x) => a - x.amount, 0);
    const cur = store.get('ledger', {}).currency || 'USD';

    // Itinerary
    const days = Array.from({ length: n }, (_, i) => t.days[i] || { title: '', items: [] });
    const itinerary = h('ol', { class: 'stack', style: { listStyle: 'none', margin: 0, padding: 0, gap: '0' } }, days.map((d, i) => {
      const add = h('input.input', { id: `trip-day-${i}-add`, placeholder: 'Add a plan, then Enter', style: { fontSize: 'var(--t-sm)' } });
      add.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || !add.value.trim()) return;
        patch(t.id, x => { x.days[i] = x.days[i] || { title: '', items: [] }; x.days[i].items.push(add.value.trim()); return x; });
        Bench.navigate('trips', t.id);
        setTimeout(() => { const el = document.getElementById(`trip-day-${i}-add`); if (el) el.focus(); }, 0);
      });
      return h('li', { style: { display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', gap: '12px', padding: '14px 18px', borderTop: i ? '1px solid var(--line)' : 0 } },
        h('div', null, h('div.eyebrow', null, `Day ${i + 1}`), h('div', { style: { fontWeight: 650, fontSize: 'var(--t-sm)' } }, fmtDay(t.start, i))),
        h('div.stack', { style: { gap: '6px' } },
          h('input.input', { id: `trip-day-${i}-title`, value: d.title, placeholder: 'Theme of the day', style: { fontWeight: 600, background: 'transparent', border: '1px dashed transparent', padding: '4px 6px', marginLeft: '-6px' },
            onfocus: e => { e.target.style.borderColor = 'var(--line-2)'; }, onblur: e => { e.target.style.borderColor = 'transparent'; },
            onchange: e => patch(t.id, x => { x.days[i] = x.days[i] || { title: '', items: [] }; x.days[i].title = e.target.value; return x; }) }),
          d.items.length ? h('ul', { style: { margin: 0, paddingLeft: '18px', fontSize: 'var(--t-sm)' } }, d.items.map((it, j) => h('li', null, it, ' ',
            h('button.btn.ghost.sm', { type: 'button', 'aria-label': `Remove ${it}`, style: { padding: '0 4px' }, onclick: () => { patch(t.id, x => { x.days[i].items.splice(j, 1); return x; }); Bench.navigate('trips', t.id); } }, '×')))) : null,
          add));
    }));

    // Packing
    const groups = {};
    t.packing.forEach(p => { (groups[p.group || 'Other'] = groups[p.group || 'Other'] || []).push(p); });
    const packAdd = h('input.input', { id: 'trip-pack-add', placeholder: 'Add item, e.g. “Sunglasses @Clothes”' });
    packAdd.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !packAdd.value.trim()) return;
      const m = packAdd.value.match(/^(.*?)\s*@(\S+)\s*$/);
      patch(t.id, x => { x.packing.push({ id: uid(), text: (m ? m[1] : packAdd.value).trim(), group: m ? m[2] : 'Other', done: false }); return x; });
      Bench.navigate('trips', t.id);
      setTimeout(() => { const el = document.getElementById('trip-pack-add'); if (el) el.focus(); }, 0);
    });
    const packing = h('div.stack', { style: { gap: '12px' } },
      h('div', { class: 'meter' }, h('i', { style: { width: (t.packing.length ? (packed / t.packing.length) * 100 : 0) + '%', background: 'var(--good)' } })),
      ...Object.entries(groups).map(([g, items]) => h('div', null, h('div.eyebrow', { style: { marginBottom: '4px' } }, g),
        items.map(p => h('label', { for: 'pk-' + p.id, style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '4px 0', cursor: 'pointer', fontSize: 'var(--t-sm)', textDecoration: p.done ? 'line-through' : 'none', color: p.done ? 'var(--ink-3)' : 'inherit' } },
          h('input.check', { id: 'pk-' + p.id, type: 'checkbox', checked: p.done, onchange: () => { patch(t.id, x => { const q = x.packing.find(z => z.id === p.id); q.done = !q.done; return x; }); Bench.navigate('trips', t.id); } }),
          p.text, h('span.spacer'),
          h('button.btn.ghost.sm', { type: 'button', 'aria-label': `Remove ${p.text}`, style: { padding: '0 6px' }, onclick: e => { e.preventDefault(); patch(t.id, x => { x.packing = x.packing.filter(z => z.id !== p.id); return x; }); Bench.navigate('trips', t.id); } }, '×'))))),
      packAdd);

    // Local time + currency
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) { zones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney']; }
    const clock = h('div', { style: { font: '700 var(--t-xl) var(--f-display)' }, class: 'num' });
    const tzSel = h('select.input', { id: 'trip-tz', onchange: e => { set('tz', e.target.value); paintClock(); } },
      h('option', { value: '' }, 'Pick a time zone'), zones.map(z => h('option', { value: z, selected: z === t.tz }, z.replace(/_/g, ' '))));
    function paintClock() {
      const tz = tzSel.value;
      if (!tz) { clock.textContent = '—'; return; }
      const now = new Date();
      const there = now.toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
      const offset = (new Date(now.toLocaleString('en-US', { timeZone: tz })) - new Date(now.toLocaleString('en-US'))) / 36e5;
      clock.replaceChildren(there, h('span.faint', { style: { fontSize: 'var(--t-sm)', marginLeft: '8px', fontFamily: 'var(--f-body)', fontWeight: 500 } }, offset === 0 ? 'same as you' : `${offset > 0 ? '+' : ''}${offset}h from you`));
    }
    paintClock();
    const clockTimer = setInterval(paintClock, 15000);
    const amt = h('input.input.num', { id: 'trip-amt', type: 'number', value: 100, 'aria-label': 'Amount at home' });
    const rate = h('input.input.num', { id: 'trip-rate', type: 'number', step: 'any', value: t.rate || '', placeholder: 'e.g. 0.92', 'aria-label': 'Exchange rate', onchange: e => set('rate', e.target.value) });
    const code = h('input.input', { id: 'trip-currency', value: t.currency || '', placeholder: 'EUR', maxlength: 3, style: { textTransform: 'uppercase' }, 'aria-label': 'Currency code', onchange: e => set('currency', e.target.value.toUpperCase()) });
    const out = h('div', { style: { font: '700 var(--t-xl) var(--f-display)' }, class: 'num' });
    const paintFx = () => {
      const v = (+amt.value || 0) * (+rate.value || 0);
      out.textContent = rate.value ? `${v.toFixed(2)} ${code.value.toUpperCase() || ''}` : '—';
    };
    [amt, rate, code].forEach(el => el.addEventListener('input', paintFx));
    paintFx();

    const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(t.place || '')}&checkin=${t.start}&checkout=${t.end}`;
    let confirmHost = h('div');

    const el = h('div.stack', { style: { gap: '18px', minWidth: 0 } },
      h('section.sheet', null,
        h('div.sheet-body', null, h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' } },
          h('label.field', { style: { gridColumn: 'span 2' } }, h('span', null, 'Trip'), input('name', { rerender: true })),
          h('label.field', null, h('span', null, 'Where'), input('place')),
          h('label.field', null, h('span', null, 'From'), input('start', { type: 'date', rerender: true })),
          h('label.field', null, h('span', null, 'To'), input('end', { type: 'date', rerender: true })))),
        h('div.stats', { style: { borderTop: '1px solid var(--line)' } },
          h('div.stat', null, h('div.eyebrow', null, 'Countdown'), h('div.v', null, until > 0 ? `${until} days` : until > -n ? 'Underway' : 'Done'), h('div.d', null, `${n} day${n === 1 ? '' : 's'}, ${fmtDay(t.start)} to ${fmtDay(t.end)}`)),
          h('div.stat', null, h('div.eyebrow', null, 'Packed'), h('div.v', null, `${packed}/${t.packing.length}`), h('div.d', null, packed === t.packing.length && t.packing.length ? 'ready to go' : 'keep going')),
          h('div.stat', null, h('div.eyebrow', null, 'Travel spend'), h('div.v', null, L.format(spent, cur, { whole: true })),
            h('div.d', null, t.budget ? `of ${L.format(t.budget, cur, { whole: true })} budget` : 'from Ledger, category Travel'))),
        h('div.row', { style: { padding: '12px 18px', borderTop: '1px solid var(--line)' } },
          h('a.btn.sm', { href: bookingUrl, target: '_blank', rel: 'noopener' }, icon('globe'), 'Search stays on Booking.com'),
          h('label.row', { for: 'trip-budget', style: { fontSize: 'var(--t-sm)' } }, h('span.faint', null, 'Budget'),
            h('input.input.num', { id: 'trip-budget', inputmode: 'decimal', style: { width: '110px' }, value: t.budget ? (t.budget / 100).toFixed(0) : '', placeholder: '0', onchange: e => { set('budget', Math.abs(L.toCents(e.target.value))); Bench.navigate('trips', t.id); } })),
          h('span.spacer'),
          h('button.btn.ghost.sm.danger', { type: 'button', onclick: () => confirmHost.replaceChildren(h('div.confirm', null, `Delete “${t.name}”?`, h('span.spacer'),
            h('button.btn.sm', { type: 'button', onclick: () => confirmHost.replaceChildren() }, 'Keep'),
            h('button.btn.sm.dark', { type: 'button', onclick: () => { const before = all(); save(before.filter(x => x.id !== t.id)); activeId = null; Bench.navigate('trips'); toast('Trip deleted', { label: 'Undo', run: () => { save(before); Bench.navigate('trips', t.id); } }); } }, 'Delete'))) }, icon('trash'), 'Delete')),
        confirmHost),
      h('div.grid.cols-main', null,
        h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Itinerary')), itinerary),
        h('div.stack', { style: { gap: '18px' } },
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Packing')), h('div.sheet-body', null, packing)),
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Local time')), h('div.sheet-body.stack', null, tzSel, clock)),
          h('section.sheet', null, h('div.sheet-head', null, h('h2', null, 'Money there')),
            h('div.sheet-body.stack', null,
              h('div.grid', { style: { gridTemplateColumns: '1fr 1fr 80px', gap: '8px' } }, h('label.field', null, h('span', null, 'Amount'), amt), h('label.field', null, h('span', null, 'Rate'), rate), h('label.field', null, h('span', null, 'Code'), code)),
              out, h('p.faint', { style: { fontSize: 'var(--t-xs)' } }, 'Bench works offline, so enter today’s rate yourself.'))))));
    el._cleanup = () => clearInterval(clockTimer);
    detail.cleanup = el._cleanup;
    return el;
  }

  Bench.module({
    id: 'trips', title: 'Trips', icon: 'trips', group: 'life', key: 'r',
    badge: () => { const up = all().filter(t => new Date(t.end + 'T23:59') >= new Date()).length; return up || ''; },
    render(page) { const un = render(page); return () => { un(); if (detail.cleanup) detail.cleanup(); }; },
    commands: () => [{ label: 'Plan a new trip', icon: 'plus', run: () => { newTrip(); Bench.navigate('trips'); } }],
    search: q => all().filter(t => (t.name + ' ' + t.place).toLowerCase().includes(q)).map(t => ({ label: t.name, sub: t.place, icon: 'trips', run: () => Bench.navigate('trips', t.id) })),
  });
})(window.Bench);
