const VERSION = '20260902-flex-lite-005';
const CACHE_NAME = 'damsan-exam-v' + VERSION;
const ASSETS = [
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

// 1. CÃƒÂ i Ã„â€˜Ã¡ÂºÂ·t vÃƒÂ  lÃ†Â°u cache ban Ã„â€˜Ã¡ÂºÂ§u
self.addEventListener('install', (event) => {
  self.skipWaiting(); // BuÃ¡Â»â„¢c SW mÃ¡Â»â€ºi kÃƒÂ­ch hoÃ¡ÂºÂ¡t ngay lÃ¡ÂºÂ­p tÃ¡Â»Â©c
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 2. KÃƒÂ­ch hoÃ¡ÂºÂ¡t vÃƒÂ  dÃ¡Â»Ân dÃ¡ÂºÂ¹p cache cÃ…Â©
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // DÃ¡Â»Ân dÃ¡ÂºÂ¹p cache phiÃƒÂªn bÃ¡ÂºÂ£n cÃ…Â©
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          })
        );
      }),
      // ChiÃ¡ÂºÂ¿m quyÃ¡Â»Ân Ã„â€˜iÃ¡Â»Âu khiÃ¡Â»Æ’n khÃƒÂ¡ch hÃƒÂ ng ngay lÃ¡ÂºÂ­p tÃ¡Â»Â©c
      self.clients.claim()
    ])
  );
});

// 3. LÃ¡ÂºÂ¯ng nghe lÃ¡Â»â€¡nh tÃ¡Â»Â« hoc_sinh.js
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. ChiÃ¡ÂºÂ¿n lÃ†Â°Ã¡Â»Â£c Network First (Ã†Â¯u tiÃƒÂªn mÃ¡ÂºÂ¡ng, mÃ¡ÂºÂ¥t mÃ¡ÂºÂ¡ng mÃ¡Â»â€ºi dÃƒÂ¹ng cache)
// Ã„ÂÃ¡ÂºÂ·c biÃ¡Â»â€¡t: LuÃƒÂ´n fetch tÃ¡Â»Â« mÃ¡ÂºÂ¡ng trÃ†Â°Ã¡Â»â€ºc cho cÃƒÂ¡c file HTML/JS Ã„â€˜Ã¡Â»Æ’ Ã„â€˜Ã¡ÂºÂ£m bÃ¡ÂºÂ£o tÃƒÂ­nh mÃ¡Â»â€ºi nhÃ¡ÂºÂ¥t
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  // Supabase REST, RPC, auth and Realtime HTTP endpoints are dynamic application
  // data. Never satisfy or populate them through the PWA cache.
  if (requestUrl.hostname.endsWith('.supabase.co')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-store' }) // ChÃ¡Â»â€˜ng cache trÃƒÂ¬nh duyÃ¡Â»â€¡t tÃ¡ÂºÂ§ng HTTP
      .then((response) => {
        // NÃ¡ÂºÂ¿u lÃ¡ÂºÂ¥y Ã„â€˜Ã†Â°Ã¡Â»Â£c tÃ¡Â»Â« mÃ¡ÂºÂ¡ng, cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t lÃ¡ÂºÂ¡i bÃ¡ÂºÂ£n mÃ¡Â»â€ºi vÃƒÂ o cache
        if (event.request.method === 'GET') {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      })
      .catch(() => {
        // NÃ¡ÂºÂ¿u mÃ¡ÂºÂ¥t mÃ¡ÂºÂ¡ng hoÃ¡ÂºÂ·c lÃ¡Â»â€”i kÃ¡ÂºÂ¿t nÃ¡Â»â€˜i, dÃƒÂ¹ng bÃ¡ÂºÂ£n lÃ†Â°u gÃ¡ÂºÂ§n nhÃ¡ÂºÂ¥t trong cache
        return caches.match(event.request);
      })
  );
});
