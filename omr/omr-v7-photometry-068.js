(function(root,factory){
 const resolve=(n,g)=>typeof module==='object'&&module.exports?require('./'+n+'.js'):root[g];
 const api=factory(resolve('omr-reliability-v7-baseline','DamSanOmrReliabilityV7Baseline'),
  resolve('omr-v7-photometry-067','DamSanOmrV7Photometry067'));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrV7Photometry068=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(B,Prev){
 'use strict';
 // Isolated research. Cache only immutable sampling geometry, NEVER pixel data.
 const q=B.quantile,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const cache=new WeakMap(),MAX_SHAPES=2;
 function compile(rect,T,point,offsetX=0,offsetY=0){
  if(!point)return null;
  const w=rect.width,h=rect.height,sx=(w-1)/T.widthCm,sy=(h-1)/T.heightCm;
  const r=Math.max(3,T.bubbleRadiusCm*(sx+sy)/2),x=point[0]*sx+offsetX*r,y=point[1]*sy+offsetY*r;
  const bins=Array.from({length:8},()=>[]),ip=[],xp=[],yp=[],parts=[];
  for(let yy=Math.max(0,Math.floor(y-1.65*r));yy<=Math.min(h-1,Math.ceil(y+1.65*r));yy++)
   for(let xx=Math.max(0,Math.floor(x-1.65*r));xx<=Math.min(w-1,Math.ceil(x+1.65*r));xx++){
    const dx=(xx-x)/r,dy=(yy-y)/r,d=Math.hypot(dx,dy);
    if(d>=1.20&&d<=1.65)bins[Math.round(Math.atan2(dy,dx)*4/Math.PI+8)%8].push(yy*w+xx);
    if(d<=.72){
     ip.push(yy*w+xx);xp.push(dx);yp.push(dy);
     parts.push((d<=.42?1:0)|(d>=.40&&d<=.64?2:0)|(((dx>=0?1:0)+(dy>=0?2:0))<<2));
    }
   }
  if(bins.some(b=>b.length<3)||ip.length<12)return {valid:false};
  return {valid:true,bins:bins.map(b=>Int32Array.from(b)),ip:Int32Array.from(ip),
   xp:Float64Array.from(xp),yp:Float64Array.from(yp),parts:Uint8Array.from(parts)};
 }
 function plan(rect,T){
  let shapes=cache.get(T);
  if(!shapes){shapes=new Map();cache.set(T,shapes);}
  const fields={P1:T.p1,P2:T.p2,P3:T.p3.flat(),SBD:T.sbd,MADE:T.maDe};
  const id=JSON.stringify([rect.width,rect.height,T.widthCm,T.heightCm,T.bubbleRadiusCm,fields]);
  if(shapes.has(id))return shapes.get(id);
  if(shapes.size>=MAX_SHAPES)shapes.delete(shapes.keys().next().value);
  const result={};
  for(const [k,rows] of Object.entries(fields))result[k]=rows.map(row=>row.map(p=>compile(rect,T,p)));
  shapes.set(id,result);return result;
 }
 function plane(g,p){
  const sector=p.bins.map(bin=>q(Array.from(bin,i=>g[i]),.80)),paper=q(sector,.5);
  const px=[],py=[];
  for(let k=0;k<4;k++){
   const a=k*Math.PI/4,d=(sector[k]-sector[k+4])/2.85;
   if(Math.abs(Math.cos(a))>.6)px.push(d*Math.cos(a));
   if(Math.abs(Math.sin(a))>.6)py.push(d*Math.sin(a));
  }
  const dx=clamp(q(px,.5),-55,55),dy=clamp(q(py,.5),-55,55);
  const residual=sector.map((v,i)=>Math.abs(v-paper-1.425*(dx*Math.cos(i*Math.PI/4)+dy*Math.sin(i*Math.PI/4))));
  const noise=q(residual,.5)/Math.max(64,paper);
  return {paper,dx,dy,noise};
 }
 function measurePlan(g,p){
  if(!p)return null;
  if(!p.valid)return {valid:false};
  const {paper,dx,dy,noise}=plane(g,p);
  let inN=0,outN=0,inSum=0,outSum=0,inDark=0,outDark=0,outDeep=0,midN=0,midDark=0;
  const quadrantN=[0,0,0,0],quadrantDark=[0,0,0,0],midQN=[0,0,0,0],midQD=[0,0,0,0];
  for(let i=0;i<p.ip.length;i++){
   const local=clamp(paper+dx*p.xp[i]+dy*p.yp[i],64,255),d=clamp((local-g[p.ip[i]])/local,0,1);
   const flag=p.parts[i],k=flag>>2;
   if(flag&1){inN++;inSum+=d;if(d>=.12)inDark++;}
   else{outN++;outSum+=d;if(d>=.12)outDark++;if(d>=.25)outDeep++;}
   quadrantN[k]++;if(d>=.12)quadrantDark[k]++;
   if(flag&2){midN++;midQN[k]++;if(d>=.15){midDark++;midQD[k]++;}}
  }
  if(!inN||!outN||quadrantN.some(n=>!n))return {valid:false};
  const innerMean=inSum/inN,outerMean=outSum/outN,fill=outDark/outN;
  return {valid:true,score:.38*innerMean+.42*outerMean+.20*fill,
   innerMean,outerMean,fill,centerFill:inDark/inN,deep:outDeep/outN,
   midFill:midN?midDark/midN:0,midMin:midQN.every(Boolean)?Math.min(...midQN.map((n,i)=>midQD[i]/n)):0,
   support:quadrantN.filter((n,i)=>quadrantDark[i]/n>=.35).length,noise,paper};
 }
 function inspect(rect,T){
  const prepared=plan(rect,T),result={};
  for(const [name,rows] of Object.entries(prepared)){
   const labels={P1:T.p1Labels,P2:T.p2Labels,P3:T.p3Labels,SBD:T.sbdLabels,MADE:T.maDeLabels}[name];
   const metrics=rows.map(row=>row.map(p=>measurePlan(rect.gray,p)));
   const calibration=Prev.calibrate(metrics);
   result[name]={calibration,rows:metrics.map(row=>Prev.classify(row,labels,calibration))};
  }
  return result;
 }
 const shifts=[[.14,0],[-.14,0],[0,.14],[0,-.14]];
 function spatialConsensus(rect,T,group,labels,cal){
  return shifts.map(([x,y])=>Prev.classify(group.map(p=>measurePlan(rect.gray,compile(rect,T,p,x,y))),labels,cal));
 }
 // Inspect residual topology at multiple contrast levels. A faint/dispersed
 // residual cannot prove erasure; diagnostics never discard a mark.
 function topology(rect,T,point){
  if(!point)return null;
  const p=compile(rect,T,point);
  if(!p?.valid)return null;
  const v=plane(rect.gray,p);
  const map=new Map(),inside=new Set(p.ip);
  const w=rect.width;
  for(let i=0;i<p.ip.length;i++){
   const local=clamp(v.paper+v.dx*p.xp[i]+v.dy*p.yp[i],64,255);
   const d=clamp((local-rect.gray[p.ip[i]])/local,0,1);
   map.set(p.ip[i],d);
  }
  function component(t){
   let count=0,largest=0;const visited=new Set();
   for(const [i,d] of map){
    if(d<t)continue;count++;
    if(visited.has(i))continue;
    const stack=[i];visited.add(i);let size=0;
    while(stack.length){
     const j=stack.pop();size++;
     for(const k of [j-w,j+w,j%w>0?j-1:-1,j%w<w-1?j+1:-1]){
      if(inside.has(k)&&!visited.has(k)&&map.get(k)>=t){visited.add(k);stack.push(k);}
     }
    }
    largest=Math.max(largest,size);
   }
   return {coverage:count/p.ip.length,largest:largest/p.ip.length,coherence:count?largest/count:0};
  }
  return {low:component(.12),high:component(.24),noise:v.noise};
 }
 function apply(rect,T,base){
  const photo=inspect(rect,T),audit=[];
  if(!base||base.geometry?.status!=='ok')return {...Prev.fuse(base,photo),photo,audit};
  const fields={P1:T.p1,P2:T.p2,P3:T.p3.flat()};
  const labels={P1:T.p1Labels,P2:T.p2Labels,P3:T.p3Labels};
  for(const [name,groups] of Object.entries(fields))groups.forEach((group,i)=>{
   const old=name==='P1'?base.p1Evidence[i]:name==='P2'?base.p2Evidence[i]:base.p3Evidence[i>>2].columns[i%4];
   const field=photo[name],n=field.rows[i];
   if(!old||!n||old.state==='multiple')return;
   const key=name==='P1'?'P1.'+(i+1):name==='P2'?'P2.'+(Math.floor(i/4)+1)+'abcd'[i%4]:'P3.'+((i>>2)+1)+'.'+(i%4+1);
   // Promotion from review demands the same strongest optical result under
   // small position perturbations, not a single lucky measurement window.
   if(old.state==='review'&&n.state==='single'){
    const rank=group.map((p,j)=>p?{j,score:B.measureBubble(rect,T,p).score}:null).filter(Boolean).sort((a,b)=>b.score-a.score);
    if(rank.length>1&&rank[0].score-rank[1].score>=.035&&rank[0].j===n.index){
     const probes=spatialConsensus(rect,T,group,labels[name],field.calibration);
     const agree=probes.filter(p=>p.state==='single'&&p.index===n.index).length;
     const conflict=probes.some(p=>p.state==='multiple'||(p.state==='single'&&p.index!==n.index));
     if(agree>=3&&!conflict)n.legacyWinner=n.index;
     else audit.push({key,kind:'unstable_review_recovery',agree,conflict});
    }
   }
   // Strong coherent second ink can be hidden by asymmetric shading or
   // different pressure. Do not convert a potential erasure to "blank".
   if(n.reason==='independent_second_trace'||n.reason==='unequal_ink_depth_possible_erasure'){
    const first=n.ranked[0],second=n.ranked[1];
    if(!first||!second||!first.valid||!second.valid) return;
    const shape=topology(rect,T,group[second.i]);
    if(!shape)return;
    const coherent=shape.high.largest>=.22&&shape.high.coherence>=.72&&second.centerFill>=.40&&second.outerMean>=.16&&shape.noise<.10;
    const probes=coherent?spatialConsensus(rect,T,group,labels[name],field.calibration):[];
    const survives=probes.filter(p=>p.ranked.find(m=>m.i===second.i)?.outerMean>=.14&&p.ranked.find(m=>m.i===second.i)?.centerFill>=.30).length;
    audit.push({key,kind:coherent&&survives>=3?'coherent_competing_ink':'ambiguous_residual',shape,stable:survives});
    // Veto only. No claim that a coherent secondary mark was intentional.
    if(old.state==='single'&&n.reason==='independent_second_trace'&&coherent&&survives>=3)
     n.reason='unequal_ink_depth_possible_erasure';
   }
  });
  const fused=Prev.fuse(base,photo);
  return {...fused,photo,audit};
 }
 return {compile,measurePlan,inspect,topology,spatialConsensus,apply};
});
