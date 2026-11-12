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
for(const mode of ['day','gradient','lamp']){
 const rect=render(answers,mode),v=V.analyzeRectified(rect,T),v6=V6.analyzeRectified(rect,T);
 assert(v.calibration.reliable&&v.p3Calibration.reliable,mode+' calibration');
 assert.strictEqual(v.p1,'ABCDABCDABCDABCDAB',mode+' P1');
 assert.deepStrictEqual(v.p2,['Đ-S-Đ-S','Đ-S-Đ-S','Đ-S-Đ-S','Đ-S-Đ-S'],mode+' P2');
 assert.deepStrictEqual(v.p3,answers,mode+' P3');
 assert.strictEqual(v.issues.length,0,mode+' unexpected issues');
 assert.strictEqual(V.compare(v6,v).count,0,mode+' V6 comparison');
 assert(v.readOnly&&!v.validForSave);
}
const one=V.analyzeRectified(render(['1','2','3','4','5','6']),T);
assert.deepStrictEqual(one.p3,['1','2','3','4','5','6']);
assert.strictEqual(one.p3Calibration.source,'P1_TRANSFER');
const blank=V.analyzeRectified(render(['','','','','','']),T);
assert.deepStrictEqual(blank.p3,['','','','','','']);
assert(blank.p3Calibration.reliable);
const eraser=V.analyzeRectified(render(answers,'eraser'),T);
assert(eraser.issues.some(i=>i.key==='P2.1a'&&i.state==='review'));
const double=V.analyzeRectified(render(answers,'double'),T);
assert(double.invalidMarks.includes('P2.2d'));
const p3double=V.analyzeRectified(render(answers,'p3double'),T);
assert(p3double.issues.some(i=>i.key==='P3.1.2'&&i.state==='multiple'));
assert.strictEqual(p3double.p3[0],'?');
const undecidable=V.decodeP3([{state:'single',token:'3'},{state:'blank',token:''},
 {state:'single',token:'0'},{state:'blank',token:''}]);
assert.strictEqual(undecidable.value,'?');
assert.strictEqual(V.decodeP3([{state:'single',token:'3'},{state:'single',token:'0'},
 {state:'single',token:'0'},{state:'blank',token:''}]).value,'300');
assert.strictEqual(V.decodeP3([{state:'single',token:'3'},{state:'single',token:'0'},
 {state:'single',token:'0'},{state:'single',token:'0'}]).value,'3000');
for(const file of ['teacher/index.html','teacher/sw.js']){
 const content=fs.readFileSync(file,'utf8');
 assert(content.includes('omr-v7-candidate.js'),file+' should load V7 into teacher PWA');
 assert(!content.includes('v7-lab.js'),'No separate laboratory URL');
}
for(const file of ['giaovien.html','omr/omr-result-write.js']){
 assert(!fs.readFileSync(file,'utf8').includes('omr-v7-candidate.js'),
  file+' should not introduce a separate V7 write path');
}
console.log('PASS OMR V7 full 18-4-6 isolated synthetic checks');

// Full-image adapter must fail closed if inner printed controls are unreliable.
{
  const rect=render(answers);
  const stubCore={
    grayscale:()=>new Uint8Array(100),
    detectCornerMarkers:()=>({ok:true,corners:[[0,0],[9,0],[9,9],[0,9]]}),
    fastTemplateRegistration:()=>({ok:true,H:[1,0,0,0,1,0,0,0,1],matches:4,rmse:0}),
    warpTemplateGray:()=>rect
  };
  const mock={data:new Uint8ClampedArray(10*10*4),width:10,height:10};
  const unsafe=V.analyzeImageData(mock,T,stubCore,
    {inspectMarkerGeometry:()=>({status:'insufficient',markers:[]})});
  assert(unsafe.requiresRetake,'Missing interior controls must require recapture');
  assert.strictEqual(unsafe.ok,false);
  assert.strictEqual(unsafe.validForSave,false);
  assert(unsafe.retakeReasons.some(s=>s.includes('Mốc khống chế')));
}
