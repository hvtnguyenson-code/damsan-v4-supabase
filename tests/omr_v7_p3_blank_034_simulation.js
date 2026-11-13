const assert=require('assert');
const N=require('../omr/omr-v7-numeric.js');
const B=require('../omr/omr-reliability-v7-baseline.js');
const V6=require('../omr/omr-reliability-v6.js');
const V7=require('../omr/omr-v7-candidate.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
console.log('=== OMR 034 P3 isolated blank-column false-review refinement ===');
// These anonymized per-bubble evidence values were measured on a separate
// full-page paper photo, NOT from the exact PWA camera frame. The photo
// itself is not stored in Git. A simulated V6 review in column 2 matches
// the app observation but is not a reproduced scan of that captured frame.
const m=(score,fill)=>({score,fill});
const metrics=[
 [m(.1044,.3333),m(.1030,.34)],
 [m(.1388,.4154),m(.1220,.37)],
 [m(.1168,.3906),m(.1164,.38)],
 [m(.1068,.3438),m(.1038,.37)]
];
const calibration={reliable:true,background:.086,
 markReference:.596,span:.510,positiveSamples:9};
const blank={state:'blank',token:'',reason:'Cột không tô'};
const review={state:'review',token:'?',
 reason:'Không đủ bằng chứng phân biệt nét tô và vết tẩy'};
const q={value:'?',reason:'Ít nhất một vị trí chưa xác định chắc chắn',
 columns:[blank,review,blank,blank]};
const recovered=N.tryRecoverUniformBlank(q,metrics,calibration);
assert(recovered&&recovered.reviewIndex===1,
 '3 blank columns and 1 low-contrast review can be treated as an empty question');
for(const [name,second] of [
 ['pencil mark',m(.20,.51)],
 ['erasure trace',m(.17,.47)],
 ['clear mark',m(.37,.84)]
]){
 const testMetrics=metrics.map((col,i)=>i===1?[second,col[1]]:col);
 assert.strictEqual(N.tryRecoverUniformBlank(q,testMetrics,calibration),null,
  'must NOT erase a possible '+name);
}
for(const columns of [
 [blank,{state:'multiple',token:'?'},blank,blank],
 [review,review,review,review],
 [blank,{state:'single',token:'1'},blank,blank],
 [blank,{...review,reason:'Không đủ hiệu chuẩn Phần III'},blank,blank]
]){
 assert.strictEqual(N.tryRecoverUniformBlank({...q,columns},metrics,calibration),null);
}
const evidence=[q,...Array.from({length:5},()=>
 ({value:'',columns:Array.from({length:4},()=>({...blank})),reason:''}))];
const baseline={p3:['?','','','','',''],p3Evidence:evidence,
 geometry:{status:'ok'},p3Calibration:calibration,
 issues:[{key:'P3.1.2',state:'review',reason:review.reason}]};
const clone=(x)=>JSON.parse(JSON.stringify(x));
const guard=B.analyzeRectified;
const mockB={measureP3Columns:()=>[metrics],
 decodeP3Positions:()=>({value:'',reason:''}),classifyP3Column:()=>{throw Error('not expected')}};
const res=N.apply({},{...T,p3:Array.from({length:6},()=>Array.from({length:4},()=>[]))},
 mockB,baseline);
assert.strictEqual(res.scan.p3[0],'');
assert.deepStrictEqual(res.scan.issues,[]);
assert.strictEqual(res.applied[0].method,'uniform_whole_question_blank_consensus');
assert.strictEqual(baseline.p3[0],'?','V6 baseline must remain immutable');
assert.strictEqual(baseline.issues.length,1);
assert.deepStrictEqual(N.apply({},T,mockB,{...baseline,geometry:{status:'review'}}).applied,[]);
assert.deepStrictEqual(N.apply({},T,mockB,{...baseline,
 p3Calibration:{...calibration,reliable:false}}).applied,[]);
assert.strictEqual(typeof V6.analyzeRectified,'function');
assert.strictEqual(B.analyzeRectified,guard);
const w=400,h=Math.round(w*T.heightCm/T.widthCm);
const rect={gray:new Uint8Array(w*h).fill(215),width:w,height:h};
const original=V6.analyzeRectified(rect,T);
const unchanged=V7.analyzeRectified(rect,T);
assert.deepStrictEqual(unchanged.p3,original.p3,
 'ordinary V7 path must remain exact V6');
assert.strictEqual(unchanged.enhancements.answerChanges,0);
console.log('PASS OMR 034 guarded whole-question blank rescue, erasure safety and unchanged default');
