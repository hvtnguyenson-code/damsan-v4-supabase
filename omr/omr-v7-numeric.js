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
function apply(rect,T,B,baseline){
 if(baseline?.geometry?.status!=='ok'||baseline.p3Calibration?.reliable!==true)
  return {scan:baseline,applied:[]};
 const qs=(baseline.p3Evidence||[]).map(q=>({...q,columns:q.columns.map(c=>({...c}))}));
 const applied=[],cleared=new Set(),multiple=new Set((baseline.issues||[])
  .filter(x=>x.state==='multiple').map(x=>x.key));
 for(let i=0;i<6;i++){
  const q=qs[i];if(!q||q.value!=='?')continue;
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
return {LEVELS,DIRECTIONS,eligible,candidate,tryRecover,apply};
});