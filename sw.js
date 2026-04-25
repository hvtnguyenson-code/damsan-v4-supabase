const VERSION = '20260425-2212';
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

// 1. Cài đặt và lưu cache ban đầu
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Buộc SW mới kích hoạt ngay lập tức
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Kích hoạt và dọn dẹp cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Dọn dẹp cache phiên bản cũ
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          })
        );
      }),
      // Chiếm quyền điều khiển khách hàng ngay lập tức
      self.clients.claim()
    ])
  );
});

// 3. Lắng nghe lệnh từ hoc_sinh.js
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Chiến lược Network First (Ưu tiên mạng, mất mạng mới dùng cache)
// Đặc biệt: Luôn fetch từ mạng trước cho các file HTML/JS để đảm bảo tính mới nhất
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }) // Chống cache trình duyệt tầng HTTP
      .then((response) => {
        // Nếu lấy được từ mạng, cập nhật lại bản mới vào cache
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // Nếu mất mạng hoặc lỗi kết nối, dùng bản lưu gần nhất trong cache
        return caches.match(event.request);
      })
  );
});
