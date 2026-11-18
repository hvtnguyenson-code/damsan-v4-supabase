const assert=require('assert');
const I=require('../omr/omr-v7-ink-060.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const w=900,h=Math.round(w*T.heightCm/T.widthCm),gray=new Uint8Array(w*h).fill(225);
function fill(p,ink=40){
 const x=p[0]*(w-1)/T.widthCm,y=p[1]*(h-1)/T.heightCm;
 const r=T.bubbleRadiusCm*(w-1)/T.widthCm*.60;
 for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(h-1,Math.ceil(y+r));yy++)
  for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(w-1,Math.ceil(x+r));xx++)
   if((xx-x)**2+(yy-y)**2<=r*r)gray[yy*w+xx]=ink;
}
const strong=T.p1[0][0],erased=T.p1[0][1],blank=T.p1[0][2];
fill(strong,36);fill(erased,198);
const rect={gray,width:w,height:h};
const a=I.signature(rect,T,strong),b=I.signature(rect,T,erased),c=I.signature(rect,T,blank);
assert(a.valid&&b.valid&&c.valid);
assert(a.inkCoverage>.65&&a.coherence>.75&&a.deepCoverage>.5);
assert(b.deepCoverage<a.deepCoverage&&b.contrast<a.contrast);
assert(c.inkCoverage===0&&c.deepCoverage===0);
const candidate={p1Evidence:[{state:'review',index:0,reason:'potential erasure'},
 {state:'single',index:1,topFill:.30,topRelative:.30,separation:.17}],
 p2Evidence:[{state:'multiple',index:-1}],p3Evidence:[
 {columns:[{state:'review',index:-1},{state:'blank',index:-1}]}]};
const diag=I.inspect(rect,T,candidate);
assert(diag.diagnosticOnly&&diag.changesAnswers===false);
assert(diag.flags.some(f=>f.key==='P1.1'&&f.kind==='needs_review'));
assert(diag.flags.some(f=>f.key==='P1.2'&&f.kind==='weak_single_review_candidate'));
assert(diag.flags.some(f=>f.key==='P2.1a'&&f.kind==='confirmed_multi_mark'));
assert(diag.flags.some(f=>f.key==='P3.1.1'&&f.kind==='needs_review'));
assert.equal(candidate.p1Evidence[1].state,'single','do not mutate existing decisions');
console.log('PASS OMR 060 ink: dark fill, faint erasure, blank, multi and P3 diagnostics without score edits');
