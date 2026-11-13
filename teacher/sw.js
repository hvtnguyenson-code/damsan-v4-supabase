const VERSION='20261113-teacher-pwa-032';
const CACHE='damsan-teacher-'+VERSION;
const CORE=[
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './icons/teacher-gv-installable.svg',
  '../vendor/student/supabase-js-2.118.0.min.js',
  '../omr/omr-template-moet-18-4-6.js',
  '../omr/omr-core.js',
  '../omr/omr-room-binding.js',
  '../omr/omr-scoring.js',
  '../omr/omr-result-write.js',
  '../omr/omr-scan-adapter.js',
  '../omr/omr-reliability-v6.js',
  '../omr/omr-v7-research.js',
  '../omr/omr-v7-candidate.js',
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
const STATIC_PATHS=new Set(CORE.map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener('fetch',event=>{
  const request=event.request,u=new URL(request.url);
  if(u.hostname.endsWith('.supabase.co')){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }
  if(request.method!=='GET'||u.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    // Network-first HTML, with a fast offline/slow-network fallback. Do NOT
    // block reload waiting indefinitely for a connection.
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const network=fetch(request,{cache:'no-store'}).then(async res=>{
        if(res.ok)await cache.put('./index.html',res.clone()).catch(()=>{});
        return res;
      }).catch(()=>null);
      const fast=await Promise.race([network,new Promise(resolve=>setTimeout(()=>resolve(null),1300))]);
      return fast||await cache.match('./index.html')||await network||Response.error();
    })());
    return;
  }
  if(STATIC_PATHS.has(u.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      // Previously cache-first plus ignoreSearch:true mixed new HTML with
      // stale OMR code on installed PWAs. Fetch JS from network when online;
      // retain the last-known-good cached script for offline use.
      // Never force activation/reload during an active scan.
      if(u.pathname.endsWith('.js')){
        try{
          const fresh=await fetch(request,{cache:'no-store'});
          if(fresh.ok){
            await cache.put(u.origin+u.pathname,fresh.clone()).catch(()=>{});
            return fresh;
          }
        }catch(_err){ /* offline: fall back to installed script */ }
        return await cache.match(request,{ignoreSearch:true})||Response.error();
      }
      const saved=await cache.match(request,{ignoreSearch:true});
      if(saved)return saved;
      const fresh=await fetch(request);
      if(fresh.ok)await cache.put(request,fresh.clone()).catch(()=>{});
      return fresh;
    })());
  }
});
