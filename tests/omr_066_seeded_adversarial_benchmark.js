'use strict';
// Seeded adversarial geometry benchmark: 48 varied "phone photographs"
// and 16 impostor layouts with known synthetic fiducial ground truth.
// Unlike a finite 27-photo replay, varying position, tilt, background,
// marker occlusion and square clutter tests an algorithmic failure class.
const assert=require('node:assert/strict');
const Core=require('../omr/omr-core.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const Old=require('../omr/omr-v7-geometry-060.js');
const New=require('../omr/omr-v7-geometry-066.js');
const width=1080,height=608,scale=548/2254*(200/2.54);
function random(seed){
 let x=(seed>>>0)||0x321ac7;
 return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;
  return (x>>>0)/4294967296;};
}
const witnessNames=['TOP-C','MID-L','MID-C','MID-R','P3-B3'];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function make(seed,forgery=false){
 const next=random(1299811+seed*7417);
 const jitter=(range)=>(next()-.5)*range;
 const originX=350+jitter(35),originY=21+jitter(9);
 const skew=jitter(.16),shear=jitter(.04);
 const project=pt=>{
  const x=originX+pt[0]*scale,y=originY+pt[1]*scale;
  return [x+skew*(y-304),y+shear*(x-540)];
 };
 const gray=new Uint8Array(width*height);
 const shade=6+jitter(9),shadeY=7+jitter(8);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)
  gray[y*width+x]=Math.max(185,Math.min(250,
   Math.round(224+shade*x/width+shadeY*y/height)));
 function box(cx,cy,r,v){
  const rr=Math.max(2,r);
  for(let y=Math.max(0,Math.floor(cy-rr));y<=Math.min(height-1,Math.ceil(cy+rr));y++)
   for(let x=Math.max(0,Math.floor(cx-rr));x<=Math.min(width-1,Math.ceil(cx+rr));x++)
    gray[y*width+x]=v;
 }
 const omit=new Set();
 if(seed%5===0&&!forgery){
  omit.add(witnessNames[seed%5]);
  omit.add(witnessNames[(seed+2)%5]);
 }
 for(const m of T.markers){
  if(forgery&&!['TL','TR','BR','BL'].includes(m.name))continue;
  if(omit.has(m.name))continue;
  const [cx,cy]=project([m.x,m.y]);
  box(cx,cy,m.size*scale*.46,10+jitter(9));
 }
 // All trials contain powerful dark square blobs beyond the real page.
 // Their precise size, color and position differ for every random seed.
 const falseCorners=[
  [18+jitter(24),14+jitter(18)],
  [1060+jitter(23),15+jitter(19)],
  [1059+jitter(22),590+jitter(17)],
  [17+jitter(24),591+jitter(18)]
 ];
 for(const p of falseCorners)box(...p,6.1+next()*1.7,12+jitter(12));
 for(let i=0;i<4;i++)box(900+jitter(145),90+i*95+jitter(25),
  3.5+next()*3.5,15+jitter(8));
 return {gray,project,dropout:omit.size};
}
let legacyAccepted=0,newAccepted=0,rescued=0,wrong=0,regressed=0;
let withDropout=0,dropoutAccepted=0;
const start=Date.now();
for(let i=1;i<=48;i++){
 const scene=make(i);
 const old=Old.register(scene.gray,width,height,T,Core);
 const better=New.register(scene.gray,width,height,T,Core);
 if(scene.dropout)withDropout++;
 if(old.ok)legacyAccepted++;
 if(better.ok){
  newAccepted++;
  if(scene.dropout)dropoutAccepted++;
 }
 if(old.ok&&!better.ok)regressed++;
 if(!old.ok&&better.ok)rescued++;
 if(better.ok){
  for(let k=0;k<4;k++){
   const mark=T.markers[k],expected=scene.project([mark.x,mark.y]);
   if(dist(expected,better.corners[k])>8){wrong++;break;}
  }
  assert(better.internalMatches>=3,'Weak internal control count accepted: '+i);
 }
}
let forgedAccepted=0;
for(let i=1;i<=16;i++){
 const fake=make(i+1700,true);
 const result=New.register(fake.gray,width,height,T,Core);
 if(result.ok)forgedAccepted++;
}
assert.equal(regressed,0,'066 must preserve 060 verified results');
assert.equal(wrong,0,'066 accepted an incorrect fiducial set');
assert.equal(forgedAccepted,0,'066 accepted a corner-only forged page');
assert(newAccepted>=44,'Adversarial recovery too weak: '+newAccepted+'/48');
assert(rescued>=32,'066 failed to improve over extrema-only approach: '+rescued);
assert(dropoutAccepted>=Math.max(0,withDropout-1),
 'Insufficient recovery with two internal markers occluded');
console.log('PASS OMR066 seeded blind geometry benchmark',JSON.stringify({
 total:48,legacyAccepted,newAccepted,rescued,regressed,
 incorrectGeometry:wrong,forgedLayouts:16,forgedAccepted,
 withTwoHiddenControls:withDropout,dropoutAccepted,
 durationMs:Date.now()-start,
 activeScoreWriter:false
}));
