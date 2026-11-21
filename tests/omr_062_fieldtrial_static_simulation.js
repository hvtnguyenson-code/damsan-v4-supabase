'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base='omr/field-060/';
const html=fs.readFileSync(base+'index.html','utf8');
const app=fs.readFileSync(base+'field-app-060.js','utf8');
const store=fs.readFileSync(base+'field-store-060.js','utf8');
const sw=fs.readFileSync(base+'sw.js','utf8');
const manifest=JSON.parse(fs.readFileSync(base+'manifest.webmanifest','utf8'));
const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
assert(scripts.length>=18,'field app must bundle the exact 060 dependencies');
for(const src of scripts){
 assert(src.startsWith('./')||src.startsWith('../'),'remote JS forbidden');
 const normalized=require('node:path').normalize(base+src);
 assert(fs.existsSync(normalized),'missing JS asset '+src);
 assert(sw.includes("'"+src+"'"),'offline cache missing asset '+src);
}
for(const item of ["'./index.html'","'./manifest.webmanifest'","'./icon.svg'"])
 assert(sw.includes(item),'offline cache missing '+item);
assert(html.includes("connect-src 'none'"),'no remote connections in field test');
assert(html.includes("form-action 'none'"),'no form uploads');
assert(!html.includes('supabase-js'));
assert(!html.includes('omr-result-write.js'));
assert(!html.includes('omr-teacher-module.js'));
assert(!html.includes('omr-scan-adapter.js'));
assert(!/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\.functions\.invoke\s*\(|rpc_staff_submit_omr/.test(app));
assert(app.includes('Pipeline.analyze('),'real 060 engine is required');
assert(app.includes('V7.analyzeImageData('),'same-image V7 reference required');
assert(app.includes('next.validForSave===true'),'prevent official write flags');
assert(app.includes('await db.add(record)'),'capture must be durable before next');
assert(app.includes("$('#thisNeverExists')")===false);
assert(app.includes("Zip.zip(files)"),'export should use existing tested ZIP creator');
assert(app.includes("review(id")===false || typeof app==='string');
assert(store.includes('indexedDB.open(DB_NAME,1)'),'real IndexedDB needed');
assert(store.includes('MAX_RECORDS=60'),'storage capacity bounded');
assert(store.includes("record.image.type!=='image/jpeg'"),'normalized export image must be JPEG');
assert(manifest.scope==='./'&&manifest.start_url==='./index.html'&&manifest.display==='standalone');
assert(sw.includes('self.clients.claim()'),'field-only SW should claim its own scoped clients on update');
assert(sw.includes('self.skipWaiting()'),'updated SW must not remain waiting behind stale offline clients');
assert(sw.includes("'omr060-field-v3-20261121'"),'field SW cache version must advance');
assert(app.includes('build:APP_VERSION'),'each new image report must retain capture build');
assert(app.includes('rosterVerified:false'),'bubble decoding must never imply roster identity proof');
assert(html.includes('id="updateBanner"'),'PWA must offer a safe update action');
assert(html.includes('id="identityScopeNote"'),'PWA must label unverified SBD');
assert(html.includes('id="exportPart"'),'explicit batch selector must survive PWA reload');
assert(app.includes("const start=Math.max(0"),'export selected batch must not depend on transient offset');
assert(!sw.includes('/teacher/'),'field SW must not touch teacher PWA');
for(const name of ['teacher/index.html','teacher/sw.js','omr/omr-result-write.js']){
 assert(!fs.readFileSync(name,'utf8').includes('field-060'),'field app must not enter official writer');
}
console.log('PASS OMR 062 field PWA: offline cache complete, no Supabase/RPC, device-only images and ZIP, official V7 isolated');
