'use strict';
const assert=require('node:assert/strict');
const T=require('../omr/omr-template-moet-18-4-6').template;
const V7=require('../omr/omr-v7-candidate');
const A=require('../omr/omr-v7-photometry-067');
const N=require('../omr/omr-v7-photometry-068');
const B=require('../omr/omr-reliability-v7-baseline');
const Core=require('../omr/omr-core');
const P068=require('../omr/omr-v7-pipeline-068');
const W=1239,H=1800,rad=T.bubbleRadiusCm*((W-1)/T.widthCm+(H-1)/T.heightCm)/2;
function rng(s){return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function make(seed,mode){
 const combined=mode==='mixed'||mode==='unequal'||mode==='residual';
 const random=rng(seed*93271+73239),gray=new Uint8Array(W*H),sx=(W-1)/T.widthCm,sy=(H-1)/T.heightCm;
 const at=p=>[p[0]*sx,p[1]*sy];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const shade=mode==='shadow'||combined?38*Math.sin(x/W*5+y/H*4)+12*Math.cos(x/W*11):18*x/W-14*y/H;
  gray[y*W+x]=Math.max(125,Math.min(255,Math.round(235+shade+(random()-.5)*(mode==='noisy'||combined?24:6))));
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
   const strength=mode==='faint'||(mode==='mixed'&&i%7===1)?.38+random()*.12:.68+random()*.14;
   const affected=(field==='P1'||field==='P2'||field==='P3')&&i%5===0;
   draw(group[index],strength,mode==='hollow'&&affected?'annulus':'disk',(mode==='offset'||mode==='mixed')&&affected?.30:0);
   const second=group.findIndex((p,j)=>p&&j!==index);
   if((mode==='unequal'||mode==='mixed')&&affected){draw(group[second],.28+random()*.055,'disk',.08);truth[field].push({state:'multiple',index:-1});}
   else if(mode==='residual'&&affected){draw(group[second],.15+random()*.055,'annulus');truth[field].push({state:'single',index});}
   else if(mode==='multiple'&&affected){draw(group[second],strength*.95);truth[field].push({state:'multiple',index:-1});}
   else if(mode==='erasures'&&affected){draw(group[second],.09);truth[field].push({state:'single',index});}
   else truth[field].push({state:'single',index});
  }
 }
 return {rect:{width:W,height:H,gray},truth};
}
function assess(o,t){if(o.state===t.state&&(t.state!=='single'||o.index===t.index))return 'correct';if(o.state==='review')return 'review';if(o.state==='blank'&&t.state==='single')return 'miss';return 'wrong';}

const totals={};let prevented=0,wrongNew=0,reviewNew=0,paired=0;
const fieldRows=(c,k)=>k==='P1'?c.p1Evidence:k==='P2'?c.p2Evidence:c.p3Evidence.flatMap(q=>q.columns);
function classifyOutcome(o,t){
 if(o.state===t.state&&(t.state!=='single'||o.index===t.index))return 'correct';
 if(o.state==='review')return 'review';
 return 'wrong';
}
for(const mode of ['clean','hollow','sparse','multiple','erasures','unequal','residual','mixed']){
 const stats={groups:0,old:{correct:0,review:0,wrong:0},next:{correct:0,review:0,wrong:0},guarded:0,audit:0};
 for(let i=1;i<=5;i++){
  const {rect,truth}=make(57001+i*377,mode);
  const baseline=V7.analyzeRectified(rect,T,{experimentalRefinement:true});
  assert.equal(baseline.geometry.status,'ok');
  assert.deepEqual(N.inspect(rect,T),A.inspect(rect,T),'fast sampler must preserve every metric');
  const a=A.apply(rect,T,baseline),b=N.apply(rect,T,baseline);
  stats.audit+=b.audit.length;
  assert.deepEqual(b.identityVeto,a.identityVeto);
  for(const k of ['P1','P2','P3'])for(let j=0;j<truth[k].length;j++){
   const t=truth[k][j],old=fieldRows(a.candidate,k)[j],next=fieldRows(b.candidate,k)[j];
   const before=classifyOutcome(old,t),after=classifyOutcome(next,t);
   stats.groups++;paired++;stats.old[before]++;stats.next[after]++;
   if(before==='wrong'&&after==='review'){stats.guarded++;prevented++;}
   if(before!=='wrong'&&after==='wrong')wrongNew++;
   if(before==='correct'&&after==='review')reviewNew++;
   if(old.state==='multiple')assert.equal(next.state,'multiple');
   if(old.state==='single'&&next.state==='single')assert.equal(next.index,old.index);
  }
 }
 totals[mode]=stats;
}
assert.equal(wrongNew,0,'no newly resolved wrong marks');
assert(prevented>0,'asymmetric competing marks must be intercepted');
for(const k of ['clean','hollow','sparse','multiple','erasures','residual']){
 assert(totals[k].next.wrong<=totals[k].old.wrong);
}
const sample=make(86711,'clean').rect;
const a=A.inspect(sample,T),b=N.inspect(sample,T);assert.deepEqual(a,b);
sample.gray.fill(231);assert.deepEqual(N.inspect(sample,T),A.inspect(sample,T),'cache must never retain pixels');
for(const [w,h] of [[1032,1500],[1551,2254]]){
 const gray=new Uint8Array(w*h);
 const random=rng(827311+w);
 for(let i=0;i<gray.length;i++)gray[i]=Math.round(153+random()*102);
 const rect={width:w,height:h,gray};
 assert.deepEqual(N.inspect(rect,T),A.inspect(rect,T));
}
const local=make(67101,'clean'),gray=local.rect.gray,data=new Uint8Array(gray.length*4);
for(let i=0;i<gray.length;i++){data[i*4]=data[i*4+1]=data[i*4+2]=gray[i];data[i*4+3]=255;}
const input={width:W,height:H,data};
const id=local.truth.SBD.map(t=>T.sbdLabels[t.index]).join(''),code=local.truth.MADE.map(t=>T.maDeLabels[t.index]).join('');
const result=P068.analyze(input,T,{core:Core,V7,expectedStudentCode:id,expectedExamCode:code});
assert(result.ok);assert.equal(result.readOnly,true);assert.equal(result.validForSave,false);
assert.deepEqual(result.answers.p3,['','-7','3,5','0','12','']);
assert.equal(P068.toResearchScan(result).recognitionEngine,'V7_068');
assert(!P068.analyze(input,T,{core:Core,V7,expectedStudentCode:'99999999',expectedExamCode:code}).ok);
console.log('PASS OMR 068 mixed optical stress and exact sample equivalence',JSON.stringify({paired,prevented,wrongNew,reviewNew,totals}));
