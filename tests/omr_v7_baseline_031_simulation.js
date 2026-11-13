const assert=require('assert'),fs=require('fs');
const V6=require('../omr/omr-reliability-v6.js');
const Clone=require('../omr/omr-reliability-v7-baseline.js');
const V7=require('../omr/omr-v7-candidate.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const source=fs.readFileSync('omr/omr-reliability-v6.js','utf8');
const copied=fs.readFileSync('omr/omr-reliability-v7-baseline.js','utf8');
assert.strictEqual(copied,source.replace(
 'else root.DamSanOmrReliabilityV6=api;',
 'else root.DamSanOmrReliabilityV7Baseline=api;'));
const cand=fs.readFileSync('omr/omr-v7-candidate.js','utf8');
assert(cand.includes("require('./omr-reliability-v7-baseline.js')"));
assert(!cand.includes('omr-v7-research.js'));
assert(!cand.includes("require('./omr-reliability-v6.js')"));
const w=640,h=Math.round(w*T.heightCm/T.widthCm),r=T.bubbleRadiusCm*(w-1)/T.widthCm;
function sheet(seed){
 const gray=new Uint8Array(w*h);gray.fill(219);
 function disk(p,val){
   if(!p)return;const x=p[0]*(w-1)/T.widthCm,y=p[1]*(h-1)/T.heightCm;
   const rad=r*.64;
   for(let yy=Math.max(0,Math.floor(y-rad));yy<=Math.min(h-1,Math.ceil(y+rad));yy++)
     for(let xx=Math.max(0,Math.floor(x-rad));xx<=Math.min(w-1,Math.ceil(x+rad));xx++)
       if((xx-x)**2+(yy-y)**2<=rad*rad)gray[yy*w+xx]=val;
 }
 T.p1.forEach((row,i)=>disk(row[(i+seed)%4],40+seed*7));
 T.p2.forEach((row,i)=>disk(row[(i+seed)%2],43+seed*6));
 const values=seed%2?['300','-12','12,3','3000','1,25','23']:['1','2','3','4','5','6'];
 values.forEach((word,i)=>[...word].forEach((ch,j)=>
   disk(T.p3[i][j][T.p3Labels.indexOf(ch)],42+seed*7)));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const factor=seed%3===0?.65+.3*x/w:seed%3===1?.83:1;
  gray[y*w+x]=Math.round(gray[y*w+x]*factor);
 }
 return {gray,width:w,height:h};
}
for(let seed=0;seed<9;seed++){
 const rect=sheet(seed),v6=V6.analyzeRectified(rect,T);
 const clone=Clone.analyzeRectified(rect,T);
 const v7=V7.analyzeValidatedRectified(rect,T,{inspectMarkerGeometry(){
   throw Error('V7 must not call the production V6 recognizer');
 }});
 assert.deepStrictEqual(clone,v6,'copied baseline mismatch seed='+seed);
 for(const key of ['p1','p2','p3','issues','invalidMarks','calibration',
   'p3Calibration','geometry','p1Evidence','p2Evidence','p3Evidence'])
   assert.deepStrictEqual(v7[key],v6[key],key+' mismatch seed='+seed);
 assert.strictEqual(V7.compare(v6,v7).count,0);
 assert.strictEqual(v7.enhancements.answerChanges,0);
}
const html=fs.readFileSync('teacher/index.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
const x=html.indexOf('omr-reliability-v6.js'),
 y=html.indexOf('omr-reliability-v7-baseline.js'),
 z=html.indexOf('omr-v7-candidate.js');
assert(x>=0&&y>x&&z>y,'V7 clone loaded after V6, before its candidate wrapper');
assert(sw.includes("'../omr/omr-reliability-v7-baseline.js'"));
const writer=fs.readFileSync('omr/omr-result-write.js','utf8');
assert(!cand.includes('staffRpc(')&&!cand.includes('rpc_staff_submit_omr'));
assert(writer.includes('rpc_staff_submit_omr'),'canonical RPC must remain');
console.log('PASS OMR 031: exact V6 source copy, nine cases, no new writer');
