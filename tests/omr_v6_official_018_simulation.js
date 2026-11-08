const assert=require('assert');
const A=require('../omr/omr-scan-adapter.js');
const S=require('../omr/omr-scoring.js');
const W=require('../omr/omr-result-write.js');
const candidate=(overrides={})=>({
  p1:'A'.repeat(18),p2:Array(4).fill('Đ-S-Đ-S'),
  p3:['14,3','25,0','31,3','36,0','300','11,2'],
  calibration:{reliable:true},p3Calibration:{reliable:true},
  geometry:{status:'ok',matched:27,total:27},
  issues:[],invalidMarks:[],...overrides
});
const baseV5={ok:true,sbd:'00120601',maDe:'9001',p1:'B'.repeat(18),
  p2:Array(4).fill('S-Đ-S-Đ'),p3:Array(6).fill('0'),
  uncertain:['P3.5.4'],uncertainDetails:[{key:'P3.5.4'}],invalidMarks:['P1.1'],
  markerCorners:[[0,0],[10,0],[10,10],[0,10]],homography:[1,0,0,0,1,0,0,0,1]};
const items=[
  ...Array.from({length:18},()=>({phan:'1',dap_an_dung:'A'})),
  ...Array.from({length:4},()=>({phan:'2',dap_an_dung:'Đ-S-Đ-S'})),
  ...candidate().p3.map(s=>({phan:'3',dap_an_dung:s}))
];
const binding={ok:true,room:{id:'room',assessment_type:'TOT_NGHIEP'},
  student:{id:'student'},variant:{code:'9001',items}};
async function run(){
  const v6=A.fromV6(baseV5,candidate());
  assert.strictEqual(v6.recognitionEngine,'V6');
  assert.strictEqual(v6.captureMode,'v6');
  assert.strictEqual(v6._labReadOnly,false);
  assert.strictEqual(v6.sbd,'00120601');
  assert.strictEqual(v6.maDe,'9001');
  assert.deepStrictEqual(v6.markerCorners,baseV5.markerCorners);
  assert.strictEqual(v6.p3[4],'300');
  assert.deepStrictEqual(v6.uncertain,[]);
  assert.strictEqual(baseV5.p1,'B'.repeat(18),'V5 source must not be mutated');
  const p=S.previewScan(v6,binding);
  assert.strictEqual(p.ok,true);
  assert.strictEqual(p.grade.score,10);
  let invoked=0,record;
  const rpc=async(name,args)=>{invoked++;record={name,args};return {status:'success',score:10}};
  const result=await W.submitConfirmed(p,rpc);
  assert.strictEqual(result.status,'success');
  assert.strictEqual(invoked,1);
  assert.strictEqual(record.name,'rpc_staff_submit_omr');
  assert.strictEqual(record.args.p_phong_id,'room');
  assert.strictEqual(record.args.p_hs_id,'student');
  assert.strictEqual(record.args.p_ma_de,'9001');
  assert.strictEqual(record.args.p_source_metadata.recognition_engine,'V6');
  assert.strictEqual(record.args.p_raw_answers[22].chon,'14,3');
  assert.strictEqual(record.args.p_raw_answers[26].chon,'300');

  const ambiguous=A.fromV6(baseV5,candidate({
    p2:['Đ-S-Đ-S','Đ-S-Đ-?','Đ-S-Đ-S','Đ-S-Đ-S'],
    issues:[{key:'P2.2d',state:'review',reason:'Cần kiểm tra dấu tẩy'}]
  }));
  assert.deepStrictEqual(ambiguous.uncertain,['P2.2d']);
  assert.strictEqual(ambiguous.uncertainDetails[0].label,'Phần II – Câu 2, ý d');
  const unsure=S.previewScan(ambiguous,binding,{allowUncertain:true});
  assert.strictEqual(unsure.ok,true);
  await assert.rejects(W.submitConfirmed(unsure,rpc),/uncertain_scan_requires_review/);
  assert.strictEqual(invoked,1,'unreviewed V6 must never write');
  unsure.reviewedUncertain=true;
  await W.submitConfirmed(unsure,rpc);
  assert.strictEqual(invoked,2);
  assert.strictEqual(record.args.p_source_metadata.uncertain_count,1);

  const multiple=A.fromV6(baseV5,candidate({
    issues:[{key:'P1.1',state:'multiple',reason:'Hai ô tô rõ'},
      {key:'P2.2d',state:'multiple',reason:'Hai ô tô rõ'}],
    invalidMarks:['P1.1','P2.2d']
  }));
  const forced=S.previewScan({...multiple,p1:'A'.repeat(18),p2:Array(4).fill('Đ-S-Đ-S')},
    binding,{allowUncertain:true});
  assert.strictEqual(forced.ok,true);
  assert.strictEqual(forced.rawAnswers[0].chon,'?','P1 double-mark must remain wrong after typing');
  assert.strictEqual(forced.rawAnswers[19].chon,'Đ-S-Đ-?','P2 double-mark must remain wrong after typing');
  assert.strictEqual(forced.scan.invalidMarks.length,2);
  await assert.rejects(W.submitConfirmed({...forced,reviewedUncertain:false},rpc),/uncertain_scan_requires_review/);

  const unreadable=A.fromV6(baseV5,candidate({p3Calibration:{reliable:false}}));
  assert.strictEqual(unreadable._requiresRetake,true);
  const unsafe=S.previewScan(unreadable,binding,{allowUncertain:true});
  await assert.rejects(W.submitConfirmed({...unsafe,reviewedUncertain:true},rpc),/unreliable_omr_requires_retake/);
  assert.strictEqual(A.fromV6(baseV5,candidate({geometry:{status:'review'}}))._requiresRetake,true);
  assert.throws(()=>W.assertConfirmed({...p,scan:{...v6,_labReadOnly:true,captureMode:'compare'}}),/comparison_mode_never_writes/);
  assert.throws(()=>W.assertConfirmed({...p,scan:{...v6,captureMode:'compare'}}),/comparison_mode_never_writes/);
  assert.strictEqual(invoked,2,'compare and unsafe modes must not reach RPC');
  assert.throws(()=>A.fromV6(baseV5,candidate({p3:['3000']})),/18–4–6/);
  assert.throws(()=>A.fromV6(baseV5,candidate({p1:'AAAA'})),/18–4–6/);
  assert.strictEqual(A.safeMode('v6'),'v6');
  assert.throws(()=>A.safeMode('silentFallback'),/unknown_omr_mode/);
  console.log('PASS omr_v6_official_018 — V6 to canonical RPC, multi-mark and safety barriers');
}
module.exports=run;
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1});