(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DamSanOmrV7Lighting=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const P=[[-1,0],[1,0],[0,-1],[0,1],[-.78,-.78],[.78,.78],[.78,-.78],[-.78,.78]];
function measure(rect,T,B,point){
 if(!point)return {score:0,fill:0,gradient:0,saturation:0};
 const {gray:g,width:w,height:h}=rect;
 const x=point[0]*(w-1)/T.widthCm,y=point[1]*(h-1)/T.heightCm;
 const r=Math.max(3,T.bubbleRadiusCm*((w-1)/T.widthCm+(h-1)/T.heightCm)/2),d=1.55*r;
 const probes=P.map(([xx,yy])=>B.samplePaper(g,w,h,x+xx*d,y+yy*d,r*.28)).sort((a,b)=>a-b);
 const paper=probes.slice(1,-1).reduce((a,b)=>a+b,0)/6;
 const gradient=(probes[6]-probes[1])/Math.max(64,paper);
 const core=.47*r,r2=core*core;
 let ink=0,fill=0,white=0,n=0;
 for(let yy=Math.max(0,Math.floor(y-core));yy<=Math.min(h-1,Math.ceil(y+core));yy++)
 for(let xx=Math.max(0,Math.floor(x-core));xx<=Math.min(w-1,Math.ceil(x+core));xx++){
  if((xx-x)**2+(yy-y)**2>r2)continue;
  const v=g[yy*w+xx],deficit=Math.max(0,(paper-v)/Math.max(64,paper));
  ink+=deficit;fill+=deficit>.12?1:0;white+=v>=252?1:0;n++;
 }
 return {score:.8*(ink/Math.max(n,1))+.1*(fill/Math.max(n,1)),
  fill:fill/Math.max(n,1),gradient,paper,saturation:white/Math.max(n,1)};
}
function inspect(rect,T,B,row,cal,labels,off={dx:0,dy:0}){
 const metrics=row.map(p=>measure(rect,T,B,p?[p[0]+off.dx,p[1]+off.dy]:null));
 const choice=B.classifyRow(metrics,cal,labels);
 return {choice,metrics,glare:metrics.some(m=>m.saturation>.35),
  diagnosticOnly:true};
}
return {measure,inspect};
});