const assert=require('assert');
const V6=require('../omr/omr-reliability-v6.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
console.log('=== OMR 013 SHEET-NORMALIZED V6 (EXPERIMENTAL) ===');
const w=900,h=Math.round(w*T.heightCm/T.widthCm),r=T.bubbleRadiusCm*(w-1)/T.widthCm;
const px=pt=>[pt[0]*(w-1)/T.widthCm,pt[1]*(h-1)/T.heightCm];
function disk(gray,x,y,radius,v){
  for(let yy=Math.max(0,Math.floor(y-radius));yy<=Math.min(h-1,Math.ceil(y+radius));yy++)
    for(let xx=Math.max(0,Math.floor(x-radius));xx<=Math.min(w-1,Math.ceil(x+radius));xx++)
      if((xx-x)**2+(yy-y)**2<=radius**2)gray[yy*w+xx]=Math.min(gray[yy*w+xx],v);
}
function ring(gray,x,y,radius,v){
  for(let yy=Math.max(0,Math.floor(y-radius));yy<=Math.min(h-1,Math.ceil(y+radius));yy++)
    for(let xx=Math.max(0,Math.floor(x-radius));xx<=Math.min(w-1,Math.ceil(x+radius));xx++){
      const d=(xx-x)**2+(yy-y)**2;
      if(d<=radius**2&&d>=(radius*.82)**2)gray[yy*w+xx]=Math.min(gray[yy*w+xx],v);
    }
}
function render(lighting='day',double=false){
  const gray=new Uint8Array(w*h);
  for(let y=0;y<h;y++)gray.fill(y>h*.36&&y<h*.76?211:239,y*w,(y+1)*w);
  for(const row of [...T.p1,...T.p2])for(const pt of row){
    const [x,y]=px(pt);ring(gray,x,y,r,130);
  }
  T.p1.forEach((row,i)=>{
    const [x,y]=px(row[i%4]);disk(gray,x,y,r*.59,72);
  });
  const targets=[0,1,0,1,0,1,0,1];
  T.p2.slice(0,8).forEach((row,i)=>{
    const [x,y]=px(row[targets[i]]);disk(gray,x,y,r*.59,73);
  });
  // Different pencil erasures should not count as a second answer.
  for(const [i,other,shade] of [[1,0,187],[2,1,194],[4,1,179]]){
    const [x,y]=px(T.p2[i][other]);disk(gray,x,y,r*.50,shade);
  }
  // The deliberately difficult P2.2d has two sizable marks.
  if(!double){
    const [x,y]=px(T.p2[7][0]);disk(gray,x,y,r*.59,116);
  }else{
    const [x,y]=px(T.p2[7][0]);disk(gray,x,y,r*.59,73);
  }
  // Simulated lamp shadows: same physical pencil under different exposure.
  if(lighting!=='day')for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let factor=.90;
    if(lighting==='gradient')factor=.60+.28*x/w;
    if(lighting==='night'){
      const dx=x/w-.65,dy=y/h-.64;
      factor=.94-.42*Math.exp(-(dx*dx+dy*dy)/.020);
    }
    gray[y*w+x]=Math.max(0,Math.min(255,Math.round(gray[y*w+x]*factor)));
  }
  return {gray,width:w,height:h};
}
for(const lighting of ['day','gradient','night']){
  const scan=V6.analyzeRectified(render(lighting),T);
  assert.strictEqual(scan.calibration.reliable,true);
  assert.strictEqual(scan.p1,'ABCDABCDABCDABCDAB');
  assert.strictEqual(scan.p2[0],'Đ-S-Đ-S','erasure must not create a second selection');
  assert.strictEqual(scan.p2[1],'Đ-S-Đ-?','difficult P2.2d must request review');
  assert(scan.issues.some(i=>i.key==='P2.2d'&&i.state==='review'));
  assert(!scan.issues.some(i=>['P2.1b','P2.1c','P2.2a'].includes(i.key)));
  assert.strictEqual(scan.invalidMarks.length,0);
}
const double=V6.analyzeRectified(render('day',true),T);
assert(double.invalidMarks.includes('P2.2d'),'two clearly filled bubbles must be wrong');
assert.strictEqual(double.p2Evidence[7].state,'multiple');
const blank=V6.classifyRow([{score:.02,fill:0,gradient:0},{score:.01,fill:0,gradient:0}],
  {reliable:true,markReference:.48,blankReference:.02},['Đ','S']);
assert.strictEqual(blank.state,'blank');
const undercalibrated=V6.calibrateSheet(Array.from({length:18},()=>[
  {score:.03,fill:0},{score:.02,fill:0},{score:.02,fill:0},{score:.03,fill:0}
]));
assert.strictEqual(undercalibrated.reliable,false);
console.log('PASS omr_reliability_013');
