(function(root,factory){
 const B=typeof module==='object'&&module.exports?require('./omr-reliability-v7-baseline.js'):root.DamSanOmrReliabilityV7Baseline;
 const api=factory(B);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrV7Photometry067=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(B){
'use strict';
// Independent optical evidence, research only. No answer key, roster or writer.
const q=(a,p)=>B.quantile(a,p),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function measure(rect,T,point){
 if(!point)return null;
 const {gray:g,width:w,height:h}=rect;
 const sx=(w-1)/T.widthCm,sy=(h-1)/T.heightCm;
 const x=point[0]*sx,y=point[1]*sy,r=Math.max(3,T.bubbleRadiusCm*(sx+sy)/2);
 const bins=Array.from({length:8},()=>[]),samples=[];
 for(let yy=Math.max(0,Math.floor(y-1.65*r));yy<=Math.min(h-1,Math.ceil(y+1.65*r));yy++)
  for(let xx=Math.max(0,Math.floor(x-1.65*r));xx<=Math.min(w-1,Math.ceil(x+1.65*r));xx++){
   const dx=(xx-x)/r,dy=(yy-y)/r,d=Math.hypot(dx,dy),v=g[yy*w+xx];
   if(d>=1.20&&d<=1.65){const k=Math.round(Math.atan2(dy,dx)*4/Math.PI+8)%8;bins[k].push(v);}
   if(d<=.72)samples.push({dx,dy,d,v});
  }
 if(bins.some(b=>b.length<3)||samples.length<12)return {valid:false};
 const sector=bins.map(b=>q(b,.80)),paper=q(sector,.5);
 // Robust opposing-sector slopes, insensitive to one printed rule or dark neighbour.
 const px=[],py=[];
 for(let k=0;k<4;k++){
  const a=k*Math.PI/4,d=(sector[k]-sector[k+4])/2.85;
  if(Math.abs(Math.cos(a))>.6)px.push(d*Math.cos(a));
  if(Math.abs(Math.sin(a))>.6)py.push(d*Math.sin(a));
 }
 const dx=clamp(q(px,.5),-55,55),dy=clamp(q(py,.5),-55,55);
 const residual=sector.map((v,i)=>Math.abs(v-paper-1.425*(dx*Math.cos(i*Math.PI/4)+dy*Math.sin(i*Math.PI/4))));
 const noise=q(residual,.5)/Math.max(64,paper);
 const inner=[],outer=[],middle=[],quadrants=[[],[],[],[]],midQuads=[[],[],[],[]];
 for(const p of samples){
  const local=clamp(paper+dx*p.dx+dy*p.dy,64,255);
  const d=clamp((local-p.v)/local,0,1);
  (p.d<=.42?inner:outer).push(d);
  const k=(p.dx>=0?1:0)+(p.dy>=0?2:0);
  quadrants[k].push(d);
  if(p.d>=.40&&p.d<=.64){middle.push(d);midQuads[k].push(d);}
 }
 if(!inner.length||!outer.length||quadrants.some(a=>!a.length))return {valid:false};
 const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
 const coverage=(a,t)=>a.filter(v=>v>=t).length/a.length;
 const innerMean=mean(inner),outerMean=mean(outer),fill=coverage(outer,.12);
 const centerFill=coverage(inner,.12),deep=coverage(outer,.25);
 const midFill=middle.length?coverage(middle,.15):0;
 const midMin=midQuads.every(a=>a.length)?Math.min(...midQuads.map(a=>coverage(a,.15))):0;
 const support=quadrants.filter(a=>coverage(a,.12)>=.35).length;
 return {valid:true,score:.38*innerMean+.42*outerMean+.20*fill,
  innerMean,outerMean,fill,centerFill,deep,midFill,midMin,support,noise,paper};
}
function calibrate(groups){
 const lower=[],positive=[],depth=[];
 for(const group of groups){
  const a=group.filter(m=>m?.valid).sort((x,y)=>y.score-x.score);
  lower.push(...a.slice(Math.max(1,Math.ceil(a.length/2))).map(m=>m.score));
  if(a[0]?.fill>=.65&&a[0].support>=3&&a[0].outerMean>=.15&&a[0].noise<.13)
   {positive.push(a[0].score);depth.push(a[0].outerMean);}
 }
 const center=q(lower,.5),blank=q(lower,.65),scatter=q(lower.map(v=>Math.abs(v-center)),.65);
 const mark=positive.length?q(positive,.4):null;
 // Absolute floors stop an all-blank section or a faint erasure cluster
 // from being re-labelled as deliberately filled by unsupervised calibration.
 const weak=Math.max(.085,blank+Math.max(.035,3*scatter));
 const strong=Math.max(.17,weak+.055,mark==null?0:blank+.30*(mark-blank));
 return {blank,scatter,mark,depthReference:depth.length?q(depth,.5):null,weak,strong,negativeSamples:lower.length,positiveSamples:positive.length,
  reliable:lower.length>=8&&blank<.16&&strong<.65};
}
function classify(group,labels,cal){
 const ranked=group.map((m,i)=>m?{...m,i}:null).filter(Boolean).sort((a,b)=>(b.score??-1)-(a.score??-1));
 const out=(state,index=-1,reason='')=>({state,index,token:index<0?(state==='blank'?'':'?'):labels[index],reason,ranked});
 if(!cal.reliable||ranked.length<2||ranked.some(m=>!m.valid||m.noise>.18))return out('review',-1,'photometry_unreliable');
 const broad=m=>m.midMin>=.72&&m.midFill>=.85&&m.outerMean>=Math.max(.26,.65*(cal.depthReference??0))&&m.noise<.09;
 const clear=m=>m.score>=cal.strong&&m.fill>=.60&&m.support>=3&&m.outerMean>=Math.max(.14,.50*(cal.depthReference??0))&&(m.centerFill>=.50||broad(m));
 const plausible=m=>m.score>=cal.weak&&m.fill>=.23&&m.support>=2&&m.outerMean>=.060;
 const strong=ranked.filter(clear),weak=ranked.filter(plausible);
 if(strong.length>=2){
  const a=strong[0],b=strong[1];
  if(b.outerMean>=.65*a.outerMean&&b.innerMean>=.65*a.innerMean)
   return out('multiple',-1,'independent_two_marks');
  return out('review',-1,'unequal_ink_depth_possible_erasure');
 }
 if(strong.length===1&&weak.some(m=>m.i!==strong[0].i))return out('review',-1,'independent_second_trace');
 if(strong.length===1)return out('single',strong[0].i,'independent_spatial_consensus');
 if(weak.length||ranked.some(m=>m.score>=cal.weak&&m.centerFill>=.28))return out('review',-1,'independent_weak_trace');
 // A blank is positive evidence of low ink across the entire group.
 if(ranked.every(m=>m.score<cal.weak&&m.fill<.32&&m.centerFill<.40))return out('blank',-1,'independent_empty_group');
 return out('review',-1,'independent_uncertain');
}
function inspect(rect,T){
 const fields={P1:T.p1,P2:T.p2,P3:T.p3.flat(),SBD:T.sbd,MADE:T.maDe},result={};
 for(const [name,rows] of Object.entries(fields)){
  const labels={P1:T.p1Labels,P2:T.p2Labels,P3:T.p3Labels,SBD:T.sbdLabels,MADE:T.maDeLabels}[name];
  const metrics=rows.map(row=>row.map(p=>measure(rect,T,p))),cal=calibrate(metrics);
  result[name]={calibration:cal,rows:metrics.map(row=>classify(row,labels,cal))};
 }
 return result;
}
// Conservative dual-engine policy: never replace a resolved value with a
// different one; never rescue a confirmed multiple; identity is veto-only.
function fuse(base,photo){
 if(!base||base.geometry?.status!=='ok')return {candidate:base,changes:[],identityVeto:[]};
 const changes=[],identityVeto=[],issues=(base.issues||[]).slice(),invalid=new Set(base.invalidMarks||[]);
 const result={...base,p1Evidence:base.p1Evidence.map(x=>({...x})),p2Evidence:base.p2Evidence.map(x=>({...x})),p3Evidence:base.p3Evidence.map(q=>({...q,columns:q.columns.map(c=>({...c}))}))};
 function replaceIssue(key,state,reason){for(let i=issues.length-1;i>=0;i--)if(issues[i].key===key)issues.splice(i,1);if(state==='review'||state==='multiple')issues.push({key,state,reason});}
 function row(old,n,key,numeric){
  if(!n||old.state==='multiple'||invalid.has(key))return old;
  const token=numeric?'token':'value',prior=old[token]||'';
  let newState=null,newValue='?';
  if(old.state==='single'&&n.state==='multiple'){newState='multiple';}
  else if(old.state==='single'&&n.state==='single'&&n.token!==prior){newState='review';}
  else if(old.state==='single'&&n.reason==='unequal_ink_depth_possible_erasure'){newState='review';}
  else if(old.state==='blank'&&(n.state==='single'||n.state==='multiple')){newState='review';}
  // Rescue only an unresolved row whose independent clean winner is also
  // the legacy strongest position (passed in by caller); no silent flip.
  else if(old.state==='review'&&n.state==='single'&&n.legacyWinner===n.index&&
   !(old.secondRelative>=.32&&old.secondFill>=.22)&&
   !(old.relative>=.55&&old.secondFill>=.35)){newState='single';newValue=n.token;}
  else if(old.state==='review'&&n.state==='multiple'){newState='multiple';}
  else if(numeric&&old.state==='review'&&n.state==='blank'&&
   n.ranked.every(m=>m.score<.065&&m.centerFill<.25&&m.outerMean<.055))
   {newState='blank';newValue='';}
  if(!newState)return old;
  changes.push({key,from:old.state+':'+prior,to:newState+':'+newValue,reason:n.reason});
  replaceIssue(key,newState,n.reason);
  if(!numeric&&newState==='multiple')invalid.add(key);
  return {...old,state:newState,[token]:newValue,index:newState==='single'?n.index:-1,reason:newState==='single'||newState==='blank'?'':n.reason,refinement:'OMR067_dual_photometry'};
 }
 for(let i=0;i<18;i++)result.p1Evidence[i]=row(result.p1Evidence[i],photo.P1.rows[i],'P1.'+(i+1),false);
 for(let i=0;i<16;i++)result.p2Evidence[i]=row(result.p2Evidence[i],photo.P2.rows[i],'P2.'+(Math.floor(i/4)+1)+'abcd'[i%4],false);
 for(let i=0;i<6;i++){
  const question=result.p3Evidence[i];
  question.columns=question.columns.map((c,j)=>row(c,photo.P3.rows[i*4+j],'P3.'+(i+1)+'.'+(j+1),true));
  const decoded=B.decodeP3Positions(question.columns);
  const key='P3.'+(i+1);
  replaceIssue(key,decoded.reason&&!question.columns.some(c=>c.state==='review'||c.state==='multiple')?'review':'single',decoded.reason);
  Object.assign(question,{value:decoded.value,raw:question.columns.map(c=>c.token),uncertain:!!decoded.reason,reason:decoded.reason});
 }
 result.p1=result.p1Evidence.map(c=>c.value||'?').join('');
 result.p2=Array.from({length:4},(_,i)=>result.p2Evidence.slice(i*4,i*4+4).map(c=>c.value||'?').join('-'));
 result.p3=result.p3Evidence.map(c=>c.value);result.issues=issues;result.invalidMarks=[...invalid];result.requiresReview=issues.length>0;
 for(const name of ['SBD','MADE'])for(let i=0;i<photo[name].rows.length;i++){
  const n=photo[name].rows[i];if(n.state==='multiple')identityVeto.push({key:name+'.'+(i+1),reason:'OMR067: hai dấu tô rõ độc lập'});
 }
 return {candidate:result,changes,identityVeto};
}
function apply(rect,T,base){
 const photo=inspect(rect,T);
 // Separate legacy ranking, not a class chosen from the expected answer key.
 for(const [name,groups] of Object.entries({P1:T.p1,P2:T.p2,P3:T.p3.flat()}))groups.forEach((group,i)=>{
  const old=name==='P1'?base.p1Evidence[i]:name==='P2'?base.p2Evidence[i]:base.p3Evidence[i>>2].columns[i%4];
  if(old.state!=='review'||photo[name].rows[i].state!=='single')return;
  const rank=group.map((p,j)=>p?{j,score:B.measureBubble(rect,T,p).score}:null).filter(Boolean).sort((a,b)=>b.score-a.score);
  if(rank.length>1&&rank[0].score-rank[1].score>=.035)photo[name].rows[i].legacyWinner=rank[0].j;
 });
 return {...fuse(base,photo),photo};
}
return {measure,calibrate,classify,inspect,fuse,apply};
});
