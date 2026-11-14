const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('teacher/index.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
const app=fs.readFileSync('teacher/app.js','utf8');
const mod=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const revision='20261114-teacher-pwa-035';
for(const text of [html,sw,app])assert(text.includes(revision));
const scripts=['omr-scan-adapter.js','omr-reliability-v6.js',
'omr-v7-research.js','omr-reliability-v7-baseline.js',
'omr-v7-local-refinement.js','omr-v7-quality.js','omr-v7-geometry.js',
'omr-v7-lighting.js','omr-v7-marks.js','omr-v7-numeric.js',
'omr-v7-sparse-p3.js','omr-v7-candidate.js','omr-teacher-module.js'];
let last=-1;
for(const name of scripts){
  const i=html.indexOf('src="../omr/'+name);
  assert(i>last,'dependency script order '+name);last=i;
  assert(sw.includes("'../omr/"+name+"'"),'PWA offline asset '+name);
}
const root={console};vm.createContext(root);
for(const name of ['omr-scan-adapter.js','omr-v7-research.js',
  'omr-reliability-v7-baseline.js','omr-v7-local-refinement.js',
 'omr-v7-quality.js','omr-v7-geometry.js','omr-v7-lighting.js',
 'omr-v7-marks.js','omr-v7-numeric.js','omr-v7-sparse-p3.js',
 'omr-v7-candidate.js'])
  vm.runInContext(fs.readFileSync('omr/'+name,'utf8'),root,{filename:name});
assert.strictEqual(typeof root.DamSanOmrV7Candidate.analyzeValidatedRectified,'function');
assert.strictEqual(typeof root.DamSanOmrScanAdapter.fromV7,'function');
assert(mod.includes("v7Option.hidden=!v7Available&&!isPwaShell"));
assert(mod.includes("v7Option.disabled=!v7Available"));
assert(mod.includes("const isPwaShell=!!q('appShell')"));
assert(mod.includes('omrV7LoadStatus'));
assert(mod.includes("officialEngine:'v6'"));
assert(sw.includes('self.skipWaiting()'),'new release should activate from WAITING state');
assert(!sw.includes('self.clients.claim()'),'must not commandeer a live grading page');
// Test real fetch handler: stale installed cache must not mask new JS online,
// while the last-known-good cache remains usable offline.
const origin='https://example.org',base='/damsan-v4-supabase';
const handlers={},stale={ok:true,version:'OLD',clone(){return this}};
const fresh={ok:true,version:'NEW',clone(){return this}};
const cacheStore=new Map([[origin+base+'/omr/omr-teacher-module.js',stale]]);
let online=true,fetches=0;
const cache={async match(req){const key=typeof req==='string'?req:req.url.split('?')[0];
  return cacheStore.get(key)||null;},
  async put(req,res){cacheStore.set(typeof req==='string'?req:req.url.split('?')[0],res);}};
const self={location:{origin},registration:{scope:origin+base+'/teacher/'},
  addEventListener(k,fn){handlers[k]=fn;},clients:{claim:async()=>{}}};
vm.runInNewContext(sw,{self,caches:{open:async()=>cache,keys:async()=>[]},
  URL,Promise,console,setTimeout,Response:{error:()=>({ok:false})},
  fetch:async()=>{fetches++;if(!online)throw Error('offline');return fresh;}});
async function get(){
  let answer=null;
  handlers.fetch({request:{url:origin+base+'/omr/omr-teacher-module.js?v='+revision,
    method:'GET',mode:'cors'},respondWith(p){answer=p;}});
  assert(answer);return await answer;
}
(async()=>{
  assert.strictEqual((await get()).version,'NEW');
  assert.strictEqual(cacheStore.get(origin+base+'/omr/omr-teacher-module.js').version,'NEW');
  online=false;assert.strictEqual((await get()).version,'NEW');
  assert.strictEqual(fetches,2);
  console.log('PASS OMR 028 PWA V7 module load, online refresh, offline fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
