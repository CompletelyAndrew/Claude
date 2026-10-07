// Bench service worker: cache-first app shell so Bench opens offline once installed.
const CACHE = 'bench-v1';
const SHELL = [
  './', 'index.html', 'css/bench.css', 'manifest.webmanifest', 'assets/icon.svg',
  'js/core/markdown.js', 'js/core/quickadd.js', 'js/core/ledger.js', 'js/core/color.js', 'js/core/easing.js', 'js/core/tools.js', 'js/core/kit.js',
  'js/app.js', 'js/seed.js',
  'js/modules/today.js', 'js/modules/tasks.js', 'js/modules/notes.js', 'js/modules/focus.js', 'js/modules/gamelab.js',
  'js/modules/toolbox.js', 'js/modules/ledger.js', 'js/modules/trips.js', 'js/modules/settings.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first for our own files (so updates land), cache as fallback; fonts cache-first.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    })));
  }
});
