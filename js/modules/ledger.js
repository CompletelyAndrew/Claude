/* Bench · Ledger
 * Personal and studio money: monthly overview, transactions with bank CSV
 * import, category budgets and an invoice builder.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, uid, toast } = Bench;
  const L = Bench.ledger;

  const CATEGORIES = ['Income', 'Housing', 'Groceries', 'Dining', 'Transport', 'Utilities', 'Subscriptions', 'Software & Games', 'Travel', 'Health', 'Gifts', 'Other'];
  const data = () => store.get('ledger', { currency: 'USD', budgets: {}, txns: [], invoice: null });
  const save = patch => store.set('ledger', { ...data(), ...patch });
  const cur = () => data().currency || 'USD';
  const money = (c, o) => L.format(c, cur(), o);

  let tab = 'overview';
  let month = L.monthKey(new Date());
  let query = '';

  function shiftMonth(key, n) {
    const [y, m] = key.split('-').map(Number);
    return L.monthKey(new Date(y, m - 1 + n, 1));
  }
  const monthLabel = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };

  // ---- Charts -------------------------------------------------------------------
  function barChart(rows) {
    const W = 560, H = 190, padL = 46, padB = 24, top = 10;
    const max = Math.max(1, ...rows.flatMap(r => [r.income, r.expense]));
    const nice = niceMax(max);
    const gw = (W - padL) / rows.length, bw = Math.min(22, gw / 3);
    const y = v => top + (H - top - padB) * (1 - v / nice);
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const v = (nice / 4) * i;
      s += `<line class="gridline" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`;
    }
    rows.forEach((r, i) => {
      const cx = padL + gw * i + gw / 2;
      const sel = r.key === month;
      s += `<rect class="bar-in" x="${cx - bw - 2}" y="${y(r.income)}" width="${bw}" height="${Math.max(0, H - padB - y(r.income))}" rx="2" opacity="${sel ? 1 : 0.55}"><title>${r.label} income ${money(r.income)}</title></rect>`;
      s += `<rect class="bar-out" x="${cx + 2}" y="${y(r.expense)}" width="${bw}" height="${Math.max(0, H - padB - y(r.expense))}" rx="2" opacity="${sel ? 1 : 0.6}"><title>${r.label} spent ${money(r.expense)}</title></rect>`;
      s += `<text x="${cx}" y="${H - 6}" text-anchor="middle" style="${sel ? 'fill:var(--ink);font-weight:700' : ''}">${r.label}</text>`;
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Income and spending by month');
    svg.innerHTML = s;
    return svg;
  }
  function niceMax(v) {
    const cents = v / 100;
    const mag = Math.pow(10, Math.floor(Math.log10(cents || 1)));
    const n = [1, 2, 2.5, 5, 10].find(x => x * mag >= cents) * mag;
    return n * 100;
  }
  function short(cents) {
    const v = cents / 100;
    return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(v));
  }

  // ---- Tabs ---------------------------------------------------------------------
  function overview() {
    const txns = data().txns || [];
    const s = L.summarize(txns, month);
    const prev = L.summarize(txns, shiftMonth(month, -1));
    const rate = s.income ? Math.round((s.net / s.income) * 100) : 0;
    const delta = prev.expense ? Math.round(((s.expense - prev.expense) / prev.expense) * 100) : 0;
    const [y, m] = month.split('-').map(Number);
    const rows = L.monthly(txns, 6, new Date(y, m - 1, 1));
    const max = s.categories.length ? s.categories[0].total : 1;

    return h('div.stack', { style: { gap: '18px' } },
      h('div.sheet', null, h('div.stats', null,
        statBox('Income', money(s.income), `${s.count} transactions`),
        statBox('Spent', money(s.expense), prev.expense ? `${delta > 0 ? '+' : ''}${delta}% vs last month` : 'no prior month'),
        statBox('Net', money(s.net, { sign: true }), s.net >= 0 ? 'in the black' : 'in the red'),
        statBox('Savings rate', `${rate}%`, rate >= 20 ? 'healthy' : rate >= 0 ? 'room to grow' : 'spending more than earned'))),
      h('div.grid.cols-main', null,
        h('section.sheet', null,
          h('div.sheet-head', null, h('h2', null, 'Six months'),
            h('div.actions.legend', null, h('span', null, h('i', { style: { background: 'var(--ink)' } }), 'Income'), h('span', null, h('i', { style: { background: 'var(--mark)' } }), 'Spent'))),
          h('div.sheet-body', null, barChart(rows))),
        h('section.sheet', null,
          h('div.sheet-head', null, h('h2', null, 'Where it went')),
          s.categories.length ? h('ul.list', null, s.categories.slice(0, 7).map(c => h('li', null, h('div.grow', null,
            h('div.row', null, h('span.title', null, c.name), h('span.spacer'), h('span.mono.num', { style: { fontSize: 'var(--t-sm)' } }, money(c.total)), h('span.faint.mono.num', { style: { fontSize: 'var(--t-xs)', width: '3.2em', textAlign: 'right' } }, Math.round(c.share * 100) + '%')),
            h('div.meter', { style: { marginTop: '6px' } }, h('i', { style: { width: (c.total / max) * 100 + '%' } }))))))
            : h('div.empty', null, h('b', null, 'No spending this month'), 'Add a transaction or import a bank CSV.'))));
  }

  function statBox(label, value, detail) {
    return h('div.stat', null, h('div.eyebrow', null, label), h('div.v', null, value), h('div.d', null, detail));
  }

  function transactions(rerender) {
    const date = h('input.input', { id: 'tx-date', type: 'date', value: L.isoDay(new Date()) });
    const payee = h('input.input', { id: 'tx-payee', type: 'text', placeholder: 'Payee or description' });
    const amount = h('input.input.num', { id: 'tx-amount', type: 'text', inputmode: 'decimal', placeholder: '0.00' });
    const kind = h('select.input', { id: 'tx-kind' }, h('option', { value: 'out' }, 'Spent'), h('option', { value: 'in' }, 'Received'));
    const cat = h('select.input', { id: 'tx-cat' }, CATEGORIES.map(c => h('option', { value: c, selected: c === 'Other' }, c)));
    payee.addEventListener('input', () => { const g = L.guessCategory(payee.value, kind.value === 'in' ? 1 : -1); if (g !== 'Other') cat.value = g; });
    kind.addEventListener('change', () => { if (kind.value === 'in') cat.value = 'Income'; });

    const add = e => {
      e.preventDefault();
      const cents = Math.abs(L.toCents(amount.value));
      if (!cents) { toast('Enter an amount, like 12.50'); amount.focus(); return; }
      const t = { id: uid(), date: date.value || L.isoDay(new Date()), payee: payee.value.trim() || 'Untitled', amount: kind.value === 'in' ? cents : -cents, category: cat.value };
      save({ txns: [t, ...data().txns] });
      const fresh = document.getElementById('tx-payee');
      if (fresh) fresh.focus();
      toast(`Recorded ${money(t.amount, { sign: true })}`);
    };

    const search = h('input.input', { id: 'tx-search', type: 'search', placeholder: 'Search payee or category', value: query });
    const tableHost = h('div.table-wrap');
    const paintTable = () => {
      const q = query.toLowerCase();
      const rows = (data().txns || []).filter(t => !q || t.payee.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
      tableHost.replaceChildren(rows.length ? h('table.data', null,
        h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Payee'), h('th', null, 'Category'), h('th.amt', null, 'Amount'), h('th', null, h('span.visually-hidden', null, 'Actions')))),
        h('tbody', null, rows.map(t => h('tr', null,
          h('td.mono.num', { style: { whiteSpace: 'nowrap' } }, t.date),
          h('td', null, t.payee, t.sample ? [' ', h('span.sample-tag', null, 'Sample')] : null),
          h('td', null, h('span.chip', null, t.category)),
          h('td', { class: 'amt' + (t.amount > 0 ? ' pos' : '') }, money(t.amount, { sign: true })),
          h('td', { style: { width: '1%' } }, h('button.btn.ghost.icon', { type: 'button', 'aria-label': `Delete ${t.payee}`, onclick: () => {
            const before = data().txns;
            save({ txns: before.filter(x => x.id !== t.id) });
            toast('Transaction deleted', { label: 'Undo', run: () => save({ txns: before }) });
          } }, icon('trash')))))))
        : h('div.empty', null, h('b', null, 'No transactions'), query ? 'Nothing matches that search.' : 'Add one above or import a CSV from your bank.'));
    };
    search.addEventListener('input', () => { query = search.value; paintTable(); });
    paintTable();

    const importCSV = async () => {
      const f = await Bench.pickFile('.csv,text/csv');
      if (!f) return;
      const rows = L.importBank(f.text).map(t => ({ ...t, id: uid() }));
      if (!rows.length) { toast('No transactions found. The file needs Date, Description and Amount columns.'); return; }
      const before = data().txns;
      save({ txns: [...rows, ...before] });
      toast(`Imported ${rows.length} transactions from ${f.name}`, { label: 'Undo', run: () => save({ txns: before }) });
    };
    const exportCSV = () => {
      const rows = [['Date', 'Payee', 'Category', 'Amount'], ...data().txns.map(t => [t.date, t.payee, t.category, (t.amount / 100).toFixed(2)])];
      Bench.download(`ledger-${L.isoDay(new Date())}.csv`, L.toCSV(rows), 'text/csv');
    };

    return h('div.stack', { style: { gap: '18px' } },
      h('form.sheet', { onsubmit: add },
        h('div.sheet-body', null, h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', alignItems: 'end' } },
          h('label.field', null, h('span', null, 'Date'), date),
          h('label.field', { style: { gridColumn: 'span 2' } }, h('span', null, 'Payee'), payee),
          h('label.field', null, h('span', null, 'Type'), kind),
          h('label.field', null, h('span', null, 'Amount'), amount),
          h('label.field', null, h('span', null, 'Category'), cat),
          h('button.btn.primary', { type: 'submit' }, icon('plus'), 'Add')))),
      h('section.sheet', null,
        h('div.sheet-head', null, h('div', { style: { flex: '1 1 220px', maxWidth: '340px' } }, search),
          h('div.actions', null,
            h('button.btn.sm', { type: 'button', onclick: importCSV }, icon('upload'), 'Import bank CSV'),
            h('button.btn.sm', { type: 'button', onclick: exportCSV }, icon('download'), 'Export CSV'))),
        tableHost));
  }

  function budgets() {
    const d = data();
    const status = L.budgets(d.txns || [], d.budgets, month);
    const rows = CATEGORIES.filter(c => c !== 'Income').map(c => {
      const st = status.find(s => s.name === c);
      const spent = L.summarize(d.txns || [], month).categories.find(x => x.name === c);
      const input = h('input.input.num', { id: 'budget-' + Bench.tools.slugify(c), type: 'text', inputmode: 'decimal', placeholder: 'No limit', value: d.budgets[c] ? (d.budgets[c] / 100).toFixed(0) : '', style: { maxWidth: '120px' } });
      input.addEventListener('change', () => {
        const b = { ...data().budgets };
        const v = Math.abs(L.toCents(input.value));
        if (v) b[c] = v; else delete b[c];
        save({ budgets: b });
      });
      return h('li', null,
        h('div.grow', null,
          h('div.row', null, h('span.title', { style: { fontWeight: 600 } }, c),
            st ? h('span', { class: 'chip ' + (st.state === 'over' ? 'bad' : st.state === 'near' ? 'warn' : 'good') }, st.state === 'over' ? 'Over' : st.state === 'near' ? 'Close' : 'On track') : null,
            h('span.spacer'), h('span.mono.num.faint', { style: { fontSize: 'var(--t-xs)' } }, money(spent ? spent.total : 0), st ? ` of ${money(st.limit, { whole: true })}` : ' spent')),
          st ? h('div', { class: 'meter ' + st.state, style: { marginTop: '6px' } }, h('i', { style: { width: Math.min(100, st.ratio * 100) + '%' } })) : null),
        h('label.visually-hidden', { for: input.id }, `${c} monthly limit`), input);
    });
    return h('section.sheet', null,
      h('div.sheet-head', null, h('h2', null, 'Monthly limits'), h('div.actions', null, h('span.faint', { style: { fontSize: 'var(--t-sm)' } }, 'Blank means no limit. Changes save as you leave the field.'))),
      h('ul.list', null, rows));
  }

  function invoice() {
    const d = data();
    const inv = d.invoice || { number: 'INV-0001', from: '', to: '', date: L.isoDay(new Date()), due: '', items: [{ desc: '', qty: 1, rate: '' }], taxRate: 0, discount: 0, notes: '' };
    const set = patch => { Object.assign(inv, patch); save({ invoice: inv }); paintPreview(); };
    const preview = h('div');

    const field = (label, key, type = 'text', extra = {}) => {
      const el = type === 'textarea'
        ? h('textarea.input', { id: 'inv-' + key, rows: 3, value: inv[key] || '', oninput: e => set({ [key]: e.target.value }), style: { minHeight: '72px' }, ...extra })
        : h('input.input', { id: 'inv-' + key, type, value: inv[key] ?? '', oninput: e => set({ [key]: e.target.value }), ...extra });
      return h('label.field', null, h('span', null, label), el);
    };

    const itemsHost = h('div.stack', { style: { gap: '8px' } });
    const paintItems = () => {
      itemsHost.replaceChildren(...inv.items.map((it, i) => h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 1fr) 64px 92px auto', gap: '6px' } },
        h('input.input', { id: `inv-desc-${i}`, 'aria-label': 'Description', placeholder: 'Description', value: it.desc, oninput: e => { inv.items[i].desc = e.target.value; set({}); } }),
        h('input.input.num', { id: `inv-qty-${i}`, 'aria-label': 'Quantity', type: 'number', min: 0, step: 'any', value: it.qty, oninput: e => { inv.items[i].qty = e.target.value; set({}); } }),
        h('input.input.num', { id: `inv-rate-${i}`, 'aria-label': 'Rate', inputmode: 'decimal', placeholder: 'Rate', value: it.rate, oninput: e => { inv.items[i].rate = e.target.value; set({}); } }),
        h('button.btn.ghost.icon', { type: 'button', 'aria-label': 'Remove line', onclick: () => { inv.items.splice(i, 1); set({}); paintItems(); } }, icon('x')))),
      h('button.btn.sm', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { inv.items.push({ desc: '', qty: 1, rate: '' }); set({}); paintItems(); } }, icon('plus'), 'Add line'));
    };
    paintItems();

    function invoiceText() {
      const t = L.invoiceTotals(inv.items, inv.taxRate, inv.discount);
      const lines = inv.items.filter(i => i.desc || i.rate).map(i => `- ${i.desc || 'Item'}: ${i.qty} × ${money(L.toCents(i.rate))} = ${money(Math.round(i.qty * L.toCents(i.rate)))}`);
      return [`INVOICE ${inv.number}`, `Date: ${inv.date}${inv.due ? `   Due: ${inv.due}` : ''}`, '', `From:\n${inv.from}`, '', `Bill to:\n${inv.to}`, '', ...lines, '',
        `Subtotal: ${money(t.subtotal)}`, t.discount ? `Discount: -${money(t.discount)}` : null, t.tax ? `Tax (${inv.taxRate}%): ${money(t.tax)}` : null, `TOTAL DUE: ${money(t.total)}`, '', inv.notes].filter(x => x != null).join('\n');
    }

    function paintPreview() {
      const t = L.invoiceTotals(inv.items, inv.taxRate, inv.discount);
      const pre = s => h('div', { style: { whiteSpace: 'pre-line' } }, s || '—');
      preview.replaceChildren(h('article', { class: 'invoice-sheet', style: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px' } },
        h('div.row', { style: { alignItems: 'flex-start' } },
          h('div', null, h('div.eyebrow', null, 'Invoice'), h('div', { style: { font: '750 var(--t-xl) var(--f-display)' } }, inv.number || '—')),
          h('span.spacer'),
          h('div', { style: { textAlign: 'right', fontSize: 'var(--t-sm)' }, class: 'mono num' }, h('div', null, 'Issued ', inv.date || '—'), inv.due ? h('div', null, 'Due ', h('span.marked', null, inv.due)) : null)),
        h('div.grid.cols-2', { style: { fontSize: 'var(--t-sm)' } }, h('div', null, h('div.eyebrow', null, 'From'), pre(inv.from)), h('div', null, h('div.eyebrow', null, 'Bill to'), pre(inv.to))),
        h('div.table-wrap', null, h('table.data', null,
          h('thead', null, h('tr', null, h('th', { style: { paddingLeft: 0 } }, 'Item'), h('th.amt', null, 'Qty'), h('th.amt', null, 'Rate'), h('th.amt', { style: { paddingRight: 0 } }, 'Amount'))),
          h('tbody', null, inv.items.map(i => h('tr', null, h('td', { style: { paddingLeft: 0 } }, i.desc || '—'), h('td.amt', null, i.qty), h('td.amt', null, money(L.toCents(i.rate))), h('td.amt', { style: { paddingRight: 0 } }, money(Math.round((+i.qty || 0) * L.toCents(i.rate))))))))),
        h('div', { style: { marginLeft: 'auto', minWidth: '220px', fontSize: 'var(--t-sm)' }, class: 'stack' },
          totalRow('Subtotal', money(t.subtotal)),
          t.discount ? totalRow(`Discount (${inv.discount}%)`, '−' + money(t.discount)) : null,
          t.tax ? totalRow(`Tax (${inv.taxRate}%)`, money(t.tax)) : null,
          h('div.row', { style: { borderTop: '2px solid var(--ink)', paddingTop: '8px', font: '700 var(--t-lg) var(--f-display)' } }, 'Total due', h('span.spacer'), h('span.num', null, money(t.total)))),
        inv.notes ? h('p.muted', { style: { fontSize: 'var(--t-sm)' } }, inv.notes) : null));
    }
    const totalRow = (k, v) => h('div.row', null, h('span.muted', null, k), h('span.spacer'), h('span.mono.num', null, v));
    paintPreview();

    const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
    return h('div.grid.cols-2', null,
      h('section.sheet', null,
        h('div.sheet-head', null, h('h2', null, 'Details')),
        h('div.sheet-body.stack', null,
          h('div.grid', { style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' } }, field('Number', 'number'), field('Issued', 'date', 'date'), field('Due', 'due', 'date')),
          h('div.grid.cols-2', { style: { gap: '10px' } }, field('From', 'from', 'textarea'), field('Bill to', 'to', 'textarea')),
          h('div.field', null, h('span', null, 'Line items'), itemsHost),
          h('div.grid.cols-2', { style: { gap: '10px' } }, field('Tax %', 'taxRate', 'number', { min: 0, step: 'any' }), field('Discount %', 'discount', 'number', { min: 0, step: 'any' })),
          field('Notes', 'notes', 'textarea'))),
      h('section.stack', null,
        h('div.row', null,
          h('button.btn', { type: 'button', onclick: () => Bench.copy(invoiceText(), 'Invoice copied as text') }, icon('copy'), 'Copy as text'),
          inFrame ? null : h('button.btn', { type: 'button', onclick: () => window.print() }, icon('download'), 'Print or save PDF'),
          h('button.btn.ghost', { type: 'button', onclick: () => {
            const n = (inv.number || 'INV-0000').replace(/(\d+)(?!.*\d)/, m => String(+m + 1).padStart(m.length, '0'));
            set({ number: n, date: L.isoDay(new Date()) }); rerender();
          } }, 'Next number')),
        preview));
  }

  function render(page) {
    const body = h('div');
    const tabs = h('div.tabs', { role: 'tablist' });
    const monthNav = h('div.row');
    function paint() {
      tabs.replaceChildren(...[['overview', 'Overview'], ['transactions', 'Transactions'], ['budgets', 'Budgets'], ['invoice', 'Invoice']].map(([id, label]) =>
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; paint(); } }, label)));
      monthNav.replaceChildren(...(tab === 'overview' || tab === 'budgets' ? [
        h('button.btn.ghost.icon', { type: 'button', 'aria-label': 'Previous month', onclick: () => { month = shiftMonth(month, -1); paint(); } }, h('span', { 'aria-hidden': 'true' }, '‹')),
        h('span', { style: { fontWeight: 600, minWidth: '9em', textAlign: 'center' } }, monthLabel(month)),
        h('button.btn.ghost.icon', { type: 'button', 'aria-label': 'Next month', onclick: () => { month = shiftMonth(month, 1); paint(); } }, h('span', { 'aria-hidden': 'true' }, '›'))] : []));
      body.replaceChildren(tab === 'overview' ? overview() : tab === 'transactions' ? transactions(paint) : tab === 'budgets' ? budgets() : invoice(paint));
    }
    paint();
    const unsub = store.subscribe(s => { if ((s === 'ledger' && tab !== 'invoice' && tab !== 'transactions') || s === '*') paint(); });
    const unsub2 = store.subscribe(s => {
      if (s === 'ledger' && tab === 'transactions') {
        // keep focus in the form; only refresh the table region
        const active = document.activeElement && document.activeElement.id;
        paint();
        const el = active && document.getElementById(active);
        if (el) el.focus();
      }
    });

    page.append(
      h('header.page-head', null, h('div', null, h('div.eyebrow', null, 'Life'), h('h1', null, 'Ledger')),
        h('div.actions', null, monthNav)),
      tabs, body);
    return () => { unsub(); unsub2(); };
  }

  Bench.module({
    id: 'ledger', title: 'Ledger', icon: 'ledger', group: 'life', key: 'm',
    render,
    commands: () => [
      { label: 'Record a transaction', icon: 'plus', run: () => { tab = 'transactions'; Bench.navigate('ledger'); } },
      { label: 'Write an invoice', icon: 'invoice', run: () => { tab = 'invoice'; Bench.navigate('ledger'); } },
      { label: 'Import bank CSV', icon: 'upload', run: () => { tab = 'transactions'; Bench.navigate('ledger'); } },
    ],
    search: q => (data().txns || []).filter(t => t.payee.toLowerCase().includes(q)).slice(0, 4)
      .map(t => ({ label: `${t.payee} ${money(t.amount, { sign: true })}`, sub: t.date, icon: 'ledger', run: () => { tab = 'transactions'; query = t.payee; Bench.navigate('ledger'); } })),
  });
})(window.Bench);
