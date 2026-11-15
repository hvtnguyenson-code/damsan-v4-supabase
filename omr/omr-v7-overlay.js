(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DamSanOmrV7Overlay=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Research-only image annotation. It NEVER writes back to recognition data,
// changes a bubble choice, or submits results. "Single" means detected mark,
// not verified correct answer.
function features(T,candidate){
 const elements=[];
 function point(pt,section,key,status){
  if(Array.isArray(pt)&&pt.length===2&&pt.every(Number.isFinite))
   elements.push({pt,section,key,status});
 }
 for(let i=0;i<T.p1.length;i++){
  const e=candidate.p1Evidence?.[i]||{};
  if(e.state==='single'&&Number.isInteger(e.index))
   point(T.p1[i][e.index],'P1','P1.'+(i+1),'single');
  else if(e.state==='review'||e.state==='multiple')
   for(const p of T.p1[i])point(p,'P1','P1.'+(i+1),e.state);
 }
 for(let i=0;i<T.p2.length;i++){
  const e=candidate.p2Evidence?.[i]||{};
  const key='P2.'+(Math.floor(i/4)+1)+'abcd'[i%4];
  if(e.state==='single'&&Number.isInteger(e.index))
   point(T.p2[i][e.index],'P2',key,'single');
  else if(e.state==='review'||e.state==='multiple')
   for(const p of T.p2[i])point(p,'P2',key,e.state);
 }
 for(let i=0;i<T.p3.length;i++)for(let j=0;j<4;j++){
  const col=candidate.p3Evidence?.[i]?.columns?.[j]||{};
  const key='P3.'+(i+1)+'.'+(j+1);
  if(col.state==='single'&&Number.isInteger(col.index)){
   point(T.p3[i][j][col.index],'P3',key,'single');
  }else if(col.state==='review'||col.state==='multiple'){
   const p=T.p3[i][j].find(Boolean);
   point(p,'P3',key,col.state);
  }
 }
 const markers=T.markers?.filter(m=>!['TL','TR','BR','BL'].includes(m.name))||[];
 const detected=candidate.geometry?.markers||[];
 const controls=markers.map(m=>{
  const observed=detected.find(x=>x.name===m.name);
  return {name:m.name,pt:[m.x,m.y],region:m.name.startsWith('P1')?'P1':
   m.name.startsWith('P2')?'P2':m.name.startsWith('P3')?'P3':'ID',
   observed:observed?.observed||null,
   residualR:Number.isFinite(observed?.residualR)?observed.residualR:null};
 });
 const counts={single:0,review:0,multiple:0};
 const groups={single:new Set(),review:new Set(),multiple:new Set()};
 for(const e of elements)groups[e.status].add(e.key);
 for(const k of Object.keys(counts))counts[k]=groups[k].size;
 return {elements,controls,counts,diagnosticOnly:true,changesAnswers:false};
}
function draw(canvas,rect,T,candidate){
 if(!canvas?.getContext||!rect?.gray||!T||!candidate)throw Error('V7_OVERLAY_INVALID_INPUT');
 const w=Math.min(820,rect.width),h=Math.max(1,Math.round(w*rect.height/rect.width));
 const ctx=canvas.getContext('2d');if(!ctx?.createImageData)throw Error('V7_OVERLAY_NO_CANVAS');
 canvas.width=w;canvas.height=h;
 const img=ctx.createImageData(w,h),pix=img.data,g=rect.gray;
 for(let y=0;y<h;y++){
  const sy=Math.min(rect.height-1,Math.round(y*(rect.height-1)/Math.max(1,h-1)));
  for(let x=0;x<w;x++){
   const sx=Math.min(rect.width-1,Math.round(x*(rect.width-1)/Math.max(1,w-1)));
   const v=g[sy*rect.width+sx],i=(y*w+x)*4;
   pix[i]=v;pix[i+1]=v;pix[i+2]=v;pix[i+3]=255;
  }
 }
 ctx.putImageData(img,0,0);
 const annotations=features(T,candidate);
 const px=p=>[p[0]*(w-1)/T.widthCm,p[1]*(h-1)/T.heightCm];
 const radius=Math.max(2.2,T.bubbleRadiusCm*((w-1)/T.widthCm+(h-1)/T.heightCm)*.60);
 const colors={single:'#16a34a',review:'#eab308',multiple:'#dc2626'};
 for(const c of annotations.controls){
  const [x,y]=px(c.pt);
  ctx.strokeStyle='#0284c7';ctx.lineWidth=1.5;
  const s=Math.max(2.4,radius*.8);
  ctx.strokeRect(x-s,y-s,2*s,2*s);
  if(c.observed){
   const ox=c.observed[0]*(w-1)/(rect.width-1),
    oy=c.observed[1]*(h-1)/(rect.height-1);
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ox,oy);ctx.stroke();
   ctx.beginPath();ctx.arc(ox,oy,1.8,0,Math.PI*2);ctx.fillStyle='#0ea5e9';ctx.fill();
  }
 }
 for(const e of annotations.elements){
  const [x,y]=px(e.pt);
  ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);
  ctx.lineWidth=e.status==='single'?1.9:1.25;
  ctx.strokeStyle=colors[e.status];ctx.stroke();
 }
 return {...annotations,width:w,height:h,drawn:true};
}
return {features,draw};
});
