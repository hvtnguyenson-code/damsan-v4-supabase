const assert=require('assert');
const O=require('../omr/omr-core.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
console.log('=== OMR EVIDENCE 009 ===');
const w=900,h=Math.round(w*T.heightCm/T.widthCm),r=T.bubbleRadiusCm*(w-1)/T.widthCm;
const q=T.p3[4],idx=x=>T.p3Labels.indexOf(x);
const xy=p=>[p[0]*(w-1)/T.widthCm,p[1]*(h-1)/T.heightCm];
const base=new Uint8Array(w*h);
for(let y=0;y<h;y++)base.fill(245-Math.round(y/h*15),y*w,(y+1)*w);
function disk(buf,cx,cy,rad,v){
  const rs=rad*rad;
  for(let y=Math.max(0,Math.floor(cy-rad));y<=Math.min(h-1,Math.ceil(cy+rad));y++)
    for(let x=Math.max(0,Math.floor(cx-rad));x<=Math.min(w-1,Math.ceil(cx+rad));x++)
      if((x-cx)**2+(y-cy)**2<=rs)buf[y*w+x]=Math.min(buf[y*w+x],v);
}
function ring(buf,cx,cy,rad,v){
  const inner=rad*.8,rr=rad*rad,ii=inner*inner;
  for(let y=Math.max(0,Math.floor(cy-rad));y<=Math.min(h-1,Math.ceil(cy+rad));y++)
    for(let x=Math.max(0,Math.floor(cx-rad));x<=Math.min(w-1,Math.ceil(cx+rad));x++){
      const d=(x-cx)**2+(y-cy)**2;
      if(d<=rr&&d>=ii)buf[y*w+x]=Math.min(buf[y*w+x],v);
    }
}
function scene(extra='blank',noise=0){
  const b=new Uint8Array(base);
  q.forEach(col=>col.forEach(pt=>{if(pt){const p=xy(pt);ring(b,p[0],p[1],r,155);}}));
  for(const [col,val] of [[0,'3'],[1,'0'],[2,'0']]){
    const p=xy(q[col][idx(val)]);disk(b,p[0],p[1],r*.56,65);
  }
  const p=xy(q[3][idx(extra==='nine'?'9':'0')]);
  if(extra==='zero'||extra==='nine')disk(b,p[0],p[1],r*.56,65);
  if(extra==='faintZero')disk(b,p[0],p[1],r*.56,207);
  if(extra==='smudge')disk(b,p[0],p[1],r*.28,159);
  if(extra==='edge')disk(b,p[0]+r*.58,p[1],r*.23,75);
  if(noise){
    for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){
      const j=y*w+x;b[j]=Math.max(0,Math.min(255,b[j]+(((x*17+y*11+noise*31)%7)-3)));
    }
  }
  return {gray:b,width:w,height:h};
}
const run=(mode,noise=0)=>O.readP3QuestionRectified(scene(mode,noise),T,q,T.p3Labels,T.bubbleRadiusCm);
for(let n=0;n<5;n++){
  const a=run('blank',n);
  assert.strictEqual(a.value,'300','blank fourth column must stay blank');
  assert.strictEqual(a.uncertain,false,'clean blank should not prompt manual review');
  assert.strictEqual(run('zero',n).value,'3000','real fourth zero must remain');
  assert.strictEqual(run('nine',n).value,'3009','real fourth nine must remain');
}
for(const variant of ['smudge','edge','faintZero']){
  const a=run(variant);
  assert.notStrictEqual(a.value,'3000',variant+' must not silently create a fourth zero');
  assert(a.raw[3]==='' || a.uncertain,variant+' must remain blank or flagged');
}
console.log('PASS omr_evidence_009');