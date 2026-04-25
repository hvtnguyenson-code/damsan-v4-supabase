const CACHE_NAME = 'damsan-exam-v2';
const ASSETS = [
  './hoc_sinh.html',
  './hoc_sinh.js',
  './manifest.json',
  'https://cdn-icons-png.flaticon.com/512/3413/3413535.png'
];

// 1. Cài đặt và lưu cache ban đầu
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Kích hoạt và dọn dẹp cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 3. Chiến lược Network First (Ưu tiên mạng, mất mạng mới dùng cache)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
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
