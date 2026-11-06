const VERSION='20261106-teacher-pwa-006';
const CACHE='damsan-teacher-'+VERSION;
const CORE=[
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './icons/exam-192.png',
  './icons/exam-512.png',
  '../vendor/student/supabase-js-2.118.0.min.js',
  '../omr/omr-template-moet-18-4-6.js',
  '../omr/omr-core.js',
  '../omr/omr-room-binding.js',
  '../omr/omr-scoring.js',
  '../omr/omr-result-write.js',
  '../omr/omr-teacher-module.js'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('damsan-teacher-')&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(u.hostname.endsWith('.supabase.co')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return;
  }
  if(event.request.method!=='GET') return;
  event.respondWith(
    fetch(event.request,{cache:'no-store'}).then(res=>{
      const clone=res.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,clone)).catch(()=>{});
      return res;
    }).catch(async()=>{
      const exact=await caches.match(event.request);
      if(exact) return exact;
      if(u.origin===self.location.origin) return caches.match(event.request,{ignoreSearch:true});
      throw new Error('offline');
    })
  );
});
