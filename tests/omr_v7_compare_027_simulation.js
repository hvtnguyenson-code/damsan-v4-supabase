const assert=require('assert');
const fs=require('fs'),vm=require('vm');
const A=require('../omr/omr-scan-adapter.js'),S=require('../omr/omr-scoring.js');
const W=require('../omr/omr-result-write.js'),V7=require('../omr/omr-v7-candidate.js');
const src=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const pwa=fs.readFileSync('teacher/index.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
const app=fs.readFileSync('teacher/app.js','utf8');
assert(src.includes("officialEngine:'v6'"),'V6 remains the default');
assert(src.includes('<option value="v7">V7 – chấm và lưu điểm (thử nghiệm)</option>'));
assert(src.includes('<option value="v5">V5 – chấm và lưu điểm (dự phòng)</option>'));
assert(src.includes("q('omrCompareLabel').textContent=v7Available"));
assert(src.includes("state.labEnabled?'compare':state.officialEngine"));
assert(src.includes("if(mode==='compare'&&hasV7Comparison())"));
assert(src.includes('info.candidate=root.DamSanOmrReliabilityV6.analyzeRectified(rect,T.template)'));
assert(src.includes('info.candidateV7=V7.analyzeValidatedRectified('));
assert(src.includes('scan=E.fromV6(v5,info.candidate)'));
assert(src.includes("scan._labReadOnly=mode==='compare'"));
assert(src.includes("if(state.labEnabled||state.lastScan?._labReadOnly)"));
assert(src.includes("q('omrSave').hidden=!!state.lastScan?._labReadOnly"));
assert(src.includes('showV7Comparison()'),'same PWA panel must show V6/V7');
assert(src.includes('Thời gian đọc: V6 '));
assert(src.includes('Điểm dự kiến: V6 '));
assert(!src.includes('v7-lab.html'),'no separate URL');
for(const name of ['omr-v7-research.js','omr-v7-candidate.js']){
 assert(pwa.includes(name),'PWA missing V7 script');
 assert(sw.includes(name),'PWA service-worker missing V7 cache');
}
const cacheRev='20261113-teacher-pwa-031';
assert(pwa.includes(cacheRev)&&sw.includes(cacheRev)&&app.includes(cacheRev));
assert(!fs.readFileSync('giaovien.html','utf8').includes('omr-v7-candidate.js'));
// Only the selected V7 mode may write; a comparison scan must be rejected
// even if all answers, room data and user acknowledgements are correct.
const base={ok:true,sbd:'00120601',maDe:'9001',p1:'A'.repeat(18),
 p2:['Đ-S-Đ-S','Đ-S-Đ-S','Đ-S-Đ-S','Đ-S-Đ-S'],
 p3:['14,3','25,0','31,3','36,0','300','11,2'],
 uncertain:[],uncertainDetails:[],invalidMarks:[]};
const v6Candidate={p1:base.p1,p2:base.p2,p3:base.p3,
 calibration:{reliable:true},p3Calibration:{reliable:true},
 geometry:{status:'ok'},issues:[],invalidMarks:[]};
const v7Candidate={engine:'V7_COMPLETE_CANDIDATE',readOnly:true,validForSave:false,
 ok:true,requiresRetake:false,retakeReasons:[],geometryDiagnostic:'ok',
 ...v6Candidate};
const v6Scan=A.fromV6(base,v6Candidate);
const v7Scan=A.fromV7(base,v7Candidate);
assert.strictEqual(v6Scan.recognitionEngine,'V6');
assert.strictEqual(v7Scan.recognitionEngine,'V7');
const answerKey=[
 ...Array.from({length:18},()=>({phan:'1',dap_an_dung:'A'})),
 ...Array.from({length:4},()=>({phan:'2',dap_an_dung:'Đ-S-Đ-S'})),
 ...base.p3.map(x=>({phan:'3',dap_an_dung:x}))
];
const binding={ok:true,room:{id:'test-room',assessment_type:'TOT_NGHIEP'},
 student:{id:'test-student'},variant:{code:'9001',items:answerKey}};
const preview=S.previewScan({...v6Scan,_labReadOnly:true,captureMode:'compare'},
 binding,{allowUncertain:true});
assert.strictEqual(preview.ok,true);
assert.throws(()=>W.assertConfirmed(preview),/comparison_mode_never_writes/);
assert.throws(()=>W.assertConfirmed({...preview,scan:{...preview.scan,_labReadOnly:false}}),
 /comparison_mode_never_writes/);
// P3 must be compared as well as P1/P2.
const changed={...v7Candidate,p1:'B'+base.p1.slice(1),
 p2:['S-Đ-S-Đ',...base.p2.slice(1)],
 p3:['14,3','25,0','31,3','36,0','3000','11,2']};
const diffs=V7.compare(v6Candidate,changed);
assert.strictEqual(diffs.count,6); // one P1, four P2 statements, one P3
assert(diffs.differences.some(x=>x.key==='P1.1'));
assert(diffs.differences.some(x=>x.key==='P2.1a'));
assert(diffs.differences.some(x=>x.key==='P3.5'));
const mock={DamSanOmrTemplate:{},DamSanOmr:{},DamSanOmrRoomBinding:{},
 DamSanOmrScoring:{},DamSanOmrResultWrite:{},DamSanOmrScanAdapter:{fromV7:()=>{}},
 DamSanOmrV7Candidate:{analyzeValidatedRectified:()=>{}}};
const el=new Map();
const get=id=>{
 if(!el.has(id))el.set(id,{id,style:{},value:'',checked:false,hidden:false,
  disabled:false,textContent:'',innerHTML:'',classList:{add(){},remove(){},contains(){return false}},
  querySelector:()=>({disabled:false})});
 return el.get(id);
};
const memory=new Map([['damSan_GVSession',JSON.stringify({id:'staff-test'})]]);
const sessionStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),
 removeItem:k=>memory.delete(k)};
const context={window:mock,document:{getElementById:get,querySelectorAll:()=>[]},
 sessionStorage,Date,console,rpcLayDanhSachPhongThi:async()=>[]};
mock.DamSanOmrReliabilityV6={analyzeRectified:()=>({})};
vm.runInNewContext(src,context);
(async()=>{
 await mock.DamSanOmrTeacher.open();
 assert.strictEqual(get('omrEngineSelect').value,'v6');
 assert.strictEqual(get('omrCompareLabel').textContent,'Đối chiếu V6/V7 (không lưu điểm)');
 assert(get('omrCompareHint').textContent.includes('V6 và V7 đọc cùng một ảnh'));
 assert.strictEqual(get('omrComparisonHeading').textContent,'Đối chiếu V6/V7 – chỉ xem, không lưu điểm');
 console.log('PASS OMR 027 V6/V7 PWA read-only compare');
})().catch(e=>{console.error(e);process.exitCode=1});
