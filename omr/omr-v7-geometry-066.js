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