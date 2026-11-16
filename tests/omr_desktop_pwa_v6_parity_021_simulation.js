const assert=require('assert'),fs=require('fs'),vm=require('vm');
const desktop=fs.readFileSync('giaovien.html','utf8'),pwa=fs.readFileSync('teacher/index.html','utf8');
const moduleSrc=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const read=html=>[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/g)]
 .map(match=>({url:match[1],path:match[1].split('?')[0].replace(/^\.\.\//,'')}));
const d=read(desktop),m=read(pwa);
const names=['omr-template-moet-18-4-6.js','omr-core.js','omr-room-binding.js',
 'omr-scoring.js','omr-result-write.js','omr-scan-adapter.js',
 'omr-reliability-v6.js','omr-v7-research.js','omr-reliability-v7-baseline.js',
 'omr-v7-local-refinement.js','omr-v7-quality.js','omr-v7-geometry.js',
 'omr-v7-overlay.js','omr-v7-lighting.js','omr-v7-marks.js',
 'omr-v7-numeric.js','omr-v7-sparse-p3.js','omr-v7-candidate.js',
 'omr-v7-lab-score.js','omr-v7-evidence.js','omr-evidence-client.js','omr-evidence-export.js','omr-teacher-module.js'];
for(const list of [d,m]){
 const indexes=names.map(file=>{
  const path='omr/'+file;
  assert.strictEqual(list.filter(x=>x.path===path).length,1,path+' must load once');
  return list.findIndex(x=>x.path===path);
 });
 assert(indexes.every((x,i)=>i===0||x>indexes[i-1]),'V7 dependency order');
}
assert(d.filter(x=>x.path.startsWith('omr/')).every(x=>x.url.split('?v=')[1]==='20261116-omr-desktop-v7-045'));
assert(moduleSrc.includes("officialEngine:'v7'"));
assert(moduleSrc.includes("const mode='v7'"));
assert(!moduleSrc.includes('id="omrEngineSelect"')&&!moduleSrc.includes('id="omrV6Lab"'));
const root={};
const load=file=>vm.runInNewContext(fs.readFileSync(file,'utf8'),{
 window:root,globalThis:root,console,document:{},setTimeout,clearTimeout,TextEncoder,Blob,URL
},{filename:file});
for(const file of names.map(x=>'omr/'+x))load(file);
assert.strictEqual(typeof root.DamSanOmrV7Candidate?.analyzeValidatedRectified,'function');
assert.strictEqual(typeof root.DamSanOmrScanAdapter?.fromV7,'function');
assert.strictEqual(root.DamSanOmrTeacher._state.officialEngine,'v7');
console.log('PASS OMR 021: desktop/PWA V7-only official parity');
