/* Bench · Notes
 * Markdown notes with live preview, [[wiki links]], backlinks and pinning.
 */
(function (Bench) {
  'use strict';
  const { h, icon, store, uid, toast } = Bench;

  const all = () => store.get('notes', []);
  const save = list => store.set('notes', list);
  let activeId = null;
  let mode = 'split'; // write | split | read
  let filter = '';

  function titleOf(body) {
    const m = String(body).match(/^\s*#\s+(.+)$/m);
    return m ? m[1].trim() : (String(body).trim().split('\n')[0] || 'Untitled').slice(0, 80);
  }

  function create(title = 'Untitled') {
    const n = { id: uid(), title, body: `# ${title}\n\n`, updated: new Date().toISOString(), pinned: false };
    save([n, ...all()]);
    return n;
  }

  function openByTitle(title) {
    const n = all().find(x => x.title.toLowerCase() === title.toLowerCase()) || create(title);
    activeId = n.id;
    Bench.navigate('notes', n.id);
  }

  function render(page) {
    const arg = Bench.takeArg();
    if (arg) activeId = arg;
    if (!all().some(n => n.id === activeId)) activeId = (sorted()[0] || {}).id || null;

    const listHost = h('ul.list', { style: { maxHeight: '62vh', overflowY: 'auto' } });
    const search = h('input.input', { id: 'note-search', type: 'search', placeholder: 'Filter notes', value: filter, oninput: e => { filter = e.target.value.toLowerCase(); paintList(); } });
    const editorHost = h('div', { style: { minWidth: 0 } });

    function sorted() {
      return all().slice().sort((a, b) => (b.pinned - a.pinned) || b.updated.localeCompare(a.updated));
    }

    function paintList() {
      const notes = sorted().filter(n => !filter || n.title.toLowerCase().includes(filter) || n.body.toLowerCase().includes(filter));
      listHost.replaceChildren(...notes.map(n => h('li', {
        style: { cursor: 'pointer', background: n.id === activeId ? 'var(--mark-soft)' : '' },
        onclick: () => { activeId = n.id; paintList(); paintEditor(); },
      },
        h('div.grow', null,
          h('div.title', { style: { fontWeight: 600 } }, n.pinned ? '• ' : '', n.title || 'Untitled'),
          h('div.meta', null, Bench.tools.relative(new Date(n.updated)), ' · ', Bench.md.wordCount(n.body), ' words', n.sample ? h('span.sample-tag', null, 'Sample') : null)))));
      if (!notes.length) listHost.replaceChildren(h('li', null, h('span.faint', null, filter ? 'No notes match.' : 'No notes yet.')));
    }

    function paintEditor() {
      const note = all().find(n => n.id === activeId);
      if (!note) {
        editorHost.replaceChildren(h('div.sheet', null, h('div.empty', null, h('b', null, 'No note open'), 'Create one to start writing.',
          h('div', { style: { marginTop: '12px' } }, h('button.btn.primary', { type: 'button', onclick: () => { activeId = create().id; paintList(); paintEditor(); } }, icon('plus'), 'New note')))));
        return;
      }
      const ta = h('textarea.input.mono', { id: 'note-body', value: note.body, spellcheck: 'true', style: { minHeight: '58vh', border: 0, background: 'transparent', borderRadius: 0, resize: 'none', lineHeight: '1.6' }, 'aria-label': 'Note text' });
      const preview = h('div.prose', { style: { padding: '4px 2px' } });
      const backlinks = h('div.meta');
      const status = h('span.faint.num', { style: { fontSize: 'var(--t-xs)' } });

      const paintPreview = () => {
        preview.innerHTML = Bench.md.render(ta.value);
        preview.querySelectorAll('a.wikilink').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openByTitle(a.dataset.note); }));
        const t = titleOf(ta.value);
        const refs = all().filter(n => n.id !== note.id && Bench.md.links(n.body).some(l => l.toLowerCase() === t.toLowerCase()));
        backlinks.replaceChildren(refs.length ? h('span', null, 'Linked from ') : h('span', null, 'No backlinks yet'),
          ...refs.map(r => h('button', { class: 'chip mark', style: { border: 0, cursor: 'pointer' }, onclick: () => { activeId = r.id; paintList(); paintEditor(); } }, r.title)));
        status.textContent = `${Bench.md.wordCount(ta.value)} words · ${Math.max(1, Math.round(Bench.md.wordCount(ta.value) / 230))} min read`;
      };
      const persist = Bench.debounce(() => {
        save(all().map(n => n.id === note.id ? { ...n, body: ta.value, title: titleOf(ta.value), updated: new Date().toISOString(), sample: false } : n));
        paintList();
      }, 350);
      ta.addEventListener('input', () => { paintPreview(); persist(); });
      ta.addEventListener('keydown', e => {
        // Tab indents; Ctrl/Cmd+B bolds the selection
        if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd) || 'bold';
          ta.setRangeText(`**${sel}**`, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input'));
        }
      });
      paintPreview();

      const seg = h('div.seg', { role: 'group', 'aria-label': 'Layout' }, ...['write', 'split', 'read'].map(m =>
        h('button', { type: 'button', 'aria-pressed': String(mode === m), onclick: () => { mode = m; paintEditor(); } }, m[0].toUpperCase() + m.slice(1))));

      let confirmHost = h('div');
      const del = () => {
        confirmHost.replaceChildren(h('div.confirm', null, `Delete “${note.title}”?`, h('span.spacer'),
          h('button.btn.sm', { type: 'button', onclick: () => confirmHost.replaceChildren() }, 'Keep'),
          h('button.btn.sm.dark', { type: 'button', onclick: () => {
            const before = all();
            save(before.filter(n => n.id !== note.id)); activeId = null; paintList(); paintEditor();
            toast('Note deleted', { label: 'Undo', run: () => { save(before); activeId = note.id; Bench.navigate('notes', note.id); } });
          } }, 'Delete')));
      };

      const panes = mode === 'write' ? [ta] : mode === 'read' ? [preview] : [ta, preview];
      editorHost.replaceChildren(h('div.sheet', null,
        h('div.sheet-head', null, seg, status,
          h('div.actions', null,
            h('button.btn.ghost.sm', { type: 'button', onclick: () => { save(all().map(n => n.id === note.id ? { ...n, pinned: !n.pinned } : n)); paintList(); paintEditor(); } }, icon('pin'), note.pinned ? 'Unpin' : 'Pin'),
            h('button.btn.ghost.sm', { type: 'button', onclick: () => Bench.copy(ta.value, 'Markdown copied') }, icon('copy'), 'Copy'),
            h('button.btn.ghost.sm', { type: 'button', onclick: () => Bench.download(Bench.tools.slugify(note.title || 'note') + '.md', ta.value, 'text/markdown') }, icon('download'), '.md'),
            h('button.btn.ghost.sm.danger', { type: 'button', onclick: del }, icon('trash')))),
        confirmHost,
        h('div', { class: 'grid', style: { gridTemplateColumns: panes.length === 2 ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr', gap: 0 } },
          ...panes.map((p, i) => h('div', { style: { padding: '14px 18px', borderLeft: i ? '1px solid var(--line)' : '0', minWidth: 0 } }, p))),
        h('div', { style: { padding: '10px 18px', borderTop: '1px solid var(--line)' } }, backlinks)));
    }

    paintList();
    paintEditor();

    page.append(
      h('header.page-head', null, h('div', null, h('div.eyebrow', null, 'Daily'), h('h1', null, 'Notes')),
        h('div.actions', null, h('button.btn.primary', { type: 'button', onclick: () => { activeId = create().id; filter = ''; search.value = ''; paintList(); paintEditor(); setTimeout(() => { const t = document.getElementById('note-body'); if (t) { t.focus(); t.selectionStart = t.value.length; } }, 0); } }, icon('plus'), 'New note'))),
      h('div.grid', { style: { gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)' }, class: 'notes-grid' },
        h('div.sheet', null, h('div.sheet-body', { style: { paddingBottom: '10px' } }, search), listHost),
        editorHost));
  }

  Bench.module({
    id: 'notes', title: 'Notes', icon: 'notes', group: 'daily', key: 'n',
    badge: () => all().length || '',
    render,
    commands: () => [{ label: 'New note', run: () => { activeId = create().id; Bench.navigate('notes', activeId); } }],
    search: q => all().filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)).slice(0, 6)
      .map(n => ({ label: n.title || 'Untitled', sub: 'note', icon: 'notes', run: () => Bench.navigate('notes', n.id) })),
  });
})(window.Bench);
