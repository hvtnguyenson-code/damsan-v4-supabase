const assert=require('assert'),fs=require('fs'),vm=require('vm');
console.log('=== OMR 035 PWA V7 field-test release and read-only guard ===');
const rev='20261113-teacher-pwa-034';
const bridge='omr-v7-runtime-20261113-034.js';
const bundle=fs.readFileSync('teacher/'+bridge,'utf8');
const adapter=fs.readFileSync('omr/omr-scan-adapter.js','utf8');
const teacherModule=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const html=fs.readFileSync('teacher/index.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
const app=fs.readFileSync('teacher/app.js','utf8');
const numerical=fs.readFileSync('omr/omr-v7-numeric.js','utf8');
const candidate=fs.readFileSync('omr/omr-v7-candidate.js','utf8');
assert.strictEqual(bundle,(adapter+'\n;\n'+teacherModule).replace(/\n+$/,'\n'),
 'V7 bridge must load SAME module as canonical source');
assert(html.includes('src="./'+bridge+'?v='+rev+'"'));
assert(html.includes('src="../omr/omr-v7-numeric.js?v='+rev+'"'));
assert(html.indexOf('src="./'+bridge)>
 html.indexOf('src="../omr/omr-teacher-module.js'));
assert(sw.includes("const VERSION='"+rev+"'"));
assert(sw.includes("'./"+bridge+"'"));
assert(app.includes("sw.js?v="+rev));
assert(!html.includes('src="./omr-v7-runtime-20261113-033.js'));
assert(!sw.includes("'./omr-v7-runtime-20261113-033.js'"));
// Keep older recovery bundle for old installed clients, without loading two.
assert(fs.existsSync('teacher/omr-v7-runtime-20261113-033.js'));
assert(sw.includes("fetch(request,{cache:'no-store'})"));
assert(sw.includes('self.skipWaiting()')&&!sw.includes('self.clients.claim()'));
assert(!sw.includes('location.reload('));
assert(numerical.includes('tryRecoverUniformBlank'));
assert(candidate.includes('Ext.numeric.apply(rect,T,B,result)'));
assert(teacherModule.includes('info.candidateV7=V7.analyzeValidatedRectified('));
assert(teacherModule.includes('rect,T.template,root.DamSanOmrReliabilityV6,\n                {experimentalRefinement:true}'));
assert(teacherModule.includes("scan._labReadOnly=mode==='compare'"));
assert(teacherModule.includes("q('omrSave').hidden=!!state.lastScan?._labReadOnly"));
const v7Branch=teacherModule.slice(teacherModule.indexOf("}else if(mode==='v7'){"),
 teacherModule.indexOf("}else{",teacherModule.indexOf("}else if(mode==='v7'){")));
assert(!v7Branch.includes('experimentalRefinement:true'),
 'V7 saving mode must NOT apply unverified candidate modifications');
assert(teacherModule.includes("officialEngine:'v6'"));
const root={console,
 DamSanOmrTemplate:{},DamSanOmr:{},DamSanOmrRoomBinding:{},
 DamSanOmrScoring:{},DamSanOmrResultWrite:{},
 DamSanOmrV7Candidate:{analyzeValidatedRectified:()=>({})}};
root.window=root;
vm.createContext(root);
vm.runInContext(bundle,root,{filename:'teacher/'+bridge});
assert.strictEqual(typeof root.DamSanOmrTeacher.open,'function');
assert.strictEqual(typeof root.DamSanOmrScanAdapter.fromV7,'function');
console.log('PASS OMR 035 new PWA assets, exact bridge, experiment read-only, canonical saving');
