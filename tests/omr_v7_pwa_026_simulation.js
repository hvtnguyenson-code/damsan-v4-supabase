const assert=require('assert'),fs=require('fs');
const A=require('../omr/omr-scan-adapter.js');
const S=require('../omr/omr-scoring.js');
const W=require('../omr/omr-result-write.js');
const candidate=(override={})=>({
 engine:'V7_COMPLETE_CANDIDATE',readOnly:true,validForSave:false,
 ok:true,requiresRetake:false,retakeReasons:[],geometryDiagnostic:'ok',
 calibration:{reliable:true},p3Calibration:{reliable:true},geometryApplied:false,
 p1:'A'.repeat(18),p2:Array(4).fill('Đ-S-Đ-S'),
 p3:['14,3','25,0','31,3','36,0','300','11,2'],
 issues:[],invalidMarks:[],...override
});
const v5={ok:true,sbd:'00120601',maDe:'9001',
 p1:'B'.repeat(18),p2:Array(4).fill('S-Đ-S-Đ'),p3:Array(6).fill('0'),
 uncertain:[],uncertainDetails:[],invalidMarks:[],
 markerCorners:[[0,0],[10,0],[10,10],[0,10]],homography:[1,0,0,0,1,0,0,0,1]};
const qlist=[...Array.from({length:18},()=>({phan:'1',dap_an_dung:'A'})),
 ...Array.from({length:4},()=>({phan:'2',dap_an_dung:'Đ-S-Đ-S'})),
 ...candidate().p3.map(ans=>({phan:'3',dap_an_dung:ans}))];
const binding={ok:true,room:{id:'room',assessment_type:'TOT_NGHIEP'},
 student:{id:'student'},variant:{code:'9001',items:qlist}};
