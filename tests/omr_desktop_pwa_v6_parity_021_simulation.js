const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const desktop=fs.readFileSync('giaovien.html','utf8');
const pwa=fs.readFileSync('teacher/index.html','utf8');
const moduleSrc=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const read=(html)=>[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/g)]
  .map(match=>({url:match[1],path:match[1].split('?')[0].replace(/^\.\.\//,'')}));
const d=read(desktop),m=read(pwa);
const required=[
 'omr/omr-template-moet-18-4-6.js','omr/omr-core.js',
 'omr/omr-room-binding.js','omr/omr-scoring.js',
 'omr/omr-result-write.js','omr/omr-scan-adapter.js',
 'omr/omr-reliability-v6.js','omr/omr-teacher-module.js'
];
for(const scripts of [d,m]){
  for(const path of required){
    assert.strictEqual(scripts.filter(item=>item.path===path).length,1,
      path+' must load exactly once in desktop and PWA');
  }
  const order=required.map(path=>scripts.findIndex(item=>item.path===path));
  assert(order.every((v,i)=>i===0||v>order[i-1]),'OMR JS dependency order is not canonical');
}
const desktopOmr=d.filter(item=>item.path.startsWith('omr/'));
const desktopVersion='20261108-omr-desktop-v6-022';
assert(desktopOmr.every(item=>item.url.split('?v=')[1]===desktopVersion),
  'desktop OMR modules must use one cache-busting revision');
assert(moduleSrc.includes("officialEngine:'v6'"),'V6 must remain fresh-session default');
assert(moduleSrc.includes('const labAvailable=!!root.DamSanOmrReliabilityV6&&!!E;'),
  'fallback to V5 must require missing V6 modules');
assert(moduleSrc.includes("state.officialEngine='v5'"),'V5 fallback must remain available');
assert(moduleSrc.includes("if(state.labEnabled||state.lastScan?._labReadOnly)"),'comparison must stay read-only');
assert(moduleSrc.includes("const expectedEngine=expectedEngineLabel(state.officialEngine);"),
  'saving must verify V5/V6/V7 identity');
assert(m.filter(x=>x.path==='omr/omr-v7-candidate.js').length===1);
assert(m.filter(x=>x.path==='omr/omr-v7-research.js').length===1);
assert(d.every(x=>x.path!=='omr/omr-v7-candidate.js'&&x.path!=='omr/omr-v7-research.js'),
  'V7 is a PWA-only option');
const roots={};
const load=(file)=>vm.runInNewContext(fs.readFileSync(file,'utf8'),{
  window:roots,globalThis:roots,console,document:{},setTimeout,clearTimeout
},{filename:file});
for(const file of [
 'omr/omr-template-moet-18-4-6.js','omr/omr-core.js',
 'omr/omr-room-binding.js','omr/omr-scoring.js','omr/omr-result-write.js',
 'omr/omr-scan-adapter.js','omr/omr-reliability-v6.js','omr/omr-teacher-module.js'
])load(file);
assert(roots.DamSanOmrReliabilityV6?.analyzeRectified,
 'desktop bundle must expose the independent V6 engine');
assert(roots.DamSanOmrScanAdapter?.fromV6,
 'desktop bundle must expose the V6 canonical adapter');
assert(roots.DamSanOmrTeacher,
 'OMR overlay must register with desktop bundle');
assert.strictEqual(roots.DamSanOmrTeacher._state.officialEngine,'v6',
 'fresh desktop OMR must default to V6');
console.log('PASS omr_desktop_pwa_v6_parity_021');