(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.DamSanOmr=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function grayscale(rgba,w,h){
    const out=new Uint8Array(w*h);
    for(let i=0,j=0;i<out.length;i++,j+=4) out[i]=(rgba[j]*77+rgba[j+1]*150+rgba[j+2]*29)>>8;
    return out;
  }

  function solveLinear(A,b){
    const n=b.length, M=A.map((r,i)=>r.slice().concat(b[i]));
    for(let c=0;c<n;c++){
      let p=c;
      for(let r=c+1;r<n;r++) if(Math.abs(M[r][c])>Math.abs(M[p][c])) p=r;
      if(Math.abs(M[p][c])<1e-10) throw new Error('Singular matrix');
      [M[c],M[p]]=[M[p],M[c]];
      const d=M[c][c]; for(let k=c;k<=n;k++) M[c][k]/=d;
      for(let r=0;r<n;r++) if(r!==c){ const f=M[r][c]; for(let k=c;k<=n;k++) M[r][k]-=f*M[c][k]; }
    }
    return M.map(r=>r[n]);
  }

  function homography4(src,dst){
    if(src.length!==4||dst.length!==4) throw new Error('homography4 requires four pairs');
    const A=[],b=[];
    for(let i=0;i<4;i++){
      const [x,y]=src[i], [u,v]=dst[i];
      A.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u);
      A.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v);
    }
    const h=solveLinear(A,b); return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
  }

  function project(H,x,y){
    const d=H[6]*x+H[7]*y+H[8];
    return [(H[0]*x+H[1]*y+H[2])/d,(H[3]*x+H[4]*y+H[5])/d];
  }

  function adaptiveBinary(gray,w,h,windowPx){
    const s=Math.max(7,windowPx|1), half=s>>1;
    const integral=new Uint32Array((w+1)*(h+1));
    for(let y=1;y<=h;y++){
      let row=0;
      for(let x=1;x<=w;x++){
        row+=gray[(y-1)*w+(x-1)];
        integral[y*(w+1)+x]=integral[(y-1)*(w+1)+x]+row;
      }
    }
    const out=new Uint8Array(w*h);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const x0=Math.max(0,x-half),x1=Math.min(w-1,x+half),y0=Math.max(0,y-half),y1=Math.min(h-1,y+half);
      const A=integral[y0*(w+1)+x0],B=integral[y0*(w+1)+x1+1],C=integral[(y1+1)*(w+1)+x0],D=integral[(y1+1)*(w+1)+x1+1];
      const mean=(D-B-C+A)/((x1-x0+1)*(y1-y0+1));
      out[y*w+x]=gray[y*w+x] < mean*0.72 ? 1 : 0;
    }
    return out;
  }

  function connectedComponents(bin,w,h){
    const seen=new Uint8Array(w*h), comps=[], stack=[];
    const dirs=[-1,1,-w,w];
    for(let i=0;i<bin.length;i++){
      if(!bin[i]||seen[i]) continue;
      let minX=w,maxX=0,minY=h,maxY=0,count=0,sumX=0,sumY=0;
      stack.push(i); seen[i]=1;
      while(stack.length){
        const q=stack.pop(), y=(q/w)|0, x=q-y*w;
        count++; sumX+=x; sumY+=y; if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
        for(const d of dirs){
          const n=q+d; if(n<0||n>=bin.length||seen[n]||!bin[n]) continue;
          const ny=(n/w)|0,nx=n-ny*w;
          if(Math.abs(nx-x)+Math.abs(ny-y)!==1) continue;
          seen[n]=1; stack.push(n);
        }
      }
      comps.push({count,minX,maxX,minY,maxY,width:maxX-minX+1,height:maxY-minY+1,cx:sumX/count,cy:sumY/count});
    }
    return comps;
  }

  function detectCornerMarkers(gray,w,h){
    const bin=adaptiveBinary(gray,w,h,Math.round(Math.min(w,h)/35));
    const minSide=Math.max(8,Math.min(w,h)*0.012), maxSide=Math.min(w,h)*0.09;
    const candidates=connectedComponents(bin,w,h).filter(c=>{
      const ratio=c.width/c.height, fill=c.count/(c.width*c.height);
      return c.width>=minSide&&c.height>=minSide&&c.width<=maxSide&&c.height<=maxSide&&ratio>0.72&&ratio<1.38&&fill>0.48;
    });
    if(candidates.length<4) return {ok:false,candidates,corners:null};
    const targets=[[0,0],[w,0],[w,h],[0,h]];
    const picked=targets.map(([tx,ty])=>candidates.reduce((best,c)=>{
      const d=(c.cx-tx)**2+(c.cy-ty)**2; return !best||d<best.d?{c,d}:best;
    },null).c);
    if(new Set(picked).size<4) return {ok:false,candidates,corners:null};
    return {ok:true,candidates,corners:picked.map(c=>[c.cx,c.cy])};
  }

  function estimateTemplateHomography(template,cornersPx){
    const m=template.markers;
    const src=[[m[0].x,m[0].y],[m[1].x,m[1].y],[m[2].x,m[2].y],[m[3].x,m[3].y]];
    return homography4(src,cornersPx);
  }

  function sampleDisk(gray,w,h,cx,cy,r){
    const r2=r*r; let sum=0,n=0;
    const x0=Math.max(0,Math.floor(cx-r)),x1=Math.min(w-1,Math.ceil(cx+r));
    const y0=Math.max(0,Math.floor(cy-r)),y1=Math.min(h-1,Math.ceil(cy+r));
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) if((x-cx)**2+(y-cy)**2<=r2){sum+=gray[y*w+x];n++;}
    return n?sum/n:255;
  }

  function localScale(H,p){
    const a=project(H,p[0],p[1]),bx=project(H,p[0]+1,p[1]),by=project(H,p[0],p[1]+1);
    return (Math.hypot(bx[0]-a[0],bx[1]-a[1])+Math.hypot(by[0]-a[0],by[1]-a[1]))/2;
  }

  function bubbleDarkness(gray,w,h,H,pt,rCm){
    const q=project(H,pt[0],pt[1]), scale=localScale(H,pt), r=Math.max(3,rCm*scale*0.72);
    const inner=sampleDisk(gray,w,h,q[0],q[1],r);
    const outer=sampleDisk(gray,w,h,q[0],q[1],r*1.65);
    return Math.max(0,Math.min(1,(outer-inner)/Math.max(32,outer)));
  }

  function choose(scores,opts={}){
    const ranked=scores.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v), top=ranked[0], second=ranked[1]||{v:0};
    const min=opts.min??0.12, gap=opts.gap??0.035;
    if(top.v<min) return {index:-1,uncertain:top.v>=min*0.65,scores};
    const uncertain=(top.v-second.v)<gap || (second.v>0 && top.v/second.v<1.28);
    return {index:top.i,uncertain,scores};
  }

  function readChoiceGroup(gray,w,h,H,points,labels,rCm,opts){
    const scores=points.map(pt=>pt?bubbleDarkness(gray,w,h,H,pt,rCm):0);
    const c=choose(scores,opts); return {...c,value:c.index<0?'':labels[c.index]};
  }

  function readDigits(gray,w,h,H,groups,labels,rCm){
    const values=[], uncertain=[];
    groups.forEach((pts,i)=>{
      const r=readChoiceGroup(gray,w,h,H,pts,labels,rCm,{min:0.10,gap:0.025});
      values.push(r.value||'?'); if(r.uncertain||r.index<0) uncertain.push(i);
    });
    return {value:values.join(''),uncertain};
  }

  function readP3Question(gray,w,h,H,question,labels,rCm){
    const cols=question.map(pts=>readChoiceGroup(gray,w,h,H,pts,labels,rCm,{min:0.10,gap:0.025}));
    const selected=cols.map(x=>x.value||'');
    const negative=selected.includes('-');
    const commaCol=selected.findIndex(v=>v===',');
    const digits=selected.map(v=>/^\d$/.test(v)?v:'').join('');
    let value=digits;
    if(commaCol>=0){
      const digitBefore=selected.slice(0,commaCol).filter(v=>/^\d$/.test(v)).join('');
      const digitAfter=selected.slice(commaCol+1).filter(v=>/^\d$/.test(v)).join('');
      value=(digitBefore||'0')+','+digitAfter;
    }
    if(negative&&value) value='-'+value;
    return {value,raw:selected,uncertain:cols.some(x=>x.uncertain||x.index<0)};
  }

  function analyzeImageData(imageData,template){
    const {data,width:w,height:h}=imageData, gray=grayscale(data,w,h);
    const markers=detectCornerMarkers(gray,w,h);
    if(!markers.ok) return {ok:false,error:'Không nhận đủ 4 mốc góc',markerCandidates:markers.candidates.length};
    const H=estimateTemplateHomography(template,markers.corners);
    const uncertain=[];
    const p1=template.p1.map((pts,i)=>{const r=readChoiceGroup(gray,w,h,H,pts,template.p1Labels,template.bubbleRadiusCm);if(r.uncertain||r.index<0)uncertain.push(`P1.${i+1}`);return r.value||'?';});
    const p2Flat=template.p2.map((pts,i)=>{const r=readChoiceGroup(gray,w,h,H,pts,template.p2Labels,template.bubbleRadiusCm);if(r.uncertain||r.index<0)uncertain.push(`P2.${Math.floor(i/4)+1}${'abcd'[i%4]}`);return r.value||'?';});
    const p2=Array.from({length:4},(_,q)=>p2Flat.slice(q*4,q*4+4).join('-'));
    const p3=template.p3.map((q,i)=>{const r=readP3Question(gray,w,h,H,q,template.p3Labels,template.bubbleRadiusCm);if(r.uncertain)uncertain.push(`P3.${i+1}`);return r.value||'?';});
    const sbd=readDigits(gray,w,h,H,template.sbd,template.sbdLabels,template.bubbleRadiusCm); sbd.uncertain.forEach(i=>uncertain.push(`SBD.${i+1}`));
    const maDe=readDigits(gray,w,h,H,template.maDe,template.maDeLabels,template.bubbleRadiusCm); maDe.uncertain.forEach(i=>uncertain.push(`MADE.${i+1}`));
    return {ok:true,sbd:sbd.value,maDe:maDe.value,p1:p1.join(''),p2,p3,uncertain,markerCorners:markers.corners,homography:H};
  }

  return {grayscale,homography4,project,adaptiveBinary,connectedComponents,detectCornerMarkers,estimateTemplateHomography,bubbleDarkness,choose,readChoiceGroup,readDigits,readP3Question,analyzeImageData};
});
