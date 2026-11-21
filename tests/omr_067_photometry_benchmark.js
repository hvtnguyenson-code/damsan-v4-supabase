'use strict';
const assert=require('node:assert/strict');
const T=require('../omr/omr-template-moet-18-4-6').template;
const V7=require('../omr/omr-v7-candidate');
const Photo=require('../omr/omr-v7-photometry-067');
const B=require('../omr/omr-reliability-v7-baseline');
const Core=require('../omr/omr-core');
const P067=require('../omr/omr-v7-pipeline-067');
const P066=require('../omr/omr-v7-pipeline-066');
const W=1239,H=1800,rad=T.bubbleRadiusCm*((W-1)/T.widthCm+(H-1)/T.heightCm)/2;
function rng(s){return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function make(seed,mode){
 const random=rng(seed*93271+73239),gray=new Uint8Array(W*H),sx=(W-1)/T.widthCm,sy=(H-1)/T.heightCm;
 const at=p=>[p[0]*sx,p[1]*sy];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const shade=mode==='shadow'?45*Math.sin(x/W*5+y/H*4):18*x/W-14*y/H;
  gray[y*W+x]=Math.max(125,Math.min(255,Math.round(235+shade+(random()-.5)*(mode==='noisy'?24:6))));
 }
 const draw=(p,delta,shape='disk',shift=0)=>{if(!p)return;const [cx,cy]=at(p);
 for(let y=Math.floor(cy-rad*1.15);y<=Math.ceil(cy+rad*1.15);y++)for(let x=Math.floor(cx-rad*1.15);x<=Math.ceil(cx+rad*1.15);x++){
  const u=(x-cx)/rad,v=(y-cy)/rad,d=Math.hypot(u,v),d2=Math.hypot(u-shift,v);
  let covered=shape==='ring'?d>=.88&&d<=1.05:shape==='annulus'?d2>=.37&&d2<=.78:d2<=.80;
  if(covered)gray[y*W+x]=Math.round(gray[y*W+x]*(1-delta));
 }};
 for(const m of T.markers){const [cx,cy]=at([m.x,m.y]),r=m.size*(sx+sy)/4;for(let y=Math.max(0,Math.round(cy-r));y<Math.min(H,Math.round(cy+r));y++)for(let x=Math.max(0,Math.round(cx-r));x<Math.min(W,Math.round(cx+r));x++)gray[y*W+x]=20;}
 const fields={P1:T.p1,P2:T.p2,P3:T.p3.flat(),SBD:T.sbd,MADE:T.maDe},truth={};
 const p3values=['','-7','3,5','0','12',''];
 for(const [field,groups] of Object.entries(fields)){
  truth[field]=[];
  for(let i=0;i<groups.length;i++){
   const group=groups[i];group.forEach(p=>draw(p,.45,'ring'));
   let index=field==='P3'?T.p3Labels.indexOf(p3values[i>>2][i%4]??''):Math.floor(random()*group.length);
   if(field==='P3'&&mode==='sparse')index=i===0?T.p3Labels.indexOf('8'):-1;
   if((field==='P1'||field==='P2')&&i%11===8)index=-1;
   if(index<0||!group[index]){truth[field].push({state:'blank',index:-1});continue;}
   const strength=mode==='faint'?.32+random()*.12:.63+random()*.22;
   const affected=(field==='P1'||field==='P2'||field==='P3')&&i%5===0;
   draw(group[index],strength,mode==='hollow'&&affected?'annulus':'disk',mode==='offset'&&affected?.36:0);
   const second=group.findIndex((p,j)=>p&&j!==index);
   if(mode==='multiple'&&affected){draw(group[second],strength*.95);truth[field].push({state:'multiple',index:-1});}
   else if(mode==='erasures'&&affected){draw(group[second],.09);truth[field].push({state:'single',index});}
   else truth[field].push({state:'single',index});
  }
 }
 return {rect:{width:W,height:H,gray},truth};
}
function assess(o,t){if(o.state===t.state&&(t.state!=='single'||o.index===t.index))return 'correct';if(o.state==='review')return 'review';if(o.state==='blank'&&t.state==='single')return 'miss';return 'wrong';}
const totals={};
for(const mode of ['clean','shadow','noisy','faint','hollow','offset','sparse','multiple','erasures']){
 const stats={total:0,legacy:{correct:0,review:0,miss:0,wrong:0},independent:{correct:0,review:0,miss:0,wrong:0},fused:{correct:0,review:0,miss:0,wrong:0},identityVeto:0};
 for(let i=1;i<=12;i++){
  const {rect,truth}=make(i<=6?i+100:i+40001,mode),old=V7.analyzeRectified(rect,T,{experimentalRefinement:true}),out=Photo.apply(rect,T,old);
  const fieldRows=(c,k)=>k==='P1'?c.p1Evidence:k==='P2'?c.p2Evidence:c.p3Evidence.flatMap(q=>q.columns);
  assert.equal(old.geometry.status,'ok');
  for(const k of ['P1','P2','P3'])for(let j=0;j<truth[k].length;j++){
   const t=truth[k][j],a=fieldRows(old,k)[j],b=out.photo[k].rows[j],c=fieldRows(out.candidate,k)[j];
   stats.total++;stats.legacy[assess(a,t)]++;stats.independent[assess(b,t)]++;stats.fused[assess(c,t)]++;
   if(a.state==='multiple')assert.equal(c.state,'multiple');
   if(a.state==='single'&&c.state==='single')assert.equal(a.index,c.index);
  }
  stats.identityVeto+=out.identityVeto.length;
 }
 assert.equal(stats.fused.miss,0,mode+': a true mark must not turn blank');
 assert.equal(stats.fused.wrong,0,mode+': no incorrect resolved state');
 assert(stats.fused.correct>=stats.legacy.correct,mode+': no loss versus legacy');
 if(mode==='hollow')assert(stats.fused.correct>stats.legacy.correct,'must improve hollow fill recognition');
 totals[mode]=stats;
}
assert.equal(B.decodeP3Positions(['','-','7',''].map(token=>({state:token?'single':'blank',token}))).value,'?');
for(const tokens of [['-','7','',''],['3',',','5',''],['0','','',''],['','','','']])assert.equal(B.decodeP3Positions(tokens.map(token=>({state:token?'single':'blank',token}))).value,tokens.join(''));
// End-to-end research pipeline, same full-image input as 066.
const fixture=make(2073,'clean'),gray=fixture.rect.gray;
const data=new Uint8Array(gray.length*4);
for(let i=0;i<gray.length;i++){data[i*4]=data[i*4+1]=data[i*4+2]=gray[i];data[i*4+3]=255;}
const input={width:W,height:H,data};
const id=fixture.truth.SBD.map(x=>T.sbdLabels[x.index]).join('');
const code=fixture.truth.MADE.map(x=>T.maDeLabels[x.index]).join('');
const a=P066.analyze(input,T,{core:Core,V7,expectedStudentCode:id,expectedExamCode:code});
const b=P067.analyze(input,T,{core:Core,V7,expectedStudentCode:id,expectedExamCode:code});
assert(a.ok&&b.ok,'clean full-pipeline fixture');
assert.equal(b.identity.sbd,id);assert.equal(b.identity.maDe,code);
assert.deepEqual(b.answers,a.answers);assert.deepEqual(b.answers.p3,['','-7','3,5','0','12','']);
assert.equal(b.readOnly,true);assert.equal(b.validForSave,false);
assert.equal(P067.toResearchScan(b).recognitionEngine,'V7_067');
assert.throws(()=>P066.toResearchScan(b));
const mismatch=P067.analyze(input,T,{core:Core,V7,expectedStudentCode:'99999999',expectedExamCode:code});
assert.equal(mismatch.ok,false);assert.equal(mismatch.identity.valid,false);
console.log('PASS OMR067 full pipeline: same answers, identity binding veto, separate read-only engine');
console.log(JSON.stringify(totals,null,2));
