(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DamSanOmrV7Geometry=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function median(v){if(!v.length)return 0;const a=v.slice().sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;}
function fit(rect,T,inspection){
 const radius=Math.max(1,T.bubbleRadiusCm*((rect.width-1)/T.widthCm+(rect.height-1)/T.heightCm)/2);
 const model={reliable:false,regions:{},reason:'unverified_controls',radius,matched:0,rejected:0,diagnosticOnly:true};
 if(inspection?.status!=='ok'||!Array.isArray(inspection.markers))return model;
 for(const region of ['P1','P2','P3']){
  const points=inspection.markers.filter(m=>m.region===region&&Array.isArray(m.predicted)
   &&Array.isArray(m.observed)&&[...m.predicted,...m.observed].every(Number.isFinite)&&(m.solidity??1)>=.66)
   .map(m=>({x:m.predicted[0],y:m.predicted[1],
    dx:m.observed[0]-m.predicted[0],dy:m.observed[1]-m.predicted[1]}));
  const mx=median(points.map(m=>m.dx)),my=median(points.map(m=>m.dy));
  const trim=points.filter(m=>Math.hypot(m.dx-mx,m.dy-my)<.27*radius
   &&Math.hypot(m.dx,m.dy)<.68*radius);
  const spread=trim.length?Math.max(...trim.map(m=>Math.hypot(m.dx-mx,m.dy-my))):Infinity;
  const reliable=trim.length>=3&&spread<=.27*radius&&Math.hypot(mx,my)<.65*radius;
  const x= reliable?median(trim.map(m=>m.dx)):0;
  const y= reliable?median(trim.map(m=>m.dy)):0;
  model.regions[region]={reliable,dx:x,dy:y,
   matched:trim.length,rejected:points.length-trim.length,
   spreadR:Number.isFinite(spread)?spread/radius:null,
   anchors:reliable?trim.map(m=>({...m})):[]};
  model.matched+=trim.length;model.rejected+=points.length-trim.length;
 }
 model.reliable=['P1','P2','P3'].every(k=>model.regions[k].reliable);
 model.reason=model.reliable?'':'unstable_local_geometry';
 return model;
}
function offset(model,region,rect,T){
 const q=model?.regions?.[region];if(!q?.reliable)return {dx:0,dy:0,reliable:false};
 return {dx:q.dx*T.widthCm/(rect.width-1),
  dy:q.dy*T.heightCm/(rect.height-1),reliable:true};
}
// Local correction from the NEAREST VERIFIED internal markers, not a new
// whole-image warp. Bad/isolated markers are already rejected by fit().
// Fail closed if the local correction disagrees with its region consensus.
function offsetAt(model,region,point,rect,T){
 const q=model?.regions?.[region];
 if(!q?.reliable||!point||point.length!==2||!point.every(Number.isFinite)
   ||!Array.isArray(q.anchors)||q.anchors.length<3)
  return {dx:0,dy:0,reliable:false,source:'unverified_local_markers'};
 const x=point[0]*(rect.width-1)/T.widthCm;
 const y=point[1]*(rect.height-1)/T.heightCm;
 const nearest=q.anchors.map(m=>({m,d:Math.hypot(x-m.x,y-m.y)}))
   .sort((a,b)=>a.d-b.d).slice(0,4);
 if(nearest.length<3)return {dx:0,dy:0,reliable:false,source:'too_few_markers'};
 let sum=0,dx=0,dy=0;
 for(const {m,d} of nearest){
  const weight=1/Math.max(model.radius*1.5,d);
  dx+=m.dx*weight;dy+=m.dy*weight;sum+=weight;
 }
 dx/=sum;dy/=sum;
 const jitter=Math.hypot(dx-q.dx,dy-q.dy);
 const magnitude=Math.hypot(dx,dy);
 const stable=Number.isFinite(jitter)&&Number.isFinite(magnitude)
  &&jitter<=.24*model.radius&&magnitude<=.65*model.radius;
 if(!stable)return {dx:0,dy:0,reliable:false,
  source:'local_disagreement',jitterR:jitter/model.radius};
 return {dx:dx*T.widthCm/(rect.width-1),
  dy:dy*T.heightCm/(rect.height-1),
  reliable:true,source:'local_verified_controls',markersUsed:nearest.length,
  jitterR:jitter/model.radius,offsetR:magnitude/model.radius};
}
return {median,fit,offset,offsetAt};
});
