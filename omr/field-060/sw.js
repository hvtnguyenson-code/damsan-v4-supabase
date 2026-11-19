'use strict';
// Non-production field-trial SW. Scoped ONLY to /omr/field-060/.
const VERSION='omr060-field-v2-20261119';
const CACHE='damsan-'+VERSION;
const ASSETS=[
 './','./index.html','./manifest.webmanifest','./icon.svg',
 './field-comparison-060.js','./field-store-060.js','./field-app-060.js',
 '../omr-template-moet-18-4-6.js','../omr-core.js',
 '../omr-reliability-v6.js','../omr-v7-research.js',
 '../omr-reliability-v7-baseline.js','../omr-v7-local-refinement.js',
 '../omr-v7-quality.js','../omr-v7-geometry.js',
 '../omr-v7-lighting.js','../omr-v7-marks.js',
 '../omr-v7-numeric.js','../omr-v7-sparse-p3.js',
 '../omr-v7-candidate.js','./omr-v7-geometry-060.js',
 './omr-v7-ink-060.js','./omr-v7-pipeline-060.js',
 '../omr-evidence-naming.js','../omr-evidence-print.js',
 '../omr-evidence-export.js'
];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(
  keys.filter(key=>key.startsWith('damsan-omr060-field-')&&key!==CACHE)
   .map(key=>caches.delete(key)))));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 const allowed=ASSETS.map(p=>new URL(p,self.registration.scope).href);
 if(!allowed.includes(url.href))return;
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(response=>{
  if(response.ok){
   const copy=response.clone();
   void caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
  }
  return response;
 })));
});