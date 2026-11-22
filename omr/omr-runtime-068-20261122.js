(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrV7Geometry060=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// ISOLATED EXPERIMENT. No production PWA import; never writes answers or scores.
const CONTROLS=new Set(['TOP-C','MID-L','MID-C','MID-R','P3-B3']);
const side=c=>Math.max(c.width,c.height);
function polygon(c){
 const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);
 const z=c.map((p,i)=>cross(p,c[(i+1)%4],c[(i+2)%4]));
 if(z.some(x=>Math.abs(x)<1)||z.some(x=>Math.sign(x)!==Math.sign(z[0])))return 0;
 return Math.abs(c.reduce((a,p,i)=>a+p[0]*c[(i+1)%4][1]-c[(i+1)%4][0]*p[1],0))/2;
}
function pickCorners(candidates){
 if(candidates.length<4)return null;
 const pick=(f,up)=>candidates.reduce((a,c)=>{
  const v=f(c);return !a||(up?v>a.v:v<a.v)?{c,v}:a;
 },null).c;
 const group=[pick(c=>c.cx+c.cy,false),pick(c=>c.cx-c.cy,true),
  pick(c=>c.cx+c.cy,true),pick(c=>c.cx-c.cy,false)];
 if(new Set(group).size!==4)return null;
 return {points:group.map(c=>[c.cx,c.cy]),boxes:group};
}
function corroborate(T,H,candidates,used,Core,w,h){
 const names=[],errors=[],usedIds=new Set(used);
 for(const marker of T.markers.filter(m=>CONTROLS.has(m.name))){
  const at=Core.project(H,marker.x,marker.y);
  if(!at.every(Number.isFinite)||at[0]<0||at[0]>=w||at[1]<0||at[1]>=h)continue;
  const sideExpected=Math.max(1,Math.hypot(...(()=>{
   const a=Core.project(H,marker.x-marker.size/2,marker.y);
   const b=Core.project(H,marker.x+marker.size/2,marker.y);
   return [b[0]-a[0],b[1]-a[1]];
  })()));
  const tol=Math.max(4.5,Math.min(w,h)*.014);
  let best=null;
  for(let i=0;i<candidates.length;i++){
   if(usedIds.has(i))continue;
   const x=candidates[i],d=Math.hypot(x.cx-at[0],x.cy-at[1]);
   if(d>tol||side(x)<sideExpected*.57||side(x)>sideExpected*1.85)continue;
   if(!best||d<best.d)best={i,d};
  }
  if(best){usedIds.add(best.i);names.push(marker.name);errors.push(best.d);}
 }
 const rmse=errors.length?Math.sqrt(errors.reduce((x,y)=>x+y*y,0)/errors.length):Infinity;
 return {names,rmse};
}
function register(gray,w,h,T,Core){
 if(!gray||gray.length!==w*h||w<80||h<80||!T?.markers||!Core?.adaptiveBinary)
  return {ok:false,reason:'bad_geometry_input'};
 const min=Math.min(w,h);
 const binary=Core.adaptiveBinary(gray,w,h,Math.round(min/35));
 // On a 720x405 landscape preview the 42px/200dpi fiducial is ~6px.
 // The legacy 8px minimum and 42%-frame width requirement reject valid forms.
 const candidates=Core.connectedComponents(binary,w,h).filter(c=>{
  const s=side(c),ar=c.width/c.height,fill=c.count/(c.width*c.height);
  return s>=Math.max(5,min*.008)&&s<=min*.095&&ar>=.70&&ar<=1.43&&fill>=.52;
 });
 if(candidates.length<4)return {ok:false,reason:'four_fiducials_missing',candidateCount:candidates.length};
 const largest=Math.max(...candidates.map(side)),tried=new Set();
 let best=null;
 for(const fraction of [.75,.60,.47,.35]){
  const pool=candidates.filter(c=>side(c)>=largest*fraction);
  if(pool.length<4||pool.length>180)continue;
  const chosen=pickCorners(pool);if(!chosen)continue;
  const key=chosen.boxes.map(c=>c.minX+':'+c.minY).join('|');
  if(tried.has(key))continue;tried.add(key);
  const corners=chosen.points,area=polygon(corners)/(w*h);
  const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
  const spanX=(Math.max(...xs)-Math.min(...xs))/w;
  const spanY=(Math.max(...ys)-Math.min(...ys))/h;
  if(area<.10||spanX<.17||spanY<.34)continue;
  let H;
  try{H=Core.estimateTemplateHomography(T,corners);}
  catch(_){continue;}
  if(!H.every(Number.isFinite))continue;
  const ids=chosen.boxes.map(c=>candidates.indexOf(c));
  const control=corroborate(T,H,candidates,ids,Core,w,h);
  const score=control.names.length*100+area*25-
   (Number.isFinite(control.rmse)?control.rmse:100);
  const candidate={ok:control.names.length>=2&&control.rmse<=Math.max(4.5,min*.014),
   H,corners,spanX,spanY,area,internalMatches:control.names.length,
   internalNames:control.names,rmse:control.rmse,candidateCount:candidates.length,
   reason:'internal_controls_unverified',score};
  if(!best||candidate.score>best.score)best=candidate;
 }
 if(!best)return {ok:false,reason:'invalid_template_quad',candidateCount:candidates.length};
 if(!best.ok)return {...best,reason:'internal_controls_unverified'};
 return {...best,reason:null,diagnosticOnly:true};
}
return {register,polygon,CONTROLS};
});
;
(function(root,factory){
 const Legacy=typeof module==='object'&&module.exports
  ?require('./omr-v7-geometry-060.js'):root.DamSanOmrV7Geometry060;
 const api=factory(Legacy);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrV7Geometry066=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Legacy){
'use strict';
// Research-only fallback when the 060 four-extrema detector cannot validate
// its markers. Inspired by open OMR work on geometric marker hypotheses
// (BayarovEmil/omr-system, JayeshGChandan/SheetScanner). Independent code;
// no third-party source copied. Never modifies the official V7 pipeline.
const WITNESSES=new Set(['TOP-C','MID-L','MID-C','MID-R','P3-B3']);
const minSide=c=>Math.min(c.width,c.height);
const maxSide=c=>Math.max(c.width,c.height);
const finite=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
function area(points){
 if(!Array.isArray(points)||points.length!==4||!points.every(finite))return 0;
 let sign=0;
 for(let i=0;i<4;i++){
  const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
  const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
  if(Math.abs(cross)<1)return 0;
  if(!sign)sign=Math.sign(cross);
  else if(Math.sign(cross)!==sign)return 0;
 }
 return Math.abs(points.reduce((s,a,i)=>{
  const b=points[(i+1)%4];return s+a[0]*b[1]-b[0]*a[1];
 },0))/2;
}
function candidatesFor(gray,w,h,Core){
 const min=Math.min(w,h);
 const binary=Core.adaptiveBinary(gray,w,h,Math.round(min/35));
 return Core.connectedComponents(binary,w,h).filter(c=>{
  const side=maxSide(c),aspect=c.width/c.height;
  const fill=c.count/Math.max(1,c.width*c.height);
  return side>=Math.max(5,min*.008)&&side<=min*.095
   &&aspect>=.70&&aspect<=1.43&&fill>=.52;
 });
}
function witnessFit(T,H,candidates,used,Core,w,h){
 const names=[],errors=[],seen=new Set(used);
 const min=Math.min(w,h),tol=Math.max(4.5,min*.014);
 for(const marker of T.markers.filter(x=>WITNESSES.has(x.name))){
  const expected=Core.project(H,marker.x,marker.y);
  if(!finite(expected)||expected[0]<0||expected[0]>=w||
    expected[1]<0||expected[1]>=h)continue;
  const a=Core.project(H,marker.x-marker.size/2,marker.y);
  const b=Core.project(H,marker.x+marker.size/2,marker.y);
  if(!finite(a)||!finite(b))continue;
  const diameter=Math.hypot(b[0]-a[0],b[1]-a[1]);
  let nearest=null;
  for(let i=0;i<candidates.length;i++){
   if(seen.has(i))continue;
   const c=candidates[i];
   const side=maxSide(c);
   if(side<Math.max(3,diameter*.50)||side>diameter*2.0)continue;
   const d=Math.hypot(c.cx-expected[0],c.cy-expected[1]);
   if(d<=tol&&(!nearest||d<nearest.d))nearest={i,d};
  }
  if(nearest){
   seen.add(nearest.i);
   names.push(marker.name);errors.push(nearest.d);
  }
 }
 return {names,
  rmse:errors.length?
   Math.sqrt(errors.reduce((acc,e)=>acc+e*e,0)/errors.length):Infinity};
}
function bestHypothesis(candidates,T,Core,w,h){
 const min=Math.min(w,h),largest=Math.max(...candidates.map(maxSide));
 let best=null,tested=0;
 for(const fraction of [.80,.62,.45,.32]){
  const pool=candidates.filter(c=>maxSide(c)>=largest*fraction);
  if(pool.length<4)continue;
  const sortBy=(fn,ascending)=>pool.map((c,i)=>({c,i,v:fn(c)}))
   .sort((a,b)=>ascending?a.v-b.v:b.v-a.v)
   .slice(0,6);
  // Shortlist multiple possible corners rather than using the single
  // darkest/extreme group; check the independent interior fiducials.
  const quadrants=[
   sortBy(c=>c.cx+c.cy,true),
   sortBy(c=>c.cx-c.cy,false),
   sortBy(c=>c.cx+c.cy,false),
   sortBy(c=>c.cx-c.cy,true)
  ];
  const checked=new Set();
  for(const TL of quadrants[0])for(const TR of quadrants[1])
   for(const BR of quadrants[2])for(const BL of quadrants[3]){
    const group=[TL,TR,BR,BL];
    const key=group.map(x=>candidates.indexOf(x.c)).join(':');
    if(checked.has(key))continue;checked.add(key);
    const indices=group.map(x=>candidates.indexOf(x.c));
    if(new Set(indices).size!==4)continue;
    const sizes=group.map(x=>maxSide(x.c));
    if(Math.max(...sizes)>Math.min(...sizes)*2.15)continue;
    const corners=group.map(x=>[x.c.cx,x.c.cy]);
    const areaRatio=area(corners)/(w*h);
    if(areaRatio<.10)continue;
    const xs=corners.map(x=>x[0]),ys=corners.map(x=>x[1]);
    const spanX=(Math.max(...xs)-Math.min(...xs))/w;
    const spanY=(Math.max(...ys)-Math.min(...ys))/h;
    if(spanX<.17||spanY<.34)continue;
    // Prevent upside-down or geometrically folded maps before a solver.
    let H;try{H=Core.estimateTemplateHomography(T,corners);}catch(_){continue;}
    if(!Array.isArray(H)||!H.every(Number.isFinite))continue;
    tested++;
    const fit=witnessFit(T,H,candidates,indices,Core,w,h);
    // At least three independent interior controls: a hard veto, not just
    // a favourable score that could accidentally accept a false rectangle.
    if(fit.names.length<3||fit.rmse>Math.max(4.5,min*.014))continue;
    const sizeRatio=Math.max(...sizes)/Math.min(...sizes);
    const score=fit.names.length*100+areaRatio*20-
      fit.rmse*2-(sizeRatio-1)*10;
    const trial={ok:true,H,corners,spanX,spanY,area:areaRatio,
      internalMatches:fit.names.length,internalNames:fit.names,
      rmse:fit.rmse,candidateCount:candidates.length,testedHypotheses:tested,
      score,reason:null,diagnosticOnly:true,
      geometryMethod:'omr066_multi_hypothesis_internal_controls'};
    if(!best||trial.score>best.score)best=trial;
    // All five interior controls with nearly perfect alignment is
    // sufficient; stop before exploring large ambiguous pools.
    if(best.internalMatches===5&&best.rmse<1.0)return best;
   }
 }
 return best&&{...best,testedHypotheses:tested};
}
function register(gray,w,h,T,Core){
 if(!gray||gray.length!==w*h||w<80||h<80||!T?.markers||
  !Core?.adaptiveBinary||!Core?.connectedComponents||
  !Core?.estimateTemplateHomography||!Core?.project)
  return {ok:false,reason:'bad_geometry_input'};
 const baseline=Legacy.register(gray,w,h,T,Core);
 // Preserve proven 060 behaviour whenever it has verified its own
 // internal controls. 066 only adds recovery of previously rejected scans.
 if(baseline.ok)return {...baseline,geometryMethod:'omr060_verified',
  experimental066:true,fallbackUsed:false};
 const candidates=candidatesFor(gray,w,h,Core);
 if(candidates.length<7)return {...baseline,experimental066:true,
  fallbackUsed:false,fallbackReason:'insufficient_control_candidates'};
 const improved=bestHypothesis(candidates,T,Core,w,h);
 if(!improved)return {...baseline,experimental066:true,
  fallbackUsed:false,fallbackReason:'no_internally_verified_hypothesis'};
 return {...improved,experimental066:true,fallbackUsed:true,
  legacyRejectedReason:baseline.reason};
}
return {register,area,candidatesFor,bestHypothesis,witnessFit};
});
;
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrV7Ink060=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Topology is secondary diagnostic evidence, NOT a score or eraser oracle.
function signature(rect,T,point){
 if(!point||!rect?.gray)return null;
 const {gray:g,width:w,height:h}=rect;
 const sx=(w-1)/T.widthCm,sy=(h-1)/T.heightCm;
 const cx=point[0]*sx,cy=point[1]*sy;
 const r=Math.max(3,T.bubbleRadiusCm*(sx+sy)/2);
 const core=.53*r,outer=1.70*r;
 const background=[];
 for(let y=Math.max(0,Math.floor(cy-outer));y<=Math.min(h-1,Math.ceil(cy+outer));y++)
  for(let x=Math.max(0,Math.floor(cx-outer));x<=Math.min(w-1,Math.ceil(cx+outer));x++){
   const d=Math.hypot(x-cx,y-cy);
   if(d>=1.23*r&&d<=outer)background.push(g[y*w+x]);
  }
 if(background.length<5)return {valid:false,reason:'insufficient_paper'};
 background.sort((a,b)=>a-b);
 const paper=background[Math.floor(.72*(background.length-1))];
 const box=Math.ceil(core),N=2*box+1,mask=new Uint8Array(N*N);
 let inspected=0,active=0,deep=0,deficit=0;
 for(let dy=-box;dy<=box;dy++)for(let dx=-box;dx<=box;dx++){
  if(dx*dx+dy*dy>core*core)continue;
  const x=Math.round(cx)+dx,y=Math.round(cy)+dy;
  if(x<0||x>=w||y<0||y>=h)continue;
  const diff=(paper-g[y*w+x])/Math.max(paper,64);
  inspected++;deficit+=Math.max(0,diff);
  if(diff>=.12){active++;mask[(dy+box)*N+(dx+box)]=1;}
  if(diff>=.24)deep++;
 }
 if(!inspected)return {valid:false,reason:'empty_center'};
 const seen=new Uint8Array(mask.length);let largest=0,components=0;
 const stack=[];
 for(let i=0;i<mask.length;i++){
  if(!mask[i]||seen[i])continue;
  let size=0;components++;seen[i]=1;stack.push(i);
  while(stack.length){
   const p=stack.pop(),x=p%N,y=(p/N)|0;size++;
   for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
    if(xx<0||yy<0||xx>=N||yy>=N)continue;
    const j=yy*N+xx;
    if(mask[j]&&!seen[j]){seen[j]=1;stack.push(j);}
   }
  }
  if(size>largest)largest=size;
 }
 return {valid:true,inkCoverage:active/inspected,deepCoverage:deep/inspected,
  contrast:deficit/inspected,coherence:active?largest/active:0,
  componentCount:components,largestComponent:largest,paper};
}
function inspect(rect,T,candidate){
 if(!rect?.gray||!candidate)return {diagnosticOnly:true,changesAnswers:false,flags:[],error:'missing_input'};
 const flags=[];
 function report(key,ev,points){
  if(!ev||!points)return;
  const st=ev.state;
  let kind=null;
  if(st==='multiple')kind='confirmed_multi_mark';
  else if(st==='review')kind='needs_review';
  else if(st==='single'){
   // Deliberately do not change a single to blank/multiple; report potential
   // weak graphite/eraser risk for comparison against teacher-verified labels.
   const weak=(Number.isFinite(ev.topFill)&&ev.topFill<.48)
      ||(Number.isFinite(ev.topRelative)&&ev.topRelative<.40)
      ||(Number.isFinite(ev.separation)&&ev.separation<.20);
   const second=(Number.isFinite(ev.secondRelative)&&ev.secondRelative>=.22
     &&Number.isFinite(ev.secondFill)&&ev.secondFill>=.14);
   if(weak)kind='weak_single_review_candidate';
   else if(second)kind='secondary_ink_review_candidate';
  }
  if(!kind)return;
  const selected=ev.index>=0?points[ev.index]:null;
  const shape=selected?signature(rect,T,selected):null;
  flags.push({key,kind,state:st,top:ev.top??null,second:ev.second??null,
   topFill:ev.topFill??null,secondFill:ev.secondFill??null,shape});
 }
 T.p1.forEach((p,i)=>report('P1.'+(i+1),candidate.p1Evidence?.[i],p));
 T.p2.forEach((p,i)=>report('P2.'+(Math.floor(i/4)+1)+'abcd'[i%4],
  candidate.p2Evidence?.[i],p));
 T.p3.forEach((question,i)=>question.forEach((p,j)=>report(
  'P3.'+(i+1)+'.'+(j+1),candidate.p3Evidence?.[i]?.columns?.[j],p)));
 return {diagnosticOnly:true,changesAnswers:false,flags,
  byPart:{P1:flags.filter(x=>x.key.startsWith('P1')).length,
   P2:flags.filter(x=>x.key.startsWith('P2')).length,
   P3:flags.filter(x=>x.key.startsWith('P3')).length}};
}
return {signature,inspect};
});
;
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
;
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
;
(function(root,factory){
 const resolve=(name,globalName)=>typeof module==='object'&&module.exports?
  require('./'+name+'.js'):root[globalName];
 const api=factory(resolve('omr-v7-geometry-066','DamSanOmrV7Geometry066'),
  resolve('omr-v7-ink-060','DamSanOmrV7Ink060'),
  resolve('omr-v7-photometry-068','DamSanOmrV7Photometry068'));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrV7Pipeline068=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Geometry,Ink,Photo){
'use strict';
// OMR 068 cached photometry and spatial consensus based on 067. No submission, storage or PWA hooks.
// Official V7 and research 060/066 remain unchanged.
function readIdentity(rect,T,Core){
 const fields=[
  {key:'SBD',name:'sbd',points:T.sbd,labels:T.sbdLabels,length:8},
  {key:'MADE',name:'maDe',points:T.maDe,labels:T.maDeLabels,length:4}
 ];
 const values={},issues=[];
 for(const field of fields){
  const out=Core.readDigitsRectified(rect,T,field.points,field.labels,T.bubbleRadiusCm);
  values[field.name]=out.value;
  for(const detail of out.details||[])
   issues.push({key:field.key+'.'+(detail.index+1),
    reason:detail.reason||'Chữ số chưa xác định',
    top:detail.top??null,second:detail.second??null});
  // A letter-like or partly absent ID cannot be promoted by a known student
  // list, an exam code, or the presumed score. Fail closed.
  if(!new RegExp('^[0-9]{'+field.length+'}$').test(out.value))
   issues.push({key:field.key,reason:'Chưa đọc đủ '+field.length+' chữ số'});
  for(let i=0;i<field.points.length;i++){
   const metrics=field.points[i].map(pt=>Core.bubbleInkScore(
    rect.gray,rect.width,rect.height,T,pt,T.bubbleRadiusCm));
   const ranked=metrics.map((m,j)=>({index:j,score:m.score,
     center:m.centerInk25||0,contrast:m.centerContrast||0}))
    .sort((a,b)=>b.score-a.score);
   const top=ranked[0],second=ranked[1];
   if(!top||!second)continue;
   const relative=second.score/Math.max(.05,top.score);
   if(top.score>=.27&&second.score>=.27&&relative>=.72
     &&second.center>=.30&&second.contrast>=.14){
    issues.push({key:field.key+'.'+(i+1),
      reason:'Hai dấu tô đáng kể trong một cột danh tính',
      top:top.score,second:second.score});
   }
  }
 }
 return {sbd:values.sbd,maDe:values.maDe,
  valid:issues.length===0,
  issues:[...new Map(issues.map(e=>[e.key,e])).values()]};
}
function compareAnswers(reference,candidate){
 const changes=[],add=(k,a,b)=>{
   const lhs=String(a??''),rhs=String(b??'');
   const numeric=(k==='SBD'||k==='MADE')&&/^[0-9]+$/.test(lhs)&&/^[0-9]+$/.test(rhs);
   if(!(numeric?Number(lhs)===Number(rhs):lhs===rhs))
     changes.push({key:k,old:a??null,proposed:b??null});
 };
 if(reference){
  add('SBD',reference.sbd,candidate.identity?.sbd);
  add('MADE',reference.maDe,candidate.identity?.maDe);
  for(let i=0;i<18;i++)add('P1.'+(i+1),reference.p1?.[i],candidate.answers?.p1?.[i]);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)
   add('P2.'+(i+1)+'abcd'[j],reference.p2?.[i]?.split('-')?.[j],
    candidate.answers?.p2?.[i]?.split('-')?.[j]);
  for(let i=0;i<6;i++)add('P3.'+(i+1),reference.p3?.[i],candidate.answers?.p3?.[i]);
 }
 return {compared:!!reference,changes,count:changes.length};
}
function analyze(imageData,T,{core,V7,reference=null,longSide=1800,expectedStudentCode=null,expectedExamCode=null}={}){
 const {width:w,height:h,data}=imageData||{};
 if(!core||!V7||!data||!Number.isInteger(w)||!Number.isInteger(h)
   ||data.length!==w*h*4||w<80||h<80)
  return {ok:false,readOnly:true,reason:'invalid_camera_frame'};
 const started=typeof performance!=='undefined'?performance.now():Date.now();
 const gray=core.grayscale(data,w,h); // once, not legacy V5 followed by V7
 const registration=Geometry.register(gray,w,h,T,core);
 if(!registration.ok)return {ok:false,readOnly:true,
  reason:registration.reason,stage:'registration',
  registration,answers:null,identity:null};
 // 32 captured sheets replayed at 1500px produced P3 differences, whereas
 // 1800px matched all recorded automatic decisions. Preserve that resolution.
 const requested=Number(longSide);
 const safeLongSide=Math.max(1800,Math.min(2254,Number.isFinite(requested)?Math.round(requested):1800));
 const rect=core.warpTemplateGray(gray,w,h,registration.H,T,safeLongSide);
 const measured=readIdentity(rect,T,core);
 // Optional binding against an already selected DB student/variant: fail
 // closed on mismatch. NEVER invent or correct answer marks from DB identity.
 const sameDigits=(a,b)=>/^[0-9]+$/.test(String(a))&&/^[0-9]+$/.test(String(b))
   &&Number(a)===Number(b);
 const bindingIssues=[];
 if(expectedStudentCode!=null&&!sameDigits(measured.sbd,expectedStudentCode))
   bindingIssues.push({key:'SBD_BINDING',reason:'SBD trên phiếu không trùng hồ sơ được gắn'});
 if(expectedExamCode!=null&&!sameDigits(measured.maDe,expectedExamCode))
   bindingIssues.push({key:'MADE_BINDING',reason:'Mã đề trên phiếu không trùng mã đề đã gắn'});
 const identity={...measured,valid:measured.valid&&bindingIssues.length===0,
   issues:[...measured.issues,...bindingIssues]};
 // The same perspective-normalized pixels are used for SBD, variant and
 // P1/II/III. No second warp and NO legacy three-part V5 analysis.
 const baseline={...V7.analyzeValidatedRectified(rect,T,null,
  {experimentalRefinement:true}),
   engine:'OMR068_RESEARCH_CANDIDATE',omr068ResearchOnly:true};
 const experiment=Photo.apply(rect,T,baseline);
 const candidate=experiment.candidate;
 if(experiment.identityVeto.length){
  for(const v of experiment.identityVeto)if(!identity.issues.some(x=>x.key===v.key))identity.issues.push(v);
  identity.valid=false;
 }
 const ink=Ink.inspect(rect,T,candidate);
 const answers={p1:candidate.p1,p2:candidate.p2,p3:candidate.p3};
 const issues=[...identity.issues,...(candidate.issues||[])];
 const analysis={ok:identity.valid&&candidate.ok===true,
  readOnly:true,validForSave:false,
  _labReadOnly:true,captureMode:'compare',recognitionEngine:'V7_068',
  requiresReview:issues.length>0||!!candidate.requiresReview,
  requiresRetake:!identity.valid||candidate.requiresRetake===true,
  identity,answers,issues,
  registration:{corners:registration.corners,
   internalNames:registration.internalNames,
   internalMatches:registration.internalMatches,
   rmse:registration.rmse,area:registration.area,
   spanX:registration.spanX,spanY:registration.spanY},
  ink,photometry:{audit:experiment.audit,changes:experiment.changes,identityVeto:experiment.identityVeto,calibration:Object.fromEntries(Object.entries(experiment.photo).map(([k,v])=>[k,v.calibration]))},geometryStatus:candidate.geometryDiagnostic,
  templateId:T.id,
  normalization:{width:rect.width,height:rect.height,
   singleWarp:true},
  candidate, // internal diagnostic, not a direct score/write payload
  elapsedMs:Math.round((typeof performance!=='undefined'?
   performance.now():Date.now())-started)};
 analysis.comparison=compareAnswers(reference,analysis);
 return analysis;
}
// The only supported bridge to a preview keeps the 060 result explicitly
// research-only. The untouched V7 ScanAdapter rejects the distinct engine.
function toResearchScan(result){
 if(!result||result.readOnly!==true||result.validForSave!==false
   ||result.candidate?.engine!=='OMR068_RESEARCH_CANDIDATE')
  throw Error('omr060_invalid_research_result');
 return {...result,_labReadOnly:true,captureMode:'compare',
   recognitionEngine:'V7_068'};
}
return {analyze,readIdentity,compareAnswers,toResearchScan};
});
;
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.DamSanOmrResultWrite=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function assertConfirmed(preview){
    if(!preview?.ok) throw new Error('preview_required');
    if(preview.scan?._labReadOnly||preview.scan?.captureMode==='compare')
      throw new Error('comparison_mode_never_writes');
    if(preview.scan?._requiresRetake)throw new Error('unreliable_omr_requires_retake');
    if(preview.scan?.recognitionEngine==='V7_068'||preview.scan?.captureMode==='v7_068'){
      const s=preview.scan,b=s.release068;
      if(s.recognitionEngine!=='V7_068'||s.captureMode!=='v7_068'||s._labReadOnly!==false||
        !b||b.version!=='068'||b.roomId!==String(preview.room?.id)||b.studentId!==String(preview.student?.id)||
        b.studentCode!==String(preview.student?.ma_hs??preview.student?.MaHS)||b.sbd!=='00'+b.studentCode||
        b.sbd!==s.sbd||b.bubbleExamCode!==s.maDe||b.examCode!==String(preview.variant?.code)||
        !/^\d{4}$/.test(s.maDe)||!/^\d+$/.test(String(b.examCode))||Number(s.maDe)!==Number(b.examCode))
        throw new Error('omr068_binding_required');
      if(preview.rawAnswers?.length!==28)throw new Error('omr068_answer_count');
      // Defense in depth: the canonical UI applies locked multiple marks,
      // and the writer independently refuses inconsistent raw answers.
      let offset={1:0,2:0,3:0};
      for(let i=0;i<28;i++){
        const part=String(preview.variant?.items?.[i]?.phan??preview.variant?.items?.[i]?.Phan??'');
        if(!['1','2','3'].includes(part))throw new Error('omr068_answer_structure');
        const j=offset[part]++,v=part==='1'?s.p1?.[j]:part==='2'?s.p2?.[j]:s.p3?.[j];
        if(String(preview.rawAnswers[i]?.chon??'')!==String(v??''))throw new Error('omr068_raw_answer_mismatch');
      }
      if(offset[1]!==18||offset[2]!==4||offset[3]!==6)throw new Error('omr068_answer_structure');
      for(const k of s.invalidMarks||[]){
        let m=/^P1\.(\d+)$/.exec(k);
        if(m){if(s.p1?.[Number(m[1])-1]!=='?')throw new Error('omr068_invalid_multiple');continue;}
        m=/^P2\.(\d+)([abcd])$/.exec(k);
        if(!m||s.p2?.[Number(m[1])-1]?.split('-')?.['abcd'.indexOf(m[2])]!=='?')throw new Error('omr068_invalid_multiple');
      }
    }
    if((preview.scan?.uncertain||[]).length && preview.reviewedUncertain !== true) throw new Error('uncertain_scan_requires_review');
    if(!preview.student?.id) throw new Error('student_id_required');
    if(!preview.room?.id) throw new Error('room_id_required');
    if(!preview.variant?.code) throw new Error('exam_code_required');
    if(!Array.isArray(preview.rawAnswers)||!preview.rawAnswers.length) throw new Error('raw_answers_required');
  }
  function metadataFrom(preview){
    const metadata={
      template_id:preview.scan?.templateId||'MOET_TLTN_2025_18_4_6_V1',
      recognition_engine:['V5','V6','V7','V7_068'].includes(preview.scan?.recognitionEngine)
        ?preview.scan.recognitionEngine:'V5',
      reviewed:true,
      uncertain_reviewed: preview.reviewedUncertain === true,
      uncertain_count:(preview.scan?.uncertain||[]).length,
      invalid_multiple_marks:[...(preview.scan?.invalidMarks||[])],
      uncertain_details:(preview.scan?.uncertainDetails||[]).map(d=>({
        vi_tri:d.key||null,
        mo_ta:d.label||d.key||null,
        ly_do:d.reason||'Cần kiểm tra lại',
        to_nhieu_o:!!d.invalidMultiple,
        muc_to_chon:Number.isFinite(d.top)?Number(d.top.toFixed(4)):null,
        muc_to_thu_hai:Number.isFinite(d.second)?Number(d.second.toFixed(4)):null,
        do_chenh:Number.isFinite(d.margin)?Number(d.margin.toFixed(4)):null
      })),
      client_preview_score:preview.grade?.score??null
    };
    // Comparative evidence stays inside the existing, access-controlled
    // OMR submission metadata, only for the designated research room.
    // No image, student identity, token, or answer-key contents are copied.
    const roomCode=String(preview.room?.MaPhong||preview.room?.ma_phong||'').trim();
    const evidence=preview.scan?.omrV7TestEvidence;
    if(roomCode==='OMR_V7_TEST'&&preview.scan?.recognitionEngine==='V7'
      &&evidence?.schema===1&&evidence.room==='OMR_V7_TEST'
      &&Array.isArray(evidence.v7?.p2)&&Array.isArray(evidence.v7?.p3)){
      metadata.omr_v7_test={
        version:1,
        v6:evidence.v6||null,
        v7:evidence.v7,
        v6_ms:Number.isFinite(evidence.v6Ms)?evidence.v6Ms:null,
        v7_ms:Number.isFinite(evidence.v7Ms)?evidence.v7Ms:null,
        comparison:evidence.comparison||null,
        v6_error:evidence.v6Error||null
      };
    }
    return metadata;
  }
  async function submitConfirmed(preview,staffRpc){
    assertConfirmed(preview);
    if(typeof staffRpc!=='function') throw new Error('staffRpc_required');
    const data=await staffRpc('rpc_staff_submit_omr',{
      p_phong_id:preview.room.id,
      p_hs_id:preview.student.id,
      p_ma_de:preview.variant.code,
      p_raw_answers:preview.rawAnswers,
      p_source_metadata:metadataFrom(preview)
    });
    if(!data) throw new Error('empty_server_response');
    return data;
  }
  return {assertConfirmed,metadataFrom,submitConfirmed,supports068:true};
});
;
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DamSanOmrEvidence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='OMR_EVIDENCE_01';
const COLORS={correct:'#159449',wrong:'#d92d20',expected:'#e8b008',review:'#f97316',marker:'#0284c7',edited:'#7c3aed'};
const displayScore=n=>Number.isFinite(Number(n))?Number(n).toFixed(2).replace('.',','):'—';
const text=v=>String(v??'').trim();
const normalizedShort=v=>text(v).replace(/'/g,'').replace(/,/g,'.').replace(/\s/g,'').toLowerCase();
const normalizedDs=v=>text(v).toUpperCase().replace(/Đ/g,'D');
const isChoice=v=>/^[A-D]$/.test(text(v).toUpperCase());
const isDs=v=>/^[ĐDS]$/.test(text(v).toUpperCase());
function slotsOf(v){
 const s=text(v).replace(/\./g,',');
 if(!/^-?\d+(,\d+)?$/.test(s)||s.length>4)return null;
 const chars=[...s];if(chars.some((c,i)=>(c==='-'&&i!==0)||(c===','&&(i===0||i===3))))return null;
 return Array.from({length:4},(_,i)=>chars[i]||'');
}
function pointAt(T,section,q,slot,token){
 if(section==='P1'){
  const labels=T.p1Labels||['A','B','C','D'];
  const j=labels.indexOf(text(token).toUpperCase());
  return j>=0?T.p1[q]?.[j]:null;
 }
 if(section==='P2'){
  const labels=T.p2Labels||['Đ','S'];
  const j=labels.findIndex(label=>normalizedDs(label)===normalizedDs(token));
  return j>=0?T.p2[q*4+slot]?.[j]:null;
 }
 const labels=T.p3Labels||['-',',','0','1','2','3','4','5','6','7','8','9'];
 const j=labels.indexOf(text(token));
 return j>=0?T.p3[q]?.[slot]?.[j]:null;
}
function markers(T){
 return (T.markers||[]).filter(m=>!['TL','TR','BR','BL'].includes(m.name)).map(m=>[m.x,m.y]);
}
function makeMarks(preview,T,original){
 if(!preview?.ok||!preview.grade?.details||!T)throw Error('EVIDENCE_PREVIEW_REQUIRED');
 const marks=[],edits=[],warnings=[],summary={correct:0,wrong:0,blank:0,review:0,manual:0,unsafeP3Answer:0};
 const originalP1=text(original?.p1);
 const originalP2=Array.isArray(original?.p2)?original.p2:[];
 const originalP3=Array.isArray(original?.p3)?original.p3:[];
 const push=(pt,kind,key,edited=false)=>{
  if(!Array.isArray(pt)||pt.length!==2||!pt.every(Number.isFinite))return;
  marks.push({pt,kind,key,edited});
 };
 const p1=preview.grade.details.filter(d=>String(d.phan)==='1'),
       p2=preview.grade.details.filter(d=>String(d.phan)==='2'),
       p3=preview.grade.details.filter(d=>String(d.phan)==='3');
 p1.forEach((d,i)=>{
  const key='P1.'+(i+1),got=text(d.chon).toUpperCase(),correct=text(d.dung).toUpperCase();
  const edited=(originalP1[i]||'')!==got;
  if(edited){summary.manual++;edits.push({key,before:originalP1[i]||'',after:got});}
  if(!isChoice(correct)){warnings.push(key+': invalid answer key');return;}
  if(got===correct){push(pointAt(T,'P1',i,0,got),'correct',key,edited);summary.correct++;}
  else{
   if(isChoice(got)){push(pointAt(T,'P1',i,0,got),'wrong',key,edited);summary.wrong++;}
   else{summary.blank++;if(got==='?'){
     summary.review++;warnings.push(key+': uncertain');
     push(T.p1[i]?.[0],'review',key);
   }}
   push(pointAt(T,'P1',i,0,correct),'expected',key);
  }
 });
 p2.forEach((d,i)=>{
  const got=text(d.chon).split('-'),correct=text(d.dung).split('-');
  const base=text(originalP2[i]).split('-');
  for(let j=0;j<4;j++){
   const key='P2.'+(i+1)+'abcd'[j];
   const c=correct[j]||'',g=got[j]||'',edited=normalizedDs(base[j])!==normalizedDs(g);
   if(edited){summary.manual++;edits.push({key,before:base[j]||'',after:g});}
   if(!isDs(c)){warnings.push(key+': invalid answer key');continue;}
   if(isDs(g)&&normalizedDs(g)===normalizedDs(c)){
    push(pointAt(T,'P2',i,j,g),'correct',key,edited);summary.correct++;
   }else{
    if(isDs(g)){push(pointAt(T,'P2',i,j,g),'wrong',key,edited);summary.wrong++;}
    else{summary.blank++;if(g==='?'){
      summary.review++;warnings.push(key+': uncertain');
      push(T.p2[i*4+j]?.[0],'review',key);
    }}
    push(pointAt(T,'P2',i,j,c),'expected',key);
   }
  }
 });
 p3.forEach((d,i)=>{
  const key='P3.'+(i+1),got=text(d.chon),correct=text(d.dung),
       orig=text(originalP3[i]);
  const edited=got!==orig;
  if(edited){summary.manual++;edits.push({key,before:orig,after:got});}
  const right=got!==''&&normalizedShort(got)===normalizedShort(correct);
  const gotSlots=slotsOf(got),correctSlots=slotsOf(correct);
  if(right){
   if(gotSlots)for(let j=0;j<4;j++)if(gotSlots[j])push(pointAt(T,'P3',i,j,gotSlots[j]),'correct',key+'.'+(j+1),edited);
   summary.correct++;
  }else{
   if(!got||got==='?'){summary.blank++;if(got==='?'){
     summary.review++;warnings.push(key+': uncertain');
     push(T.p3[i]?.[0]?.find(Boolean),'review',key);
   }}
   // Each digit position gets its own verdict. Do not mark a correct digit
   // red just because another digit in the same numeric answer is wrong.
   for(let j=0;j<4;j++){
    const g=gotSlots?.[j]||'',c=correctSlots?.[j]||'',partKey=key+'.'+(j+1);
    if(g&&c&&g===c){push(pointAt(T,'P3',i,j,g),'correct',partKey,edited);continue;}
    if(g)push(pointAt(T,'P3',i,j,g),'wrong',partKey,edited);
    if(c)push(pointAt(T,'P3',i,j,c),'expected',partKey);
   }
   // Invalid/unrepresentable answer forms cannot be mapped to physical
   // bubbles, so show the expected number as text in the retained JSON.
   if(!correctSlots){summary.unsafeP3Answer++;warnings.push(key+': correct numeric form not drawable; show text');}
   summary.wrong++;
  }
 });
 return {marks,edits,warnings,summary,version:VERSION,diagnosticOnly:true};
}
function renderImage(canvas,gray,T,report,{markersVisible=false}={}){
 if(!canvas?.getContext||!gray?.gray||!T||!report)throw Error('EVIDENCE_IMAGE_REQUIRED');
 const srcW=gray.width,srcH=gray.height,w=Math.min(1200,srcW),h=Math.round(srcH*w/srcW);
 const ctx=canvas.getContext('2d');
 canvas.width=w;canvas.height=h;
 const image=ctx.createImageData(w,h),dst=image.data,data=gray.gray;
 for(let y=0;y<h;y++){
  const iy=Math.min(srcH-1,Math.round(y*(srcH-1)/Math.max(1,h-1)));
  for(let x=0;x<w;x++){
   const ix=Math.min(srcW-1,Math.round(x*(srcW-1)/Math.max(1,w-1)));
   const v=data[iy*srcW+ix],p=(y*w+x)*4;
   dst[p]=v;dst[p+1]=v;dst[p+2]=v;dst[p+3]=255;
  }
 }
 ctx.putImageData(image,0,0);
 const px=pt=>[pt[0]*(w-1)/T.widthCm,pt[1]*(h-1)/T.heightCm];
 const radius=Math.max(3,T.bubbleRadiusCm*(w-1)/T.widthCm*.62);
 if(markersVisible)for(const pt of markers(T)){
  const [x,y]=px(pt);ctx.strokeStyle=COLORS.marker;ctx.lineWidth=1.2;
  ctx.strokeRect(x-radius*.7,y-radius*.7,1.4*radius,1.4*radius);
 }
 for(const m of report.marks){
  const [x,y]=px(m.pt);
  if(m.kind==='review'){
   ctx.fillStyle=COLORS.review;ctx.font='bold '+Math.max(12,Math.round(radius*3))+'px Arial, sans-serif';
   ctx.fillText('?',x+radius,y-radius*.7);
   continue;
  }
  ctx.strokeStyle=COLORS[m.kind];ctx.lineWidth=Math.max(2,radius*.35);
  ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
  if(m.edited){ctx.strokeStyle=COLORS.edited;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(x,y,radius+3,0,Math.PI*2);ctx.stroke();}
 }
 return {width:w,height:h};
}
function compose(canvas,gray,T,preview,original,meta={},options={}){
 const report=makeMarks(preview,T,original);
 const photo=(typeof document!=='undefined')?document.createElement('canvas'):options.createCanvas?.();
 if(!photo)throw Error('EVIDENCE_CANVAS_REQUIRED');
 renderImage(photo,gray,T,report,options);
 const out=canvas||((typeof document!=='undefined')?document.createElement('canvas'):options.createCanvas?.());
 if(!out?.getContext)throw Error('EVIDENCE_OUTPUT_CANVAS_REQUIRED');
 const header=188,gutter=24;
 out.width=photo.width;out.height=photo.height+header;
 const ctx=out.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);
 const name=text(meta.studentName||preview.student?.ho_ten||'');
 const room=text(meta.roomName||preview.room?.ten_dot||'');
 const student=text(meta.studentCode||preview.student?.ma_hs||'');
 const code=text(preview.variant?.code||'');
 ctx.fillStyle='#0f172a';ctx.font='bold 24px Arial, sans-serif';
 ctx.fillText('KẾT QUẢ CHẤM OMR '+(preview.scan?.recognitionEngine==='V7_068'?'068':'V7'),gutter,36,out.width-2*gutter);
 ctx.font='18px Arial, sans-serif';
 ctx.fillText('Bài: '+room,gutter,70,out.width-2*gutter);
 ctx.fillText('Học sinh: '+name+'  |  SBD: '+student+'  |  Mã đề: '+code,gutter,100,out.width-2*gutter);
 const parts=preview.grade.parts;
 ctx.font='bold 19px Arial, sans-serif';
 ctx.fillText('P1: '+displayScore(parts.p1)+'   P2: '+displayScore(parts.p2)+'   P3: '+displayScore(parts.p3)+'   TỔNG: '+displayScore(meta.finalScore??preview.grade.score),gutter,132,out.width-2*gutter);
 ctx.font='14px Arial, sans-serif';ctx.fillStyle='#475569';
 const status=meta.status==='official'?'ĐÃ LƯU CHÍNH THỨC':'DỰ KIẾN / THỬ NGHIỆM';
 ctx.fillText(status+'  •  '+VERSION+'  •  '+text(meta.timestamp||new Date().toISOString()),gutter,159,out.width-2*gutter);
 ctx.fillText('Xanh: đúng • Đỏ: chọn sai • Vàng: đáp án đúng • Cam: chưa rõ • Tím: GV sửa',gutter,180,out.width-2*gutter);
 ctx.drawImage(photo,0,header);
 return {canvas:out,report};
}
function record(preview,original,report,meta={}){
 const grade=preview.grade,part=grade.parts;
 return {schema:1,version:VERSION,recognition_engine:preview.scan?.recognitionEngine==='V7_068'?'V7_068':'V7',scan_id:meta.scanId||null,revision:meta.revision||1,
  room_id:preview.room?.id||null,student_id:preview.student?.id||null,
  student_name:preview.student?.ho_ten||'',student_code:preview.student?.ma_hs||'',
  class_name:preview.student?.lop||'',room_name:preview.room?.ten_dot||preview.room?.MaPhong||'',
  exam_code:preview.variant?.code||null,mode:meta.mode||'test',
  recognized:{p1:original?.p1||'',p2:original?.p2||[],p3:original?.p3||[]},
  confirmed:{p1:preview.scan?.p1||'',p2:preview.scan?.p2||[],p3:preview.scan?.p3||[]},
  grade:{total:grade.score,parts:{p1:part.p1,p2:part.p2,p3:part.p3},details:grade.details},
  edits:report.edits,uncertain_details:preview.scan?.uncertainDetails||[],
  report_summary:report.summary,notes:report.warnings,created_at:meta.timestamp||new Date().toISOString()};
}
return {supports068:true,VERSION,COLORS,slotsOf,pointAt,makeMarks,renderImage,compose,record,displayScore};
});
;
(function(root,factory){
 const resolve=(n,g)=>typeof module==='object'&&module.exports?require('./'+n+'.js'):root[g];
 const api=factory(resolve('omr-v7-pipeline-068','DamSanOmrV7Pipeline068'),
  resolve('omr-room-binding','DamSanOmrRoomBinding'),resolve('omr-scan-adapter','DamSanOmrScanAdapter'));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrRelease068=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(P,B,E){
 'use strict';
 const engine='V7_068',mode='v7_068';
 const available=()=>!!P?.analyze&&!!B?.bindScan&&!!E?.fromV6;
 function normalize(result,model){
  const c=result?.candidate,id=result?.identity,reg=result?.registration;
  if(result?.recognitionEngine!==engine||result.readOnly!==true||result.validForSave!==false||
   result.ok!==true||result.requiresRetake!==false||id?.valid!==true||id.issues?.length!==0||
   c?.engine!=='OMR068_RESEARCH_CANDIDATE'||c.ok!==true||c.requiresRetake!==false||
   c.geometryDiagnostic!=='ok'||c.calibration?.reliable!==true||c.p3Calibration?.reliable!==true||
   !Array.isArray(c.retakeReasons)||c.retakeReasons.length||
   !Array.isArray(reg?.corners)||reg.corners.length!==4||reg.corners.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||
   !/^\d{4}$/.test(id.maDe)||!/^\d{8}$/.test(id.sbd))
   throw Error('068 chưa xác minh đủ hình học hoặc SBD/mã đề; cần quét lại');
  const scanned={ok:true,sbd:id.sbd,maDe:id.maDe,markerCorners:reg.corners,
   markerMatches:reg.internalMatches,markerRmse:reg.rmse};
  const binding=B.bindScan(scanned,model);
  if(!binding.ok)throw Error('068: SBD hoặc mã đề không khớp duy nhất với phòng thi; kiểm tra phiếu và quét lại');
  // Retain all issues from the engine AND independently reconstruct unresolved
  // column/row states. Confirmed multiple marks must stay locked to zero.
  const issues=(c.issues||[]).slice(),invalid=new Set(c.invalidMarks||[]),seen=new Set(issues.map(x=>x.key));
  const add=(key,e,lock)=>{
   if(!e||!['review','multiple'].includes(e.state))return;
   if(!seen.has(key)){issues.push({key,state:e.state,reason:e.reason||'Cần kiểm tra dấu tô'});seen.add(key);}
   if(lock&&e.state==='multiple')invalid.add(key);
  };
  if(c.p1Evidence?.length!==18||c.p2Evidence?.length!==16||c.p3Evidence?.length!==6||
    c.p3Evidence.some(x=>x.columns?.length!==4))throw Error('068 thiếu bằng chứng nhận dạng');
  c.p1Evidence.forEach((e,i)=>add('P1.'+(i+1),e,true));
  c.p2Evidence.forEach((e,i)=>add('P2.'+(Math.floor(i/4)+1)+'abcd'[i%4],e,true));
  c.p3Evidence.forEach((x,i)=>{
   x.columns.forEach((e,j)=>add('P3.'+(i+1)+'.'+(j+1),e,false));
   if(x.uncertain||x.value==='?')add('P3.'+(i+1),{state:'review',reason:x.reason},false);
  });
  const candidate={...c,issues,invalidMarks:[...invalid]};
  E.validateCandidate(candidate);
  // Only this selected, room-bound production adapter promotes the isolated
  // optical result. The research pipeline itself remains read-only.
  const scan=E.fromV6(scanned,candidate);
  if(scan._requiresRetake)throw Error('068 cần quét lại');
  return {scan:{...scan,recognitionEngine:engine,captureMode:mode,_labReadOnly:false,
   release068:{version:'068',roomId:String(binding.room.id),studentId:String(binding.student.id),
    studentCode:String(binding.student.ma_hs??binding.student.MaHS),sbd:id.sbd,
    examCode:String(binding.variant.code),bubbleExamCode:id.maDe}},candidate};
 }
 function recognize(pixels,T,core,V7,model){
  if(!available()||!core?.warpTemplateGray||!model?.valid1846)throw Error('068 chưa sẵn sàng hoặc phòng thi không hợp lệ');
  let rect=null;
  const captureCore={...core,warpTemplateGray(...args){rect=core.warpTemplateGray(...args);return rect;}};
  const result=P.analyze(pixels,T,{core:captureCore,V7,longSide:1800});
  const normalized=normalize(result,model);
  if(!rect)throw Error('068 chưa có ảnh chuẩn hóa');
  return {...normalized,rect};
 }
 return {engine,mode,available,normalize,recognize};
});
;
(function(root){
  'use strict';
  const T=root.DamSanOmrTemplate, O=root.DamSanOmr, B=root.DamSanOmrRoomBinding, S=root.DamSanOmrScoring, W=root.DamSanOmrResultWrite, E=root.DamSanOmrScanAdapter;
  const V7=root.DamSanOmrV7Candidate, R068=root.DamSanOmrRelease068;
  const LabScore=root.DamSanOmrV7LabScore;
  const Evidence=root.DamSanOmrEvidence, EvidenceClient=root.DamSanOmrEvidenceClient, EvidenceExport=root.DamSanOmrEvidenceExport, Naming=root.DamSanOmrEvidenceNaming,
    EvidencePrint=root.DamSanOmrEvidencePrint, EvidenceQueue=root.DamSanOmrEvidenceQueue;
  // Retain the previous V7 controller if any 068 dependency is missing.
  if(!T||!O||!B||!S||!W?.supports068||!R068?.available()||!Evidence?.supports068||!V7?.analyzeValidatedRectified||!E?.fromV7){console.warn('OMR 068 unavailable; retain V7');return;}
  if(document.getElementById('omrTeacherOverlay')){console.warn('OMR 068 requires a fresh page, retain active V7');return;}

  // The experimental capture gate is isolated to one dedicated test room.
  // Do not allow a global URL parameter to alter normal V7 rooms.
  const PRECISION_TEST_ROOM_CODE='OMR_V7_PRECISION_TEST';
  const precisionCapture=!!root.DamSanOmrPrecisionCapture;
  let precisionEvidenceQueue=null;
  const state={rooms:[],roomModel:null,stream:null,lastScan:null,lastPreview:null,saved:new Set(),facing:'environment',autoScanEnabled:true,autoScanTimer:null,autoScanBusy:false,autoScanStable:0,autoScanLastCorners:null,lastCaptureMode:'manual',photoZoom:1.65,cameraRequestSerial:0,labEnabled:false,officialEngine:'v7',lastV6:null,evidenceCtx:null,evidenceData:null,evidenceTimer:null,evidenceSave:null,evidenceExportNext:0,evidenceExportRoom:null,evidenceCommittedSubmissionId:null};
  const q=id=>document.getElementById(id);
  // Desktop keeps its V5/V6 fallback comparison. The teacher PWA, when
  // loaded with V7 modules, compares V6/V7 without any second route or RPC.
  const hasV7Comparison=()=>!!V7?.analyzeValidatedRectified&&!!E?.fromV7;
  const expectedEngineLabel=(engine,compare=false)=>compare
    ?(hasV7Comparison()?'V6':'V5')
    :engine==='v7_068'?'V7_068':engine==='v7'?'V7':engine==='v6'?'V6':'V5';
  const formatScore=value=>{const n=Number(value);return value===null||value===undefined||value===''||!Number.isFinite(n)?'—':n.toFixed(2).replace('.',',');};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function normalizeRoom(r){
    return {
      ...r,
      id:r.id,
      MaPhong:r.MaPhong??r.ma_phong??'',
      DoiTuong:r.DoiTuong??r.doi_tuong??'TatCa',
      truong_id:r.truong_id??r.TruongId??r.TruongID,
      assessment_type:r.assessment_type??r.AssessmentType??'LEGACY',
      scoring_config:r.scoring_config??r.ScoringConfig??{}
    };
  }
  function allowedStudents(rows,room){
    const target=String(room.DoiTuong||'TatCa').trim();
    if(!target||target==='TatCa') return rows;
    const allow=target.split(',').map(s=>s.trim()).filter(Boolean);
    return rows.filter(s=>allow.includes(String(s.lop||'').trim())||allow.includes(String(s.ma_hs||'').trim()));
  }
  async function loadStudents(room){
    const res=await sb.from('hoc_sinh').select('id,truong_id,ma_hs,ho_ten,lop,quyen').eq('truong_id',room.truong_id);
    if(res.error) throw res.error;
    return allowedStudents(res.data||[],room);
  }


  const OMR_RESTORE_KEY='damSan_TeacherOmrReload_v1';
  function omrOwner(){
    try{return String(JSON.parse(sessionStorage.getItem('damSan_GVSession')||'null')?.id||'');}
    catch(_){return '';}
  }
  function readOmrReload(){
    try{
      const data=JSON.parse(sessionStorage.getItem(OMR_RESTORE_KEY)||'null');
      if(!data||data.v!==1||!data.owner||data.owner!==omrOwner()||
        Date.now()-data.at>6*60*60*1000)return null;
      return data;
    }catch(_){return null;}
  }
  function rememberOmr({clearDraft=false,withPhoto=false}={}){
    const owner=omrOwner();if(!owner)return;
    try{
      const old=readOmrReload()||{},roomId=q('omrRoomSelect')?.value||'';
      const data={v:1,owner,at:Date.now(),roomId,
        engine:state.officialEngine,compare:state.labEnabled,
        draft:clearDraft?null:(old.draft||null)};
      if(withPhoto&&state.lastScan?.ok&&roomId){
        const canvas=q('omrTeacherCanvas'),max=1250;
        let photo='';
        if(canvas?.width&&canvas?.height){
          const scale=Math.min(1,max/canvas.width,max/canvas.height);
          const preview=document.createElement('canvas');
          preview.width=Math.max(1,Math.round(canvas.width*scale));
          preview.height=Math.max(1,Math.round(canvas.height*scale));
          preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
          photo=preview.toDataURL('image/jpeg',.78);
          if(photo.length>1200000)photo='';
        }
        const ids=['omrSbd','omrMaDe','omrP1',
          ...[1,2,3,4].map(i=>'omrP2_'+i),...[1,2,3,4,5,6].map(i=>'omrP3_'+i)];
        data.draft={photo,scan:state.lastScan,comparison:state.lastV6,
          values:Object.fromEntries(ids.map(id=>[id,q(id).value])),
          roomId,engine:state.officialEngine,compare:state.labEnabled};
      }
      sessionStorage.setItem(OMR_RESTORE_KEY,JSON.stringify(data));
    }catch(e){
      // Session quota or disabled storage must never interrupt a camera scan.
      console.warn('OMR session draft unavailable:',e?.name||'unavailable');
    }
  }
  function clearOmrDraft(){rememberOmr({clearDraft:true});}
  function restoreOmrDraft(draft){
    return new Promise(resolve=>{
      if(!draft?.photo||!draft.scan?.ok||!state.roomModel?.valid1846
        ||draft.roomId!==String(q('omrRoomSelect').value)
        ||draft.engine!==state.officialEngine||draft.compare!==state.labEnabled
        ||!Array.isArray(draft.scan.p2)||!Array.isArray(draft.scan.p3)
        ||draft.scan.recognitionEngine!==expectedEngineLabel(state.officialEngine,state.labEnabled)){
        resolve(false);return;
      }
      const img=new Image();
      img.onload=()=>{
        try{
          const c=q('omrTeacherCanvas'),ctx=c.getContext('2d');
          c.width=img.naturalWidth;c.height=img.naturalHeight;
          ctx.drawImage(img,0,0);
          state.lastScan=draft.scan;state.lastV6=draft.comparison||null;
          const values=draft.values||{};
          for(const [id,value] of Object.entries(values)){
            const el=q(id);if(el&&typeof value==='string')el.value=value;
          }
          q('omrPhotoHint').textContent='Ảnh phiếu đã khôi phục sau tải lại • Chạm để xem lớn';
          q('omrScanArea').style.display='block';
          q('omrEngineResult').textContent=state.labEnabled
            ?'ĐỐI CHIẾU '+(hasV7Comparison()?'V6/V7':'V5/V6')+' – chỉ xem, không lưu điểm'
            :'Đang chấm bằng '+expectedEngineLabel(state.officialEngine);
          // Clear the previous manual acknowledgement. Revalidate answers
          // and marks with the currently reloaded room/variant before saving.
          q('omrReviewUncertain').checked=false;
          reviewCurrent();
          showV6Comparison();
          resolve(!!state.lastPreview);
        }catch(e){console.warn('OMR draft restore failed:',e);resolve(false);}
      };
      img.onerror=()=>resolve(false);
      img.src=draft.photo;
    });
  }

  function ensureUi(){
    if(q('omrTeacherOverlay')) return;
    const style=document.createElement('style');
    style.textContent=`
      #omrTeacherOverlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:4000;align-items:center;justify-content:center;padding:10px}
      #omrTeacherOverlay.show{display:flex}
      .omr-shell{width:min(980px,100%);max-height:96dvh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 18px 55px rgba(0,0,0,.28)}
      .omr-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid #e2e8f0;position:sticky;top:0;background:#fff;z-index:3}
      .omr-head h2{margin:0;font-size:18px}.omr-close{border:0;background:#fee2e2;color:#991b1b;border-radius:8px;padding:8px 11px;font-weight:700}
      .omr-body{padding:16px}.omr-row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.omr-field{flex:1;min-width:180px}.omr-field label{font-size:12px;margin-bottom:4px}
      /* Room selector must never share a flex row with template/progress data. */
      #omrTeacherOverlay .omr-room-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}
      #omrTeacherOverlay .omr-room-picker{min-width:0}
      #omrTeacherOverlay .omr-room-picker label{display:block;font-size:13px;font-weight:700;margin:0 0 6px}
      #omrTeacherOverlay #omrRoomSelect{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;white-space:nowrap;text-overflow:ellipsis}
      #omrTeacherOverlay .omr-room-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-width:0}
      #omrTeacherOverlay .omr-room-info-item{min-width:0;overflow-wrap:anywhere}
      #omrTeacherOverlay .omr-room-info-item .omr-muted{display:block;margin-bottom:4px}
      .omr-card{border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin:12px 0;background:#fff}.omr-muted{color:#64748b;font-size:12px}.omr-warn{background:#fff7ed;border-color:#fdba74}.omr-ok{background:#f0fdf4;border-color:#86efac}.omr-alert-field input,.omr-alert-field select{border:2px solid #f59e0b!important;background:#fffbeb!important}.omr-warning-list{margin:8px 0 0 18px;padding:0}.omr-warning-list li{margin:5px 0;line-height:1.4}
      .omr-actions{display:flex;gap:8px;flex-wrap:wrap}.omr-actions button{border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}.omr-primary{background:#1769e0;color:#fff}.omr-green{background:#15803d;color:#fff}.omr-light{background:#eef2f7;color:#1f2937}
      #omrTeacherVideoWrap{display:none;position:fixed;inset:0;background:#000;z-index:4500;padding:calc(8px + env(safe-area-inset-top)) 8px calc(8px + env(safe-area-inset-bottom));flex-direction:column}#omrTeacherVideoWrap.show{display:flex}
      #omrAutoHud{position:absolute;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);z-index:2;background:rgba(15,23,42,.78);color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;max-width:88vw;text-align:center;pointer-events:none}
      #omrAutoGuide{position:absolute;left:8%;right:8%;top:9%;bottom:17%;border:2px solid rgba(255,255,255,.72);border-radius:18px;box-shadow:0 0 0 9999px rgba(0,0,0,.12);pointer-events:none;z-index:1}
      #omrAutoGuide.ready{border-color:#22c55e;box-shadow:0 0 0 9999px rgba(0,0,0,.06),0 0 0 3px rgba(34,197,94,.22) inset}
      #omrTeacherVideo{flex:1;width:100%;min-height:0;object-fit:contain}.omr-camera-bar{display:flex;gap:8px;justify-content:center;padding:10px;flex-wrap:wrap}
      .omr-photo-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .omr-photo-head button{border:0;border-radius:8px;background:#eef2f7;color:#1f2937;font-weight:700;padding:8px 10px;cursor:pointer}
      #omrTeacherCanvas{display:block;max-width:100%;width:auto;height:auto;max-height:75dvh;object-fit:contain;background:#111;border-radius:8px;margin:auto;cursor:zoom-in}
      #omrPhotoLightbox{display:none;position:fixed;inset:0;z-index:4700;background:#0b1220;color:white;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
      #omrPhotoLightbox.show{display:flex}
      .omr-photo-controls{flex-shrink:0;display:flex;gap:8px;align-items:center;padding:10px;background:#0f172a}
      .omr-photo-controls button{border:0;border-radius:8px;background:#334155;color:#fff;font-weight:700;padding:10px 14px;cursor:pointer}
      #omrPhotoPan{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-x pan-y}
      #omrPhotoZoomCanvas{display:block;max-width:none;height:auto;margin:0 auto}
      #omrTeacherOverlay .omr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;min-width:0;max-width:100%}
      #omrTeacherOverlay .omr-grid>.omr-answer{min-width:0;max-width:100%}
      #omrTeacherOverlay .omr-grid>.omr-answer input{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;font-family:ui-monospace,monospace}
      #omrTeacherOverlay #omrStudentName{overflow-wrap:anywhere}
      .omr-score{font-size:30px;font-weight:800;color:#0f766e}.omr-progress{font-weight:700;color:#334155}
      /* Fixed V7 map: no collapsed details and no responsive overflow. */
      #omrTeacherOverlay .omr-shell,#omrTeacherOverlay .omr-body,#omrTeacherOverlay .omr-card{box-sizing:border-box;min-width:0;max-width:100%}
      #omrTeacherOverlay #omrV7OverlayPanel{width:100%;min-width:0}
      #omrTeacherOverlay .omr-overlay-title{font-size:16px;line-height:1.4;margin:0;font-weight:800;color:#0f172a}
      #omrTeacherOverlay #omrV7OverlayCanvas{display:block;width:100%;max-width:100%;height:auto;max-height:75dvh;object-fit:contain;border-radius:8px;background:#f1f5f9}
      #omrTeacherOverlay #omrV7OverlayLegend{font-size:12px;line-height:1.6;margin:8px 0;color:#334155}
      #omrTeacherOverlay #omrV7OverlayStatus{overflow-wrap:anywhere;margin-top:6px}
      #omrTeacherOverlay .omr-identity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end;min-width:0;width:100%}
      #omrTeacherOverlay .omr-identity-grid>.omr-field{min-width:0;max-width:100%;width:100%;box-sizing:border-box}
      #omrTeacherOverlay .omr-identity-grid>.omr-field-student{grid-column:1/-1}
      #omrTeacherOverlay .omr-identity-grid label{display:block;margin:0 0 6px;font-size:13px;line-height:1.4;font-weight:600;overflow-wrap:anywhere}
      #omrTeacherOverlay .omr-identity-grid input,#omrTeacherOverlay .omr-identity-grid select{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;min-height:44px;padding:8px 10px;border:1px solid #94a3b8;border-radius:8px;background:#fff;color:#0f172a;font-size:16px;text-overflow:ellipsis}
      #omrTeacherOverlay .omr-identity-grid select{white-space:nowrap;overflow:hidden}
      #omrTeacherOverlay #omrEvidenceCanvas{display:block;width:100%;max-width:100%;height:auto;max-height:72dvh;object-fit:contain;background:white;border:1px solid #dbe3ed;border-radius:8px}
      #omrTeacherOverlay #omrEvidenceStatus{font-size:12px;margin-top:8px;overflow-wrap:anywhere}
      #omrTeacherOverlay #omrEvidenceCard{margin-top:0}
      #omrTeacherOverlay #omrEvidenceCard>strong{display:block;font-size:16px;margin-bottom:5px}
      #omrTeacherOverlay .omr-evidence-extra{margin-top:12px;border-top:1px solid #e2e8f0;padding-top:10px}
      #omrTeacherOverlay .omr-evidence-extra>summary,#omrTeacherOverlay #omrReviewDetails>summary,
      #omrTeacherOverlay #omrTechnicalDetails>summary{cursor:pointer;font-weight:700;line-height:1.45;color:#334155}
      #omrTeacherOverlay #omrReviewDetails .omr-identity-grid{margin-top:10px}
      #omrTeacherOverlay #omrEvidenceCanvas{cursor:zoom-in}
      #omrTeacherOverlay #omrScanArea>.omr-actions{position:sticky;bottom:0;z-index:2;
         padding:10px 5px;background:#fff;border-top:1px solid #e2e8f0;justify-content:center}
      #omrTeacherOverlay #omrScanArea>.omr-actions button{min-height:43px}
      #omrTeacherOverlay #omrTechnicalDetails:not([open]){padding:9px 12px;font-size:12px}
      /* Explicit display:grid/block rules on child canvases used to override
         the browser's native closed-details styles. Guarantee one visible image. */
      #omrTeacherOverlay details:not([open]) > :not(summary){display:none!important}
      #omrTeacherOverlay #omrEvidenceArchiveList{font-size:13px;line-height:1.5;max-height:250px;overflow:auto}
      #omrTeacherOverlay .omr-evidence-tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
      #omrTeacherOverlay #omrEvidenceReady{display:none;box-sizing:border-box;width:100%;margin-top:10px;
        padding:12px;background:#047857;color:white;border-radius:9px;text-align:center;
        text-decoration:none;font-weight:750;font-size:15px;line-height:1.5;
        overflow-wrap:anywhere;min-height:48px}
      @media(max-width:340px){#omrTeacherOverlay .omr-identity-grid{grid-template-columns:minmax(0,1fr)}}
      .omr-lab-details{white-space:pre-line;line-height:1.55;overflow-wrap:anywhere}.omr-lab-toggle{display:flex;gap:8px;align-items:flex-start;cursor:pointer}.omr-lab-toggle input{width:20px;height:20px;flex:0 0 20px;accent-color:#7c3aed}
      @media(max-width:700px){#omrTeacherOverlay{padding:0}.omr-shell{border-radius:0;max-height:100dvh;height:100dvh;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}.omr-body{padding:12px}.omr-field{min-width:145px}#omrTeacherOverlay .omr-room-info{grid-template-columns:minmax(0,1fr)}}
    `;
    document.head.appendChild(style);
    const wrap=document.createElement('div');
    wrap.innerHTML=`
    <div id="omrTeacherOverlay"><div class="omr-shell">
      <div class="omr-head"><h2>📷 Chấm phiếu trắc nghiệm</h2><button class="omr-close" id="omrClose">Đóng</button></div>
      <div class="omr-body">
        <div class="omr-card">
          <div class="omr-room-layout">
            <div class="omr-room-picker">
              <label for="omrRoomSelect">Phòng thi</label>
              <select id="omrRoomSelect" aria-label="Chọn phòng thi"></select>
            </div>
            <div class="omr-room-info">
              <div class="omr-room-info-item"><span class="omr-muted">Phiếu chuẩn</span><strong>BGD 2025 • 18–4–6</strong></div>
              <div class="omr-room-info-item"><span class="omr-muted">Tiến độ phiên này</span><div id="omrProgress" class="omr-progress">0 phiếu đã lưu</div><button type="button" id="omrEvidenceQueueRetry" class="omr-light" style="display:none;margin-top:6px;padding:6px 9px;font-size:12px">Thử tải lại minh chứng</button></div>
            </div>
          </div>
          <div id="omrRoomSummary" class="omr-muted" style="margin-top:8px">Chọn phòng để bắt đầu.</div>
           <div class="omr-card" id="omrEngineWrap">
              <strong>Chọn thuật toán OMR</strong>
               <select id="omrEngineReleaseSelect" aria-label="Chọn thuật toán OMR" style="width:100%;margin-top:6px">
                 <option value="v7">V7 — ổn định (dự phòng)</option>
                 <option value="v7_068">068 — nhận dạng cải tiến</option>
               </select>
               <div class="omr-muted" style="margin-top:6px">Chọn 068 để chấm bằng thuật toán mới. V7 vẫn hoạt động độc lập. Kiểm tra SBD, mã đề và cảnh báo trước khi lưu.</div>
              <div class="omr-muted" id="omrV7LoadStatus" style="display:none;margin-top:6px" role="status"></div>
            </div>
        </div>
        <div class="omr-card">
          <div class="omr-actions">
            <button class="omr-primary" id="omrOpenCamera">Mở camera</button>
            <label class="omr-light" style="display:inline-block;padding:10px 14px;border-radius:8px;font-weight:700;cursor:pointer">Chọn ảnh<input id="omrPickFile" type="file" accept="image/*" style="display:none"></label>
          </div>
          <div class="omr-muted" style="margin-top:8px">Camera chỉ đọc phiếu trên máy. Điểm chỉ được ghi sau khi giáo viên bấm Xác nhận & Lưu.</div>
        </div>
        <div id="omrScanArea" style="display:none">
          <section id="omrEvidenceCard" class="omr-card" style="display:none" aria-label="Phiếu minh chứng đã đánh dấu đúng sai">
            <strong>Phiếu có đánh dấu đúng/sai</strong>
            <div class="omr-muted">Xanh: đúng • Đỏ: lựa chọn sai • Vàng: đáp án đúng • Cam: chưa rõ • Tím: GV sửa. Phiếu minh chứng không thay đổi điểm chính thức.</div>
            <canvas id="omrEvidenceCanvas" role="img" aria-label="Ảnh phiếu trắc nghiệm đã đánh dấu đáp án đúng sai"></canvas>
            <div id="omrEvidenceStatus" role="status"></div>
            <details id="omrEvidenceToolsDetails" class="omr-evidence-extra">
           <summary>Công cụ minh chứng và xuất file</summary>
           <div class="omr-evidence-tools">
               <button type="button" class="omr-light" id="omrEvidencePdf">Tải phiếu PDF</button>
              <button type="button" class="omr-light" id="omrEvidenceHistory">Phiếu OMR đã lưu</button>
              <button type="button" class="omr-light" id="omrEvidenceExport">Xuất Excel + phiếu PDF</button>
              <button type="button" class="omr-light" id="omrEvidenceRetry" style="display:none">Lưu lại minh chứng</button>
            </div>
            <a id="omrEvidenceReady" href="#" download style="display:none">Tải gói ZIP đã tạo</a>
            <div id="omrEvidenceArchiveList" style="display:none"></div>
           </details>
          </section>

          <details id="omrTechnicalDetails" class="omr-card" open>
          <summary>Ảnh nguồn và bản đồ mốc — xem khi cần kiểm tra kỹ thuật</summary>
          <div class="omr-card">
            <div class="omr-photo-head"><span class="omr-muted" id="omrPhotoHint">Ảnh phiếu sau khi chụp</span><button type="button" id="omrPhotoExpand">Xem chi tiết</button></div>
            <canvas id="omrTeacherCanvas" aria-label="Ảnh phiếu để đối chiếu kết quả nhận dạng"></canvas>
          </div>
          <section id="omrV7OverlayPanel" class="omr-card" style="display:none" aria-labelledby="omrV7OverlayTitle">
             <h3 class="omr-overlay-title" id="omrV7OverlayTitle">Bản đồ định vị — mốc nội bộ và vị trí tô</h3>
             <div id="omrV7OverlayLegend">Xanh lá: nhận một ô; vàng: cần kiểm tra; đỏ: nhiều dấu tô; xanh dương: mốc. Xem lại các cảnh báo trước khi xác nhận lưu điểm.</div>
             <canvas id="omrV7OverlayCanvas" role="img" aria-label="Bản đồ vị trí nhận dạng V7, chỉ xem"></canvas>
             <div class="omr-muted" id="omrV7OverlayStatus" role="status"></div>
          </section>
          </details>
           <div id="omrEngineResult" class="omr-muted" style="margin:8px 0;font-weight:700"></div>
           <div id="omrWarning" class="omr-card omr-warn" style="display:none"></div>
          <label id="omrReviewUncertainWrap" class="omr-card omr-warn" style="display:none;cursor:pointer">
            <input id="omrReviewUncertain" type="checkbox" style="width:auto;margin-right:8px"> Tôi đã kiểm tra đúng các vị trí được đánh dấu và xác nhận dữ liệu đang hiển thị là đúng.
          </label>
          <details id="omrReviewDetails" class="omr-card">
          <summary>Thông tin và đáp án đọc được — chạm để kiểm tra / sửa</summary>
          <div class="omr-identity-grid">
              <div class="omr-field"><label for="omrSbd">SBD / mã học sinh</label><input id="omrSbd" type="text" inputmode="numeric" autocomplete="off"></div>
              <div class="omr-field"><label for="omrMaDe">Mã đề</label><input id="omrMaDe" type="text" autocomplete="off"></div>
              <div class="omr-field omr-field-student"><label for="omrStudent">Học sinh</label><select id="omrStudent"></select></div>
            </div>
          <div style="margin-top:12px;font-weight:700">Đáp án nhận dạng</div>
            <div class="omr-grid" style="margin-top:10px">
              <div class="omr-answer"><label>Phần I (18 ký tự A/B/C/D)</label><input id="omrP1" type="text" maxlength="18"></div>
              <div class="omr-answer"><label>P2 Câu 1</label><input id="omrP2_1" type="text"></div>
              <div class="omr-answer"><label>P2 Câu 2</label><input id="omrP2_2" type="text"></div>
              <div class="omr-answer"><label>P2 Câu 3</label><input id="omrP2_3" type="text"></div>
              <div class="omr-answer"><label>P2 Câu 4</label><input id="omrP2_4" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 1</label><input id="omrP3_1" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 2</label><input id="omrP3_2" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 3</label><input id="omrP3_3" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 4</label><input id="omrP3_4" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 5</label><input id="omrP3_5" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 6</label><input id="omrP3_6" type="text"></div>
            </div>
          <div style="margin-top:10px"><button type="button" class="omr-light" id="omrRecheck">Kiểm tra lại</button></div>
         </details>
         <div class="omr-card omr-ok" id="omrGradeCard" style="display:none">
            <div id="omrStudentName" style="font-weight:800"></div>
            <div>Mã đề: <b id="omrGradeCode"></b></div>
            <div>Điểm dự kiến (<span id="omrGradeEngine">V7</span>): <span class="omr-score" id="omrScore">-</span></div>
            <div id="omrPartScores" class="omr-muted"></div>
          </div>

          <div class="omr-actions">
            <button type="button" class="omr-light" id="omrEditAnswers">Kiểm tra / sửa</button>
            <button class="omr-green" id="omrSave" disabled>Xác nhận & Lưu</button>
            <button class="omr-light" id="omrNext">Quét lại</button>
          </div>
        </div>
      </div>
    </div></div>
    <div id="omrTeacherVideoWrap"><div id="omrAutoHud">Đưa trọn phiếu vào khung</div><div id="omrAutoGuide"></div><video id="omrTeacherVideo" autoplay playsinline muted></video><div class="omr-camera-bar"><button id="omrCameraClose">Đóng</button><button id="omrAutoToggle">Tự động: Bật</button><button id="omrCameraSwitch">Đổi camera</button><button id="omrCameraCapture" class="omr-primary">Chụp thủ công</button></div></div>
    <div id="omrPhotoLightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh phiếu phóng to">
      <div class="omr-photo-controls"><strong style="flex:1">Ảnh phiếu đã phóng</strong>
        <button type="button" id="omrPhotoMinus" aria-label="Thu nhỏ">−</button>
        <button type="button" id="omrPhotoPlus" aria-label="Phóng to">+</button>
        <button type="button" id="omrPhotoClose">Đóng</button>
      </div><div id="omrPhotoPan"><canvas id="omrPhotoZoomCanvas"></canvas></div>
    </div>`;
    document.body.appendChild(wrap);
    q('omrClose').onclick=()=>{if(!root.DamSanTeacherNav?.closeOmr?.())close();};
    q('omrRoomSelect').onchange=()=>loadRoom(q('omrRoomSelect').value);
    q('omrOpenCamera').onclick=openCamera;
    q('omrPickFile').onchange=e=>e.target.files[0]&&loadImageFile(e.target.files[0]);
    q('omrCameraClose').onclick=()=>{if(!root.DamSanTeacherNav?.backFrom?.('camera'))closeCamera();};
    q('omrCameraSwitch').onclick=()=>{state.facing=state.facing==='environment'?'user':'environment';openCamera();};
    q('omrCameraCapture').onclick=()=>capture('manual');
    q('omrPhotoExpand').onclick=openPhotoDetail;
    q('omrEvidenceCanvas').onclick=()=>openPhotoDetail({fromEvidence:true});
    q('omrEditAnswers').onclick=()=>{
      const details=q('omrReviewDetails');details.open=!details.open;
      if(details.open)details.scrollIntoView?.({block:'nearest',behavior:'smooth'});
    };
    q('omrTeacherCanvas').onclick=openPhotoDetail;
    q('omrPhotoClose').onclick=()=>{if(!root.DamSanTeacherNav?.backFrom?.('photo'))closePhotoDetail();};
    q('omrPhotoPlus').onclick=()=>setPhotoZoom(state.photoZoom+.45);
    q('omrPhotoMinus').onclick=()=>setPhotoZoom(state.photoZoom-.45);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closePhotoDetail();});
    q('omrAutoToggle').onclick=()=>{
      state.autoScanEnabled=!state.autoScanEnabled;
      state.autoScanStable=0;state.autoScanLastCorners=null;
      q('omrAutoToggle').textContent='Tự động: '+(state.autoScanEnabled?'Bật':'Tắt');
      updateAutoHud(state.autoScanEnabled?'Đưa trọn phiếu vào khung':'Chế độ thủ công',false);
      if(state.autoScanEnabled&&state.stream)startAutoScanLoop();
      else if(!state.autoScanEnabled)stopAutoScanLoop();
    };
    q('omrEngineReleaseSelect').onchange=()=>{
      const chosen=q('omrEngineReleaseSelect').value;
      if(state.saving||state.evidenceCommittedSubmissionId){q('omrEngineReleaseSelect').value=state.officialEngine;showWarning('Hãy hoàn tất lưu điểm và minh chứng trước khi đổi thuật toán.');return;}
      if(!['v7','v7_068'].includes(chosen)){q('omrEngineReleaseSelect').value=state.officialEngine;return;}
      if(chosen===state.officialEngine)return;
      closeCamera();resetScan();state.officialEngine=chosen;
      q('omrSbd').readOnly=chosen==='v7_068';q('omrMaDe').readOnly=chosen==='v7_068';
      rememberOmr({clearDraft:true});
      q('omrRoomSummary').textContent+=(chosen==='v7_068'?' • Đã chọn 068':' • Đã chọn V7')+'; quét phiếu mới.';
    };
    q('omrRecheck').onclick=reviewCurrent;
    const evidenceFileStem=()=>{
      if(!state.evidenceData)return '';
      return Naming.stem({...state.evidenceData.record,
        exam_code:state.evidenceData.preview.variant.code,
        student_code:state.evidenceData.preview.student.ma_hs,
        student_name:state.evidenceData.preview.student.ho_ten,
        class_name:state.evidenceData.preview.student.lop});
    };
    q('omrEvidencePdf').onclick=async()=>{
      const btn=q('omrEvidencePdf');
      if(!state.evidenceData||!EvidencePrint||btn.disabled)return;
      btn.disabled=true;
      try{
        const pdf=await EvidencePrint.pdfFromCanvas(q('omrEvidenceCanvas'));
        EvidenceClient.downloadBlob(new Blob([pdf],{type:'application/pdf'}),
          evidenceFileStem()+'.pdf');
      }catch(err){
        q('omrEvidenceStatus').textContent='Không tạo được PDF: '+(err?.message||err);
      }finally{btn.disabled=false;}
    };
    q('omrEvidenceHistory').onclick=showEvidenceArchive;
    // A keyboard-accessible reader can expand the optional tools when needed.
    q('omrEvidenceToolsDetails').addEventListener('toggle',()=>{
      if(q('omrEvidenceToolsDetails').open&&state.evidenceData)
        q('omrEvidenceStatus').setAttribute('aria-live','polite');
    });
    q('omrEvidenceExport').onclick=exportEvidenceRoom;
    q('omrEvidenceRetry').onclick=()=>saveTestEvidence(true);
    q('omrNext').onclick=()=>{
      resetScan();
      if(!root.DamSanTeacherNav?.resumeCamera?.())openCamera({navigation:'replace'});
    };
    q('omrEvidenceQueueRetry').onclick=()=>{
      if(!precisionEvidenceQueue)return;
      const btn=q('omrEvidenceQueueRetry');
      btn.disabled=true;
      void precisionEvidenceQueue.drain()
        .catch(err=>showWarning('Tải minh chứng lỗi: '+(err.message||err)))
        .finally(()=>{btn.disabled=false;});
    };
    q('omrSave').onclick=saveCurrent;
    if(typeof window!=='undefined')window.addEventListener('online',()=>{
      if(precisionEvidenceQueue)void precisionEvidenceQueue.drain().catch(()=>{});
    });
    q('omrReviewUncertain').onchange=reviewCurrent;
    const gradeInputs=['omrSbd','omrMaDe','omrStudent','omrP1',
      'omrP2_1','omrP2_2','omrP2_3','omrP2_4',
      'omrP3_1','omrP3_2','omrP3_3','omrP3_4','omrP3_5','omrP3_6'];
    let gradeDebounce=null;
    for(const id of gradeInputs){
      q(id).addEventListener('change',()=>{
        if(gradeDebounce)clearTimeout(gradeDebounce);
        reviewCurrent();
      });
      if(id==='omrStudent')continue;
      q(id).addEventListener('input',()=>{
        if(gradeDebounce)clearTimeout(gradeDebounce);
        gradeDebounce=setTimeout(reviewCurrent,300);
      });
    }
  }

  async function open(){
    ensureUi();
    const saved=readOmrReload();
    const v7Available=hasV7Comparison();
    const draft=saved?.draft;
    // Never restore a V5/V6 or comparison scan into an official V7 session.
    const resumeDraft=!!(v7Available
      &&typeof draft?.photo==='string'
      &&draft.photo.startsWith('data:image/jpeg;base64,')
      &&draft.scan?.ok===true
      &&draft.roomId===saved.roomId
      &&saved.engine==='v7'&&saved.compare===false
      &&draft.engine==='v7'&&draft.compare===false
      &&draft.scan.recognitionEngine==='V7'
      &&draft.scan.captureMode==='v7'
      &&draft.scan._labReadOnly===false
      &&draft.scan._requiresRetake===false);
    state.restoring=true;
    state.officialEngine=saved?.engine==='v7_068'?'v7_068':'v7';
    state.labEnabled=false;
    q('omrEngineReleaseSelect').value=state.officialEngine;
    q('omrSbd').readOnly=state.officialEngine==='v7_068';q('omrMaDe').readOnly=state.officialEngine==='v7_068';
    const v7Status=q('omrV7LoadStatus');
    v7Status.style.display=v7Available?'none':'block';
    v7Status.textContent=v7Available?''
      :'Không tải được đầy đủ thuật toán V7. Hãy đóng và mở lại PWA. Chấm điểm tạm khóa; không tự chuyển sang V5/V6.';
    q('omrOpenCamera').disabled=!v7Available;
    q('omrPickFile').disabled=!v7Available;
    q('omrTeacherOverlay').classList.add('show');
    q('omrRoomSelect').innerHTML='<option value="">Đang tải phòng...</option>';
    try{
      const rooms=(await rpcLayDanhSachPhongThi()).map(normalizeRoom);
      state.rooms=rooms;
      q('omrRoomSelect').innerHTML='<option value="">— Chọn phòng thi —</option>'+rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.MaPhong)}${r.DoiTuong&&r.DoiTuong!=='TatCa'?' — '+esc(r.DoiTuong):''}</option>`).join('');
      const chosen=rooms.find(r=>String(r.id)===String(saved?.roomId||''))?.id||(rooms.length===1?rooms[0].id:null);
      if(chosen){
        q('omrRoomSelect').value=chosen;
        await loadRoom(chosen);
        if(resumeDraft&&state.roomModel?.valid1846){
          const restored=await restoreOmrDraft(draft);
          if(!restored)q('omrRoomSummary').textContent+=' • Phiếu trước đó không khôi phục được, cần quét lại.';
        }
      }
    }catch(e){q('omrRoomSummary').textContent='Không tải được danh sách phòng: '+e.message;}
    finally{state.restoring=false;rememberOmr({clearDraft:!resumeDraft});}
  }
  function close(){closePhotoDetail();closeCamera();q('omrTeacherOverlay')?.classList.remove('show');}
  function isOpen(){return !!q('omrTeacherOverlay')?.classList.contains('show');}
  async function restoreNavigationStage(stage){
    if(!isOpen())await open();
    if(stage==='photo'){
      closeCamera();
      if(state.lastScan)openPhotoDetail({navigation:'none'});
      else closePhotoDetail();
    }else if(stage==='result'){
      closePhotoDetail();closeCamera();
      if(state.lastScan)q('omrScanArea').style.display='block';
    }else if(stage==='camera'){
      closePhotoDetail();
      await openCamera({navigation:'none'});
    }else{
      closePhotoDetail();closeCamera();resetScan();
    }
  }
  async function loadRoom(id){
    resetScan();
    state.roomModel=null;
    if(!id){q('omrRoomSummary').textContent='Chọn phòng để bắt đầu.';return;}
    const room=state.rooms.find(r=>String(r.id)===String(id)); if(!room)return;
    q('omrRoomSummary').textContent='Đang tải đề và danh sách học sinh...';
    try{
      state.roomModel=await B.loadReadOnlyContext({room,staffRpc:staffRpc,loadStudents});
      if(!state.roomModel.valid1846){
        q('omrRoomSummary').textContent='Phòng này không có cấu trúc 18–4–6 hợp lệ. Không thể chấm bằng phiếu chuẩn.';
        return;
      }
      fillStudentSelect();
      q('omrRoomSummary').textContent=`${state.roomModel.students.length} học sinh • ${state.roomModel.codes.length} mã đề: ${state.roomModel.codes.join(', ')}`;
      updateProgress();
      if(isPrecisionRoom()){
        try{
          const queue=getPrecisionEvidenceQueue();
          await queue.publish();
          void queue.drain().catch(err=>console.warn('OMR queue recovery:',err?.message||err));
        }catch(err){console.warn('OMR queue unavailable:',err?.message||err);}
      }
      if(!state.restoring)rememberOmr({clearDraft:true});
    }catch(e){q('omrRoomSummary').textContent='Không tải được phòng: '+e.message;}
  }
  function fillStudentSelect(selected){
    if(!state.roomModel)return;
    q('omrStudent').innerHTML='<option value="">— Chưa xác định —</option>'+state.roomModel.students.map(s=>`<option value="${esc(s.id)}">${esc(s.ma_hs)} — ${esc(s.ho_ten)} (${esc(s.lop)})</option>`).join('');
    if(selected)q('omrStudent').value=selected;
  }

  function updateAutoHud(text,ready=false){
    const hud=q('omrAutoHud'),guide=q('omrAutoGuide');
    if(hud)hud.textContent=text;
    if(guide)guide.classList.toggle('ready',!!ready);
  }
  function stopAutoScanLoop(){
    if(state.autoScanTimer){clearInterval(state.autoScanTimer);state.autoScanTimer=null;}
    state.autoScanStable=0;state.autoScanLastCorners=null;state.autoScanBusy=false;
  }
  function cornerMotion(a,b,scale){
    if(!a||!b||a.length!==b.length)return Infinity;
    let sum=0;
    for(let i=0;i<a.length;i++)sum+=Math.hypot(a[i][0]-b[i][0],a[i][1]-b[i][1]);
    return sum/a.length/Math.max(1,scale);
  }
  function startAutoScanLoop(){
    stopAutoScanLoop();
    const probe=document.createElement('canvas'),pctx=probe.getContext('2d',{willReadFrequently:true});
    state.autoScanTimer=setInterval(()=>{
      if(!state.autoScanEnabled||state.autoScanBusy||!state.stream)return;
      const v=q('omrTeacherVideo');
      if(!v?.videoWidth||!v?.videoHeight)return;
      try{
        const max=720,s=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
        probe.width=Math.max(1,Math.round(v.videoWidth*s));probe.height=Math.max(1,Math.round(v.videoHeight*s));
        pctx.drawImage(v,0,0,probe.width,probe.height);
        const img=pctx.getImageData(0,0,probe.width,probe.height);
        const gray=O.grayscale(img.data,probe.width,probe.height);
        if(precisionCapture&&evidenceRoomCode()===PRECISION_TEST_ROOM_CODE){
          const assessment=root.DamSanOmrPrecisionCapture.evaluate(gray,probe.width,probe.height,T.template,O);
          if(!assessment.ready){
            state.autoScanStable=0;state.autoScanLastCorners=null;
            const reason=(assessment.reasons||[assessment.reason])[0];
            const messages={
              four_corners_missing:'Cần đủ 4 mốc vuông đen',
              invalid_quad:'Phiếu nghiêng hoặc thiếu góc',
              internal_controls_unverified:'Chưa khớp mốc nội bộ của mẫu phiếu',
              illumination:'Ánh sáng chưa phù hợp',
              blur_or_low_texture:'Ảnh chưa đủ nét — giữ điện thoại ổn định'
            };
            updateAutoHud(messages[reason]||'Đang xác minh phiếu',false);
            return;
          }
          const motion=cornerMotion(assessment.corners,state.autoScanLastCorners,Math.min(probe.width,probe.height));
          state.autoScanLastCorners=assessment.corners.map(p=>p.slice());
          state.autoScanStable=motion<0.014?state.autoScanStable+1:1;
          const need=2;
          updateAutoHud('Precision Capture • '+assessment.internalMatches+' mốc nội bộ • giữ yên '+Math.min(state.autoScanStable,need)+'/'+need,true);
          if(state.autoScanStable>=need){
            state.autoScanBusy=true;
            updateAutoHud('Ảnh đủ chất lượng — đang nhận dạng…',true);
            capture('auto');
          }
          return;
        }
        if(state.officialEngine==='v7_068'){
          const reg=root.DamSanOmrV7Geometry066.register(gray,probe.width,probe.height,T.template,O);
          if(!reg.ok){state.autoScanStable=0;state.autoScanLastCorners=null;updateAutoHud('068: đưa đủ phiếu và mốc vào khung',false);return;}
          const motion=cornerMotion(reg.corners,state.autoScanLastCorners,Math.min(probe.width,probe.height));
          state.autoScanLastCorners=reg.corners.map(p=>p.slice());
          state.autoScanStable=motion<0.014?state.autoScanStable+1:1;
          updateAutoHud('068 • '+reg.internalMatches+' mốc nội bộ • giữ yên '+Math.min(state.autoScanStable,2)+'/2',true);
          if(state.autoScanStable>=2){state.autoScanBusy=true;capture('auto');}
          return;
        }
        const markers=O.detectCornerMarkers(gray,probe.width,probe.height);
        if(!markers.ok){
          state.autoScanStable=0;state.autoScanLastCorners=null;
          updateAutoHud('Đưa trọn phiếu và 4 mốc góc vào khung',false);
          return;
        }
        const geometry=O.fastTemplateRegistration(T.template,markers,probe.width,probe.height);
        if(!geometry.ok){
          state.autoScanStable=0;state.autoScanLastCorners=markers.corners;
          updateAutoHud('Đang căn phiếu — giữ đủ 4 góc',false);
          return;
        }
        const motion=cornerMotion(markers.corners,state.autoScanLastCorners,Math.min(probe.width,probe.height));
        state.autoScanLastCorners=markers.corners.map(p=>p.slice());
        state.autoScanStable=motion<0.018?state.autoScanStable+1:1;
        const need=2;
        updateAutoHud('Đã bắt 4 mốc ngoài • giữ yên '+Math.min(state.autoScanStable,need)+'/'+need,true);
        if(state.autoScanStable>=need){
          state.autoScanBusy=true;
          updateAutoHud('Đang tự chụp và nhận dạng…',true);
          setTimeout(()=>capture('auto'),80);
        }
      }catch(e){
        state.autoScanStable=0;state.autoScanLastCorners=null;
        updateAutoHud('Không nhận được phiếu — thử giữ thẳng hơn',false);
      }
    },240);
  }
  async function openCamera({navigation='push'}={}){
    if(!state.roomModel?.valid1846){alert('Hãy chọn phòng 18–4–6 hợp lệ trước.');return false;}
    closeCamera();
    const request=state.cameraRequestSerial;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:state.facing},width:{ideal:1920},height:{ideal:1080}},audio:false});
      if(request!==state.cameraRequestSerial||!isOpen()){
        stream.getTracks().forEach(t=>t.stop());
        return false;
      }
      state.stream=stream;
      const v=q('omrTeacherVideo');
      v.srcObject=stream;q('omrTeacherVideoWrap').classList.add('show');
      q('omrAutoToggle').textContent='Tự động: '+(state.autoScanEnabled?'Bật':'Tắt');
      updateAutoHud(state.autoScanEnabled?'Đưa trọn phiếu vào khung':'Chế độ thủ công',false);
      try{await v.play();}catch(_){}
      if(request!==state.cameraRequestSerial)return false;
      if(state.autoScanEnabled)startAutoScanLoop();
      if(navigation!=='none')root.DamSanTeacherNav?.enterOmrStage?.('camera',{replace:navigation==='replace'});
      return true;
    }catch(e){alert('Không mở được camera: '+e.message);return false;}
  }
  function closeCamera(){
    ++state.cameraRequestSerial;
    stopAutoScanLoop();
    if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
    q('omrTeacherVideoWrap')?.classList.remove('show');
  }

  function capture(mode='manual'){
    const v=q('omrTeacherVideo');if(!state.stream||!v.videoWidth)return;
    state.lastCaptureMode=mode;
    const c=q('omrTeacherCanvas'),ctx=c.getContext('2d',{willReadFrequently:true}),max=2200,s=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
    c.width=Math.round(v.videoWidth*s);c.height=Math.round(v.videoHeight*s);ctx.drawImage(v,0,0,c.width,c.height);closeCamera();analyzeCanvas();
  }
  function loadImageFile(file){
    if(!state.roomModel?.valid1846){alert('Hãy chọn phòng 18–4–6 hợp lệ trước.');return;}
    state.lastCaptureMode='file';
    const requestedMode=state.officialEngine,requestedRoom=state.roomModel.room.id;
    const img=new Image();img.onload=()=>{
      if(requestedMode!==state.officialEngine||requestedRoom!==state.roomModel?.room?.id||!isOpen()){URL.revokeObjectURL(img.src);return;}
      const c=q('omrTeacherCanvas'),ctx=c.getContext('2d',{willReadFrequently:true}),max=state.officialEngine==='v7_068'?2200:1800,s=Math.min(1,max/Math.max(img.width,img.height));
      c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);ctx.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);analyzeCanvas();
    };img.src=URL.createObjectURL(file);
  }
  // The source image is only cropped AFTER OMR analysis has used the full
  // camera frame. Marker coordinates are in that original image pixel space.
  function photoCropBounds(corners,width,height){
    if(!Array.isArray(corners)||corners.length!==4||width<1||height<1)return null;
    if(corners.some(p=>!Array.isArray(p)||p.length<2||!p.every(Number.isFinite)))return null;
    const xx=corners.map(p=>p[0]),yy=corners.map(p=>p[1]);
    const minX=Math.min(...xx),maxX=Math.max(...xx),minY=Math.min(...yy),maxY=Math.max(...yy);
    const spanX=maxX-minX,spanY=maxY-minY;
    if(spanX<width*.22||spanY<height*.22)return null;
    const area=Math.abs(corners.reduce((s,p,i)=>{
      const q=corners[(i+1)%corners.length];return s+p[0]*q[1]-q[0]*p[1];
    },0))*.5;
    if(area<width*height*.07)return null;
    // The outer printed markers sit about 3% inside each paper edge.
    const padX=Math.max(6,spanX*.055),padY=Math.max(6,spanY*.045);
    const x=Math.max(0,Math.floor(minX-padX)),y=Math.max(0,Math.floor(minY-padY));
    const right=Math.min(width,Math.ceil(maxX+padX)),bottom=Math.min(height,Math.ceil(maxY+padY));
    return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
  }
  function renderReviewPhoto(canvas,corners){
    const bounds=photoCropBounds(corners,canvas.width,canvas.height);
    if(!bounds)return false;
    const cropped=document.createElement('canvas');
    cropped.width=bounds.width;cropped.height=bounds.height;
    const croppedCtx=cropped.getContext('2d');
    if(!croppedCtx)return false;
    croppedCtx.drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
    canvas.width=bounds.width;canvas.height=bounds.height;
    canvas.getContext('2d').drawImage(cropped,0,0);
    return true;
  }
  function setPhotoZoom(value){
    state.photoZoom=Math.max(1,Math.min(3.2,value));
    const c=q('omrPhotoZoomCanvas');
    if(c)c.style.width=Math.round(state.photoZoom*100)+'%';
  }
  function openPhotoDetail({navigation='push',fromEvidence=false}={}){
    const src=fromEvidence&&state.evidenceData?q('omrEvidenceCanvas'):
      q('omrTeacherCanvas'),viewer=q('omrPhotoLightbox');
    if(!src?.width||!src?.height||!viewer)return;
    const zoom=q('omrPhotoZoomCanvas');
    zoom.width=src.width;zoom.height=src.height;
    zoom.getContext('2d').drawImage(src,0,0);
    viewer.classList.add('show');
    setPhotoZoom(1.65);
    const pan=q('omrPhotoPan');if(pan){pan.scrollLeft=0;pan.scrollTop=0;}
    if(navigation!=='none')root.DamSanTeacherNav?.enterOmrStage?.('photo');
  }
  function closePhotoDetail(){
    q('omrPhotoLightbox')?.classList.remove('show');
    const zoom=q('omrPhotoZoomCanvas');
    if(zoom){zoom.width=0;zoom.height=0;}
  }
  function analyzeCanvas(){
    const c=q('omrTeacherCanvas'),ctx=c.getContext('2d',{willReadFrequently:true});
    state.lastScan=null;state.lastPreview=null;
    state.evidenceCtx=null;state.evidenceData=null;
    if(q('omrEvidenceCard'))q('omrEvidenceCard').style.display='none';
    if(q('omrTechnicalDetails'))q('omrTechnicalDetails').open=true;
    if(state.evidenceTimer)clearTimeout(state.evidenceTimer);
    q('omrSave').disabled=true;
    try{
      q('omrReviewUncertain').checked=false;
      const pixels=ctx.getImageData(0,0,c.width,c.height);
       const mode=state.officialEngine;
       if(!['v7','v7_068'].includes(mode))throw Error('Thuật toán chưa được chọn hợp lệ');
       const v5=mode==='v7'?O.analyzeImageData(pixels,T.template):{ok:true};
      let scan=v5;
      if(!v5.ok){
        q('omrScanArea').style.display='block';
        const detail=v5.markerMatches!==undefined?` (${v5.markerMatches} mốc khớp)`:'';
        showWarning((v5.error||'Không đọc được phiếu')+detail);
        if(state.lastCaptureMode==='auto')setTimeout(()=>openCamera({navigation:'none'}).catch(()=>{}),700);
        return;
      }
      state.lastV6=null;
      if(mode==='v7_068'){
        try{
          const release=R068.recognize(pixels,T.template,O,V7,state.roomModel);
          scan=release.scan;
          const {rect,candidate}=release;
          state.evidenceCtx={rect,candidate,original:null,scanId:crypto.randomUUID(),revision:0,signature:null};
          const panel=q('omrV7OverlayPanel');
          if(panel&&root.DamSanOmrV7Overlay?.draw){
            try{
              const image=root.DamSanOmrV7Overlay.draw(q('omrV7OverlayCanvas'),rect,T.template,candidate);
              panel.style.display='block';
              q('omrV7OverlayStatus').textContent='068 • Cần kiểm tra: '+image.counts.review+' • Nhiều dấu: '+image.counts.multiple;
            }catch(err){console.warn('068 overlay:',err);panel.style.display='none';}
          }
        }catch(e){
          q('omrScanArea').style.display='block';
          showWarning('068: '+(e?.message||String(e))+'. Không lưu phiếu này. Có thể chọn V7 rồi quét lại.');
          return;
        }
      }else if(mode!=='v5'){
        const begun=performance.now();
        try{
          if(!E)throw Error('Thiếu mô-đun chuẩn hóa kết quả V7');
          const gray=O.grayscale(pixels.data,pixels.width,pixels.height);
          const rect=O.warpTemplateGray(gray,pixels.width,pixels.height,
            v5.homography,T.template,1800);
          if(mode==='compare'&&hasV7Comparison()){
            // One V5 four-corner homography and ONE rectified image for both
            // independent engines. Never reuse V6 marks as V7 answers.
            const info={candidate:null,candidateV7:null,
              elapsedMs:null,v7ElapsedMs:null,error:'',v7Error:''};
            state.lastV6=info;
            try{
              const t6=performance.now();
              info.candidate=root.DamSanOmrReliabilityV6.analyzeRectified(rect,T.template);
              info.elapsedMs=Math.round(performance.now()-t6);
              // Only the display scan is normalized. _labReadOnly is set below
              // and write-level checks also reject every comparison capture.
              scan=E.fromV6(v5,info.candidate);
            }catch(err){info.error='V6: '+(err?.message||String(err));}
            try{
              const t7=performance.now();
              // A/B experiment is ALWAYS read-only; expose the full
              // V7 candidate here, never in the save-enabled V7 path.
              info.candidateV7=V7.analyzeValidatedRectified(
                rect,T.template,root.DamSanOmrReliabilityV6,
                {experimentalRefinement:true});
              info.v7ElapsedMs=Math.round(performance.now()-t7);
              if(!info.candidateV7.ok)
                info.v7Error=(info.candidateV7.retakeReasons||[]).join('; ')||
                  'V7 yêu cầu kiểm tra lại ảnh';
              // Show the same rectified pixels used for V6/V7 decisions.
              // The overlay never changes a score or enables saving.
              const overlayPanel=q('omrV7OverlayPanel');
              if(overlayPanel&&root.DamSanOmrV7Overlay?.draw){
                try{
                  const image=root.DamSanOmrV7Overlay.draw(
                    q('omrV7OverlayCanvas'),rect,T.template,info.candidateV7);
                  overlayPanel.style.display='block';
                  q('omrV7OverlayStatus').textContent=
                    'Dấu nhận một ô: '+image.counts.single+
                    ' • Cần xem lại: '+image.counts.review+
                    ' • Nhiều dấu: '+image.counts.multiple+
                    ' • Mốc nội bộ: '+image.controls.length+
                    ' (chỉ quan sát, không lưu điểm)';
                }catch(e){console.warn('V7 overlay:',e);}
              }
            }catch(err){info.v7Error='V7: '+(err?.message||String(err));}
          }else if(mode==='v7'){
            if(!V7?.analyzeValidatedRectified||!E.fromV7)
              throw Error('Thiếu thuật toán V7 trên PWA');
            // Official writer uses the same refined candidate tested in comparison.
            const candidate=V7.analyzeValidatedRectified(
              rect,T.template,null,{experimentalRefinement:true});
            scan=E.fromV7(v5,candidate);
            if(Evidence){
              state.evidenceCtx={rect,candidate,original:null,scanId:crypto.randomUUID(),
                revision:0,signature:null};
            }
            if(root.DamSanOmrV7Overlay?.draw){
              try{
                const panel=q('omrV7OverlayPanel');
                panel.style.display='block';
                const image=root.DamSanOmrV7Overlay.draw(
                  q('omrV7OverlayCanvas'),rect,T.template,candidate);
                panel.style.display='block';
                q('omrV7OverlayStatus').textContent=
                  'Dấu nhận một ô: '+image.counts.single+
                  ' • Cần xem lại: '+image.counts.review+
                  ' • Nhiều dấu: '+image.counts.multiple+
                  ' • Mốc nội bộ: '+image.controls.length;
              }catch(err){
                q('omrV7OverlayStatus').textContent='Không hiển thị được bản đồ V7: '+(err?.message||'lỗi vẽ');
                console.warn('V7 overlay:',err);
              }
            }
            const roomCode=String(state.roomModel?.room?.MaPhong||
              state.roomModel?.room?.ma_phong||'').trim();
            if(roomCode==='OMR_V7_TEST'){
              // Research evidence is collected ONLY in the explicitly
              // designated test room and only after teacher confirmation.
              // The same rectified image is used; no image upload, new RPC,
              // new database table, or extra UI step is introduced.
              const evidence={schema:1,room:'OMR_V7_TEST',
                v7:{p1:candidate.p1,p2:[...candidate.p2],p3:[...candidate.p3],
                  warningCount:candidate.issues.length,
                  invalidMarks:[...candidate.invalidMarks]},
                v7Ms:Math.round(performance.now()-begun),
                v6:null,v6Ms:null,comparison:null,v6Error:null};
              try{
                const t6=performance.now();
                const baseline=root.DamSanOmrReliabilityV6.analyzeRectified(
                  rect,T.template);
                evidence.v6Ms=Math.round(performance.now()-t6);
                evidence.v6={p1:baseline.p1,p2:[...baseline.p2],
                  p3:[...baseline.p3],
                  warningCount:(baseline.issues||[]).length,
                  invalidMarks:[...(baseline.invalidMarks||[])]};
                const difference=V7.compare(baseline,candidate);
                evidence.comparison={count:difference.count,
                  differences:difference.differences};
              }catch(err){
                // V6 reference failure is recorded as diagnostic evidence.
                // It must not change V7 grading or bypass any V7 safety gate.
                evidence.v6Error=String(err?.message||err).slice(0,180);
              }
              scan.omrV7TestEvidence=evidence;
            }
          }else{
            const candidate=root.DamSanOmrReliabilityV6.analyzeRectified(rect,T.template);
            state.lastV6={candidate,elapsedMs:Math.round(performance.now()-begun)};
            if(mode==='v6')scan=E.fromV6(v5,candidate);
          }
        }catch(e){
          if(mode==='compare'){
            state.lastV6={error:'Không đối chiếu được: '+(e?.message||String(e))};
          }else{
            q('omrScanArea').style.display='block';
            showWarning('Không xử lý được bằng '+expectedEngineLabel(mode)+': '+
              (e?.message||String(e))+'. Hãy quét lại ảnh đạt yêu cầu; không lưu từ ảnh này.');
            return;
          }
        }
      }
      scan.templateId=T.template.id;
      scan._labReadOnly=mode==='compare';
      scan.captureMode=mode;
      if(mode==='v5'||(mode==='compare'&&!hasV7Comparison()))
        scan.recognitionEngine='V5';
      state.lastScan=scan;
      if(state.evidenceCtx){
        state.evidenceCtx.original={p1:scan.p1,p2:[...(scan.p2||[])],
          p3:[...(scan.p3||[])]};
      }
      // Presentation only: crop around validated four-corner markers after
      // recognition. Never send the cropped image back to the OMR engine.
      let cropped=false;
      try{cropped=renderReviewPhoto(c,scan.markerCorners);}catch(e){console.warn('OMR preview crop:',e);}
      q('omrPhotoHint').textContent=cropped?'Phiếu đã phóng vừa khung theo 4 mốc góc • Chạm để xem lớn':'Ảnh gốc • Chạm để xem lớn';
      q('omrScanArea').style.display='block';
      q('omrEngineResult').textContent=mode==='compare'
        ?'ĐỐI CHIẾU '+(hasV7Comparison()?'V6/V7':'V5/V6')+' – chỉ xem, không lưu điểm'
        :'Đang chấm bằng '+expectedEngineLabel(mode);
      q('omrSbd').value=scan.sbd;
      q('omrMaDe').value=scan.maDe;
      q('omrP1').value=scan.p1;
      scan.p2.forEach((v,i)=>q('omrP2_'+(i+1)).value=v);
      scan.p3.forEach((v,i)=>q('omrP3_'+(i+1)).value=v);
      const sr=B.resolveStudent(scan.sbd,state.roomModel.studentIndex);
      fillStudentSelect(sr.status==='matched'?sr.student.id:null);
      if(scan.uncertain.length) showScanWarnings(scan);
      else {clearWarningHighlights();hideWarning();}
      reviewCurrent();
      showV6Comparison();
      rememberOmr({withPhoto:true});
      root.DamSanTeacherNav?.enterOmrStage?.('result');
    }catch(e){showWarning('Lỗi đọc ảnh: '+e.message);}
  }

  // Comparison never mutates the V5 scan or the canonical answer key.
  function compareV5V6(v5,v6){
    const diffs=[];
    for(let i=0;i<18;i++){
      const old=v5.p1?.[i]||'?',now=v6.p1?.[i]||'?';
      if(old!==now)diffs.push({key:'P1.'+(i+1),old,now});
    }
    const a=(v5.p2||[]).flatMap(row=>row.split('-'));
    const b=(v6.p2||[]).flatMap(row=>row.split('-'));
    for(let i=0;i<16;i++){
      const old=a[i]||'?',now=b[i]||'?';
      if(old!==now)diffs.push({key:'P2.'+(Math.floor(i/4)+1)+'abcd'[i%4],old,now});
    }
    if(Array.isArray(v5.p3)&&Array.isArray(v6.p3)){
      for(let i=0;i<6;i++){
        const old=v5.p3[i]??'?',now=v6.p3[i]??'?';
        if(old!==now)diffs.push({key:'P3.'+(i+1),old,now});
      }
    }
    return diffs;
  }

  // Read-only comparison in the EXISTING PWA OMR result panel. This function
  // does not perform any RPC, storage write or mutation of the answer key.
  function showV7Comparison(){
    const panel=q('omrV6Comparison'),scan=state.lastScan;
    if(!panel)return;
    panel.style.display=scan?._labReadOnly?'block':'none';
    if(!scan?._labReadOnly)return;
    const data=state.lastV6||{},v6=data.candidate,v7=data.candidateV7;
    const summary=q('omrV6Summary'),scores=q('omrV6Scores'),diffs=q('omrV6Diffs');
    const failures=[data.error,data.v7Error].filter(Boolean);
    const changes=(v6&&v7)?compareV5V6(v6,v7):[];
    const counts=[v6?.issues?.length??'—',v7?.issues?.length??'—'];
    summary.textContent=changes.length+' vị trí khác nhau ở Phần I/II/III. '+
      'Thời gian đọc: V6 '+(data.elapsedMs??'—')+' ms, V7 '+
      (data.v7ElapsedMs??'—')+' ms (không gồm căn phiếu). '+
      'Cảnh báo: V6 '+counts[0]+', V7 '+counts[1]+'.';
    const lines=changes.map(item=>item.key+': V6='+item.old+' | V7='+item.now);
    if(!changes.length&&v6&&v7)lines.push('Không có khác biệt đáp án trên ảnh này.');
    for(const [name,candidate] of [['V6',v6],['V7',v7]])
      if(candidate?.issues?.length)
        lines.push(name+' cần kiểm tra: '+candidate.issues.map(item=>
          item.key+(item.state==='multiple'?' (tô nhiều ô)':
            item.reason?' ('+item.reason+')':'')).join('; '));
    if(failures.length)lines.push('Điều kiện ảnh/mốc: '+failures.join('; '));
    if(!v6)lines.push('Không đọc được V6 trên ảnh này.');
    if(!v7)lines.push('Không đọc được V7 trên ảnh này.');
    diffs.textContent=lines.join('\n');
    // Scoring remains possible for V7 when ONLY the V6 P3 calibration
    // failed. Bind the ORIGINAL scanned SBD/exam code against the loaded
    // room; never depend on reviewCurrent()/lastPreview (which V6 may block).
    // The lab flag stays set and the submission RPC still rejects this scan.
    if(!LabScore?.estimate){
      scores.textContent='Không tải được mô-đun điểm đối chiếu; đóng và mở lại PWA.';
      return;
    }
    const v6Estimate=LabScore.estimate(scan,v6,state.roomModel,B,S,E);
    const v7Estimate=LabScore.estimate(scan,v7,state.roomModel,B,S,E);
    const display=(out,name)=>out.ok
      ?String(out.score)+(out.requiresReview?' (còn '+out.warningCount+
        ' vị trí cần kiểm tra)':'')+(name==='V7'?' [thử nghiệm]':'')
      :'chưa tính được ('+out.reason+')';
    scores.textContent='Điểm dự kiến: V6 '+display(v6Estimate,'V6')+
      ' • V7 '+display(v7Estimate,'V7')+
      ' (chỉ so sánh, không ghi điểm).';
  }
  function showV6Comparison(){
    if(hasV7Comparison()){showV7Comparison();return;}
    const panel=q('omrV6Comparison'),scan=state.lastScan;
    if(!panel)return;
    panel.style.display=scan?._labReadOnly?'block':'none';
    if(!scan?._labReadOnly)return;
    const data=state.lastV6||{},v6=data.candidate;
    const summary=q('omrV6Summary'),scores=q('omrV6Scores'),diffs=q('omrV6Diffs');
    scores.textContent='';
    if(!v6){
      summary.textContent=data.error||'Chưa có kết quả V6';
      diffs.textContent='V5 vẫn hiển thị bình thường. Không thể lưu điểm khi thử nghiệm.';
      return;
    }
    const changes=compareV5V6(scan,v6),geometry=v6.geometry||{};
    summary.textContent=changes.length+' câu/ý khác nhau (P1/P2/P3) • V6 thêm '+
      data.elapsedMs+' ms • Mốc nội vùng: '+(geometry.status||'không rõ')+
      ' ('+(geometry.matched||0)+'/'+(geometry.total||0)+').';
    diffs.textContent=changes.length
      ?changes.map(d=>d.key+': V5='+d.old+', V6='+d.now).join('\n')
      :'Không có khác biệt Phần I/II/III trên ảnh này.';
    if(v6.issues?.length)diffs.textContent+='\nV6 cảnh báo: '+v6.issues
      .map(x=>x.key+' ('+x.reason+')').join('; ');
    if(!state.lastPreview?.ok){
      scores.textContent='Chưa có học sinh/mã đề hợp lệ để so điểm.';
      return;
    }
    try{
      // P3 answers now come from the independent V6 P3 decoder.
      // Student identity and exam code still come from the V5 camera scan.
      const alt={...scan,p1:v6.p1,p2:v6.p2,p3:v6.p3,
        invalidMarks:v6.invalidMarks,
        uncertain:(v6.issues||[]).map(x=>x.key)};
      const binding={ok:true,room:state.lastPreview.room,
        student:state.lastPreview.student,variant:state.lastPreview.variant};
      const estimate=S.previewScan(alt,binding,{allowUncertain:true});
      scores.textContent=estimate.ok
        ?'V5: '+formatScore(state.lastPreview.grade.score)+
          ' điểm • V6: '+formatScore(estimate.grade.score)+' điểm (V6 nhận dạng độc lập Phần III)'
        :'V6 chưa thể tính điểm dự kiến.';
    }catch(e){scores.textContent='Không so được điểm: '+(e.message||'lỗi');}
  }
  function scanFromForm(){
    return {
      ...(state.lastScan||{}),
      templateId:T.template.id,
      sbd:q('omrSbd').value.trim(),
      maDe:q('omrMaDe').value.trim(),
      p1:q('omrP1').value.trim().toUpperCase(),
      p2:[1,2,3,4].map(i=>q('omrP2_'+i).value.trim().toUpperCase()),
      p3:[1,2,3,4,5,6].map(i=>q('omrP3_'+i).value.trim()),
      uncertain:[...(state.lastScan?.uncertain||[])],
      uncertainDetails:[...(state.lastScan?.uncertainDetails||[])],
      invalidMarks:[...(state.lastScan?.invalidMarks||[])]
    };
  }
  function selectedStudent(){return state.roomModel?.students.find(s=>String(s.id)===String(q('omrStudent').value));}
  function reviewCurrent(){
    // Never show the previous student's evidence when a changed identity or
    // exam code temporarily fails validation.
    if(state.evidenceTimer){clearTimeout(state.evidenceTimer);state.evidenceTimer=null;}
    if(q('omrEvidenceCard'))q('omrEvidenceCard').style.display='none';
    q('omrSave').disabled=true;
    q('omrSave').hidden=!!state.lastScan?._labReadOnly;
    q('omrGradeCard').style.display='none';state.lastPreview=null;
    if(!state.roomModel||!state.lastScan)return;
    if(state.lastScan._requiresRetake){
      q('omrReviewUncertainWrap').style.display='none';
      showWarning(expectedEngineLabel(state.officialEngine)+' chưa đủ điều kiện nhận dạng: '+
        state.lastScan._retakeReason+'. Quét lại phiếu này; không thể lưu khi nhận dạng chưa tin cậy.');
      return;
    }
    if(!['v7','v7_068'].includes(state.officialEngine)||state.lastScan.recognitionEngine!==expectedEngineLabel(state.officialEngine)||
      state.lastScan.captureMode!==state.officialEngine||state.lastScan._labReadOnly!==false){
      showWarning('Kết quả không thuộc thuật toán đang chọn. Hãy quét lại phiếu.');return;
    }
    if(state.officialEngine==='v7_068'){
      const bound=state.lastScan.release068;
      if(!bound||bound.version!=='068'||bound.roomId!==String(state.roomModel.room.id)||
        q('omrSbd').value.trim()!==bound.sbd||q('omrMaDe').value.trim()!==bound.bubbleExamCode){
        showWarning('068: thông tin phiếu hoặc phòng thi đã thay đổi. Hãy quét lại.');return;
      }
    }
    const scan=S.enforceInvalidMarks(scanFromForm()),vr=B.resolveVariant(scan.maDe,state.roomModel.variants);
    if(scan.invalidMarks.length){
      if(q('omrP1').value!==scan.p1)q('omrP1').value=scan.p1;
      scan.p2.forEach((v,i)=>{const f=q('omrP2_'+(i+1));if(f.value!==v)f.value=v;});
    }
    if(vr.status!=='matched'){showWarning('Mã đề không tồn tại trong phòng.');return;}
    const sr=B.resolveStudent(scan.sbd,state.roomModel.studentIndex);
    if(sr.status==='invalid_format'){showWarning('SBD trên phiếu phải đủ đúng 8 chữ số.');return;}
    if(sr.status==='invalid_prefix'){showWarning('SBD phiếu phải theo quy ước 00 + mã học sinh 6 số. Hai số đầu phải là 00.');return;}
    if(sr.status==='not_found'){showWarning('Không tìm thấy mã học sinh '+(sr.studentCode||'')+' trong phòng đã chọn.');return;}
    if(sr.status==='ambiguous'){showWarning('Mã học sinh bị trùng trong danh sách phòng. Không thể tự chấm.');return;}
    const st=sr.student;
    if(state.officialEngine==='v7_068'&&(String(st.id)!==state.lastScan.release068.studentId||String(vr.variant.code)!==state.lastScan.release068.examCode)){showWarning('068: học sinh/mã đề không khớp kết quả nhận dạng đã xác minh. Quét lại.');return;}
    fillStudentSelect(st.id);
    const manualSelected=selectedStudent();
    if(!manualSelected || String(manualSelected.id)!==String(st.id)){
      showWarning('SBD không khớp học sinh đang chọn. Hệ thống đã trả về đúng học sinh theo SBD.');
      fillStudentSelect(st.id);
    }
    const binding={ok:true,room:state.roomModel.room,student:st,variant:vr.variant,scan};
    let preview;
    try{preview=S.previewScan(scan,binding,{allowUncertain:true});}catch(e){showWarning('Không thể chấm thử: '+e.message);return;}
    if(!preview.ok){
      showWarning('Chưa thể chấm: '+preview.coverage.errors.join('; '));
      return;
    }
    const hasUncertain=(scan.uncertain||[]).length>0;
    const reviewed=hasUncertain && q('omrReviewUncertain').checked;
    preview.reviewedUncertain=reviewed;
    q('omrReviewUncertainWrap').style.display=hasUncertain?'block':'none';
    if(hasUncertain&&q('omrReviewDetails'))q('omrReviewDetails').open=true;
    state.lastPreview=preview;
    scheduleEvidence();
    q('omrStudentName').textContent=`${st.ma_hs} — ${st.ho_ten} (${st.lop})`;
    q('omrGradeCode').textContent=vr.variant.code;
    q('omrScore').textContent=formatScore(preview.grade.score);
    q('omrGradeEngine').textContent=scan.recognitionEngine||'V5';
    q('omrPartScores').textContent=`P1: ${formatScore(preview.grade.parts.p1)} • P2: ${formatScore(preview.grade.parts.p2)} • P3: ${formatScore(preview.grade.parts.p3)}`;
    q('omrGradeCard').style.display='block';
    if(scan.uncertain.length) showScanWarnings(scan);
    else {clearWarningHighlights();hideWarning();}
    q('omrSave').disabled=(hasUncertain && !reviewed)||!!state.lastScan?._labReadOnly||!!state.lastScan?._requiresRetake;
    if(state.lastScan?._labReadOnly)showV6Comparison();
    // Keep edits of an unsaved answer in the current browsing session only.
    if(state.lastScan?.ok&&!state.restoring){
      const snapshot=readOmrReload();
      if(snapshot?.draft){
        const ids=['omrSbd','omrMaDe','omrP1',
          ...[1,2,3,4].map(i=>'omrP2_'+i),...[1,2,3,4,5,6].map(i=>'omrP3_'+i)];
        snapshot.draft.values=Object.fromEntries(ids.map(id=>[id,q(id).value]));
        snapshot.at=Date.now();
        try{sessionStorage.setItem(OMR_RESTORE_KEY,JSON.stringify(snapshot));}catch(_){}
      }
    }
  }

  function isPrecisionRoom(){
    return evidenceRoomCode()===PRECISION_TEST_ROOM_CODE;
  }
  function getPrecisionEvidenceQueue(){
    if(!EvidenceQueue||!EvidenceClient?.prepare||!EvidenceClient?.sendPrepared)
      throw Error('precision_queue_module_missing');
    if(!precisionEvidenceQueue){
      precisionEvidenceQueue=EvidenceQueue.create({
        getOwner:omrOwner,
        getToken:()=>sessionStorage.getItem('damSan_StaffToken'),
        send:(token,body)=>EvidenceClient.sendPrepared(sb,token,body),
        onChange:jobs=>{
          state.precisionEvidenceQueueJobs=jobs;
          updateProgress();
        }
      });
    }
    return precisionEvidenceQueue;
  }
  function evidenceRoomCode(){
    return String(state.roomModel?.room?.MaPhong||
      state.roomModel?.room?.ma_phong||'').trim();
  }
  function scheduleEvidence(){
    if(state.evidenceTimer)clearTimeout(state.evidenceTimer);
    // Render an in-memory preview in every V7 room; persisted evidence is written
    // once AFTER the canonical score commit, with a verified submission ID.
    if(!Evidence||!state.evidenceCtx||!state.lastPreview?.ok)return;
    state.evidenceTimer=setTimeout(renderEvidence,420);
  }
  function renderEvidence(){
    const ctx=state.evidenceCtx,preview=state.lastPreview;
    if(!ctx||!preview?.ok||!Evidence)return;
    try{
      const confirmed=JSON.stringify([preview.scan.p1,preview.scan.p2,
        preview.scan.p3,preview.variant.code,preview.student.id,
        state.evidenceCommittedSubmissionId||'draft']);
      if(ctx.signature===confirmed){
        if(state.evidenceData)q('omrEvidenceCard').style.display='block';
        return;
      }
      ctx.signature=confirmed;ctx.revision++;
      const trial=evidenceRoomCode()==='OMR_V7_TEST';
      const meta={studentName:preview.student.ho_ten,studentCode:preview.student.ma_hs,
        roomName:preview.room?.ten_dot||preview.room?.TenDot||'',
        status:trial?'test':(state.evidenceCommittedSubmissionId?'official':'preview'),
        timestamp:new Date().toISOString(),
        scanId:ctx.scanId,revision:ctx.revision,mode:trial?'test':'official'};
      const result=Evidence.compose(q('omrEvidenceCanvas'),ctx.rect,T.template,
        preview,ctx.original,meta);
      const record=Evidence.record(preview,ctx.original,result.report,meta);
      if(isPrecisionRoom()&&Array.isArray(ctx.candidate?.p3Evidence)){
        // Record only uncertain P3 ink/eraser signals for later validation.
        // Diagnostic metadata NEVER changes the decoded answers or score.
        const items=[];
        ctx.candidate.p3Evidence.forEach((question,qi)=>{
          (question?.columns||[]).forEach((c,ci)=>{
            if(c?.state!=='review'&&c?.state!=='multiple')return;
            items.push({key:'P3.'+(qi+1)+'.'+(ci+1),reason:c.reason,
              top:c.top??null,second:c.second??null,margin:c.margin??null,
              relative:c.relative??null,topFill:c.topFill??null,
              secondFill:c.secondFill??null});
          });
        });
        record.eraser_diagnostic_v1={capture:'precision_059',
          calibration:{markReference:ctx.candidate.p3Calibration?.markReference??null,
            background:ctx.candidate.p3Calibration?.background??null,
            markGate:ctx.candidate.p3Calibration?.markGate??null,
            separationGate:ctx.candidate.p3Calibration?.separationGate??null},
          uncertain:items};
      }
      const source=q('omrTeacherCanvas');
      const capture=document.createElement('canvas');
      const scale=Math.min(1,1900/Math.max(source.width,source.height));
      capture.width=Math.max(1,Math.round(source.width*scale));
      capture.height=Math.max(1,Math.round(source.height*scale));
      capture.getContext('2d').drawImage(source,0,0,capture.width,capture.height);
      state.evidenceData={record,preview,result,capture,signature:confirmed};
      q('omrEvidenceCard').style.display='block';
      if(q('omrTechnicalDetails'))q('omrTechnicalDetails').open=false;
      if(q('omrEvidenceHistory'))q('omrEvidenceHistory').style.display='';
      if(q('omrEvidenceExport'))q('omrEvidenceExport').style.display='';
      q('omrEvidenceStatus').textContent='Đã tạo ảnh minh chứng • '+
        result.report.summary.manual+' vị trí GV sửa'+
        ' • chỉ lưu một phiếu cuối cùng sau khi bấm Xác nhận & Lưu';
      q('omrEvidenceRetry').style.display='none';
      // NEVER upload a preview or an intermediate correction to Storage.
      // Only saveCurrent(), after a successful canonical score write, can
      // persist the final annotated sheet for this student.
    }catch(e){
      q('omrEvidenceStatus').textContent='Không tạo được ảnh minh chứng: '+(e.message||e);
    }
  }
  async function saveTestEvidence(force){
    const info=state.evidenceData;
    if(!info||!EvidenceClient)return {status:'skipped'};
    if(!force&&state.evidenceSave===info.signature)return {status:'success',idempotent:true};
    if(info.signature!==state.evidenceData?.signature)return {status:'stale'};
    try{
      const result=await EvidenceClient.save(sb,
        sessionStorage.getItem('damSan_StaffToken'),{
          scanId:info.record.scan_id,revision:info.record.revision,
          submissionId:state.evidenceCommittedSubmissionId,
          preview:info.preview,original:state.evidenceCtx?.original,
          report:info.record,canvas:q('omrEvidenceCanvas'),
          capture:info.capture,
          mode:evidenceRoomCode()==='OMR_V7_TEST'?'test':'official'});
      state.evidenceSave=info.signature;
      if(state.evidenceData?.signature===info.signature)
        q('omrEvidenceStatus').textContent='Phiếu cuối cùng đã lưu an toàn • mã '+result.artifact_id;
      return {status:'success',artifact_id:result.artifact_id};
    }catch(err){
      if(state.evidenceData?.signature===info.signature){
        q('omrEvidenceStatus').textContent='Ảnh minh chứng đã tạo; chưa lưu lên Storage ('+(err.message||err)+'). Có thể tải về hoặc thử lại.';
        q('omrEvidenceRetry').style.display='inline-block';
      }
      return {status:'error',message:err?.message||String(err)};
    }
  }
  async function showEvidenceArchive(){
    const panel=q('omrEvidenceArchiveList');
    panel.style.display='block';
    panel.textContent='Đang đọc danh sách minh chứng OMR của phòng...';
    try{
      const token=sessionStorage.getItem('damSan_StaffToken');
      const list=await EvidenceClient.list(sb,token,state.roomModel.room.id);
      if(!list.length){panel.textContent='Chưa có minh chứng đã lưu.';return;}
      panel.textContent='';
      for(const item of list.slice(0,100)){
        const row=document.createElement('div'),btn=document.createElement('button');
        btn.type='button';btn.className='omr-light';
        btn.textContent=(item.student_code||'Chưa rõ SBD')+' — '+(item.student_name||'Chưa xác định')+
          ' • Mã đề '+(item.exam_code||'?')+' • '+formatScore(item.preview_score)+
          ' • '+new Date(item.created_at).toLocaleString('vi-VN');
        btn.onclick=async()=>{
          btn.disabled=true;
          try{
            const signed=await EvidenceClient.signed(sb,token,item.id);
            const a=document.createElement('a');
            a.href=signed.url;a.target='_blank';a.rel='noopener noreferrer';
            a.textContent='Mở phiếu đã đánh dấu';row.appendChild(a);
          }catch(e){row.append(' Không mở được: '+(e.message||e));}
          finally{btn.disabled=false;}
        };
        row.appendChild(btn);panel.appendChild(row);
      }
    }catch(e){panel.textContent='Không đọc được minh chứng: '+(e.message||e);}
  }
  async function exportEvidenceRoom(){
    const status=q('omrEvidenceStatus'),btn=q('omrEvidenceExport'),link=q('omrEvidenceReady');
    if(!EvidenceExport||!EvidenceClient||!state.roomModel?.room?.id){
      status.textContent='Chưa thể xuất minh chứng OMR: chưa chọn phòng hoặc thiếu mô-đun.';return;
    }
    if(btn.disabled)return;
    btn.disabled=true;btn.setAttribute('aria-busy','true');
    btn.textContent='Đang tạo Excel + phiếu PDF...';
    EvidenceClient.clearPreparedDownload(link);
    status.textContent='Đang đọc danh sách minh chứng của phòng...';
    try{
      const token=sessionStorage.getItem('damSan_StaffToken'),roomId=state.roomModel.room.id;
      const entries=await EvidenceClient.list(sb,token,roomId);
      if(!entries.length)throw Error('Phòng chưa có minh chứng đã lưu');
      if(state.evidenceExportRoom!==roomId){
        state.evidenceExportRoom=roomId;state.evidenceExportNext=0;
      }
      const start=state.evidenceExportNext>=entries.length?0:state.evidenceExportNext;
      const slice=entries.slice(start,start+20);
      const output=await EvidenceExport.exportBatch(slice,EvidenceClient,sb,token,{
        part:Math.floor(start/20)+1,download:false,
        status:message=>{status.textContent=message;}
      });
      const prepared=EvidenceClient.prepareDownload(output.archive,output.filename,link);
      state.evidenceExportNext=start+slice.length;
      const left=entries.length-state.evidenceExportNext;
      status.textContent='Đã chuẩn bị '+output.records+' phiếu ('+
        (prepared.bytes/1024/1024).toFixed(2)+' MB). Excel nằm trong ZIP. '+
        'Nếu điện thoại chưa tải tự động, chạm nút xanh “Tải tệp” bên dưới.'+
        (left>0?' Còn '+left+' phiếu chưa xuất.':'');
      btn.textContent=left>0?'Tạo ZIP tiếp ('+left+' phiếu)':'Xuất Excel + ZIP';
      // Best effort for desktop browsers. The visible anchor is the reliable
      // mobile fallback and preserves a real user gesture on the second tap.
      try{link.click();}catch(_){/* manual anchor stays available */}
      link.scrollIntoView?.({block:'center',behavior:'smooth'});
    }catch(e){
      status.textContent='Xuất Excel + ZIP chưa thành công: '+(e?.message||String(e))+
        '. Chưa thay đổi điểm hoặc ảnh đã lưu.';
      status.scrollIntoView?.({block:'center',behavior:'smooth'});
    }finally{
      btn.disabled=false;btn.removeAttribute('aria-busy');
      if(btn.textContent==='Đang tạo Excel + ZIP...')btn.textContent='Xuất Excel + ZIP';
    }
  }
  async function saveCurrent(){
    if(state.saving)return;
    if(state.labEnabled||state.lastScan?._labReadOnly){
      showWarning('Đang đối chiếu '+(hasV7Comparison()?'V6/V7':'V5/V6')+
        ': không lưu điểm. Hãy bỏ đối chiếu và quét lại.');
      return;
    }
    if(state.lastScan?._requiresRetake){
      showWarning(expectedEngineLabel(state.officialEngine)+' cần quét lại: '+state.lastScan._retakeReason);return;
    }
    if(!state.lastPreview)return;
    // Revalidate text fields before the irreversible submission step.
    reviewCurrent();
    if(!state.lastPreview)return;
    const expectedEngine=expectedEngineLabel(state.officialEngine);
    if(state.lastScan?.recognitionEngine!==expectedEngine||
       state.lastPreview.scan?.recognitionEngine!==expectedEngine||
       state.lastScan?.captureMode!==state.officialEngine||
       state.lastPreview.scan?.captureMode!==state.officialEngine){
      showWarning('Đã thay đổi thuật toán chấm; cần quét lại để bảo đảm kết quả.');return;
    }
    const st=state.lastPreview.student;
    if(state.saved.has(String(st.id))){showWarning('Học sinh này đã được lưu trong phiên chấm hiện tại.');return;}
    if(!isPrecisionRoom()&&!confirm(`Lưu điểm ${formatScore(state.lastPreview.grade.score)} cho ${st.ho_ten} — mã đề ${state.lastPreview.variant.code}?`))return;
    const btn=q('omrSave'),old=btn.textContent;state.saving=true;q('omrEngineReleaseSelect').disabled=true;btn.disabled=true;btn.textContent='Đang lưu...';
    try{
      const data=await W.submitConfirmed(state.lastPreview,staffRpc);
      if(data.status==='conflict'){showWarning(data.message||'Học sinh đã có bài/điểm. Không ghi đè.');return;}
      if(data.status!=='success') throw new Error(data.message||'Không lưu được kết quả.');
      state.saved.add(String(st.id));updateProgress();
      q('omrGradeCard').classList.add('omr-ok');
      // Every V7 room now persists the FINAL artifact after the canonical
      // score commit; the submission ID binds OFFICIAL evidence to its receipt.
      // Keep the current scan for an explicit retry if Storage is unavailable.
      state.evidenceCommittedSubmissionId=data.submission_id||null;
      if(state.evidenceTimer){clearTimeout(state.evidenceTimer);state.evidenceTimer=null;}
      renderEvidence();
      if(isPrecisionRoom()){
        // Score is already committed. Encode the final two immutable photos
        // once and DURABLY enqueue them before releasing the camera.
        // The upload continues in the background; never send a second score.
        try{
          if(!data.submission_id||!state.evidenceData)throw Error('evidence_snapshot_missing');
          const info=state.evidenceData;
          const payload=EvidenceClient.prepare({
            scanId:info.record.scan_id,revision:info.record.revision,
            submissionId:data.submission_id,preview:info.preview,
            original:state.evidenceCtx?.original,report:info.record,
            canvas:q('omrEvidenceCanvas'),capture:info.capture,
            mode:'official'
          });
          const queue=getPrecisionEvidenceQueue();
          await queue.add({submissionId:data.submission_id,roomId:info.preview.room.id,payload});
          void queue.drain().catch(err=>console.warn('OMR evidence queue:',err?.message||err));
        }catch(err){
          q('omrEvidenceRetry').style.display='inline-block';
          showWarning('Điểm của '+st.ho_ten+' đã lưu, nhưng chưa xếp hàng ảnh an toàn: '+
            (err?.message||err)+'. Bấm Lưu lại minh chứng; KHÔNG quét lại học sinh này.');
          return;
        }
        resetScan();
        if(!root.DamSanTeacherNav?.resumeCamera?.())await openCamera({navigation:'replace'});
        return;
      }
      const savedEvidence=await saveTestEvidence(true);
      if(savedEvidence?.status!=='success'){
        showWarning('Điểm của '+st.ho_ten+' đã lưu thành công ('+
          formatScore(data.score)+'). Ảnh phiếu chưa lưu; nhấn Lưu lại minh chứng. KHÔNG quét lại học sinh này và không đóng màn hình.');
        return;
      }
      alert(`Đã lưu: ${st.ho_ten} — ${formatScore(data.score)} điểm.`);
      resetScan();
      if(!root.DamSanTeacherNav?.resumeCamera?.())await openCamera({navigation:'replace'});
    }catch(e){showWarning('Lưu thất bại: '+e.message);}
    finally{state.saving=false;q('omrEngineReleaseSelect').disabled=false;btn.textContent=old;btn.disabled=!state.lastPreview;}
  }
  function updateProgress(){
    const total=state.roomModel?.students.length||0;
    const pending=state.precisionEvidenceQueueJobs||[];
    const failed=pending.filter(job=>job.error).length;
    const retry=q('omrEvidenceQueueRetry');
    if(retry)retry.style.display=isPrecisionRoom()&&pending.length?'inline-block':'none';
    q('omrProgress').textContent=`${state.saved.size} phiếu đã lưu trong phiên${total?' / '+total+' học sinh':''}`+
      (isPrecisionRoom()?(pending.length?' • '+pending.length+' ảnh minh chứng chờ tải'+
        (failed?' ('+failed+' cần thử lại)':''):' • Minh chứng đã đồng bộ'):'');
  }
  function resetScan(){
    closePhotoDetail();
    state.lastScan=null;state.lastPreview=null;state.lastV6=null;
    state.evidenceCtx=null;state.evidenceData=null;state.evidenceSave=null;
    state.evidenceCommittedSubmissionId=null;
    if(state.evidenceTimer){clearTimeout(state.evidenceTimer);state.evidenceTimer=null;}
    if(q('omrEvidenceCard'))q('omrEvidenceCard').style.display='none';
    if(q('omrTechnicalDetails'))q('omrTechnicalDetails').open=true;
    if(q('omrReviewDetails'))q('omrReviewDetails').open=false;
    if(q('omrEvidenceToolsDetails'))q('omrEvidenceToolsDetails').open=false;
    if(q('omrEvidenceArchiveList'))q('omrEvidenceArchiveList').style.display='none';
    if(q('omrV7OverlayPanel'))q('omrV7OverlayPanel').style.display='none';
    if(q('omrV6Comparison'))q('omrV6Comparison').style.display='none';
    if(q('omrEngineResult'))q('omrEngineResult').textContent='';
    if(q('omrSave'))q('omrSave').hidden=false;
    if(q('omrScanArea'))q('omrScanArea').style.display='none';
    if(q('omrGradeCard'))q('omrGradeCard').style.display='none';
    if(q('omrSave'))q('omrSave').disabled=true;
    if(q('omrReviewUncertain'))q('omrReviewUncertain').checked=false;
    if(q('omrReviewUncertainWrap'))q('omrReviewUncertainWrap').style.display='none';
    if(!state.restoring)clearOmrDraft();
    clearWarningHighlights();hideWarning();
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function warningFieldId(key){
    if(/^P1\./.test(key))return 'omrP1';
    const p2=key.match(/^P2\.(\d)/);if(p2)return 'omrP2_'+p2[1];
    const p3=key.match(/^P3\.(\d)/);if(p3)return 'omrP3_'+p3[1];
    if(/^SBD\./.test(key))return 'omrSbd';
    if(/^MADE\./.test(key))return 'omrMaDe';
    return null;
  }
  function clearWarningHighlights(){
    document.querySelectorAll('#omrTeacherOverlay .omr-alert-field').forEach(el=>el.classList.remove('omr-alert-field'));
  }
  function showScanWarnings(scan){
    const el=q('omrWarning');if(!el)return;
    clearWarningHighlights();
    const details=Array.isArray(scan?.uncertainDetails)&&scan.uncertainDetails.length
      ? scan.uncertainDetails
      : (scan?.uncertain||[]).map(key=>({key,label:key,reason:'Cần kiểm tra lại vị trí này'}));
    details.forEach(d=>{
      const id=warningFieldId(d.key||'');const field=id?q(id):null;
      field?.parentElement?.classList.add('omr-alert-field');
    });
    el.style.display='block';
    const invalid=details.filter(d=>d.invalidMultiple).length;
    el.innerHTML='<b>Có '+details.length+' vị trí cần kiểm tra</b>'+
      (invalid?' — '+invalid+' câu/ý tô nhiều ô đã bị tính sai, không sửa bằng nhập tay.':'')+
      ':<ul class="omr-warning-list">'+
      details.map(d=>'<li><b>'+escapeHtml(d.label||d.key)+'</b>: '+escapeHtml(d.reason||'Cần kiểm tra lại')+'</li>').join('')+
      '</ul><div class="omr-muted" style="margin-top:8px">Các ô liên quan đã được đánh dấu màu vàng bên dưới.</div>';
  }
  function showWarning(msg){
    const el=q('omrWarning');if(!el)return;
    clearWarningHighlights();el.style.display='block';el.textContent=msg;
    if(!state.lastPreview&&state.lastScan&&q('omrReviewDetails'))
      q('omrReviewDetails').open=true;
  }
  function hideWarning(){const el=q('omrWarning');if(el){el.style.display='none';el.textContent='';}}

  root.DamSanOmrTeacher={open,close,isOpen,restoreNavigationStage,loadRoom,reviewCurrent,
    release:'068',persistForReload:()=>{if(isOpen())rememberOmr();},_state:state,_photoCropBounds:photoCropBounds,_renderReviewPhoto:renderReviewPhoto,_compareV5V6:compareV5V6};
})(window);