(async()=>{
 assert.strictEqual(A.safeMode('v7'),'v7');
 const scan=A.fromV7(v5,candidate());
 assert.strictEqual(scan.recognitionEngine,'V7');
 assert.strictEqual(scan.captureMode,'v7');
 assert.strictEqual(scan._labReadOnly,false);
 assert.strictEqual(scan._requiresRetake,false);
 assert.strictEqual(scan.sbd,v5.sbd);
 assert.strictEqual(scan.maDe,v5.maDe);
 assert.deepStrictEqual(scan.markerCorners,v5.markerCorners);
 const preview=S.previewScan(scan,binding);
 assert.strictEqual(preview.ok,true);
 assert.strictEqual(preview.grade.score,10);
 let calls=0,record=null;
 const staffRpc=async(name,args)=>{calls++;record={name,args};return {status:'success',score:10}};
 const written=await W.submitConfirmed(preview,staffRpc);
 assert.strictEqual(written.status,'success');
 assert.strictEqual(calls,1);
 assert.strictEqual(record.name,'rpc_staff_submit_omr');
 assert.strictEqual(record.args.p_source_metadata.recognition_engine,'V7');
 assert.strictEqual(record.args.p_phong_id,'room');
 assert.strictEqual(record.args.p_hs_id,'student');
 assert.strictEqual(record.args.p_raw_answers[26].chon,'300');
 assert.strictEqual(v5.p1,'B'.repeat(18),'baseline V5 must not mutate');
 const ambiguous=A.fromV7(v5,candidate({
  p2:['Đ-S-Đ-S','Đ-S-Đ-?','Đ-S-Đ-S','Đ-S-Đ-S'],
  issues:[{key:'P2.2d',state:'review',reason:'Vết tẩy đáng ngờ'}]}));
 const warning=S.previewScan(ambiguous,binding,{allowUncertain:true});
 assert(warning.ok);
 await assert.rejects(W.submitConfirmed(warning,staffRpc),/uncertain_scan_requires_review/);
 assert.strictEqual(calls,1);
 warning.reviewedUncertain=true;
 await W.submitConfirmed(warning,staffRpc);
 assert.strictEqual(calls,2);
 const multiple=A.fromV7(v5,candidate({
  issues:[{key:'P1.1',state:'multiple',reason:'Hai ô tô'},
          {key:'P2.2d',state:'multiple',reason:'Hai ô tô'}],
  invalidMarks:['P1.1','P2.2d']}));
 const forced=S.previewScan({...multiple,p1:'A'.repeat(18),p2:Array(4).fill('Đ-S-Đ-S')},
  binding,{allowUncertain:true});
 assert.strictEqual(forced.rawAnswers[0].chon,'?','P1 two marks always wrong');
 assert.strictEqual(forced.rawAnswers[19].chon,'Đ-S-Đ-?','P2 two marks always wrong');
 await assert.rejects(W.submitConfirmed({...forced,reviewedUncertain:false},staffRpc),
  /uncertain_scan_requires_review/);
 for(const bad of [
   {geometryDiagnostic:'insufficient'},
   {geometryDiagnostic:'review'},
   {calibration:{reliable:false}},
   {p3Calibration:{reliable:false}},
   {ok:false},
   {requiresRetake:true,retakeReasons:['poor image']},
   {readOnly:false},
   {validForSave:true},
   {engine:'V6'},
   {p1:'ABC'},
   {p3:['3000']}
 ])assert.throws(()=>A.fromV7(v5,candidate(bad)),/V7|18–4–6/);
 assert.strictEqual(calls,2,'unsafe V7 never writes');
 // The 30+ field-test sheets must preserve paired V6/V7 readouts when a
 // teacher selects V7 and confirms saving to the special test room.
 const evidence={schema:1,room:'OMR_V7_TEST',v7:{
    p1:scan.p1,p2:scan.p2,p3:scan.p3,warningCount:0,invalidMarks:[]},
    v6:{p1:'B'.repeat(18),p2:Array(4).fill('Đ-S-Đ-S'),
      p3:scan.p3,warningCount:1,invalidMarks:[]},
    v7Ms:82,v6Ms:95,comparison:{count:18,differences:[
      {key:'P1.1',v6:'B',v7:'A'}]},v6Error:null};
 const labPreview={...preview,
    room:{...preview.room,MaPhong:'OMR_V7_TEST'},
    scan:{...scan,omrV7TestEvidence:evidence}};
 const trialMetadata=W.metadataFrom(labPreview);
 assert.strictEqual(trialMetadata.recognition_engine,'V7');
 assert.strictEqual(trialMetadata.omr_v7_test.version,1);
 assert.strictEqual(trialMetadata.omr_v7_test.v7_ms,82);
 assert.strictEqual(trialMetadata.omr_v7_test.v6_ms,95);
 assert.strictEqual(trialMetadata.omr_v7_test.comparison.count,18);
 assert(!('omr_v7_test' in W.metadataFrom({
   ...labPreview,room:{...labPreview.room,MaPhong:'10A4_GK1'}})),
   'Non-test rooms must not accumulate OMR research metadata');
 assert(!('omr_v7_test' in W.metadataFrom({
   ...labPreview,scan:{...labPreview.scan,recognitionEngine:'V6'}})),
   'Only deliberately selected V7 scans are recorded');
 assert(moduleHasEvidenceGuard(),'Only the special test room records a paired V6 scan');
 function moduleHasEvidenceGuard(){
   const m=fs.readFileSync('omr/omr-teacher-module.js','utf8');
   return m.includes("if(roomCode==='OMR_V7_TEST')") &&
     m.includes('scan.omrV7TestEvidence=evidence') &&
     m.includes('V7.compare(baseline,candidate)');
 }
 const html=fs.readFileSync('teacher/index.html','utf8');
 const module=fs.readFileSync('omr/omr-teacher-module.js','utf8');
 const sw=fs.readFileSync('teacher/sw.js','utf8');
 assert(module.includes('<option value="v7">V7 – chấm và lưu điểm (thử nghiệm)</option>'));
 assert(module.includes('scan=E.fromV7(v5,candidate);'));
 assert(module.includes("const expectedEngine=expectedEngineLabel(state.officialEngine);"));
 assert(module.includes("state.officialEngine='v5'"),'V5 fallback retained');
 assert(module.includes("officialEngine:'v6'"),'V6 remains default');
 for(const filename of ['omr-v7-research.js','omr-v7-candidate.js']){
   assert(html.includes(filename),'PWA script missing '+filename);
   assert(sw.includes(filename),'PWA cache missing '+filename);
 }
 const core=fs.readFileSync('omr/omr-v7-candidate.js','utf8');
 assert(core.includes('analyzeValidatedRectified'));
 assert(!core.includes('rpc_staff_submit_omr')&&!core.includes('staffRpc('));
 assert(!fs.readFileSync('giaovien.html','utf8').includes('omr-v7-candidate.js'),
  'desktop still stays on V6/V5');
 assert(!fs.existsSync('omr/v7-lab.html'),'no standalone URL required');
 console.log('PASS OMR V7 PWA selected mode + canonical scoring/write and guards');
})().catch(err=>{console.error(err);process.exitCode=1;});
