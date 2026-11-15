const assert=require('assert'),fs=require('fs');
const A=require('../omr/omr-scan-adapter.js');
const S=require('../omr/omr-scoring.js');
const W=require('../omr/omr-result-write.js');
const module=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const desktop=fs.readFileSync('giaovien.html','utf8');
const html=fs.readFileSync('teacher/index.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
const candidate=fs.readFileSync('omr/omr-v7-candidate.js','utf8');
const bridge=fs.readFileSync('teacher/omr-v7-runtime-20261115-039.js','utf8');
const adapter=fs.readFileSync('omr/omr-scan-adapter.js','utf8');
assert.strictEqual(bridge,(adapter+'\n;\n'+module).replace(/\n+$/,'\n'),'runtime bridge must match V7 canonical code');
assert(module.includes("officialEngine:'v7'"));
assert(module.includes("const mode='v7'"));
assert(module.includes('OMR V7 — chấm và lưu điểm chính thức'));
assert(!module.includes('id="omrEngineSelect"'));
assert(!module.includes('id="omrV6Lab"'));
assert(!module.includes('id="omrV6Comparison"'));
assert(module.includes("q('omrOpenCamera').disabled=!v7Available"));
assert(module.includes("q('omrPickFile').disabled=!v7Available"));
assert(module.includes("state.lastScan.captureMode!=='v7'"));
assert(module.includes("state.lastPreview.scan?.captureMode!=='v7'"));
assert(module.includes("draft.scan.recognitionEngine==='V7'"));
assert(module.includes("saved.engine==='v7'&&saved.compare===false"));
const a=module.indexOf("}else if(mode==='v7'){");
const b=module.indexOf("}else{",a+1);
assert(a>=0&&b>a,'official branch exists');
const official=module.slice(a,b);
assert(official.includes('rect,T.template,null,{experimentalRefinement:true}'),
 'official must use full refinement, not observe-only V7');
assert(official.includes('scan=E.fromV7(v5,candidate);'));
assert(official.includes('DamSanOmrV7Overlay.draw'));
assert(candidate.includes("opts.experimentalRefinement===true"));
assert(candidate.includes('Ext.sparse.apply(rect,T,B,result,Ext.numeric)'));
assert(candidate.includes('geometryDiagnostic'));
assert(desktop.includes('omr-v7-candidate.js'));
assert(html.includes('20261115-teacher-pwa-039'));
assert(sw.includes("const VERSION='20261115-teacher-pwa-039'"));
assert(html.includes('omr-v7-runtime-20261115-039.js'));
assert(sw.includes("'./omr-v7-runtime-20261115-039.js'"));
const scan0={ok:true,sbd:'00100434',maDe:'103',p1:'A'.repeat(18),
 p2:Array(4).fill('Đ-S-Đ-S'),p3:['','175','15','','',''],
 uncertain:[],uncertainDetails:[],invalidMarks:[]};
const validated={engine:'V7_COMPLETE_CANDIDATE',readOnly:true,validForSave:false,
 ok:true,requiresRetake:false,retakeReasons:[],geometryDiagnostic:'ok',
 calibration:{reliable:true},p3Calibration:{reliable:true},
 geometry:{status:'ok'},issues:[],invalidMarks:[],
 p1:scan0.p1,p2:scan0.p2,p3:scan0.p3};
const scan=A.fromV7(scan0,validated);
assert.strictEqual(scan.recognitionEngine,'V7');
assert.strictEqual(scan.captureMode,'v7');
assert.strictEqual(scan._requiresRetake,false);
const items=[
 ...Array.from({length:18},()=>({phan:'1',dap_an_dung:'A'})),
 ...Array.from({length:4},()=>({phan:'2',dap_an_dung:'Đ-S-Đ-S'})),
 ...scan0.p3.map(x=>({phan:'3',dap_an_dung:x}))];
const model={ok:true,room:{id:'room-1',assessment_type:'TOT_NGHIEP'},
 student:{id:'student-1'},variant:{code:'103',items}};
const preview=S.previewScan(scan,model,{allowUncertain:true});
assert(preview.ok);
assert.strictEqual(preview.grade.score,9); // Four blank P3 answers never earn points.
W.assertConfirmed(preview);
const meta=W.metadataFrom(preview);
assert.strictEqual(meta.recognition_engine,'V7');
assert.throws(()=>W.assertConfirmed({...preview,scan:{...scan,captureMode:'compare'}}),/comparison_mode_never_writes/);
assert.throws(()=>W.assertConfirmed({...preview,scan:{...scan,_labReadOnly:true}}),/comparison_mode_never_writes/);
assert.throws(()=>A.fromV7(scan0,{...validated,p3Calibration:{reliable:false}}),/V7/);
console.log('PASS OMR 041: V7 sole official path, full refinement, 18-4-6 score, writes guarded');
