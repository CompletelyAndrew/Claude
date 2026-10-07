/* Bench · markdown.js
 * A small, safe Markdown renderer. Escapes all HTML first, then applies a
 * deliberate subset: headings, emphasis, code, links, lists, task lists,
 * quotes, rules, tables and [[wiki links]] between notes.
 */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeUrl(url) {
    const u = url.trim();
    if (/^(https?:|mailto:|#|\/|\.\/)/i.test(u)) return u;
    return '#';
  }

  // Inline formatting. Input is already HTML-escaped.
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    s = s
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) =>
        `<a href="#notes" class="wikilink" data-note="${target.trim()}">${(label || target).trim()}</a>`)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img alt="${alt}" src="${safeUrl(url)}">`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) =>
        `<a href="${safeUrl(url)}" target="_blank" rel="noopener">${text}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/==([^=]+)==/g, '<mark>$1</mark>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  }

  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
  }

  function render(src) {
    const lines = esc(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code
      const fence = line.match(/^```\s*([\w-]*)\s*$/);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        const lang = fence[1] ? ` data-lang="${fence[1]}"` : '';
        out.push(`<pre${lang}><code>${buf.join('\n')}</code></pre>`);
        continue;
      }

      if (/^\s*$/.test(line)) { i++; continue; }

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const n = h[1].length;
        out.push(`<h${n}>${inline(h[2])}</h${n}>`);
        i++;
        continue;
      }

      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      if (/^&gt;\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^&gt;\s?/.test(lines[i])) buf.push(lines[i++].replace(/^&gt;\s?/, ''));
        out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
        continue;
      }

      // Tables: header row, separator row, body rows
      if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /\|/.test(lines[i]) && !/^\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
        out.push('<div class="md-table"><table><thead><tr>' +
          head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>');
        continue;
      }

      // Lists (one level; task items supported)
      const li = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
      if (li) {
        const ordered = /\d/.test(li[1]);
        const tag = ordered ? 'ol' : 'ul';
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
          if (!m || /\d/.test(m[1]) !== ordered) break;
          const task = m[2].match(/^\[( |x|X)\]\s+(.*)$/);
          if (task) {
            const done = task[1] !== ' ';
            items.push(`<li class="task${done ? ' done' : ''}"><span class="box" aria-hidden="true"></span>${inline(task[2])}</li>`);
          } else {
            items.push(`<li>${inline(m[2])}</li>`);
          }
          i++;
        }
        out.push(`<${tag}>${items.join('')}</${tag}>`);
        continue;
      }

      // Paragraph: gather until blank line or block start
      const buf = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
        !/^(#{1,6}\s|```|&gt;|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join('<br>'))}</p>`);
    }
    return out.join('\n');
  }

  // Titles of notes linked with [[...]] from a body of text.
  function links(src) {
    const set = new Set();
    String(src || '').replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (_, t) => set.add(t.trim()));
    return [...set];
  }

  function wordCount(src) {
    const m = String(src || '').replace(/```[\s\S]*?```/g, ' ').match(/[\p{L}\p{N}'’-]+/gu);
    return m ? m.length : 0;
  }

  const api = { render, links, wordCount, escape: esc };
  root.Bench = root.Bench || {};
  root.Bench.md = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
