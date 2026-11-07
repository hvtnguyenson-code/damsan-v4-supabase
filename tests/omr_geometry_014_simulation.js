const assert=require('assert');
const V6=require('../omr/omr-reliability-v6.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
console.log('=== OMR 014 INTERNAL GEOMETRY (OFFLINE DIAGNOSTIC) ===');
const w=1000,h=Math.round(w*T.heightCm/T.widthCm);
const px=m=>[m.x*(w-1)/T.widthCm,m.y*(h-1)/T.heightCm];
const inside=T.markers.filter(m=>!['TL','TR','BR','BL'].includes(m.name));
function scene({night=false,shiftP3=0,omitP2=false,ringsInstead=false}={}){
  const gray=new Uint8Array(w*h).fill(222);
  for(const mk of inside){
    if(omitP2&&mk.name.startsWith('P2'))continue;
    const [x,y]=px(mk),side=mk.size*((w-1)/T.widthCm+(h-1)/T.heightCm)/2;
    const offset=mk.name.startsWith('P3')?shiftP3:0;
    const half=side*.48;
    for(let yy=Math.max(0,Math.floor(y-half));yy<=Math.min(h-1,Math.ceil(y+half));yy++)
      for(let xx=Math.max(0,Math.floor(x+offset-half));xx<=Math.min(w-1,Math.ceil(x+offset+half));xx++){
        const border=xx<x+offset-half+1||xx>x+offset+half-1
          ||yy<y-half+1||yy>y+half-1;
        if(!ringsInstead||border)gray[yy*w+xx]=16;
      }
  }
  if(night)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const light=.56+.22*x/w-.11*y/h;
    gray[y*w+x]=Math.round(gray[y*w+x]*light);
  }
  return {gray,width:w,height:h};
}
const good=V6.inspectMarkerGeometry(scene(),T);
assert.strictEqual(good.status,'ok',JSON.stringify(good.regions));
assert(good.matched>=20);
assert(good.regions.P1.p90R<.5);
assert(good.regions.P3.p90R<.5);
const lowLight=V6.inspectMarkerGeometry(scene({night:true}),T);
assert.strictEqual(lowLight.status,'ok');
assert(lowLight.matched>=20);
const shifted=V6.inspectMarkerGeometry(scene({shiftP3:12}),T);
assert.strictEqual(shifted.status,'review','known P3 displacement must be visible');
assert(shifted.affected.includes('P3'));
assert(!shifted.affected.includes('P2'));
const missing=V6.inspectMarkerGeometry(scene({omitP2:true}),T);
assert.strictEqual(missing.status,'insufficient','missing controls cannot imply geometry is good');
assert.strictEqual(missing.regions.P2.matched,0);
const noSolid=V6.inspectMarkerGeometry(scene({ringsInstead:true}),T);
assert(noSolid.matched<6,'thin ring is not a filled-square marker');
const complete=V6.analyzeRectified(scene(),T);
assert.strictEqual(complete.geometry.status,'ok');
assert.strictEqual(complete.calibration.reliable,false,'no pencil marks => no calibration');
console.log('PASS omr_geometry_014');
