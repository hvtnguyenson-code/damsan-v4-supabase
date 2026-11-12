const assert=require('assert');
const fs=require('fs');
const V7=require('../omr/omr-v7-research.js');
const V6=require('../omr/omr-reliability-v6.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
console.log('=== OMR V7 research candidate: isolated synthetic tests ===');
// V7 may exist in research source/tests/docs but never in production entrypoints.
for(const path of ['teacher/index.html','giaovien.html','teacher/app.js',
  'omr/omr-teacher-module.js','omr/omr-result-write.js','teacher/sw.js']){
  assert(!fs.readFileSync(path,'utf8').includes('omr-v7-research'),path+' must not load V7');
}
const cal={reliable:true,mark:.72,blank:.035,span:.685};
const m=(score,fill,gradient=0,clipped=0)=>({score,fill,gradient,clipped});
const choice=metrics=>V7.decideRow(metrics,cal,['A','B','C','D']);
assert.strictEqual(choice([m(.72,.96),m(.02,0),m(.02,0),m(.02,0)]).value,'A');
assert.strictEqual(choice([m(.02,.01),m(.01,0),m(.02,0),m(.01,0)]).state,'blank');
assert.strictEqual(choice([m(.72,.96),m(.63,.92),m(.01,0),m(.01,0)]).state,'multiple');
assert.strictEqual(choice([m(.72,.96),m(.29,.36),m(.01,0),m(.01,0)]).state,'review');
assert.strictEqual(choice([m(.72,.96),m(.10,.1),m(.01,0),m(.01,0)]).state,'single');
assert.strictEqual(choice([m(.72,.96,0,.60),m(.01,0),m(.01,0),m(.01,0)]).state,'review');
assert.strictEqual(V7.decideRow([m(.72,.96),m(.63,.92)],cal,['Đ','S']).state,'multiple');
assert.strictEqual(V7.decideRow([m(.72,.96),m(.02,0)],{...cal,reliable:false},['Đ','S']).state,'review');
function frame(type){
  const w=128,h=128,gray=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)
    gray[y*w+x]=x%16<8?(type==='sharp'?35:105):(type==='sharp'?220:160);
  return {gray,width:w,height:h};
}
const chosen=V7.chooseFrame([frame('soft'),frame('sharp')]);
assert.strictEqual(chosen.index,1);
assert(chosen.candidates[0].quality.focus>chosen.candidates[1].quality.focus);
assert.throws(()=>V7.chooseFrame([]),/v7_no_frames/);
// Small coherent internal-marker displacements may be corrected; outliers
// are rejected; missing regional support makes correction unavailable.
const controls=[];
for(const [prefix,y] of [['P1',120],['P2',250],['P3',390]])
  for(let j=0;j<4;j++)controls.push({
    region:prefix,predicted:[60+j*70,y],observed:[63+j*70,y+2]});
const geom=V7.fitLocalGeometry(controls,10);
assert(geom.reliable);
let mapped=V7.correctedPoint(155,250,geom);
assert(Math.abs(mapped[0]-158)<.01&&Math.abs(mapped[1]-252)<.01);
assert.strictEqual(V7.fitLocalGeometry(controls.slice(0,8),10).reliable,false);
const corrupted=controls.map((x,i)=>i===0?{...x,observed:[x.observed[0]+100,x.observed[1]]}:x);
const robust=V7.fitLocalGeometry(corrupted,10);
assert(robust.reliable&&robust.rejected===1);
mapped=V7.correctedPoint(155,250,robust);
assert(Math.abs(mapped[0]-158)<.1);
assert.deepStrictEqual(V7.correctedPoint(20,30,{reliable:false}),[20,30]);
// Synthetic sheet with known printed template coordinates.
const w=900,h=Math.round(w*T.heightCm/T.widthCm),rad=T.bubbleRadiusCm*(w-1)/T.widthCm;
const px=pt=>[pt[0]*(w-1)/T.widthCm,pt[1]*(h-1)/T.heightCm];
function disk(gray,x,y,r,v){
  for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(h-1,Math.ceil(y+r));yy++)
    for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(w-1,Math.ceil(x+r));xx++)
      if((xx-x)**2+(yy-y)**2<=r*r)gray[yy*w+xx]=v;
}
function synthetic(lighting='day',double=false){
  const gray=new Uint8Array(w*h);gray.fill(222);
  T.p1.forEach((row,i)=>{
    const [x,y]=px(row[i%4]);disk(gray,x,y,rad*.63,57);
  });
  T.p2.forEach((row,i)=>{
    const [x,y]=px(row[i%2]);disk(gray,x,y,rad*.63,57);
  });
  // Erased older choice: faint remaining graphite should not be treated as
  // a second full answer when the new choice is unambiguously filled.
  const old=px(T.p2[0][1]);disk(gray,old[0],old[1],rad*.5,215);
  if(double){
    const other=px(T.p2[7][0]);disk(gray,other[0],other[1],rad*.63,57);
  }
  if(lighting!=='day')for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let factor=lighting==='gradient'?.64+.32*x/w:.9;
    if(lighting==='lamp'){
      const dx=x/w-.50,dy=y/h-.72;
      factor=.96-.38*Math.exp(-(dx*dx+dy*dy)/.023);
    }
    gray[y*w+x]=Math.min(255,Math.max(0,Math.round(gray[y*w+x]*factor)));
  }
  return {gray,width:w,height:h};
}
for(const lighting of ['day','gradient','lamp']){
  const out=V7.analyzeRectified(synthetic(lighting),T);
  assert(out.calibration.reliable,lighting+' should calibrate');
  assert.strictEqual(out.p1,'ABCDABCDABCDABCDAB',lighting+' P1');
  assert.deepStrictEqual(out.p2,['Đ-S-Đ-S','Đ-S-Đ-S','Đ-S-Đ-S','Đ-S-Đ-S'],lighting+' P2');
  assert.strictEqual(out.readOnly,true);
  assert.strictEqual(out.validForSave,false);
  assert.strictEqual(out.p3,null,'V7 must never invent P3');
  assert.strictEqual(out.p3Source,'NOT_EVALUATED');
}
const double=V7.analyzeRectified(synthetic('day',true),T);
assert(double.invalidMarks.includes('P2.2d'),'two filled bubbles in P2.2d must invalidate it');
assert.strictEqual(double.p2[1].split('-')[3],'?');
const withP3=V7.analyzeRectified(synthetic(),T,{v6:V6});
assert.strictEqual(withP3.p3Source,'V6_UNCHANGED');
assert(Array.isArray(withP3.p3)&&withP3.p3.length===6);
assert.strictEqual(withP3.validForSave,false);
console.log('PASS OMR V7 isolated candidate');
