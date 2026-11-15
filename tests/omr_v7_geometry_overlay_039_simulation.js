const assert=require('assert'),fs=require('fs');
const G=require('../omr/omr-v7-geometry.js');
const Overlay=require('../omr/omr-v7-overlay.js');
const V6=require('../omr/omr-reliability-v6.js');
const V7=require('../omr/omr-v7-candidate.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const width=750,height=Math.round(width*T.heightCm/T.widthCm);
const rect={gray:new Uint8Array(width*height).fill(225),width,height};
const radius=T.bubbleRadiusCm*((width-1)/T.widthCm+(height-1)/T.heightCm)/2;
const locations={P1:T.markers.filter(m=>m.name.startsWith('P1')),
 P2:T.markers.filter(m=>m.name.startsWith('P2')),
 P3:T.markers.filter(m=>m.name.startsWith('P3'))};
const anchors=[];
for(const [region,marks] of Object.entries(locations))
 for(const [i,m] of marks.entries()){
   const x=m.x*(width-1)/T.widthCm,y=m.y*(height-1)/T.heightCm;
   const offsetX=(.10+.03*i)*radius,offsetY=(-.13+.025*i)*radius;
   anchors.push({region,name:m.name,solidity:.91,
    predicted:[x,y],observed:[x+offsetX,y+offsetY]});
 }
const fitted=G.fit(rect,T,{status:'ok',markers:anchors});
assert(fitted.reliable,'three regions must have stable control points');
const q=G.offsetAt(fitted,'P3',T.p3[2][1][5],rect,T);
assert(q.reliable&&q.markersUsed>=3);
assert(q.source==='local_verified_controls');
assert(Math.abs(q.dx)<T.bubbleRadiusCm*.65);
const wrong=G.offsetAt(fitted,'P3',null,rect,T);
assert.strictEqual(wrong.reliable,false);
const corrupted=anchors.map(a=>({...a,
  observed:[a.predicted[0]+3*radius,a.predicted[1]-3*radius]}));
assert(!G.fit(rect,T,{status:'ok',markers:corrupted}).reliable);
const poor=G.fit(rect,T,{status:'review',markers:anchors});
assert(!G.offsetAt(poor,'P1',T.p1[0][0],rect,T).reliable);
const baseline=V6.analyzeRectified(rect,T);
const compared=V7.analyzeRectified(rect,T);
assert.deepStrictEqual(compared.p1,baseline.p1);
assert.deepStrictEqual(compared.p2,baseline.p2);
assert.deepStrictEqual(compared.p3,baseline.p3);
assert.strictEqual(compared.enhancements.answerChanges,0);
const synthetic={p1Evidence:Array.from({length:18},(_,i)=>({state:i===0?'single':'blank',index:1})),
 p2Evidence:Array.from({length:16},(_,i)=>({state:i===3?'multiple':'blank',index:0})),
 p3Evidence:Array.from({length:6},(_,i)=>({columns:Array.from({length:4},(_,j)=>({
  state:i===0&&j===0?'review':i===1&&j===0?'single':'blank',index:2}))})),
 geometry:{markers:[]}};
const annotations=Overlay.features(T,synthetic);
assert(annotations.counts.single===2);
assert(annotations.counts.review===1);
assert(annotations.counts.multiple===1);
assert(annotations.controls.length>=20);
assert(annotations.diagnosticOnly&&!annotations.changesAnswers);
assert(!('save' in Overlay)&&!('submit' in Overlay));
let image=null,drawn=0;
const canvas={getContext:()=>({
 createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
 putImageData:(img)=>{image=img;},
 beginPath(){},arc(){},stroke(){},strokeRect(){},
 moveTo(){},lineTo(){},fill(){},set strokeStyle(v){},set fillStyle(v){},
 set lineWidth(v){}
})};
const summary=Overlay.draw(canvas,rect,T,synthetic);
assert(summary.drawn&&summary.width<=820&&image.data.length===4*summary.width*summary.height);
assert(!fs.readFileSync('omr/omr-v7-candidate.js','utf8').includes('rpc_staff_submit_omr'));
console.log('PASS OMR 039 spatially bounded multi-marker correction, no-change V6, read-only overlay');
