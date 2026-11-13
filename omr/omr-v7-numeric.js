(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DamSanOmrV7Numeric=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const LEVELS=[.2,.4,.6],DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]];
function eligible(c){return c?.state==='review'
 &&c.reason==='Không đủ bằng chứng phân biệt nét tô và vết tẩy'
 &&Number.isFinite(c.top)&&Number.isFinite(c.second)
 &&c.top-c.second>=.075&&c.second/Math.max(.01,c.top)<.32
 &&c.secondFill<.22&&c.topFill>=.30;}
function candidate(rect,T,B,points,cal,dx,dy){
 const p=points.map(q=>q?[q[0]+dx*T.bubbleRadiusCm,q[1]+dy*T.bubbleRadiusCm]:null);
 const m=p.map(q=>q?B.measureBubble(rect,T,q):null);
 return B.classifyP3Column(m,T.p3Labels,cal);
}
function trustworthy(c){return c.state==='single'&&c.topFill>=.62&&
 c.margin>=.105&&c.secondFill<.18&&c.relative<.25;}
function tryRecover(rect,T,B,points,cal,original){
 if(!eligible(original)||!cal?.reliable)return null;
 const winners=[];
 for(const [dx,dy] of DIRECTIONS){
  const scans=LEVELS.map(t=>candidate(rect,T,B,points,cal,t*dx,t*dy));
  if(scans.every(s=>trustworthy(s)&&s.token===scans[0].token))
   winners.push(scans[0].token);
 }
 if(!winners.length||!winners.every(x=>x===winners[0]))return null;
 return {state:'single',token:winners[0],reason:'',
  refinement:'stable_numeric_recenter',votes:winners.length};
}
// Experimental whole-question blank rescue. The V6 engine and its P3
// calibration remain untouched. This is NOT a general blank threshold.
// One REVIEW in an otherwise proven-empty four-position number can result
// from grey print or a crease; all four positional distributions must agree.
// Ambiguous graphite, erasures and marks on multiple positions fail closed.
function tryRecoverUniformBlank(q,columns,cal){
 if(q?.value!=='?'||!Array.isArray(q.columns)||q.columns.length!==4
   ||!Array.isArray(columns)||columns.length!==4
   ||cal?.reliable!==true
   ||!Number.isFinite(cal.markReference)
   ||!Number.isFinite(cal.background)
   ||cal.markReference-cal.background<.12)
   return null;
 const reviewAt=[];
 for(let i=0;i<4;i++){
   const c=q.columns[i];
   if(c?.state==='review'){
     if(c.reason!=='Không đủ bằng chứng phân biệt nét tô và vết tẩy')
       return null;
     reviewAt.push(i);
   }else if(c?.state!=='blank')return null;
 }
 // Never turn an entire faint four-digit answer into an empty response.
 if(reviewAt.length!==1)return null;
 const span=cal.markReference-cal.background;
 const scoreCeiling=Math.min(cal.background+.22*span,
   .35*cal.markReference);
 const peak=[],separations=[];
 for(const column of columns){
   if(!Array.isArray(column))return null;
   const ordered=column.filter(Boolean)
     .slice().sort((a,b)=>b.score-a.score);
   if(ordered.length<2)return null;
   const top=ordered[0],second=ordered[1];
   if(!Number.isFinite(top.score)||!Number.isFinite(second.score)
     ||!Number.isFinite(top.fill)||top.fill>=.52
     ||top.score>scoreCeiling
     ||top.score-second.score>.038)
     return null;
   peak.push(top.score);
   separations.push(top.score-second.score);
 }
 // An isolated faint pencil stroke is darker than the surrounding three
 // unmarked columns, even if all four are below the V6 mark threshold.
 const reference=peak.filter((_,i)=>i!==reviewAt[0]).sort((a,b)=>a-b)[1];
 if(peak[reviewAt[0]]>reference*1.30+.012
   ||Math.max(...peak)-Math.min(...peak)>.065)
   return null;
 return {reviewIndex:reviewAt[0],
   scoreMax:Math.max(...peak),scoreSpread:Math.max(...peak)-Math.min(...peak),
   markerMargin:separations[reviewAt[0]],scoreCeiling,
   method:'uniform_whole_question_blank_consensus'};
}
function apply(rect,T,B,baseline){
 if(baseline?.geometry?.status!=='ok'||baseline.p3Calibration?.reliable!==true)
  return {scan:baseline,applied:[]};
 const qs=(baseline.p3Evidence||[]).map(q=>({...q,columns:q.columns.map(c=>({...c}))}));
 const applied=[],cleared=new Set(),multiple=new Set((baseline.issues||[])
  .filter(x=>x.state==='multiple').map(x=>x.key));
 // Numeric measurements are recomputed only when the experimental mode
 // encounters one review inside an otherwise blank numeric question.
 let allColumns=null;
 for(let i=0;i<6;i++){
  const q=qs[i];if(!q||q.value!=='?')continue;
  const oneReview=q.columns.filter(c=>c.state==='review').length===1
    &&q.columns.every(c=>c.state==='blank'||c.state==='review');
  if(oneReview){
   if(!allColumns)allColumns=B.measureP3Columns(rect,T);
   const blank=tryRecoverUniformBlank(q,allColumns[i],baseline.p3Calibration);
   if(blank){
    const key='P3.'+(i+1);
    cleared.add(key);cleared.add(key+'.'+(blank.reviewIndex+1));
    const old=q.columns[blank.reviewIndex];
    q.columns[blank.reviewIndex]={...old,state:'blank',token:'',
      index:-1,reason:'',refinement:blank.method};
    q.value='';q.uncertain=false;q.reason='';
    applied.push({key,from:'?',to:'',method:blank.method,
      scoreMax:blank.scoreMax,scoreSpread:blank.scoreSpread});
    continue;
   }
  }
  for(let j=0;j<4;j++){
   const old=q.columns[j],key='P3.'+(i+1)+'.'+(j+1);
   if(multiple.has(key))continue;
   const newer=tryRecover(rect,T,B,T.p3[i][j],baseline.p3Calibration,old);
   if(!newer)continue;
   q.columns[j]={...old,...newer};cleared.add(key);
   applied.push({key,from:'?',to:newer.token,method:newer.refinement});
  }
  const ans=B.decodeP3Positions(q.columns);
  q.value=ans.value;q.uncertain=!!ans.reason;q.reason=ans.reason;
 }
 if(!applied.length)return {scan:baseline,applied};
 const remaining=(baseline.issues||[]).filter(x=>!cleared.has(x.key));
 for(let i=0;i<6;i++)if(qs[i]?.reason&&!remaining.some(x=>x.key==='P3.'+(i+1)))
  remaining.push({key:'P3.'+(i+1),state:'review',reason:qs[i].reason,question:i+1});
 return {scan:{...baseline,p3:qs.map(q=>q.value),
  p3Evidence:qs,issues:remaining},applied};
}
return {LEVELS,DIRECTIONS,eligible,candidate,tryRecover,
 tryRecoverUniformBlank,apply};
});