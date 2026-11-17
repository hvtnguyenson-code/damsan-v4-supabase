(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DamSanOmrPrecisionCapture=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Diagnostic pre-capture gate: never edits bubble decisions or exam scores.
function quality(gray,w,h,polygon){
 if(!gray||w<32||h<32||gray.length!==w*h)return {ok:false,reason:'invalid_frame'};
 const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
 const x0=Math.max(2,Math.floor(Math.min(...xs))),x1=Math.min(w-3,Math.ceil(Math.max(...xs)));
 const y0=Math.max(2,Math.floor(Math.min(...ys))),y1=Math.min(h-3,Math.ceil(Math.max(...ys)));
 const step=Math.max(1,Math.round(Math.min(w,h)/340));
 let count=0,sum=0,sum2=0,lap=0,edge=0,black=0,white=0;
 for(let y=y0;y<=y1;y+=step)for(let x=x0;x<=x1;x+=step){
  const v=gray[y*w+x],l=Math.abs(4*v-gray[y*w+x-1]-gray[y*w+x+1]-gray[(y-1)*w+x]-gray[(y+1)*w+x]);
  count++;sum+=v;sum2+=v*v;lap+=l;edge+=l>32?1:0;black+=v<24?1:0;white+=v>251?1:0;
 }
 if(!count)return {ok:false,reason:'empty_roi'};
 const mean=sum/count,variance=Math.max(0,sum2/count-mean*mean);
 return {ok:true,mean,variance,focus:lap/count,edgeDensity:edge/count,darkFraction:black/count,whiteFraction:white/count,samples:count};
}
function evaluate(gray,w,h,T,core,opts={}){
 const markers=core.detectCornerMarkers(gray,w,h);
 if(!markers.ok)return {ready:false,stage:'corners',reason:'four_corners_missing',markers:markers.candidates?.length||0};
 const g=core.fastTemplateRegistration(T,markers,w,h);
 if(!g.ok)return {ready:false,stage:'geometry',reason:'invalid_quad',corners:markers.corners,geometry:g};
 const q=quality(gray,w,h,markers.corners);
 // Independent cross-check: projected internal marks, no homography mutation.
 const refs=(T.markers||[]).filter(m=>['TOP-C','MID-L','MID-C','MID-R','P3-B3'].includes(m.name));
 const diag=core.matchTemplateMarkers({...T,markers:refs},g.H,markers.candidates,w,h);
 const minDiag=opts.minDiag??2;
 const diagOk=diag.pairs.length>=minDiag&&diag.rmse<=Math.max(5,Math.min(w,h)*0.022);
 const lightOk=q.mean>=(opts.minBrightness??65)&&q.mean<=(opts.maxBrightness??245);
 const focusOk=q.focus>=(opts.minFocus??2.1)&&q.edgeDensity>=(opts.minEdgeDensity??0.005);
 const reasons=[];
 if(!diagOk)reasons.push('internal_controls_unverified');
 if(!lightOk)reasons.push('illumination');
 if(!focusOk)reasons.push('blur_or_low_texture');
 const score=(diag.pairs.length/Math.max(1,refs.length))*30+
  Math.min(1,q.focus/9)*30+Math.min(1,q.edgeDensity/.06)*20+
  Math.min(1,g.area/.45)*20;
 return {ready:reasons.length===0,stage:'pre_capture',reasons,score,geometry:g,quality:q,
  internalMatches:diag.pairs.length,internalRmse:diag.rmse,corners:markers.corners};
}
function chooseBest(frames){
 const accepted=frames.filter(f=>f&&f.result?.ready);
 if(!accepted.length)return {ready:false,reason:'no_qualified_frame'};
 const sorted=accepted.slice().sort((a,b)=>b.result.score-a.result.score);
 return {ready:true,frame:sorted[0],alternatives:accepted.length};
}
return {quality,evaluate,chooseBest};
});
