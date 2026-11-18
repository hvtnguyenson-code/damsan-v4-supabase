const assert=require('assert'),fs=require('fs');
const C=require('../omr/omr-core.js'),T=require('../omr/omr-template-moet-18-4-6.js').template;
const G=require('../omr/omr-v7-geometry-060.js');
const P=require('../omr/omr-v7-pipeline-060.js');
const V7=require('../omr/omr-v7-candidate.js');
const w=1080,h=608,k=548/2254,sourceDpi=200/2.54,x0=350,y0=21;
const at=point=>[x0+point[0]*sourceDpi*k,y0+point[1]*sourceDpi*k];
function image({internal=true,duplicateId=false}={}){
 const gray=new Uint8Array(w*h).fill(235);
 function box(cx,cy,r,v){
  for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)
   for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++)
    gray[y*w+x]=v;
 }
 function dot(cx,cy,r,v){
  for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)
   for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++)
    if((x-cx)**2+(y-cy)**2<=r*r)gray[y*w+x]=v;
 }
 for(const mk of T.markers){
  if(!internal&&!['TL','TR','BR','BL'].includes(mk.name))continue;
  box(...at([mk.x,mk.y]),Math.max(2,mk.size*sourceDpi*k*.45),12);
 }
 if(internal){
  const sbd='00120601',code='0103';
  T.sbd.forEach((col,i)=>dot(...at(col[Number(sbd[i])]),3.3,35));
  T.maDe.forEach((col,i)=>dot(...at(col[Number(code[i])]),3.3,35));
  T.p1.forEach((row,i)=>dot(...at(row[i%4]),3.3,38));
  T.p2.forEach((row,i)=>dot(...at(row[i%2]),3.3,38));
  T.p3.forEach((q,i)=>{
   for(let j=0;j<3;j++){
    const point=q[j][T.p3Labels.indexOf(String((i+j)%10))];
    if(point)dot(...at(point),3.3,38);
   }
  });
  if(duplicateId)dot(...at(T.sbd[0][8]),3.3,35);
 }
 const rgba=new Uint8Array(w*h*4);
 for(let i=0;i<gray.length;i++){
  const n=i*4;rgba[n]=rgba[n+1]=rgba[n+2]=gray[i];rgba[n+3]=255;
 }
 return {data:rgba,width:w,height:h,gray};
}
const source=image(),legacy=C.detectCornerMarkers(source.gray,w,h);
assert(legacy.ok,'existing fiducials must be visible in full-res camera');
assert(!C.fastTemplateRegistration(T,legacy,w,h).ok,
 'Legacy 42% horizontal span is supposed to reject this upright 16:9 image');
const selected=G.register(source.gray,w,h,T,C);
assert(selected.ok,'landscape-safe geometry must accept correct form');
assert(selected.spanX<.42&&selected.internalMatches>=3);
assert.equal(G.register(image({internal:false}).gray,w,h,T,C).ok,false,
 'four arbitrary squares without interior controls are not a valid form');
const failures=[];let grayscale=0,warps=0,legacyReads=0;
const core={...C,
 grayscale(...args){grayscale++;return C.grayscale(...args);},
 warpTemplateGray(...args){warps++;return C.warpTemplateGray(...args);},
 analyzeImageData(){legacyReads++;throw Error('redundant V5 pass');}
};
const out=P.analyze(source,T,{core,V7,longSide:1300});
assert(out.ok,JSON.stringify(out.identity)+' / '+(out.candidate?.retakeReasons||[]).join(','));
assert.equal(out.identity.sbd,'00120601');
assert.equal(out.identity.maDe,'0103');
assert.equal(out.answers.p1,'ABCDABCDABCDABCDAB');
assert.deepStrictEqual(out.answers.p2,Array(4).fill('Đ-S-Đ-S'));
assert.deepStrictEqual(out.answers.p3,['012','123','234','345','456','567']);
assert.equal(out.geometryStatus,'ok');
assert.equal(out.registration.internalMatches,5);
assert.deepStrictEqual([grayscale,warps,legacyReads],[1,1,0],
 'new research path must gray+warp exactly once and skip legacy 3-part scoring');
assert(out.readOnly&&!out.validForSave,'never create a write-enabled candidate');
assert(out.ink?.diagnosticOnly&&out.ink.changesAnswers===false);
const dup=P.analyze(image({duplicateId:true}),T,{core:C,V7,longSide:1300});
assert(!dup.ok&&!dup.identity.valid,
 'a second filled SBD digit must block identity confidence');
assert(dup.identity.issues.some(x=>x.key.startsWith('SBD')),
 'SBD warnings must survive, not be overwritten by section candidate');
const changed=P.compareAnswers({sbd:'00120602',maDe:'0103',
 p1:'ABCDABCDABCDABCDAB',p2:Array(4).fill('Đ-S-Đ-S'),
 p3:['012','123','234','345','456','568']},out);
assert.equal(changed.count,2);assert.deepStrictEqual(changed.changes.map(x=>x.key),['SBD','P3.6']);
const src=fs.readFileSync('omr/omr-v7-pipeline-060.js','utf8');
const prod=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const html=fs.readFileSync('teacher/index.html','utf8');
assert(!prod.includes('omr-v7-pipeline-060')&&!html.includes('omr-v7-pipeline-060'));
assert(!src.includes('rpc_staff_submit_omr')&&!src.includes('omr-evidence'));
console.log('PASS OMR 060: upright landscape 16:9, independent anchors, one warp, identity, P1/P2/P3, read-only safety');
