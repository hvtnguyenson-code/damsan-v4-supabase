const CACHE_NAME = 'damsan-exam-v1';
const ASSETS = [
  './hoc_sinh.html',
  './hoc_sinh.js',
  './manifest.json',
  'https://cdn-icons-png.flaticon.com/512/3413/3413535.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
