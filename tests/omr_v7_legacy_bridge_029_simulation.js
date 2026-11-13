const assert=require('assert'),fs=require('fs'),vm=require('vm');
console.log('=== OMR 029 legacy installed PWA V7 runtime recovery ===');
const oldAdapter=fs.readFileSync('omr/omr-scan-adapter.js','utf8');
const officialModule=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const bundlePath='teacher/omr-v7-runtime-20261113-033.js';
const bundle=fs.readFileSync(bundlePath,'utf8');
assert.strictEqual(bundle,(oldAdapter+'\n;\n'+officialModule).replace(/\n+$/,'\n'),
 'Recovery bundle must match canonical source byte-for-byte, not diverge');
const html=fs.readFileSync('teacher/index.html','utf8'),
 sw=fs.readFileSync('teacher/sw.js','utf8'),
 app=fs.readFileSync('teacher/app.js','utf8');
assert(html.includes('src="./omr-v7-runtime-20261113-033.js?v=20261113-teacher-pwa-033"'));
const bootIndex=html.indexOf('src="./omr-v7-runtime-20261113-033.js');
assert(bootIndex>html.indexOf('src="../omr/omr-v7-candidate.js'));
assert(bootIndex>html.indexOf('src="../omr/omr-teacher-module.js'));
assert(bootIndex<html.indexOf('src="./app.js'));
assert(sw.includes("'./omr-v7-runtime-20261113-033.js'"));
// The old worker precached the names in 029/031/032, but not the NEW path.
// A distinct PATH is necessary: all of them ignored ?v query strings.
const site='https://example.org/damsan-v4-supabase/';
const oldCached=[
'teacher/index.html','teacher/app.js','teacher/sw.js',
'omr/omr-scan-adapter.js','omr/omr-teacher-module.js',
'omr/omr-v7-research.js','omr/omr-v7-candidate.js'
];
const oldPaths=new Set(oldCached.map(x=>new URL(x,site).pathname));
assert(oldPaths.has(new URL('omr/omr-teacher-module.js',site).pathname));
assert(!oldPaths.has(new URL(bundlePath,site).pathname));
assert(html.includes('20261113-teacher-pwa-033'));
assert(sw.includes("const VERSION='20261113-teacher-pwa-033'"));
assert(app.includes("sw.js?v=20261113-teacher-pwa-033"));
// Browser-like execution verifies the bridge restores BOTH adapter and
// OMR page module if a previous SW gives the app older versions.
const root={console,
 DamSanOmrTemplate:{},DamSanOmr:{},DamSanOmrRoomBinding:{},
 DamSanOmrScoring:{},DamSanOmrResultWrite:{},
 DamSanOmrV7Candidate:{analyzeValidatedRectified:()=>({})}};
root.window=root; // Browser IIFE deliberately attaches to window, not Node global.
vm.createContext(root);
vm.runInContext(bundle,root,{filename:bundlePath});
assert.strictEqual(typeof root.DamSanOmrScanAdapter.fromV7,'function');
assert.strictEqual(typeof root.DamSanOmrTeacher.open,'function');
// Detect accidental deployment of a second user-facing URL.
assert(!html.includes('v7-lab.html'));
assert(!sw.includes('v7-lab.html'));
// Recovery activates when fully cached; it never takes over open sessions
// or erases the cache an old active grading page may still need.
const handles={},deleted=[],cache={addAll:async items=>{assert(items.includes('./omr-v7-runtime-20261113-033.js'));}};
let skipCalls=0;
const self={registration:{scope:site+'teacher/'},location:{origin:new URL(site).origin},
 addEventListener(name,fn){handles[name]=fn;},
 skipWaiting:async()=>{skipCalls++},
 clients:{matchAll:async()=>[{}],claim(){throw Error('must not claim active clients')}}};
const caches={open:async()=>cache,keys:async()=>['damsan-teacher-029',
 'damsan-teacher-20261113-teacher-pwa-033'],
 delete:async k=>{deleted.push(k);return true;}};
vm.runInNewContext(sw,{self,caches,URL,Promise,setTimeout,console,
 fetch:async()=>({ok:true}),Response:{error(){return {ok:false}}}});
function trigger(name){
 let result;
 handles[name]({waitUntil(p){result=p;}});
 assert(result,'worker '+name+' must defer lifecycle work');
 return result;
}
(async()=>{
 await trigger('install');
 assert.strictEqual(skipCalls,1,'installed PWA must not stay indefinitely WAITING');
 await trigger('activate');
 assert.deepStrictEqual(deleted,[],'old caches survive while a client is active');
 assert(!sw.includes('self.clients.claim()'),'never replace controller mid-scan');
 assert(!sw.includes('location.reload('),'never reload a teacher page');
 assert(sw.includes('5000'),'network-first HTML must allow mobile connections time');
 console.log('PASS OMR 029 legacy worker bypass, exact runtime and safe activation');
})().catch(e=>{console.error(e);process.exitCode=1;});
