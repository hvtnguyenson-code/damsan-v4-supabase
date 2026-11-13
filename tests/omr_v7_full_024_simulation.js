const assert=require('assert'),fs=require('fs');
const V=require('../omr/omr-v7-candidate.js'),V6=require('../omr/omr-reliability-v6.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const w=820,h=Math.round(w*T.heightCm/T.widthCm),r=T.bubbleRadiusCm*(w-1)/T.widthCm;
const xy=p=>[p[0]*(w-1)/T.widthCm,p[1]*(h-1)/T.heightCm];
function render(words,mode='day'){
 const gray=new Uint8Array(w*h);gray.fill(221);
 function disk(p,v=53){
  if(!p)return;const [x,y]=xy(p),rad=r*.63;
  for(let yy=Math.max(0,Math.floor(y-rad));yy<=Math.min(h-1,Math.ceil(y+rad));yy++)
  for(let xx=Math.max(0,Math.floor(x-rad));xx<=Math.min(w-1,Math.ceil(x+rad));xx++)
  if((xx-x)**2+(yy-y)**2<=rad*rad)gray[yy*w+xx]=v;
 }
 T.p1.forEach((row,i)=>disk(row[i%4]));T.p2.forEach((row,i)=>disk(row[i%2]));
 words.forEach((word,i)=>Array.from(word).forEach((ch,j)=>disk(T.p3[i][j][T.p3Labels.indexOf(ch)])));
 if(mode==='eraser')disk(T.p2[0][1],186);
 if(mode==='double')disk(T.p2[7][0]);
 if(mode==='p3double')disk(T.p3[0][1][T.p3Labels.indexOf('7')]);
 if(mode==='gradient'||mode==='lamp'){
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dx=x/w-.58,dy=y/h-.62;
    const f=mode==='gradient'?.6+.35*x/w:.95-.45*Math.exp(-1*((dx*dx+dy*dy)/.03));
    gray[y*w+x]=Math.round(gray[y*w+x]*f);
  }
 }
 return {gray,width:w,height:h};
}
const answers=['300','-12','12,3','3000','1,25','23'];
const Copy=require('../omr/omr-reliability-v7-baseline.js');
const fields=['p1','p2','p3','p1Evidence','p2Evidence','p3Evidence',
 'issues','invalidMarks','calibration','p3Calibration','geometry','lighting'];
for(const mode of ['day','gradient','lamp','eraser','double','p3double']){
  const rect=render(answers,mode),v6=V6.analyzeRectified(rect,T);
  const copied=Copy.analyzeRectified(rect,T),v7=V.analyzeRectified(rect,T);
  assert.deepStrictEqual(copied,v6,'all V6 internals must match: '+mode);
  for(const field of fields)
    assert.deepStrictEqual(v7[field],v6[field],mode+' changed '+field);
  assert.strictEqual(v7.engine,'V7_COMPLETE_CANDIDATE');
  assert.strictEqual(v7.baselineEngine,'V6_EXACT_COPY');
  assert.strictEqual(v7.enhancements.mode,'observe_only');
  assert.deepStrictEqual(v7.enhancements.applied,[]);
  assert.strictEqual(v7.enhancements.answerChanges,0);
  assert.strictEqual(V.compare(v6,v7).count,0);
  assert(v7.readOnly&&!v7.validForSave);
  assert.strictEqual(v7.geometryDiagnostic,v6.geometry.status);
  assert.strictEqual(v7.requiresRetake,!v6.calibration.reliable||
    !v6.p3Calibration.reliable||v6.geometry.status!=='ok');
}
for(const words of [['1','2','3','4','5','6'],['','','','','','']]){
  const rect=render(words),v6=V6.analyzeRectified(rect,T),v7=V.analyzeRectified(rect,T);
  assert.deepStrictEqual(v7.p3,v6.p3);
  assert.deepStrictEqual(v7.issues,v6.issues);
}
for(const path of ['teacher/index.html','teacher/sw.js']){
  const src=fs.readFileSync(path,'utf8');
  assert(src.includes('omr-reliability-v7-baseline.js'));
  assert(src.includes('omr-v7-candidate.js'));
}
const stubCore={
  grayscale:()=>new Uint8Array(100),
  detectCornerMarkers:()=>({ok:true,corners:[[0,0],[9,0],[9,9],[0,9]]}),
  fastTemplateRegistration:()=>({ok:true,H:[1,0,0,0,1,0,0,0,1],matches:4,rmse:0}),
  warpTemplateGray:()=>render(answers)
};
const camera={data:new Uint8ClampedArray(10*10*4),width:10,height:10};
const out=V.analyzeImageData(camera,T,stubCore);
const same=V.analyzeRectified(stubCore.warpTemplateGray(),T);
assert.deepStrictEqual(out.p1,same.p1);
assert.deepStrictEqual(out.p2,same.p2);
assert.deepStrictEqual(out.p3,same.p3);
assert.strictEqual(out.validForSave,false);
console.log('PASS OMR V7 024 V6 copy parity across all three sections');
