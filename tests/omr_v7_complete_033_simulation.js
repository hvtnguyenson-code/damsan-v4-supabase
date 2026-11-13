const assert=require('assert'),fs=require('fs');
const B=require('../omr/omr-reliability-v7-baseline.js');
const V6=require('../omr/omr-reliability-v6.js');
const V7=require('../omr/omr-v7-candidate.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const Q=require('../omr/omr-v7-quality.js');
const G=require('../omr/omr-v7-geometry.js');
const L=require('../omr/omr-v7-lighting.js');
const M=require('../omr/omr-v7-marks.js');
const N=require('../omr/omr-v7-numeric.js');
const w=820,h=Math.round(w*T.heightCm/T.widthCm),r=T.bubbleRadiusCm*(w-1)/T.widthCm;
const xy=p=>[p[0]*(w-1)/T.widthCm,p[1]*(h-1)/T.heightCm];
function sheet(shift=0,shadow=false){
 const gray=new Uint8Array(w*h);gray.fill(220);
 function paint(p,value=50,off=0){
  const [cx,cy]=xy(p),rad=.63*r;
  for(let y=Math.max(0,Math.floor(cy-rad));y<=Math.min(h-1,Math.ceil(cy+rad));y++)
  for(let x=Math.max(0,Math.floor(cx+off-rad));x<=Math.min(w-1,Math.ceil(cx+off+rad));x++)
   if((x-cx-off)**2+(y-cy)**2<=rad*rad)gray[y*w+x]=value;
 }
 T.p1.forEach((row,i)=>paint(row[i%4],50,i===13?shift:0));
 T.p2.forEach((row,i)=>paint(row[i%2],50));
 if(shadow){const [cx,cy]=xy(T.p1[13][1]),x=cx+1.55*r,y=cy,rad=.3*r;
  for(let py=Math.max(0,Math.floor(y-rad));py<=Math.min(h-1,Math.ceil(y+rad));py++)
  for(let px=Math.max(0,Math.floor(x-rad));px<=Math.min(w-1,Math.ceil(x+rad));px++)
   if((px-x)**2+(py-y)**2<=rad*rad)gray[py*w+px]=60;}
 return {gray,width:w,height:h};
}
const clear=sheet(),flat={gray:new Uint8Array(w*h).fill(220),width:w,height:h};
assert(Q.assess(clear).focus>Q.assess(flat).focus);
assert.strictEqual(Q.choose([flat,clear]).index,1);
assert(Q.inspectZones(clear,T).centersChecked>100);
const ms=[];
for(const part of ['P1','P2','P3'])for(let i=0;i<4;i++)
 ms.push({region:part,predicted:[i*36+60,i*37+70],
  observed:[i*36+60+.2*r,i*37+70-.1*r],solidity:.95});
const geo=G.fit(clear,T,{status:'ok',markers:ms});
assert(geo.reliable);
const off=G.offset(geo,'P1',clear,T);assert(off.reliable&&off.dx>0);
assert(!G.fit(clear,T,{status:'ok',markers:ms.map(x=>({
 ...x,observed:[x.predicted[0]+4*r,x.predicted[1]+r]}))}).reliable);
const lit=L.inspect(clear,T,B,T.p1[0],{reliable:true,
 markReference:.5,blankReference:.03},T.p1Labels);
assert.strictEqual(lit.metrics.length,4);
assert.strictEqual(lit.glare,false);
const raw=B.analyzeRectified(clear,T),out=V7.analyzeRectified(clear,T);
assert.deepStrictEqual(out.p1,raw.p1);
assert.deepStrictEqual(out.p2,raw.p2);
assert.deepStrictEqual(out.p3,raw.p3);
assert.strictEqual(out.enhancements.answerChanges,0);
assert.strictEqual(out.enhancements.mode,'observe_only');
assert(M.inspect(raw).diagnosticOnly);
const trial=V7.analyzeRectified(sheet(3.5,true),T,{experimentalRefinement:true});
assert.strictEqual(trial.enhancements.mode,'experimental_all_modules');
assert(trial.enhancements.applied.length===trial.enhancements.answerChanges);
assert.strictEqual(trial.validForSave,false);
assert(N.eligible({state:'review',
 reason:'Không đủ bằng chứng phân biệt nét tô và vết tẩy',
 top:.46,second:.04,topFill:.35,secondFill:.05}));
assert(!N.eligible({state:'multiple'}));
assert.strictEqual(B.decodeP3Positions([
 {state:'single',token:'3'},{state:'single',token:'0'},
 {state:'single',token:'0'},{state:'blank',token:''}]).value,'300');
assert.strictEqual(B.decodeP3Positions([
 {state:'single',token:'3'},{state:'blank',token:''},
 {state:'single',token:'0'},{state:'blank',token:''}]).value,'?');
for(const name of ['quality','geometry','lighting','marks','numeric']){
 const path='omr-v7-'+name+'.js';
 assert(fs.readFileSync('teacher/index.html','utf8').includes(path));
 assert(fs.readFileSync('teacher/sw.js','utf8').includes(path));
}
assert.deepStrictEqual(V6.analyzeRectified(clear,T),raw);
console.log('PASS OMR 033 all modules and immutable V6 fallback');
