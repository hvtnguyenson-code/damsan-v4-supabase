const assert=require('assert'),fs=require('fs');
const B=require('../omr/omr-reliability-v7-baseline.js');
const V6=require('../omr/omr-reliability-v6.js');
const S=require('../omr/omr-v7-sparse-p3.js');
const V7=require('../omr/omr-v7-candidate.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
console.log('=== OMR 036 independent P3 sparse-column calibration ===');
const met=(score,fill)=>({score,fill,gradient:.018});
function grid(values){
 const g=T.p3.map(q=>q.map(col=>col.map((pt,k)=>pt?met(.035+.002*(k%4),.07):null)));
 values.forEach((word,i)=>[...word].forEach((ch,j)=>{
  const idx=T.p3Labels.indexOf(ch);assert(idx>=0&&g[i][j][idx]);
  g[i][j][idx]=met(.49,.88);
 }));
 return g;
}
function base(){return {geometry:{status:'ok'},
 calibration:{reliable:true,markReference:.53},p3Calibration:{reliable:false},
 p3:Array(6).fill('?'),issues:Array.from({length:24},(_,j)=>({
  key:'P3.'+(Math.floor(j/4)+1)+'.'+(j%4+1),state:'review'}))};}
const answers=['7','175','15','0','12','23'];
for(let n=0;n<=6;n++){
 const expected=answers.map((v,i)=>i<n?v:'');
 const m=grid(expected),source=base();
 const out=S.apply({},T,{...B,measureP3Columns:()=>m},source);
 assert(out.activated,'n='+n+' must calibrate without requiring 8 marks');
 assert.strictEqual(out.scan.p3Calibration.globalCountRequirement,0);
 assert.deepStrictEqual(out.scan.p3,expected,'per question result n='+n);
 assert.deepStrictEqual(out.scan.issues,[],'false alert n='+n);
 assert.strictEqual(source.p3[0],'?','V6 copy must not be mutated');
}
const blank=grid(Array(6).fill(''));
const fallback=S.apply({},T,{...B,measureP3Columns:()=>blank},
 {...base(),calibration:{reliable:false}});
assert(fallback.activated&&fallback.scan.p3.every(x=>x===''));
const two=grid(['7','','','','','']);
two[0][0][T.p3Labels.indexOf('8')]=met(.46,.81);
const dual=S.apply({},T,{...B,measureP3Columns:()=>two},base());
assert(dual.scan.issues.some(x=>x.key==='P3.1.1'&&x.state==='multiple'),
 'two filled marks must never be accepted');
const faint=grid(Array(6).fill(''));
faint[0][0][T.p3Labels.indexOf('7')]=met(.17,.42);
const unknown=S.apply({},T,{...B,measureP3Columns:()=>faint},base());
assert.strictEqual(unknown.scan.p3[0],'?','faint isolated mark must stay unknown');
assert(unknown.scan.issues.some(x=>x.key==='P3.1.1'));
const broken=grid(['175','','','','','']);
broken[0][1]=grid(Array(6).fill(''))[0][1];
const gap=S.apply({},T,{...B,measureP3Columns:()=>broken},base());
assert.strictEqual(gap.scan.p3[0],'?','cannot infer middle digit');
const bad=S.apply({},T,{...B,measureP3Columns:()=>two},
 {...base(),geometry:{status:'review'}});
assert.strictEqual(bad.activated,false);
assert.deepStrictEqual(bad.scan.p3,Array(6).fill('?'));
const sourceCode=fs.readFileSync('omr/omr-reliability-v6.js','utf8').replace(
 'else root.DamSanOmrReliabilityV6=api;',
 'else root.DamSanOmrReliabilityV7Baseline=api;');
assert.strictEqual(fs.readFileSync('omr/omr-reliability-v7-baseline.js','utf8'),sourceCode);
const html=fs.readFileSync('teacher/index.html','utf8'),sw=fs.readFileSync('teacher/sw.js','utf8');
assert(html.includes('omr-v7-sparse-p3.js')&&sw.includes("'../omr/omr-v7-sparse-p3.js'"));
const v7=fs.readFileSync('omr/omr-v7-candidate.js','utf8');
assert(v7.includes('Ext.sparse.apply(rect,T,B,result)'));
const w=420,h=Math.round(w*T.heightCm/T.widthCm);
const rect={gray:new Uint8Array(w*h).fill(220),width:w,height:h};
assert.deepStrictEqual(V7.analyzeRectified(rect,T).p3,V6.analyzeRectified(rect,T).p3);
console.log('PASS OMR 036 sparse 0..6, dual, faint, missing digit and V6 parity');