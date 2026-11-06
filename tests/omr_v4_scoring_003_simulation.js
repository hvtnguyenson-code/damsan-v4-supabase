const assert=require('assert');
const S=require('../omr/omr-scoring.js');
console.log('=== OMR V4 SCORING 003 ===');
const items=[
  ...Array.from({length:18},(_,i)=>({phan:'1',dap_an_dung:i%2?'B':'A'})),
  {phan:'2',dap_an_dung:'Đ-S-Đ-S'},
  {phan:'2',dap_an_dung:'Đ-Đ-Đ-Đ'},
  {phan:'2',dap_an_dung:'S-S-S-S'},
  {phan:'2',dap_an_dung:'Đ-S-S-Đ'},
  {phan:'3',dap_an_dung:"'25,0"},
  {phan:'3',dap_an_dung:"'11,2"},
  {phan:'3',dap_an_dung:"'31,3"},
  {phan:'3',dap_an_dung:"'36,0"},
  {phan:'3',dap_an_dung:"'300"},
  {phan:'3',dap_an_dung:"'14,3"}
];
const variant={code:'444',items};
const scan={
  p1:'AB'.repeat(9),
  p2:['Đ-S-Đ-S','Đ-Đ-S-S','S-Đ-Đ-Đ','Đ-S-S-Đ'],
  p3:['25.0','11,2','31,3','36,0','300','14,3'],
  uncertain:[]
};
const raw=S.buildRawAnswers(scan,variant);
assert.strictEqual(raw.length,28);
assert.strictEqual(raw[0].chon,'A');
assert.strictEqual(raw[18].chon,'Đ-S-Đ-S');
assert.strictEqual(raw[22].chon,'25.0');
const g=S.previewGrade(raw,variant,'TOT_NGHIEP',{});
assert.strictEqual(g.parts.p1,4.5);
assert.strictEqual(g.parts.p2,2.35);
assert.strictEqual(g.parts.p3,1.5);
assert.strictEqual(g.score,8.35);
assert.strictEqual(S.scoreP2('Đ-Đ-S-S','Đ-Đ-Đ-Đ'),0.25);
assert.strictEqual(S.scoreP2('S-Đ-Đ-Đ','S-S-S-S'),0.1);
// A confirmed multiple mark is wrong even when edited to a correct answer.
const invalidScan={...scan,invalidMarks:['P1.1','P2.1a','P2.2a']};
const invalidRaw=S.buildRawAnswers(invalidScan,variant);
assert.strictEqual(invalidRaw[0].chon,'?');
assert.strictEqual(invalidRaw[18].chon,'?-S-Đ-S');
assert.strictEqual(invalidRaw[19].chon,'?-Đ-S-S');
const invalidGrade=S.previewGrade(invalidRaw,variant,'TOT_NGHIEP',{});
assert.strictEqual(invalidGrade.parts.p1,4.25);
assert(Math.abs(invalidGrade.parts.p2-1.7)<1e-9);
assert(Math.abs(invalidGrade.score-7.45)<1e-9);
const edited={...invalidScan,p1:'A'+scan.p1.slice(1),p2:['Đ-S-Đ-S','Đ-Đ-S-S',...scan.p2.slice(2)]};
const previewEdited=S.previewScan(edited,{ok:true,room:{assessment_type:'TOT_NGHIEP'},student:{id:'test'},variant});
assert(Math.abs(previewEdited.grade.score-7.45)<1e-9);
assert.deepStrictEqual(S.enforceInvalidMarks(scan),scan);
assert.strictEqual(S.normalizeShort(" '25,0 "),'25.0');
const binding={ok:true,room:{assessment_type:'TOT_NGHIEP',scoring_config:{}},student:{id:'s1'},variant};
const preview=S.previewScan(scan,binding);
assert.strictEqual(preview.ok,true);
assert.strictEqual(preview.grade.score,8.35);
const blocked=S.previewScan({...scan,uncertain:['P1.1']},binding);
assert.strictEqual(blocked.ok,false);
assert.strictEqual(blocked.reason,'scan_incomplete');
console.log('PASS omr_v4_scoring_003');
