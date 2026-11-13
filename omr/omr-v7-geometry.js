(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DamSanOmrV7Geometry=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function median(v){if(!v.length)return 0;const a=v.slice().sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;}
function fit(rect,T,inspection){
 const radius=Math.max(1,T.bubbleRadiusCm*((rect.width-1)/T.widthCm+(rect.height-1)/T.heightCm)/2);
 const model={reliable:false,regions:{},reason:'unverified_controls',radius,matched:0,rejected:0};
 if(inspection?.status!=='ok'||!Array.isArray(inspection.markers))return model;
 for(const region of ['P1','P2','P3']){
  const points=inspection.markers.filter(m=>m.region===region&&Array.isArray(m.predicted)
   &&Array.isArray(m.observed)&&[...m.predicted,...m.observed].every(Number.isFinite)&&(m.solidity??1)>=.66)
   .map(m=>({dx:m.observed[0]-m.predicted[0],dy:m.observed[1]-m.predicted[1]}));
  const mx=median(points.map(m=>m.dx)),my=median(points.map(m=>m.dy));
  const trim=points.filter(m=>Math.hypot(m.dx-mx,m.dy-my)<.27*radius
   &&Math.hypot(m.dx,m.dy)<.68*radius);
  const spread=trim.length?Math.max(...trim.map(m=>Math.hypot(m.dx-mx,m.dy-my))):Infinity;
  const reliable=trim.length>=3&&spread<=.27*radius&&Math.hypot(mx,my)<.65*radius;
  model.regions[region]={reliable,dx:reliable?median(trim.map(m=>m.dx)):0,
   dy:reliable?median(trim.map(m=>m.dy)):0,
   matched:trim.length,rejected:points.length-trim.length};
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
return {median,fit,offset};
});