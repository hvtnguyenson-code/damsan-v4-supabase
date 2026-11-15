const assert=require('assert');
const B=require('../omr/omr-reliability-v7-baseline.js');
const V6=require('../omr/omr-reliability-v6.js');
const N=require('../omr/omr-v7-numeric.js');
const Sparse=require('../omr/omr-v7-sparse-p3.js');
const V7=require('../omr/omr-v7-candidate.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
console.log('=== OMR 038 sparse P3 isolated blank noise consensus ===');
const mark=(score,fill)=>({score,fill,gradient:.018});
function grid(){
 return T.p3.map(q=>q.map(col=>col.map((p,i)=>p?
  mark(.034+.0007*(i%4),.075):null)));
}
const g=grid(),L=T.p3Labels;
function set(q,j,token,score,fill){
 const i=L.indexOf(token);assert(i>=0&&g[q][j][i]);
 g[q][j][i]=mark(score,fill);
}
// Two actual filled positions, not eight; a different question is empty
// except for a single noisy printed ring in column 2.
set(1,0,'1',.52,.90);set(1,1,'7',.53,.93);
for(let j=0;j<4;j++){
 set(0,j,j===0?'-':'0',[.096,.132,.099,.103][j],.40);
 set(0,j,'1',[.084,.115,.090,.094][j],.28);
}
const baseline={geometry:{status:'ok'},
 calibration:{reliable:true,markReference:.55},
 p3Calibration:{reliable:false},p3:Array(6).fill('?'),
 issues:Array.from({length:24},(_,n)=>({
  key:'P3.'+(Math.floor(n/4)+1)+'.'+(n%4+1),state:'review',
  reason:'Không đủ dữ liệu rõ để hiệu chuẩn Phần III'}))};
const engine={...B,measureP3Columns:()=>g};
const before=Sparse.apply({},T,engine,baseline);
assert(before.activated);
assert.strictEqual(before.scan.p3[0],'?');
const after=Sparse.apply({},T,engine,baseline,N);
assert(after.activated);
assert.strictEqual(after.scan.p3[0],'');
assert.strictEqual(after.scan.p3[1],'17');
assert.strictEqual(after.scan.p3Evidence[0].columns[1].state,'blank');
assert(!after.scan.issues.some(i=>i.key.startsWith('P3.1')));
assert(after.applied.some(i=>i.method==='sparse_p3_blank_consensus'));
assert.strictEqual(baseline.p3[0],'?');
assert.strictEqual(baseline.issues.length,24);
function reject(name,mutate){
 const copied=g.map(q=>q.map(col=>col.map(x=>x?{...x}:null)));
 mutate(copied);
 const result=Sparse.apply({},T,{...B,measureP3Columns:()=>copied},baseline,N);
 assert.notStrictEqual(result.scan.p3[0],'',
  'must NOT silently erase '+name);
 assert(!result.applied.some(x=>x.method==='sparse_p3_blank_consensus'
   &&x.key.startsWith('P3.1')),'unsafe correction: '+name);
}
reject('faint graphite or erasure',x=>{
 x[0][1][L.indexOf('0')]=mark(.23,.64);
 x[0][1][L.indexOf('1')]=mark(.10,.25);
});
reject('two significant filled bubbles',x=>{
 x[0][1][L.indexOf('0')]=mark(.51,.87);
 x[0][1][L.indexOf('1')]=mark(.46,.80);
});
reject('valid numeral among blank columns',x=>{
 x[0][2][L.indexOf('5')]=mark(.53,.91);
});
const denied=Sparse.apply({},T,engine,
 {...baseline,geometry:{status:'review'}},N);
assert.strictEqual(denied.activated,false);
const rect={gray:new Uint8Array(500*730).fill(219),width:500,height:730};
const original=V6.analyzeRectified(rect,T);
assert.deepStrictEqual(V7.analyzeRectified(rect,T).p3,original.p3);
console.log('PASS OMR 038 strict sparse consensus, vetoes, geometry and V6 parity');
