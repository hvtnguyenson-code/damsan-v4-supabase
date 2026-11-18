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
