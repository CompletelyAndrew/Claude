/* Bench · quickadd.js
 * Turns one line of plain text into a structured task.
 *   "Playtest Line Load fri 3pm !high #games every week"
 *   → { title: "Playtest Line Load", due: <Fri 15:00>, priority: 3,
 *       tags: ["games"], repeat: "week" }
 * Pure: pass `now` in for deterministic results.
 */
(function (root) {
  'use strict';

  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const PRIORITY = { low: 1, '1': 1, med: 2, medium: 2, '2': 2, high: 3, '3': 3, urgent: 3 };

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function parseTime(str) {
    const m = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    let h = +m[1];
    const min = m[2] ? +m[2] : 0;
    const ap = m[3] && m[3].toLowerCase();
    if (!ap && !m[2]) return null; // a bare number is not a time
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return { h, min };
  }

  function parse(input, now = new Date()) {
    let text = ' ' + String(input || '').trim() + ' ';
    const out = { title: '', due: null, hasTime: false, priority: 0, tags: [], repeat: null };
    const today = startOfDay(now);
    let date = null;

    const take = (re, fn) => {
      text = text.replace(re, (...args) => { const r = fn(...args); return r === false ? args[0] : ' '; });
    };

    // #tags
    take(/\s#([\p{L}\p{N}_-]+)/gu, (_, t) => { out.tags.push(t.toLowerCase()); });

    // !priority  or  !!! / !!
    take(/\s!(low|med|medium|high|urgent|[123])\b/gi, (_, p) => { out.priority = PRIORITY[p.toLowerCase()]; });
    take(/\s(!{1,3})(?=\s)/g, (_, b) => { out.priority = Math.max(out.priority, b.length); });

    // repeat
    take(/\severy\s+(day|week|month|year|weekday)\b/gi, (_, r) => { out.repeat = r.toLowerCase(); });
    take(/\s(daily|weekly|monthly|yearly)\b/gi, (_, r) => {
      out.repeat = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.toLowerCase()];
    });

    // relative dates
    take(/\s(today|tonight|tod)\b/gi, (_, w) => { date = today; if (/tonight/i.test(w)) out._defaultTime = { h: 19, min: 0 }; });
    take(/\s(tomorrow|tmrw|tmr)\b/gi, () => { date = addDays(today, 1); });
    take(/\sin\s+(\d+)\s+(day|days|week|weeks)\b/gi, (_, n, u) => { date = addDays(today, +n * (/week/i.test(u) ? 7 : 1)); });
    take(/\snext\s+week\b/gi, () => { date = addDays(today, 7 - ((today.getDay() + 6) % 7)); });

    // weekdays ("fri", "next friday")
    take(/\s(next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|urday|sday)?\b/gi, (_, next, d) => {
      const target = DAYS.indexOf(d.slice(0, 3).toLowerCase());
      let diff = (target - today.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      if (next && diff < 7) diff += 7;
      date = addDays(today, diff);
    });

    // absolute dates: 2026-10-14, 10/14, oct 14, 14 oct
    take(/\s(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => { date = new Date(+y, +m - 1, +d); });
    take(/\s(\d{1,2})\/(\d{1,2})\b/g, (_, m, d) => {
      date = new Date(today.getFullYear(), +m - 1, +d);
      if (date < today) date.setFullYear(date.getFullYear() + 1);
    });
    const monRe = new RegExp(`\\s(?:(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})|(\\d{1,2})\\s+(${MONTHS.join('|')})[a-z]*)\\b`, 'gi');
    take(monRe, (_, m1, d1, d2, m2) => {
      const mi = MONTHS.indexOf((m1 || m2).slice(0, 3).toLowerCase());
      date = new Date(today.getFullYear(), mi, +(d1 || d2));
      if (date < today) date.setFullYear(date.getFullYear() + 1);
    });

    // times: "at 3pm", "15:30", "9am"
    let time = null;
    take(/\s(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\b/gi, (_, t) => {
      const p = parseTime(t.replace(/\s+/g, ''));
      if (!p) return false;
      time = p;
    });

    if (!time && out._defaultTime) time = out._defaultTime;
    if (time && !date) date = today;
    if (date) {
      const d = new Date(date);
      if (time) { d.setHours(time.h, time.min, 0, 0); out.hasTime = true; }
      out.due = d;
    }
    delete out._defaultTime;

    out.title = text.replace(/\s+/g, ' ').trim();
    if (!out.title) out.title = 'Untitled task';
    return out;
  }

  // Next occurrence of a repeating task after it is completed.
  function nextDue(due, repeat) {
    if (!due || !repeat) return null;
    const d = new Date(due);
    if (repeat === 'day') d.setDate(d.getDate() + 1);
    else if (repeat === 'week') d.setDate(d.getDate() + 7);
    else if (repeat === 'month') d.setMonth(d.getMonth() + 1);
    else if (repeat === 'year') d.setFullYear(d.getFullYear() + 1);
    else if (repeat === 'weekday') {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    }
    return d;
  }

  const api = { parse, nextDue };
  root.Bench = root.Bench || {};
  root.Bench.quickadd = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
