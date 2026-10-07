/* Bench · Tasks
 * Plain-English capture ("fri 3pm !high #tanks every week"), smart views,
 * repeating tasks and tags.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, uid, fmtDue, toast } = Bench;

  const all = () => store.get('tasks', []);
  const save = list => store.set('tasks', list);

  Bench.addTask = function addTask(text) {
    const p = Bench.quickadd.parse(text);
    const task = { id: uid(), title: p.title, done: false, due: p.due ? p.due.toISOString() : null, hasTime: p.hasTime, priority: p.priority, tags: p.tags, repeat: p.repeat, created: new Date().toISOString() };
    save([task, ...all()]);
    toast(`Added “${task.title}”${task.due ? ' for ' + fmtDue(task.due, task.hasTime) : ''}`);
    return task;
  };

  function toggle(id) {
    const list = all().map(t => ({ ...t }));
    const t = list.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    if (t.done && t.repeat && t.due) {
      const next = Bench.quickadd.nextDue(new Date(t.due), t.repeat);
      list.unshift({ ...t, id: uid(), done: false, doneAt: null, due: next.toISOString(), created: new Date().toISOString(), sample: false });
      toast(`Next one is ${fmtDue(next.toISOString(), t.hasTime)}`);
    }
    save(list);
  }

  function remove(id) {
    const before = all();
    save(before.filter(t => t.id !== id));
    toast('Task deleted', { label: 'Undo', run: () => save(before) });
  }

  const startOfToday = () => Bench.today().getTime();
  const endOfToday = () => startOfToday() + 864e5;
  function bucket(t) {
    if (t.done) return 'done';
    if (!t.due) return 'someday';
    const d = new Date(t.due).getTime();
    if (d < startOfToday()) return 'overdue';
    if (d < endOfToday()) return 'today';
    if (d < startOfToday() + 7 * 864e5) return 'week';
    return 'later';
  }
  Bench.taskBucket = bucket;

  const VIEWS = [
    { id: 'focus', label: 'Today', test: t => ['overdue', 'today'].includes(bucket(t)) },
    { id: 'week', label: 'Next 7 days', test: t => !t.done && ['overdue', 'today', 'week'].includes(bucket(t)) },
    { id: 'all', label: 'All open', test: t => !t.done },
    { id: 'done', label: 'Done', test: t => t.done },
  ];

  function sortTasks(list) {
    return list.slice().sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ad = a.due ? new Date(a.due).getTime() : Infinity, bd = b.due ? new Date(b.due).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  function taskRow(t, opts = {}) {
    const b = bucket(t);
    const dueChip = t.due ? h('span', { class: 'chip ' + (b === 'overdue' ? 'bad' : b === 'today' ? 'mark' : '') }, icon('clock'), fmtDue(t.due, t.hasTime)) : null;
    return h('li', { class: t.done ? 'is-done' : '' },
      h('span', { class: 'pri p' + (t.priority || 0), title: ['No priority', 'Low', 'Medium', 'High'][t.priority || 0] }),
      h('input.check', { type: 'checkbox', checked: !!t.done, 'aria-label': `Complete ${t.title}`, onchange: () => toggle(t.id) }),
      h('div.grow', null,
        h('div.title', null, t.title),
        (dueChip || t.tags.length || t.repeat || t.sample) ? h('div.meta', null, dueChip,
          t.repeat ? h('span.chip', null, '↻ every ' + t.repeat) : null,
          t.tags.map(tag => h('button', { class: 'chip blue', style: { border: 0, cursor: 'pointer' }, onclick: () => opts.onTag && opts.onTag(tag) }, '#' + tag)),
          t.sample ? h('span.sample-tag', null, 'Sample') : null) : null),
      opts.compact ? null : h('button', { class: 'btn ghost icon', 'aria-label': `Delete ${t.title}`, onclick: () => remove(t.id) }, icon('trash')));
  }
  Bench.taskRow = taskRow;

  let view = 'focus';
  let tagFilter = null;

  function render(page) {
    const input = h('input.input', {
      id: 'task-quick', type: 'text', autocomplete: 'off',
      placeholder: 'Add a task: “Playtest build fri 3pm !high #games every week”',
    });
    const preview = h('div.meta', { style: { minHeight: '22px' } });
    const paintPreview = () => {
      const v = input.value.trim();
      if (!v) { preview.replaceChildren(h('span.faint', null, 'Dates, times, !priority, #tags and “every week” are understood.')); return; }
      const p = Bench.quickadd.parse(v);
      preview.replaceChildren(
        h('span.chip', null, p.title),
        p.due ? h('span.chip.mark', null, icon('clock'), fmtDue(p.due.toISOString(), p.hasTime)) : null,
        p.priority ? h('span', { class: 'chip ' + (p.priority === 3 ? 'bad' : 'warn') }, ['', 'Low', 'Medium', 'High'][p.priority]) : null,
        p.repeat ? h('span.chip', null, '↻ every ' + p.repeat) : null,
        p.tags.map(t => h('span.chip.blue', null, '#' + t)));
    };
    input.addEventListener('input', paintPreview);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) { Bench.addTask(input.value); input.value = ''; paintPreview(); }
    });
    paintPreview();

    const seg = h('div.seg', { role: 'group', 'aria-label': 'View' });
    const listHost = h('div');
    const tagHost = h('div.row');

    function paint() {
      const tasks = all();
      seg.replaceChildren(...VIEWS.map(v => h('button', { type: 'button', 'aria-pressed': String(view === v.id), onclick: () => { view = v.id; paint(); } },
        v.label, ' ', h('span.faint.num', null, tasks.filter(v.test).length))));
      const tags = [...new Set(tasks.filter(t => !t.done).flatMap(t => t.tags))].sort();
      tagHost.replaceChildren(...tags.map(t => h('button', { class: 'chip ' + (tagFilter === t ? 'mark' : ''), style: { border: 0, cursor: 'pointer' }, 'aria-pressed': String(tagFilter === t), onclick: () => { tagFilter = tagFilter === t ? null : t; paint(); } }, '#' + t)));

      const v = VIEWS.find(x => x.id === view);
      let shown = sortTasks(tasks.filter(v.test));
      if (tagFilter) shown = shown.filter(t => t.tags.includes(tagFilter));
      if (view === 'done') shown.sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0));

      if (!shown.length) {
        listHost.replaceChildren(h('div.empty', null, h('b', null, view === 'focus' ? 'Nothing due today' : 'No tasks here'), 'Type one above and press Enter.'));
        return;
      }
      // Group by bucket for the open views
      const groups = view === 'done' ? [['Done', shown]] : Object.entries(shown.reduce((acc, t) => {
        const k = { overdue: 'Overdue', today: 'Today', week: 'This week', later: 'Later', someday: 'No date', done: 'Done' }[bucket(t)];
        (acc[k] = acc[k] || []).push(t); return acc;
      }, {}));
      listHost.replaceChildren(...groups.map(([name, items]) => h('section', null,
        h('div.eyebrow', { style: { padding: '14px 18px 6px' } }, name, ' · ', items.length),
        h('ul.list', null, items.map(t => taskRow(t, { onTag: tag => { tagFilter = tag; paint(); } }))))));
    }
    paint();
    const unsub = store.subscribe(s => { if (s === 'tasks' || s === '*') paint(); });

    page.append(
      h('header.page-head', null, h('div', null, h('div.eyebrow', null, 'Daily'), h('h1', null, 'Tasks'))),
      h('div.sheet', null,
        h('div.sheet-body.stack', null, h('label.visually-hidden', { for: 'task-quick' }, 'New task'), input, preview)),
      h('div.sheet', null,
        h('div.sheet-head', null, seg, h('div.actions', null, tagHost)),
        listHost));
    setTimeout(() => input.focus(), 0);
    return unsub;
  }

  Bench.module({
    id: 'tasks', title: 'Tasks', icon: 'tasks', group: 'daily', key: 't',
    badge: () => all().filter(t => ['overdue', 'today'].includes(bucket(t))).length || '',
    render,
    commands: () => [{ label: 'New task…', hint: 'n', run: () => Bench.openPalette('+ ') }],
    search: q => all().filter(t => t.title.toLowerCase().includes(q) || t.tags.some(x => x.includes(q.replace('#', ''))))
      .slice(0, 6).map(t => ({ label: t.title, sub: t.done ? 'done' : fmtDue(t.due, t.hasTime), icon: 'tasks', run: () => { tagFilter = null; view = t.done ? 'done' : 'all'; Bench.navigate('tasks'); } })),
  });
})(window.Bench);
