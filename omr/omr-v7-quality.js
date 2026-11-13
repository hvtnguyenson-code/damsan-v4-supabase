(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DamSanOmrV7Quality=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function assess(rect){
 const g=rect?.gray,w=rect?.width,h=rect?.height;
 if(!g||w<16||h<16||g.length!==w*h)throw Error('V7_INVALID_FRAME');
 const step=Math.max(2,Math.floor(Math.min(w,h)/260));
 let lap=0,edges=0,clipped=0,dark=0,glare=0,mean=0,n=0;
 for(let y=2;y<h-2;y+=step)for(let x=2;x<w-2;x+=step){
  const i=y*w+x,v=g[i],d=Math.abs(4*v-g[i-1]-g[i+1]-g[i-w]-g[i+w]);
  lap+=d;edges+=d>32?1:0;clipped+=v>=252?1:0;dark+=v<26?1:0;mean+=v;n++;
  glare+=v>=252&&Math.abs(g[i-1]-v)<=2&&Math.abs(g[i+1]-v)<=2?1:0;
 }
 const focus=lap/n,edgeDensity=edges/n,clippedFraction=clipped/n,meanBrightness=mean/n;
 return {focus,edgeDensity,clippedFraction,flatGlareFraction:glare/n,darkFraction:dark/n,meanBrightness,
  warnings:[...(glare/n>.26&&clippedFraction>.36?['possible_glare']:[]),
   ...(meanBrightness<45?['underexposure']:[]),
   ...(focus<1.2&&edgeDensity<.001?['low_focus_or_texture']:[])],
  diagnosticOnly:true,changesAnswers:false};
}
function choose(frames){
 if(!Array.isArray(frames)||!frames.length)throw Error('V7_NO_FRAMES');
 const ranked=frames.map((f,i)=>{const q=assess(f);return {index:i,quality:q,
  rank:q.focus+15*q.edgeDensity-80*Math.max(0,q.clippedFraction-.3)-40*Math.max(0,q.darkFraction-.50)};})
  .sort((a,b)=>b.rank-a.rank);
 return {index:ranked[0].index,quality:ranked[0].quality,candidates:ranked,relativeOnly:true};
}
function inspectZones(rect,T){
 const g=rect.gray,w=rect.width,h=rect.height;
 const pts=[...T.p1.flat(),...T.p2.flat(),...T.p3.flat(2).filter(Boolean)];
 let white=0,total=0;
 for(const p of pts){const x=Math.round(p[0]*(w-1)/T.widthCm),
  y=Math.round(p[1]*(h-1)/T.heightCm);
  if(x<0||x>=w||y<0||y>=h)continue;
  total++;white+=g[y*w+x]>=252?1:0;}
 return {centersChecked:total,centersNearWhite:white,
  saturationRate:white/Math.max(1,total),diagnosticOnly:true};
}
return {assess,choose,inspectZones};
});