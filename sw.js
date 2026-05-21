const VERSION = '20260508-0015';
const CACHE_NAME = 'damsan-exam-v' + VERSION;
const STATIC_ASSETS = [
  './hoc_sinh.html',
  './hoc_sinh.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdn-icons-png.flaticon.com/512/3413/3413535.png'
];

const CACHEABLE_HOSTS = new Set([
  self.location.host,
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'cdn-icons-png.flaticon.com'
]);

const NEVER_CACHE_HOSTS = new Set([
  'xcervjnwlchwfqvbeahy.supabase.co'
]);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => Promise.all(
        cacheNames.map((cache) => cache !== CACHE_NAME ? caches.delete(cache) : undefined)
      )),
      self.clients.claim()
    ])
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function shouldCache(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (NEVER_CACHE_HOSTS.has(url.host)) return false;
  if (!CACHEABLE_HOSTS.has(url.host)) return false;
  return STATIC_ASSETS.some((asset) => new URL(asset, self.location.href).href === url.href);
}

self.addEventListener('fetch', (event) => {
  if (!shouldCache(event.request)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        if (response && response.ok) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
