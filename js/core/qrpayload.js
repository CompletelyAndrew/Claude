/* Bench · qrpayload.js
 * What a QR payload is and where it leads: classify(text) names the type,
 * pulls out its fields, says what a phone will do with it, and raises
 * the safety flags a careful reader would. Builders go the other way.
 */
(function (root) {
  'use strict';

  const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 's.id', 'tiny.cc', 'rb.gy', 'shorturl.at', 't.ly', 'bl.ink', 'lnkd.in', 'shorturl.com', 'v.gd', 'qr.net', 'urlz.fr'];
  // Hosted "dynamic QR" services: the printed code points at them and they forward on
  const DYNAMIC = ['qrco.de', 'qr-code-generator.com', 'me-qr.com', 'qrfy.com', 'qrcodechimp.com', 'beaconstac.com', 'qr.page', 'l.ead.me', 'qrs.ly', 'scan.page', 'linktr.ee', 'uqr.me', 'qrcode-monkey.com'];
  const RISKY_FILES = /\.(apk|exe|msi|dmg|pkg|scr|bat|cmd|jar|vbs|ps1|iso)$/i;
  const NEW_TLDS = /\.(zip|mov|top|xyz|click|country|gq|tk|ml|cf|work|rest|cam)$/i;
  const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_eid|mc_cid|igshid|yclid|_hs\w+|ref|src|campaign)$/i;
  const BRANDS = ['paypal', 'apple', 'microsoft', 'google', 'amazon', 'netflix', 'chase', 'wellsfargo', 'usps', 'fedex', 'dhl', 'irs', 'hmrc'];
  const LURES = /(login|verify|secure|account|update|parking|payment|refund|wallet)/;

  const flag = (level, code, msg) => ({ level, code, msg });

  // ---- Field parsers --------------------------------------------------------------
  // MECARD / WIFI style: KEY:value;KEY:value;; with \ escapes
  function keyed(body) {
    const out = {};
    let key = '', val = '', inKey = true;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === '\\' && i + 1 < body.length) { (inKey ? (key += body[++i]) : (val += body[++i])); continue; }
      if (inKey && c === ':') { inKey = false; continue; }
      if (!inKey && c === ';') { if (key) out[key.toUpperCase()] = out[key.toUpperCase()] ? out[key.toUpperCase()] + ', ' + val : val; key = ''; val = ''; inKey = true; continue; }
      if (inKey) key += c; else val += c;
    }
    if (key && !inKey) out[key.toUpperCase()] = val;
    return out;
  }

  // vCard / iCalendar: unfold lines, NAME;PARAMS:value
  function lines(text) {
    const out = {};
    const unfolded = text.replace(/\r?\n[ \t]/g, '');
    for (const line of unfolded.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z-]+)(?:;[^:]*)?:(.*)$/);
      if (!m) continue;
      const k = m[1].toUpperCase();
      const v = m[2].replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
      out[k] = out[k] ? out[k] + ', ' + v : v;
    }
    return out;
  }

  function query(qs) {
    const out = {};
    for (const part of String(qs || '').replace(/^\?/, '').split('&')) {
      if (!part) continue;
      const [k, v = ''] = part.split('=');
      try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { out[k] = v; }
    }
    return out;
  }

  function gtinValid(digits) {
    if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
    const d = digits.split('').map(Number), check = d.pop();
    const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === check;
  }

  function icsDate(s) {
    const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
    return m ? `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : s;
  }

  // ---- URLs ---------------------------------------------------------------------------
  function urlInfo(raw) {
    const flags = [];
    let u;
    try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw); }
    catch (e) { return null; }
    const host = u.hostname.toLowerCase();
    const rawHost = (raw.match(/^[a-z]+:\/\/(?:[^@/]*@)?([^/:?#]+)/i) || [])[1] || host;
    const bare = host.replace(/^www\./, '');
    const fields = [['Address', u.href]];

    if (u.protocol === 'http:') flags.push(flag('warn', 'http', 'Not encrypted (http, not https). Anyone on the network can read or alter the page.'));
    if (u.username || u.password || /^[a-z]+:\/\/[^/?#]*@/i.test(raw)) flags.push(flag('bad', 'userinfo', `Everything before “@” is ignored. This really goes to ${host}.`));
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) flags.push(flag('bad', 'ip', 'Points at a raw IP address instead of a name. Legitimate businesses almost never do this.'));
    if (/[^\x00-\x7f]/.test(rawHost) || host.split('.').some(l => l.startsWith('xn--'))) {
      const scripts = new Set([...rawHost].map(c => (/[a-z0-9.-]/i.test(c) ? 'latin' : /[Ѐ-ӿ]/.test(c) ? 'cyrillic' : /[Ͱ-Ͽ]/.test(c) ? 'greek' : 'other')));
      flags.push(scripts.size > 1
        ? flag('bad', 'lookalike', 'The domain mixes alphabets, a classic lookalike trick (е and e look identical).')
        : flag('warn', 'punycode', 'International domain name. Check it is the one you expect.'));
    }
    if (SHORTENERS.includes(bare)) flags.push(flag('warn', 'shortener', 'Link shortener: the real destination is hidden until you open it.'));
    if (DYNAMIC.some(d => bare === d || bare.endsWith('.' + d))) flags.push(flag('info', 'dynamic', 'Dynamic QR service: the code forwards on, and its owner can change where it goes after printing.'));
    if (u.port && !['80', '443'].includes(u.port)) flags.push(flag('warn', 'port', `Uses an unusual port (${u.port}).`));
    if (RISKY_FILES.test(u.pathname)) flags.push(flag('bad', 'download', 'Downloads an app or program file directly. Install apps from your app store instead.'));
    if (NEW_TLDS.test(host)) flags.push(flag('info', 'tld', `The .${host.split('.').pop()} ending is cheap and popular with throwaway sites.`));
    const labels = bare.split('.');
    const owner = labels.slice(-2).join('.');
    const brandHit = BRANDS.find(b => bare.includes(b) && labels[labels.length - 2] !== b);
    if (brandHit) flags.push(flag('warn', 'brand', `“${brandHit}” appears in the address, but the site that owns it is ${owner}.`));
    else if (LURES.test(labels[labels.length - 2]) && labels[labels.length - 2].includes('-')) flags.push(flag('warn', 'lure', `${owner} is built from words like “login” or “verify”. Real services use their own name.`));
    if (labels.length > 4) flags.push(flag('info', 'subdomains', 'Lots of subdomains. The part that matters is the last two.'));
    const params = query(u.search);
    const tracking = Object.keys(params).filter(k => TRACKING.test(k));
    if (tracking.length) flags.push(flag('info', 'tracking', `Carries tracking tags (${tracking.join(', ')}). The owner learns this scan came from this code.`));

    // What kind of place is it?
    let kind = 'website', action = `Opens ${bare} in your browser`;
    const path = u.pathname;
    if (/^(apps|itunes)\.apple\.com$/.test(host) || (host === 'play.google.com' && path.startsWith('/store'))) { kind = 'app-store'; action = 'Opens an app store page'; }
    else if (/^maps\.(google|apple)\.com$/.test(host) || (bare === 'google.com' && path.startsWith('/maps')) || (bare === 'goo.gl' && path.startsWith('/maps'))) { kind = 'map'; action = 'Opens a map location'; }
    else if (bare === 'wa.me' || host === 'api.whatsapp.com') { kind = 'chat'; action = 'Starts a WhatsApp chat'; }
    else if (['paypal.me', 'venmo.com', 'cash.app', 'buy.stripe.com', 'square.link', 'pay.google.com'].includes(bare)) { kind = 'payment'; action = 'Opens a payment page'; flags.push(flag('warn', 'pay', 'Leads to a payment. Check who you are paying before you confirm.')); }
    else if (/\/01\/\d{14}/.test(path)) { kind = 'product'; action = 'GS1 Digital Link: a product page keyed by its barcode number'; fields.push(['GTIN', path.match(/\/01\/(\d{14})/)[1]]); }
    else if (['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'facebook.com', 'x.com', 'twitter.com', 'linkedin.com'].includes(bare)) { kind = 'social'; action = `Opens ${bare}`; }
    else if (/(^|\.)(menu|order|toasttab|opentable|resy)\b/.test(host) || /\/menu\b/i.test(path)) { kind = 'menu'; action = 'Opens a menu or ordering page'; }
    fields.push(['Domain', host]);
    if (path && path !== '/') fields.push(['Path', path]);
    if (u.search) fields.push(['Query', Object.entries(params).map(([k, v]) => `${k}=${v}`).join(' · ')]);
    return { kind, action, host, href: u.href, fields, flags };
  }

  // ---- classify ---------------------------------------------------------------------------
  function classify(input) {
    const text = String(input ?? '');
    const t = text.trim();
    const res = (type, label, action, fields = [], flags = [], extra = {}) => ({ type, label, action, fields, flags, length: text.length, ...extra });

    if (!t) return res('empty', 'Empty', 'Nothing to do');

    if (/^(javascript|vbscript|data|file):/i.test(t)) return res('script', 'Script or local file', 'Tries to run code or open a file on your device', [['Content', t.slice(0, 80)]], [flag('bad', 'scheme', `${t.split(':')[0].toLowerCase()}: links are never something a poster or menu needs.`)]);
    if (/^intent:/i.test(t)) return res('intent', 'Android intent', 'Asks Android to open a specific app', [['Content', t.slice(0, 120)]], [flag('warn', 'intent', 'Launches an app directly. Make sure you expect it.')]);

    if (/^WIFI:/i.test(t)) {
      const f = keyed(t.slice(5));
      const auth = (f.T || 'nopass').toUpperCase();
      const flags = [];
      if (auth === 'WEP') flags.push(flag('warn', 'wep', 'WEP is long broken; this network is not really protected.'));
      if (auth === 'NOPASS' || !f.P) flags.push(flag('info', 'open', 'Open network: no password, so others can see your traffic.'));
      return res('wifi', 'Wi-Fi login', `Joins the Wi-Fi network “${f.S || '?'}”`,
        [['Network', f.S || ''], ['Security', auth === 'NOPASS' ? 'None' : auth], ['Password', f.P || '(none)'], ...(f.H === 'true' ? [['Hidden', 'Yes']] : [])], flags, { data: f });
    }

    if (/^BEGIN:VCARD/i.test(t)) {
      const f = lines(t);
      return res('vcard', 'Contact card (vCard)', `Offers to save ${f.FN || f.N || 'a contact'} to your contacts`,
        [['Name', f.FN || (f.N || '').split(';').filter(Boolean).reverse().join(' ')], ['Phone', f.TEL], ['Email', f.EMAIL], ['Organisation', f.ORG], ['Title', f.TITLE], ['Website', f.URL], ['Address', (f.ADR || '').split(';').filter(Boolean).join(', ')]].filter(r => r[1]), [], { data: f });
    }
    if (/^MECARD:/i.test(t)) {
      const f = keyed(t.slice(7));
      return res('mecard', 'Contact card (MeCard)', `Offers to save ${f.N ? f.N.split(',').reverse().join(' ').trim() : 'a contact'} to your contacts`,
        [['Name', f.N], ['Phone', f.TEL], ['Email', f.EMAIL], ['Address', f.ADR], ['Website', f.URL], ['Note', f.NOTE]].filter(r => r[1]), [], { data: f });
    }
    if (/^BEGIN:(VEVENT|VCALENDAR)/i.test(t)) {
      const f = lines(t);
      return res('event', 'Calendar event', `Offers to add “${f.SUMMARY || 'an event'}” to your calendar`,
        [['Title', f.SUMMARY], ['Starts', icsDate(f.DTSTART)], ['Ends', icsDate(f.DTEND)], ['Where', f.LOCATION], ['Details', f.DESCRIPTION]].filter(r => r[1]), [], { data: f });
    }

    let m;
    if ((m = t.match(/^tel:(.+)$/i))) return res('tel', 'Phone number', `Dials ${m[1]}`, [['Number', m[1]]], [flag('info', 'call', 'Your phone shows the number first; check it before you call.')]);
    if ((m = t.match(/^(?:sms|smsto|mms|mmsto):([^:?]*)(?:[:?](?:body=)?(.*))?$/i))) {
      const fl = [];
      if (/^\d{4,6}$/.test(m[1])) fl.push(flag('warn', 'shortcode', 'Short codes can sign you up to paid text services.'));
      return res('sms', 'Text message', `Drafts a text to ${m[1] || 'someone'}`, [['To', m[1]], ['Message', decodeSafe(m[2] || '')]].filter(r => r[1]), fl);
    }
    if ((m = t.match(/^mailto:([^?]*)(\?.*)?$/i))) {
      const q = query(m[2]);
      return res('email', 'Email', `Drafts an email to ${decodeSafe(m[1]) || 'someone'}`, [['To', decodeSafe(m[1])], ['Subject', q.subject], ['Body', q.body], ['Cc', q.cc]].filter(r => r[1]));
    }
    if (/^MATMSG:/i.test(t)) {
      const f = keyed(t.slice(7));
      return res('email', 'Email', `Drafts an email to ${f.TO || 'someone'}`, [['To', f.TO], ['Subject', f.SUB], ['Body', f.BODY]].filter(r => r[1]));
    }
    if ((m = t.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,[^?]*)?(\?.*)?$/i))) {
      const q = query(m[3]);
      return res('geo', 'Map location', `Opens your maps app at ${(+m[1]).toFixed(4)}, ${(+m[2]).toFixed(4)}`, [['Latitude', m[1]], ['Longitude', m[2]], ['Label', q.q]].filter(r => r[1]));
    }
    if ((m = t.match(/^otpauth:\/\/(totp|hotp)\/([^?]*)(\?.*)?$/i))) {
      const q = query(m[3]);
      const labelRaw = decodeSafe(m[2]);
      const [iss, acct] = labelRaw.includes(':') ? labelRaw.split(':') : [q.issuer || '', labelRaw];
      return res('otp', 'Two-factor setup', `Adds a ${m[1].toUpperCase()} code for ${q.issuer || iss || 'an account'} to your authenticator`,
        [['Issuer', q.issuer || iss], ['Account', acct], ['Digits', q.digits || '6'], ['Period', m[1].toLowerCase() === 'totp' ? `${q.period || 30}s` : ''], ['Secret', q.secret ? q.secret.slice(0, 4) + '•••' : '']].filter(r => r[1]),
        [flag('warn', 'secret', 'This holds a login secret. Only scan codes you created yourself on the real site, and never share them.')]);
    }
    if ((m = t.match(/^(bitcoin|ethereum|litecoin|monero|dogecoin|solana):([^?]+)(\?.*)?$/i))) {
      const q = query(m[3]);
      return res('crypto', 'Crypto payment', `Opens a wallet to send ${m[1].toLowerCase()}`, [['Coin', m[1]], ['Address', m[2]], ['Amount', q.amount || q.value], ['Label', q.label || q.message]].filter(r => r[1]),
        [flag('warn', 'pay', 'Crypto payments cannot be reversed. Check the address character by character.')]);
    }
    if ((m = t.match(/^upi:\/\/pay(\?.*)$/i))) {
      const q = query(m[1]);
      return res('upi', 'UPI payment', `Pays ${q.pn || q.pa || 'someone'} via UPI`, [['Payee', q.pn], ['UPI ID', q.pa], ['Amount', q.am ? `${q.am} ${q.cu || 'INR'}` : ''], ['Note', q.tn]].filter(r => r[1]),
        [flag('warn', 'pay', 'Leads to a payment. Scanning to pay never receives money.')]);
    }
    if (/^BCD\r?\n/.test(t)) {
      const p = t.split(/\r?\n/);
      return res('epc', 'SEPA bank transfer', `Pre-fills a bank transfer to ${p[5] || 'someone'}`, [['Payee', p[5]], ['IBAN', p[6]], ['BIC', p[4]], ['Amount', p[7]], ['Reference', p[9] || p[10]]].filter(r => r[1]),
        [flag('warn', 'pay', 'Check the payee name and IBAN match the invoice.')]);
    }
    if (/^SPC\r?\n/.test(t)) {
      const p = t.split(/\r?\n/);
      return res('swiss', 'Swiss QR-bill', `Pre-fills a payment to ${p[5] || 'someone'}`, [['IBAN', p[3]], ['Payee', p[5]], ['Amount', p[18] ? `${p[18]} ${p[19] || ''}` : '']].filter(r => r[1]), [flag('warn', 'pay', 'Check the payee before paying.')]);
    }
    if ((m = t.match(/^market:\/\/details\?id=([\w.]+)/i))) return res('app', 'App', `Opens ${m[1]} in Google Play`, [['Package', m[1]]]);
    if (/^\d+$/.test(t) && gtinValid(t)) return res('gtin', 'Product number (GTIN)', 'Just a number: a scanner shows it, a shop looks it up', [['GTIN', t], ['Kind', { 8: 'EAN-8', 12: 'UPC-A', 13: 'EAN-13', 14: 'GTIN-14' }[t.length]]]);

    if (/^(https?:\/\/|www\.)/i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t) && !/\s/.test(t) && /\.[a-z]{2,}(\/|$)/i.test(t)) {
      const u = urlInfo(t);
      if (u) {
        const labels = { website: 'Web link', 'app-store': 'App store link', map: 'Map link', chat: 'Chat link', payment: 'Payment link', product: 'Product link (GS1)', social: 'Social link', menu: 'Menu / ordering link' };
        return res('url', labels[u.kind], u.action, u.fields, u.flags, { kind: u.kind, host: u.host, href: u.href });
      }
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
      const scheme = t.split(':')[0].toLowerCase();
      return res('deeplink', 'App link', `Asks an app registered for “${scheme}:” to open`, [['Scheme', scheme], ['Content', t.slice(0, 120)]], [flag('info', 'deeplink', 'Opens whichever app claims this scheme, if any.')]);
    }
    if (/^[[{]/.test(t)) { try { JSON.parse(t); return res('json', 'Structured data (JSON)', 'Shown as text; meant for a specific app to read', [['Keys', Object.keys(JSON.parse(t)).slice(0, 8).join(', ')]]); } catch (e) { /* plain text */ } }
    return res('text', 'Plain text', 'Shows the text. Nothing opens', [['Text', t.length > 140 ? t.slice(0, 140) + '…' : t]]);
  }

  function decodeSafe(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  // ---- Builders ---------------------------------------------------------------------------
  const esc = s => String(s ?? '').replace(/([\\;,:"])/g, '\\$1');
  const build = {
    url: ({ url }) => String(url || '').trim(),
    text: ({ text }) => String(text || ''),
    wifi: ({ ssid, password, auth = 'WPA', hidden }) => `WIFI:T:${auth === 'none' ? 'nopass' : auth};S:${esc(ssid)};${auth === 'none' ? '' : `P:${esc(password)};`}${hidden ? 'H:true;' : ''};`,
    contact: ({ name, phone, email, org, url }) => ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name || ''}`, `N:${(name || '').split(' ').reverse().join(';')};;;`, org && `ORG:${org}`, phone && `TEL:${phone}`, email && `EMAIL:${email}`, url && `URL:${url}`, 'END:VCARD'].filter(Boolean).join('\n'),
    email: ({ to, subject, body }) => `mailto:${to || ''}${subject || body ? '?' + [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join('&') : ''}`,
    sms: ({ to, body }) => `SMSTO:${to || ''}:${body || ''}`,
    tel: ({ to }) => `tel:${String(to || '').replace(/[^\d+]/g, '')}`,
    geo: ({ lat, lng, label }) => `geo:${lat},${lng}${label ? `?q=${encodeURIComponent(label)}` : ''}`,
  };

  const api = { classify, build, gtinValid, SHORTENERS, DYNAMIC };
  root.Bench = root.Bench || {};
  root.Bench.qrpayload = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
