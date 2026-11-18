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
