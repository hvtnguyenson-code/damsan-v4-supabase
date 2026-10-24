const VERSION = '20261024-login-enter-085';
const CACHE_NAME = 'damsan-exam-v' + VERSION;

// PWA-INSTALL-081A: all student runtime dependencies required before login
// are same-origin CORE_ASSETS. A public CDN outage must not prevent the PWA
// from installing or starting on a newly provisioned Android device.
const CORE_ASSETS = [
  './hoc_sinh.html',
  './hoc_sinh.js',
  './manifest.json',
  './icons/exam-192.png',
  './icons/exam-512.png',
  './vendor/student/supabase-js-2.118.0.min.js',
  './vendor/student/dompurify-3.0.6.min.js',
  './vendor/student/crypto-js-4.1.1.min.js'
];

const OPTIONAL_ASSETS = [];

// 1. Cài đặt và lưu cache ban đầu
self.addEventListener('install', (event) => {
  // SUBMISSION-SAFETY-010A: Không gọi self.skipWaiting() vô điều kiện ở đây
  // để tránh kích hoạt và reload giữa chừng khi học sinh đang làm bài hoặc nộp bài.
  // Service Worker mới sẽ chờ tin nhắn SKIP_WAITING từ hoc_sinh.js khi an toàn.
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      await Promise.allSettled(
        OPTIONAL_ASSETS.map((url) => cache.add(url))
      );
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
      .catch(async () => {
        // Nếu mất mạng, ưu tiên exact cache. Với static asset cùng origin có
        // query cache-bust (?v=...), cho phép dùng bản core tương ứng không query.
        const exact = await caches.match(event.request);
        if (exact) return exact;
        if (requestUrl.origin === self.location.origin) {
          return caches.match(event.request, { ignoreSearch: true });
        }
        return undefined;
      })
  );
});
