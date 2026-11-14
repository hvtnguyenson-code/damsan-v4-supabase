const assert=require('assert');
const B=require('../omr/omr-reliability-v7-baseline.js');
const S=require('../omr/omr-v7-sparse-p3.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
console.log('=== OMR 037 anonymized measurements from photographed P3 code-103 paper ===');
// Measured from the voluntarily supplied photographed paper after a single
// four-corner perspective correction to the official template. Each tuple
// stores top two bubble marks [label, score, fill] from the independent
// V6 measureBubble formula. No image, identity, or student ID is stored.
const readings=[
 [['-',.0949,.26,'0',.06,.1735],[',',.1067,.303,'0',.0752,.2245],
  [',',.0971,.2772,'0',.0937,.23],['4',.0734,.198,'2',.0694,.2178]],
 [['1',.5899,1,'4',.0609,.1765],['7',.6036,1,'4',.0553,.1373],
  ['5',.5472,1,'2',.0302,.0891],['4',.0232,.0588,'5',.0226,.049]],
 [['1',.5907,1,'0',.0122,0],['5',.6129,1,'1',.0133,0],
  ['8',.0103,0,'2',.0094,0],['9',.0214,0,'4',.0189,0]],
 [['1',.0175,0,'3',.0107,0],['0',.0113,0,'2',.0098,0],
  ['0',.0117,0,'8',.0115,0],['2',.013,0,'0',.0118,0]],
 [['0',.01,0,'1',.0094,0],['2',.0201,0,'3',.0181,0],
  ['0',.0134,0,'1',.0116,0],['1',.0202,0,'9',.016,0]],
 [['1',.0138,0,'-',.0113,0],['9',.0172,0,'5',.0146,0],
  ['5',.01,0,'8',.0088,0],['8',.0142,0,'2',.0131,0]]
];
const metrics=T.p3.map((q,i)=>q.map((column,j)=>{
 const list=column.map((pt)=>pt?{score:.006,fill:0,gradient:.035}:null);
 const [k1,s1,f1,k2,s2,f2]=readings[i][j];
 for(const [k,s,f] of [[k1,s1,f1],[k2,s2,f2]]){
  const idx=T.p3Labels.indexOf(k);
  assert(idx>=0&&list[idx],k+' must exist in P3 column');
  list[idx]={score:s,fill:f,gradient:.055};
 }
 return list;
}));
const legacy=B.calibrateP3(metrics.flat());
assert.strictEqual(legacy.positiveSamples,5,'five confidently marked numeric positions');
assert.strictEqual(legacy.reliable,false,'legacy eight-mark calibration is too strict');
const baseline={geometry:{status:'ok'},calibration:{reliable:true,markReference:.5},
 p3Calibration:legacy,p3:Array(6).fill('?'),
 issues:Array.from({length:24},(_,i)=>({key:'P3.'+(Math.floor(i/4)+1)+'.'+(i%4+1),
  state:'review',reason:'Không đủ dữ liệu rõ để hiệu chuẩn Phần III'}))};
const out=S.apply({},T,{...B,measureP3Columns:()=>metrics},baseline);
assert.strictEqual(out.activated,true);
assert.deepStrictEqual(out.scan.p3,['','175','15','','',''],
 'read exactly two answered questions, keep four questions truly blank');
assert.strictEqual(out.scan.issues.length,0,'never repeat 24 global failure warnings');
assert.strictEqual(out.scan.p3Calibration.positiveSamples,5);
assert.strictEqual(out.scan.p3Calibration.globalCountRequirement,0);
assert.strictEqual(baseline.p3[1],'?','preserve original V6 readout');
console.log('PASS OMR 037 photographed P3 evidence, 5 seeded marks, exact values');
