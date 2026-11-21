'use strict';
// OMR 066 — independent resolution/orientation geometry stress.
// Known synthetic marker positions; no photos, students or production writes.
const assert=require('node:assert/strict');
const Core=require('../omr/omr-core.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const G=require('../omr/omr-v7-geometry-066.js');
const sizes=[
 {name:'small_landscape',w:720,h:405,pageHeight:365,x:215,y:15},
 {name:'medium_landscape',w:1080,h:608,pageHeight:548,x:350,y:21},
 {name:'large_landscape',w:1920,h:1080,pageHeight:960,x:640,y:38},
 {name:'portrait_phone',w:1080,h:1600,pageHeight:1450,x:28,y:42}
];
function sample(spec,iteration){
 const {w,h,pageHeight}=spec;
 const gray=new Uint8Array(w*h),s=pageHeight/2254*(200/2.54);
 const skew=.025*Math.sin(iteration*1.9),tilt=.016*Math.cos(iteration*1.3);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)
  gray[y*w+x]=Math.round(225+13*x/w+7*y/h);
 const at=p=>{
  const x=spec.x+p[0]*s,y=spec.y+p[1]*s;
  return [x+skew*(y-h/2),y+tilt*(x-w/2)];
 };
 function box(cx,cy,r,v){
  for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)
   for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++)
    gray[y*w+x]=v;
 }
 for(const m of T.markers)
  box(...at([m.x,m.y]),Math.max(2,m.size*s*.46),12);
 // Four larger lookalike fiducials, within image borders but outside paper.
 const r=Math.max(5,Math.min(w,h)*.012);
 for(const p of [[12,12],[w-13,12],[w-13,h-13],[12,h-13]])
  box(...p,r,15);
 return {gray,at};
}
let total=0,accepted=0,falseCorners=0,minControls=5;
const perMode={};
for(const spec of sizes){
 perMode[spec.name]={accepted:0,total:8};
 for(let i=0;i<8;i++){
  const {gray,at}=sample(spec,i+1);
  const r=G.register(gray,spec.w,spec.h,T,Core);
  total++;
  if(!r.ok)continue;
  accepted++;perMode[spec.name].accepted++;
  minControls=Math.min(minControls,r.internalMatches);
  for(let k=0;k<4;k++){
   const m=T.markers[k],p=at([m.x,m.y]);
   if(Math.hypot(p[0]-r.corners[k][0],p[1]-r.corners[k][1])>
    Math.max(5,Math.min(spec.w,spec.h)*.015))falseCorners++;
  }
  assert(r.internalMatches>=3,'Invalid internal marker count');
 }
}
assert.equal(falseCorners,0,'Accepted wrong corner locations');
for(const [name,x] of Object.entries(perMode))
 assert(x.accepted>=7,'Multi-resolution acceptance too low '+name+' '+x.accepted);
console.log('PASS OMR066 4 camera scales/orientations geometry',JSON.stringify({
 total,accepted,perMode,falseCorners,minControls
}));
