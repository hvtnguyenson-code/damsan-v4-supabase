'use strict';
// OMR 066 — independent synthetic geometry stress harness.
// Ground truth is generated from the PDF-derived Đam San template, NOT
// inferred from a few photos. Official V7 and research 060 are unchanged.
const assert=require('node:assert/strict');
const Core=require('../omr/omr-core.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const Legacy=require('../omr/omr-v7-geometry-060.js');
const Geometry=require('../omr/omr-v7-geometry-066.js');
const P060=require('../omr/omr-v7-pipeline-060.js');
const P066=require('../omr/omr-v7-pipeline-066.js');
const V7=require('../omr/omr-v7-candidate.js');

const W=1080,H=608,scale=548/2254*(200/2.54);
const baseAt=p=>[350+p[0]*scale,21+p[1]*scale];
function scene({distractors=false,skew=0,onlyCorners=false}={}){
 const g=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)
  g[y*W+x]=Math.round(230+7*x/W+5*y/H); // realistic illumination gradient
 const at=point=>{
  const a=baseAt(point);
  return [a[0]+skew*(a[1]-300),a[1]+skew*.24*(a[0]-540)];
 };
 function box(x,y,r,ink){
  for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(H-1,Math.ceil(y+r));yy++)
   for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(W-1,Math.ceil(x+r));xx++)
    g[yy*W+xx]=ink;
 }
 function dot(x,y,r,ink){
  for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(H-1,Math.ceil(y+r));yy++)
   for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(W-1,Math.ceil(x+r));xx++){
    if((xx-x)*(xx-x)+(yy-y)*(yy-y)<=r*r)g[yy*W+xx]=ink;
   }
 }
 for(const m of T.markers){
  if(onlyCorners&&!['TL','TR','BR','BL'].includes(m.name))continue;
  const p=at([m.x,m.y]);
  box(p[0],p[1],Math.max(2,m.size*scale*.46),12);
 }
 if(!onlyCorners){
  const sbd='00120601',code='0103';
  T.sbd.forEach((c,i)=>dot(...at(c[Number(sbd[i])]),3.2,33));
  T.maDe.forEach((c,i)=>dot(...at(c[Number(code[i])]),3.2,33));
  T.p1.forEach((row,i)=>dot(...at(row[i%4]),3.2,36));
  T.p2.forEach((row,i)=>dot(...at(row[i%2]),3.2,36));
  T.p3.forEach((q,i)=>{
   for(let j=0;j<3;j++){
    const pt=q[j][T.p3Labels.indexOf(String((i+j)%10))];
    if(pt)dot(...at(pt),3.2,36);
   }
  });
 }
 if(distractors){
  // Four plausible, high-contrast square blobs far beyond the real paper:
  // they defeat the old extrema-only strategy but cannot corroborate the
  // template's interior fiducials.
  for(const p of [[20,18],[1056,20],[1055,588],[19,587]])
   box(p[0],p[1],7,13);
  // A competing dark blob by the right edge and ink-like circle.
  box(983,270,6,15);
  dot(998,350,6,10);
 }
 const rgba=new Uint8Array(W*H*4);
 for(let i=0,j=0;i<g.length;i++,j+=4){
  rgba[j]=rgba[j+1]=rgba[j+2]=g[i];rgba[j+3]=255;
 }
 return {gray:g,rgba:{width:W,height:H,data:rgba},at};
}
const close=(a,b,tol=7)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=tol;
function assertAnchors(reg,at){
 assert.equal(reg.ok,true,JSON.stringify({
  reason:reg.reason,legacyRejected:reg.legacyRejectedReason,
  inner:reg.internalMatches,rmse:reg.rmse}));
 assert(reg.internalMatches>=3,'must have >=3 internal fiducials');
 assert(reg.corners.length===4);
 for(let i=0;i<4;i++)
  assert(close(reg.corners[i],at([T.markers[i].x,T.markers[i].y])),
   'Wrong corner #'+i+' actual '+JSON.stringify(reg.corners[i]));
}

// 1. Ordinary photo: proven 060 registration preserved verbatim.
const clear=scene();
const base=Legacy.register(clear.gray,W,H,T,Core);
assertAnchors(base,clear.at);
const stable=Geometry.register(clear.gray,W,H,T,Core);
assert.equal(stable.fallbackUsed,false);
assert.equal(stable.geometryMethod,'omr060_verified');
assert.deepEqual(stable.corners,base.corners);
const control060=P060.analyze(clear.rgba,T,{core:Core,V7,
 expectedStudentCode:'00120601',expectedExamCode:'0103'});
const control066=P066.analyze(clear.rgba,T,{core:Core,V7,
 expectedStudentCode:'00120601',expectedExamCode:'0103'});
assert.equal(control060.ok,true);
assert.equal(control066.ok,true);
assert.equal(control066.readOnly,true);
assert.equal(control066.validForSave,false);
assert.equal(control066.identity.sbd,'00120601');
assert.equal(control066.identity.maDe,'0103');
assert.deepEqual(control066.answers,control060.answers,
 '006 fallback must not alter already accepted 060 answers');

// 2. Four strong squares around the *background*, 060 rejects.
// 066 searches alternate quadrilaterals and requires internal witnesses.
const noisy=scene({distractors:true});
const old=Legacy.register(noisy.gray,W,H,T,Core);
assert.equal(old.ok,false,'Adversarial clutter should foil the old extrema method');
const recovered=Geometry.register(noisy.gray,W,H,T,Core);
assertAnchors(recovered,noisy.at);
assert.equal(recovered.fallbackUsed,true,'new fallback was not actually used');
assert.equal(recovered.geometryMethod,'omr066_multi_hypothesis_internal_controls');
const result=P066.analyze(noisy.rgba,T,{core:Core,V7,
 expectedStudentCode:'00120601',expectedExamCode:'0103'});
assert.equal(result.ok,true,'066 did not recover a complete clean research read');
assert.equal(result.identity.valid,true);
assert.equal(result.readOnly,true);
assert.equal(result.validForSave,false);
assert.deepEqual(result.answers,control060.answers,
 'Fallback must preserve all P1/P2/P3 ground truth');
assert.throws(()=>P060.toResearchScan(result),/omr060_invalid_research_result/,
 '066 results must not be promoted into 060 bridge');
const safe=P066.toResearchScan(result);
assert.equal(safe.recognitionEngine,'V7_066');
assert.equal(safe.validForSave,false);

// 3. Perspective skew + distractors: geometry must not depend on a
// fixed absolute paper position or a perfectly rectangular camera frame.
const skewed=scene({distractors:true,skew:.055});
const warped=Geometry.register(skewed.gray,W,H,T,Core);
assertAnchors(warped,skewed.at);
assert.equal(warped.fallbackUsed,true);

// 4. False sheet with corners but no interior witnesses must fail closed.
const forged=scene({distractors:true,onlyCorners:true});
const falsePositive=Geometry.register(forged.gray,W,H,T,Core);
assert.equal(falsePositive.ok,false,'corner-only impostor was accepted');

// 5. Strict invalid-input protection.
assert.equal(Geometry.register(new Uint8Array(10),W,H,T,Core).ok,false);
console.log('PASS OMR 066 multi-hypothesis fiducial recovery',JSON.stringify({
 legacyClutterReason:old.reason,
 recoveredControls:recovered.internalMatches,recoveredRmse:recovered.rmse,
 perspectiveControls:warped.internalMatches,
 answersPreserved:true,identityPreserved:true,
 negativeRejected:true,officialWrites:false
}));
