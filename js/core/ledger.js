/* Bench · ledger.js
 * Money math and CSV handling. Amounts are stored as integer cents so
 * totals never drift. Income is positive, expenses are negative.
 */
(function (root) {
  'use strict';

  function toCents(value) {
    if (typeof value === 'number') return Math.round(value * 100);
    let s = String(value || '').trim();
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    s = s.replace(/[^0-9.,]/g, '');
    // "1.234,56" (EU) vs "1,234.56" (US)
    if (/,\d{2}$/.test(s) && s.indexOf('.') < s.lastIndexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = Math.round(parseFloat(s || '0') * 100);
    return neg ? -n : n;
  }

  function format(cents, currency = 'USD', opts = {}) {
    const v = (cents || 0) / 100;
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency, signDisplay: opts.sign ? 'exceptZero' : 'auto',
        maximumFractionDigits: opts.whole ? 0 : 2, minimumFractionDigits: opts.whole ? 0 : 2,
      }).format(v);
    } catch (e) {
      return (v < 0 ? '-' : '') + '$' + Math.abs(v).toFixed(opts.whole ? 0 : 2);
    }
  }

  // Date-only strings ("2026-10-01") are calendar dates, not UTC instants.
  function monthKey(date) {
    if (typeof date === 'string' && /^\d{4}-\d{2}/.test(date)) return date.slice(0, 7);
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function summarize(txns, month) {
    const rows = month ? txns.filter(t => monthKey(t.date) === month) : txns;
    let income = 0, expense = 0;
    const byCat = {};
    for (const t of rows) {
      if (t.amount >= 0) income += t.amount;
      else {
        expense += -t.amount;
        byCat[t.category || 'Other'] = (byCat[t.category || 'Other'] || 0) + -t.amount;
      }
    }
    const categories = Object.entries(byCat)
      .map(([name, total]) => ({ name, total, share: expense ? total / expense : 0 }))
      .sort((a, b) => b.total - a.total);
    return { income, expense, net: income - expense, count: rows.length, categories };
  }

  // Last `n` months ending with `endMonth`, oldest first.
  function monthly(txns, n = 6, end = new Date()) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
      const key = monthKey(d);
      const s = summarize(txns, key);
      out.push({ key, label: d.toLocaleString(undefined, { month: 'short' }), income: s.income, expense: s.expense, net: s.net });
    }
    return out;
  }

  // Budget status for each category with a monthly limit.
  function budgets(txns, limits, month) {
    const s = summarize(txns, month);
    const spent = Object.fromEntries(s.categories.map(c => [c.name, c.total]));
    return Object.entries(limits || {}).map(([name, limit]) => {
      const used = spent[name] || 0;
      const ratio = limit ? used / limit : 0;
      return { name, limit, used, ratio, state: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok' };
    }).sort((a, b) => b.ratio - a.ratio);
  }

  // RFC 4180-ish CSV parser: quotes, escaped quotes, commas and newlines in fields.
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', q = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(f => f.trim() !== ''));
  }

  function toCSV(rows) {
    return rows.map(r => r.map(v => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
  }

  // Map a bank export into transactions by sniffing the header row.
  function importBank(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];
    const head = rows[0].map(h => h.toLowerCase().trim());
    const col = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
    const iDate = col('date', 'posted');
    const iDesc = col('description', 'payee', 'memo', 'name', 'details');
    const iAmt = col('amount', 'value');
    const iDebit = col('debit', 'withdrawal');
    const iCredit = col('credit', 'deposit');
    const iCat = col('category');
    return rows.slice(1).map(r => {
      let amount = iAmt >= 0 ? toCents(r[iAmt]) : toCents(r[iCredit] || 0) - Math.abs(toCents(r[iDebit] || 0));
      const d = new Date(r[iDate]);
      return {
        date: isoDay(isNaN(d) ? new Date() : d),
        payee: (r[iDesc] || '').trim() || 'Imported',
        amount,
        category: (iCat >= 0 && r[iCat]) ? r[iCat].trim() : guessCategory(r[iDesc] || '', amount),
      };
    }).filter(t => t.amount !== 0);
  }

  function isoDay(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const RULES = [
    [/steam|itch\.io|epic games|humble|unity|godot|jetbrains|github|adobe|figma/i, 'Software & Games'],
    [/spotify|netflix|apple\.com|youtube|disney|hulu/i, 'Subscriptions'],
    [/uber|lyft|shell|chevron|exxon|bp |transit|metro|parking/i, 'Transport'],
    [/airbnb|booking\.com|hotel|airline|delta|united|southwest|expedia/i, 'Travel'],
    [/whole foods|trader joe|safeway|kroger|grocer|market|aldi|costco/i, 'Groceries'],
    [/restaurant|cafe|coffee|starbucks|doordash|grubhub|pizza|taco|burger/i, 'Dining'],
    [/rent|mortgage|landlord/i, 'Housing'],
    [/electric|water|gas co|comcast|verizon|at&t|t-mobile|internet/i, 'Utilities'],
  ];
  function guessCategory(desc, amount) {
    if (amount > 0) return 'Income';
    for (const [re, cat] of RULES) if (re.test(desc)) return cat;
    return 'Other';
  }

  function invoiceTotals(items, taxRate = 0, discount = 0) {
    const subtotal = items.reduce((s, it) => s + Math.round((+it.qty || 0) * toCents(it.rate)), 0);
    const disc = Math.round(subtotal * (+discount || 0) / 100);
    const tax = Math.round((subtotal - disc) * (+taxRate || 0) / 100);
    return { subtotal, discount: disc, tax, total: subtotal - disc + tax };
  }

  const api = { isoDay, toCents, format, monthKey, summarize, monthly, budgets, parseCSV, toCSV, importBank, guessCategory, invoiceTotals };
  root.Bench = root.Bench || {};
  root.Bench.ledger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
