/* Bench · Today
 * The front page: what's due, how the week is going, where money stands,
 * and a scratchpad. Reads every other module's data; owns none.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, fmtDue } = Bench;

  function greeting() {
    const hr = new Date().getHours();
    return hr < 5 ? 'Late night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  }

  function focusByDay(sessions, n = 7) {
    const out = [];
    const t0 = Bench.today();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(t0); d.setDate(d.getDate() - i);
      const mins = sessions.filter(s => Bench.sameDay(new Date(s.start), d)).reduce((a, s) => a + s.minutes, 0);
      out.push({ d, mins });
    }
    return out;
  }
  Bench.focusByDay = focusByDay;

  function weekBars(days) {
    const W = 280, H = 84, pad = 18, bw = 26;
    const max = Math.max(60, ...days.map(d => d.mins));
    const step = (W - bw) / (days.length - 1);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H + pad}`);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Focus minutes over the last 7 days: ' + days.map(d => d.mins).join(', '));
    let html = `<line class="gridline" x1="0" x2="${W}" y1="${H}" y2="${H}"/>`;
    days.forEach((d, i) => {
      const bh = Math.max(d.mins ? 3 : 0, (d.mins / max) * (H - 16));
      const x = i * step;
      const isToday = i === days.length - 1;
      html += `<rect x="${x}" y="${H - bh}" width="${bw}" height="${bh}" rx="3" fill="${isToday ? 'var(--mark)' : 'var(--ink)'}" opacity="${isToday ? 1 : 0.85}"/>`;
      if (d.mins) html += `<text x="${x + bw / 2}" y="${H - bh - 4}" text-anchor="middle">${d.mins}</text>`;
      html += `<text x="${x + bw / 2}" y="${H + 14}" text-anchor="middle">${d.d.toLocaleDateString(undefined, { weekday: 'narrow' })}</text>`;
    });
    svg.innerHTML = html;
    return svg;
  }

  function render(page, { navigate }) {
    const tasks = store.get('tasks', []);
    const focus = store.get('focus', { sessions: [] });
    const ledgerData = store.get('ledger', { txns: [], budgets: {}, currency: 'USD' });
    const trips = store.get('trips', []);
    const L = Bench.ledger;

    const dueNow = tasks.filter(t => ['overdue', 'today'].includes(Bench.taskBucket(t)))
      .sort((a, b) => new Date(a.due) - new Date(b.due) || b.priority - a.priority);
    const overdue = dueNow.filter(t => Bench.taskBucket(t) === 'overdue').length;
    const week = focusByDay(focus.sessions || []);
    const todayMins = week[week.length - 1].mins;
    const weekMins = week.reduce((a, d) => a + d.mins, 0);
    const month = L.monthKey(new Date());
    const sum = L.summarize(ledgerData.txns || [], month);
    const watch = L.budgets(ledgerData.txns || [], ledgerData.budgets, month).filter(b => b.state !== 'ok');
    const upcoming = trips.filter(t => new Date(t.end + 'T23:59') >= Bench.today()).sort((a, b) => a.start.localeCompare(b.start))[0];
    const tripDays = upcoming ? Math.ceil((new Date(upcoming.start + 'T00:00') - Bench.today()) / 864e5) : null;
    const cur = ledgerData.currency || 'USD';

    const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const lede = dueNow.length
      ? [`You have `, h('span.marked', null, `${dueNow.length} thing${dueNow.length === 1 ? '' : 's'} due`), overdue ? `, ${overdue} carried over from before.` : ' today.']
      : ['Nothing is due today. ', h('span.marked', null, 'Good day to make something.')];

    page.append(
      h('header.page-head', null,
        h('div', null,
          h('div.eyebrow', null, dateLine),
          h('h1', null, greeting() + '.'),
          h('p.muted', { style: { marginTop: '6px', fontSize: 'var(--t-lg)' } }, ...lede)),
        h('div.actions', null,
          h('button.btn', { type: 'button', onclick: () => Bench.openPalette('+ ') }, icon('plus'), 'Task'),
          h('button.btn.primary', { type: 'button', onclick: () => { Bench.focusAutoStart = true; navigate('focus'); } }, icon('play'), 'Start focus'))),

      h('div.sheet', null, h('div.stats', null,
        stat('Due today', dueNow.length, overdue ? `${overdue} overdue` : 'all on time', () => navigate('tasks')),
        stat('Focus today', fmtMins(todayMins), `${fmtMins(weekMins)} this week`, () => navigate('focus')),
        stat('Net this month', L.format(sum.net, cur, { whole: true }), `${L.format(sum.expense, cur, { whole: true })} spent`, () => navigate('ledger')),
        upcoming ? stat('Next trip', tripDays <= 0 ? 'Now' : `${tripDays} day${tripDays === 1 ? '' : 's'}`, upcoming.name, () => navigate('trips'))
          : stat('Next trip', '—', 'Plan one in Trips', () => navigate('trips')))),

      h('div.grid.cols-main', null,
        h('div.stack', { style: { gap: '18px' } },
          h('section.sheet', null,
            h('div.sheet-head', null, h('h2', null, 'Due now'), h('div.actions', null, h('a.btn.ghost.sm', { href: '#tasks' }, 'All tasks', icon('arrow')))),
            dueNow.length ? h('ul.list', null, dueNow.slice(0, 7).map(t => Bench.taskRow(t, { compact: true })))
              : h('div.empty', null, h('b', null, 'All clear'), 'Press n anywhere to capture a task.')),
          scratchpad()),
        h('div.stack', { style: { gap: '18px' } },
          h('section.sheet', null,
            h('div.sheet-head', null, h('h2', null, 'Focus, last 7 days'), h('div.actions', null, h('span.chip.num', null, fmtMins(weekMins)))),
            h('div.sheet-body', null, weekBars(week))),
          h('section.sheet', null,
            h('div.sheet-head', null, h('h2', null, 'Budget watch')),
            watch.length ? h('ul.list', null, watch.slice(0, 4).map(b => h('li', null,
              h('div.grow', null,
                h('div.row', null, h('span.title', null, b.name), h('span.spacer'), h('span.num.mono.faint', { style: { fontSize: 'var(--t-xs)' } }, `${L.format(b.used, cur, { whole: true })} of ${L.format(b.limit, cur, { whole: true })}`)),
                h('div', { class: 'meter ' + b.state, style: { marginTop: '6px' } }, h('i', { style: { width: Math.min(100, b.ratio * 100) + '%' } }))))))
              : h('div.empty', null, h('b', null, 'Every budget is on track'), 'Set limits in Ledger.')),
          recentNotes(navigate))));

  }

  // Re-render in place when tasks change (checking one off here)
  function mount(page, ctx) {
    render(page, ctx);
    return store.subscribe(s => {
      if (s !== 'tasks') return;
      const main = document.getElementById('main'), y = main ? main.scrollTop : 0;
      page.replaceChildren();
      render(page, ctx);
      if (main) main.scrollTop = y;
    });
  }

  function stat(label, value, detail, onClick) {
    return h('button', { class: 'stat', type: 'button', onclick: onClick },
      h('div.eyebrow', null, label), h('div.v', null, String(value)), h('div.d', null, detail));
  }

  function fmtMins(m) { return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; }
  Bench.fmtMins = fmtMins;

  function scratchpad() {
    const ta = h('textarea.input', { id: 'scratch', rows: 5, placeholder: 'A scratchpad that remembers. Jot a phone number, a bug repro, a lyric…', value: store.get('scratch', '') });
    const save = Bench.debounce(() => store.set('scratch', ta.value), 300);
    ta.addEventListener('input', save);
    return h('section.sheet', null,
      h('div.sheet-head', null, h('h2', null, 'Scratchpad'),
        h('div.actions', null, h('button.btn.ghost.sm', { type: 'button', onclick: () => {
          if (!ta.value.trim()) return;
          const first = ta.value.trim().split('\n')[0].slice(0, 60);
          const note = { id: Bench.uid(), title: first, body: ta.value, updated: new Date().toISOString(), pinned: false };
          store.set('notes', [note, ...store.get('notes', [])]);
          ta.value = ''; store.set('scratch', '');
          Bench.toast('Saved as a note');
        } }, icon('notes'), 'Save as note'))),
      h('div.sheet-body', null, ta));
  }

  function recentNotes(navigate) {
    const notes = store.get('notes', []).slice().sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 4);
    return h('section.sheet', null,
      h('div.sheet-head', null, h('h2', null, 'Recent notes'), h('div.actions', null, h('a.btn.ghost.sm', { href: '#notes' }, 'Notes', icon('arrow')))),
      notes.length ? h('ul.list', null, notes.map(n => h('li', { style: { cursor: 'pointer' }, onclick: () => navigate('notes', n.id) },
        icon('notes'), h('div.grow', null, h('div.title', null, n.title || 'Untitled'), h('div.meta', null, Bench.tools.relative(new Date(n.updated)))))))
        : h('div.empty', null, h('b', null, 'No notes yet'), 'Write one in Notes.'));
  }

  Bench.module({ id: 'today', title: 'Today', icon: 'today', group: 'daily', key: 'h', render: mount });
})(window.Bench);
