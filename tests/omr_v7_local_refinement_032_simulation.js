const assert=require('assert');
const B=require('../omr/omr-reliability-v7-baseline.js');
const V=require('../omr/omr-v7-candidate.js');
const Local=require('../omr/omr-v7-local-refinement.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const w=820,h=Math.round(w*T.heightCm/T.widthCm),
 radius=T.bubbleRadiusCm*(w-1)/T.widthCm;
function point(p){return [p[0]*(w-1)/T.widthCm,p[1]*(h-1)/T.heightCm];}
function sheet({shift=0,shadow=false,double=false,erasure=false}={}){
 const gray=new Uint8Array(w*h);gray.fill(220);
 function dot(p,value=50,offset=0,scale=.63){
  const [x,y]=point(p),r=radius*scale;
  for(let yy=Math.max(0,Math.floor(y-r));yy<Math.min(h,Math.ceil(y+r));yy++)
   for(let xx=Math.max(0,Math.floor(x+offset-r));xx<Math.min(w,Math.ceil(x+offset+r));xx++)
    if((xx-x-offset)**2+(yy-y)**2<r*r)gray[yy*w+xx]=value;
 }
 T.p1.forEach((row,i)=>dot(row[i%4],50,i===13?shift:0));
 T.p2.forEach((row,i)=>dot(row[i%2],50));
 if(double)dot(T.p1[13][(13+1)%4],55);
 if(erasure)dot(T.p1[13][(13+1)%4],165);
 if(shadow){
  const [xx,yy]=point(T.p1[13][1]);
  const x=xx+radius*1.55,y=yy,r=radius*.3;
  for(let py=Math.max(0,Math.floor(y-r));py<Math.min(h,Math.ceil(y+r));py++)
   for(let px=Math.max(0,Math.floor(x-r));px<Math.min(w,Math.ceil(x+r));px++)
    if((px-x)**2+(py-y)**2<r*r)gray[py*w+px]=60;
 }
 return {gray,width:w,height:h};
}
const displaced=sheet({shift:3.5,shadow:true});
const raw=B.analyzeRectified(displaced,T);
assert.strictEqual(raw.p1Evidence[13].state,'review',
 'V6 reference must actually fail in constructed local shadow/shift case');
assert.strictEqual(raw.p1Evidence[13].reason,Local.LIGHTING_REASON);
const authorized={...raw,geometry:{...raw.geometry,status:'ok'}};
const trial=Local.apply(displaced,T,B,authorized);
assert.deepStrictEqual(trial.applied.map(a=>a.key),['P1.14']);
assert.strictEqual(trial.scan.p1[13],'B');
assert.strictEqual(trial.scan.issues.some(x=>x.key==='P1.14'),false);
assert.strictEqual(raw.p1[13],'?','V6 source remains immutable');
assert.strictEqual(raw.p1Evidence[13].state,'review');
assert.deepStrictEqual(trial.scan.p2,raw.p2);
assert.deepStrictEqual(trial.scan.p3,raw.p3);
assert.deepStrictEqual(trial.scan.invalidMarks,raw.invalidMarks);
const unsafe=Local.apply(displaced,T,B,raw);
assert.deepStrictEqual(unsafe.applied,[],'No recovery when marker geometry is not OK');
const clean=B.analyzeRectified(sheet(),T);
assert.deepStrictEqual(Local.apply(sheet(),T,B,{...clean,geometry:{status:'ok'}}).applied,[],
 'Do not alter already clear V6 answers');
const two=B.analyzeRectified(sheet({double:true}),T);
assert.deepStrictEqual(Local.apply(sheet({double:true}),T,B,{...two,geometry:{status:'ok'}}).applied,[],
 'Never override an existing double mark');
const erased=B.analyzeRectified(sheet({erasure:true}),T);
assert.deepStrictEqual(Local.apply(sheet({erasure:true}),T,B,{...erased,geometry:{status:'ok'}}).applied,[],
 'Never turn suspected erased second marks into a single');
const off=V.analyzeRectified(displaced,T);
assert.deepStrictEqual(off.p1,raw.p1);
assert.deepStrictEqual(off.issues,raw.issues);
assert.strictEqual(off.enhancements.mode,'observe_only');
assert.strictEqual(off.enhancements.answerChanges,0);
const on=V.analyzeRectified(displaced,T,{experimentalRefinement:true});
assert.strictEqual(on.p1,raw.p1,
 'Full scan must fail closed when printed geometry is insufficient');
assert.strictEqual(on.enhancements.answerChanges,0);
assert.strictEqual(on.validForSave,false);
assert.strictEqual(V.compare(raw,on).count,0);
console.log('PASS OMR 032 local multi-offset refinement: one rescue, multiple/erasures/uncertain geometry protected');
