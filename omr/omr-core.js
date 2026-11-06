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

  function homographyN(src,dst){
    if(src.length!==dst.length||src.length<4) throw new Error('homographyN requires at least four pairs');
    const rows=[],b=[];
    for(let i=0;i<src.length;i++){
      const [x,y]=src[i], [u,v]=dst[i];
      rows.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u);
      rows.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v);
    }
    const AtA=Array.from({length:8},()=>Array(8).fill(0)),Atb=Array(8).fill(0);
    for(let r=0;r<rows.length;r++) for(let i=0;i<8;i++){
      Atb[i]+=rows[r][i]*b[r];
      for(let j=0;j<8;j++) AtA[i][j]+=rows[r][i]*rows[r][j];
    }
    const h=solveLinear(AtA,Atb);
    return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
  }

  function homography4(src,dst){
    if(src.length!==4||dst.length!==4) throw new Error('homography4 requires four pairs');
    return homographyN(src,dst);
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
    if(candidates.length<4) return {ok:false,candidates,outerCandidates:[],corners:null};
    const observedMaxSide=Math.max(...candidates.map(c=>Math.max(c.width,c.height)));
    const outerCandidates=candidates.filter(c=>Math.max(c.width,c.height)>=observedMaxSide*0.74);
    if(outerCandidates.length<4) return {ok:false,candidates,outerCandidates,corners:null};
    const pick=(score,dir)=>outerCandidates.reduce((best,c)=>{
      const v=score(c); return !best||(dir<0?v<best.v:v>best.v)?{c,v}:best;
    },null).c;
    const picked=[
      pick(c=>c.cx+c.cy,-1),
      pick(c=>c.cx-c.cy,1),
      pick(c=>c.cx+c.cy,1),
      pick(c=>c.cx-c.cy,-1)
    ];
    if(new Set(picked).size<4) return {ok:false,candidates,outerCandidates,corners:null};
    return {ok:true,candidates,outerCandidates,corners:picked.map(c=>[c.cx,c.cy])};
  }

  function estimateTemplateHomography(template,cornersPx){
    const m=template.markers;
    const src=[[m[0].x,m[0].y],[m[1].x,m[1].y],[m[2].x,m[2].y],[m[3].x,m[3].y]];
    return homography4(src,cornersPx);
  }

  function matchTemplateMarkers(template,H,candidates,w,h){
    const tol=Math.max(10,Math.min(w,h)*0.035),used=new Set(),pairs=[];
    for(const mk of template.markers||[]){
      const pred=project(H,mk.x,mk.y);
      let best=null;
      for(let i=0;i<candidates.length;i++){
        if(used.has(i)) continue;
        const c=candidates[i],d=Math.hypot(c.cx-pred[0],c.cy-pred[1]);
        if(d<=tol&&(!best||d<best.d)) best={i,c,d,pred};
      }
      if(best){
        used.add(best.i);
        pairs.push({src:[mk.x,mk.y],dst:[best.c.cx,best.c.cy],error:best.d,name:mk.name});
      }
    }
    const rmse=pairs.length?Math.sqrt(pairs.reduce((s,p)=>s+p.error*p.error,0)/pairs.length):Infinity;
    return {pairs,rmse,tolerance:tol};
  }

  function refineTemplateHomography(template,markers,w,h){
    const initial=estimateTemplateHomography(template,markers.corners);
    const x=markers.corners.map(p=>p[0]),y=markers.corners.map(p=>p[1]);
    const spanX=(Math.max(...x)-Math.min(...x))/w,spanY=(Math.max(...y)-Math.min(...y))/h;
    let matched=matchTemplateMarkers(template,initial,markers.candidates,w,h),H=initial;
    if(matched.pairs.length>=6){
      H=homographyN(matched.pairs.map(p=>p.src),matched.pairs.map(p=>p.dst));
      matched=matchTemplateMarkers(template,H,markers.candidates,w,h);
    }
    const minMatches=Math.min(6,(template.markers||[]).length);
    const ok=matched.pairs.length>=minMatches
      && matched.rmse<=matched.tolerance*0.45
      && spanX>=0.45 && spanY>=0.45;
    return {ok,H,matches:matched.pairs.length,rmse:matched.rmse,tolerance:matched.tolerance,spanX,spanY,pairs:matched.pairs};
  }

  function fastTemplateRegistration(template,markers,w,h){
    const H=estimateTemplateHomography(template,markers.corners);
    const xs=markers.corners.map(p=>p[0]),ys=markers.corners.map(p=>p[1]);
    const spanX=(Math.max(...xs)-Math.min(...xs))/w,spanY=(Math.max(...ys)-Math.min(...ys))/h;
    const area=Math.abs(
      markers.corners.reduce((s,p,i,a)=>{
        const q=a[(i+1)%a.length];
        return s+p[0]*q[1]-q[0]*p[1];
      },0)
    )/2/(w*h);
    const diagNames=new Set(['TOP-C','MID-L','MID-C','MID-R','P3-B3']);
    const diagnostics=matchTemplateMarkers(
      {...template,markers:(template.markers||[]).filter(m=>diagNames.has(m.name))},
      H,markers.candidates,w,h
    );
    const ok=spanX>=0.42&&spanY>=0.42&&area>=0.18;
    return {
      ok,H,spanX,spanY,area,
      matches:4+diagnostics.pairs.length,
      rmse:diagnostics.rmse,
      diagnosticPairs:diagnostics.pairs
    };
  }

  function darkIntegral(gray,w,h){
    const out=new Uint32Array((w+1)*(h+1));
    for(let y=1;y<=h;y++){
      let row=0;
      for(let x=1;x<=w;x++){
        row+=255-gray[(y-1)*w+(x-1)];
        out[y*(w+1)+x]=out[(y-1)*(w+1)+x]+row;
      }
    }
    return out;
  }

  function boxDarkMean(integral,w,h,cx,cy,half){
    const x0=Math.max(0,Math.floor(cx-half)),x1=Math.min(w-1,Math.ceil(cx+half));
    const y0=Math.max(0,Math.floor(cy-half)),y1=Math.min(h-1,Math.ceil(cy+half));
    if(x1<x0||y1<y0) return 0;
    const stride=w+1;
    const A=integral[y0*stride+x0],B=integral[y0*stride+x1+1];
    const C=integral[(y1+1)*stride+x0],D=integral[(y1+1)*stride+x1+1];
    return (D-B-C+A)/((x1-x0+1)*(y1-y0+1));
  }

  function locateMarkerNear(gray,w,h,H,mk,integral){
    const pred=project(H,mk.x,mk.y),scale=Math.max(0.1,localScale(H,[mk.x,mk.y]));
    const expected=Math.max(4,(mk.size||0.25)*scale);
    const search=Math.max(7,expected*1.9),inner=Math.max(2,expected*0.30);
    const step=Math.max(1,Math.round(expected*0.12));
    let best=null;
    const x0=Math.max(1,Math.floor(pred[0]-search)),x1=Math.min(w-2,Math.ceil(pred[0]+search));
    const y0=Math.max(1,Math.floor(pred[1]-search)),y1=Math.min(h-2,Math.ceil(pred[1]+search));
    for(let y=y0;y<=y1;y+=step) for(let x=x0;x<=x1;x+=step){
      const score=boxDarkMean(integral,w,h,x,y,inner);
      if(!best||score>best.score) best={x,y,score};
    }
    if(!best||best.score<55) return null;

    const half=Math.max(3,expected*0.65);
    let sx=0,sy=0,sw=0;
    for(let y=Math.max(0,Math.floor(best.y-half));y<=Math.min(h-1,Math.ceil(best.y+half));y++){
      for(let x=Math.max(0,Math.floor(best.x-half));x<=Math.min(w-1,Math.ceil(best.x+half));x++){
        const weight=Math.max(0,205-gray[y*w+x]);
        if(weight<18) continue;
        sx+=x*weight;sy+=y*weight;sw+=weight;
      }
    }
    const cx=sw?sx/sw:best.x,cy=sw?sy/sw:best.y;
    return {src:[mk.x,mk.y],dst:[cx,cy],name:mk.name,score:best.score,expectedSide:expected};
  }

  function median(values){
    if(!values.length) return NaN;
    const a=values.slice().sort((x,y)=>x-y),m=a.length>>1;
    return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }

  function refineTemplateHomographyDeep(template,markers,gray,w,h){
    const initial=estimateTemplateHomography(template,markers.corners);
    const integral=darkIntegral(gray,w,h);
    let pairs=(template.markers||[]).map(mk=>locateMarkerNear(gray,w,h,initial,mk,integral)).filter(Boolean);
    if(pairs.length<10) return {ok:false,H:initial,matches:pairs.length,rmse:Infinity,pairs};

    let H=initial;
    for(let iter=0;iter<3&&pairs.length>=8;iter++){
      H=homographyN(pairs.map(p=>p.src),pairs.map(p=>p.dst));
      const errors=pairs.map(p=>{
        const q=project(H,p.src[0],p.src[1]);
        return Math.hypot(q[0]-p.dst[0],q[1]-p.dst[1]);
      });
      const med=median(errors),floor=Math.max(2.2,Math.min(w,h)*0.0025);
      const cut=Math.max(floor,Number.isFinite(med)?med*2.8:floor);
      const next=pairs.filter((p,i)=>errors[i]<=cut);
      if(next.length===pairs.length) break;
      pairs=next;
    }
    if(pairs.length>=8) H=homographyN(pairs.map(p=>p.src),pairs.map(p=>p.dst));
    const errors=pairs.map(p=>{
      const q=project(H,p.src[0],p.src[1]);
      return Math.hypot(q[0]-p.dst[0],q[1]-p.dst[1]);
    });
    const rmse=errors.length?Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length):Infinity;
    const names=new Set(pairs.map(p=>p.name));
    const outerOk=['TL','TR','BR','BL'].every(n=>names.has(n));
    const maxRmse=Math.max(3,Math.min(w,h)*0.0045);
    return {ok:outerOk&&pairs.length>=10&&rmse<=maxRmse,H,matches:pairs.length,rmse,pairs};
  }

  function bilinear(gray,w,h,x,y){
    if(x<0||y<0||x>w-1||y>h-1) return 255;
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1);
    const fx=x-x0,fy=y-y0;
    const a=gray[y0*w+x0]*(1-fx)+gray[y0*w+x1]*fx;
    const b=gray[y1*w+x0]*(1-fx)+gray[y1*w+x1]*fx;
    return Math.round(a*(1-fy)+b*fy);
  }

  function warpTemplateGray(gray,w,h,H,template,longSide=1800){
    const ch=Math.max(900,Math.round(longSide));
    const cw=Math.max(620,Math.round(ch*template.widthCm/template.heightCm));
    const out=new Uint8Array(cw*ch);
    // Evaluate the perspective mapping incrementally along each row. Identical
    // bilinear sampling, without allocating a point array for every output pixel.
    const stepX=template.widthCm/(cw-1),stepY=template.heightCm/(ch-1);
    const du=H[0]*stepX,dv=H[3]*stepX,dd=H[6]*stepX;
    for(let y=0;y<ch;y++){
      const ty=y*stepY;
      let u=H[1]*ty+H[2],v=H[4]*ty+H[5],d=H[7]*ty+H[8];
      const row=y*cw;
      for(let x=0;x<cw;x++){
        out[row+x]=bilinear(gray,w,h,u/d,v/d);
        u+=du;v+=dv;d+=dd;
      }
    }
    return {gray:out,width:cw,height:ch};
  }

  function bubbleInkScore(gray,w,h,template,pt,rCm){
    const sx=(w-1)/template.widthCm,sy=(h-1)/template.heightCm;
    const cx=pt[0]*sx,cy=pt[1]*sy,r=Math.max(3,rCm*(sx+sy)/2);
    const patchR=Math.max(5,r*1.8),coreR=Math.max(2.2,r*0.72),coreR2=coreR*coreR;
    const hist=new Uint32Array(256);
    const x0=Math.max(0,Math.floor(cx-patchR)),x1=Math.min(w-1,Math.ceil(cx+patchR));
    const y0=Math.max(0,Math.floor(cy-patchR)),y1=Math.min(h-1,Math.ceil(cy+patchR));
    let patchN=0;
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){hist[gray[y*w+x]]++;patchN++;}
    let target=patchN*0.80,acc=0,bg=245;
    for(let i=0;i<256;i++){acc+=hist[i];if(acc>=target){bg=i;break;}}

    let n=0,d8=0,d15=0,d25=0,deficit=0,centerN=0,center25=0,center45=0,centerDeficit=0;
    const centerR2=(r*0.44)*(r*0.44);
    const ix0=Math.max(0,Math.floor(cx-coreR)),ix1=Math.min(w-1,Math.ceil(cx+coreR));
    const iy0=Math.max(0,Math.floor(cy-coreR)),iy1=Math.min(h-1,Math.ceil(cy+coreR));
    for(let y=iy0;y<=iy1;y++) for(let x=ix0;x<=ix1;x++){
      if((x-cx)*(x-cx)+(y-cy)*(y-cy)>coreR2) continue;
      const v=gray[y*w+x],d=bg-v;n++;
      if(d>8)d8++;if(d>15)d15++;if(d>25)d25++;if(d>0)deficit+=d;
      if((x-cx)*(x-cx)+(y-cy)*(y-cy)<=centerR2){
        centerN++;if(d>25)center25++;if(d>45)center45++;if(d>0)centerDeficit+=d;
      }
    }
    if(!n) return {score:0,bg,ink8:0,ink15:0,ink25:0,deficit:0};
    const f8=d8/n,f15=d15/n,f25=d25/n,meanDef=deficit/n/255;
    const score=Math.max(0,Math.min(1,0.38*f8+0.32*f15+0.20*f25+0.10*Math.min(1,meanDef*5)));
    return {score,bg,ink8:f8,ink15:f15,ink25:f25,deficit:meanDef,
      centerInk25:centerN?center25/centerN:0,centerInk45:centerN?center45/centerN:0,
      centerContrast:centerN?centerDeficit/centerN/255:0};
  }

  function chooseInk(scores,opts={}){
    const ranked=scores.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v),top=ranked[0]||{v:0,i:-1},second=ranked[1]||{v:0,i:-1};
    const margin=top.v-second.v,ratio=top.v/Math.max(0.04,second.v),base=median(scores)||0,aboveBase=top.v-base;
    const allowBlank=!!opts.allowBlank;
    const cleanBlank=allowBlank && (top.v<(opts.blankMax??0.18) || aboveBase<(opts.blankBaseGap??0.055));
    if(cleanBlank) return {index:-1,blank:true,uncertain:false,reason:'Ô để trống',scores,top:top.v,second:second.v,margin,ratio,base,aboveBase};
    const doubtfulBlank=allowBlank && top.v<(opts.blankCeil??0.52) && aboveBase<(opts.blankWarnGap??0.095);
    if(doubtfulBlank) return {index:-1,blank:true,uncertain:true,reason:'Nét tô quá mờ hoặc ô để trống',scores,top:top.v,second:second.v,margin,ratio,base,aboveBase};

    const gap=opts.gap??0.075,ratioMin=opts.ratio??1.14;
    const uncertain=margin<gap||ratio<ratioMin;
    let reason='';
    if(uncertain){
      const doubleMin=opts.doubleMin??0.24,doubleGap=opts.doubleGap??0.10;
      if(top.v>=doubleMin&&second.v>=doubleMin&&margin<doubleGap) reason='Có dấu tô ở nhiều ô; mức tô gần nhau';
      else if(top.v<(opts.weakCeil??0.44)) reason='Nét tô mờ hoặc chưa kín ô';
      else reason='Khó phân biệt giữa các ô';
    }
    return {index:top.i,blank:false,uncertain,reason,scores,top:top.v,second:second.v,margin,ratio,base,aboveBase};
  }

  function readChoiceGroupRectified(rect,template,points,labels,rCm,opts={}){
    const metrics=points.map(pt=>pt?bubbleInkScore(rect.gray,rect.width,rect.height,template,pt,rCm):{score:0});
    const scores=metrics.map(m=>m.score),c=chooseInk(scores,opts);
    return {...c,metrics,value:c.index<0?'':labels[c.index]};
  }

  function readDigitsRectified(rect,template,groups,labels,rCm){
    const values=[],uncertain=[],details=[];
    groups.forEach((pts,i)=>{
      const r=readChoiceGroupRectified(rect,template,pts,labels,rCm,{gap:0.07,ratio:1.12});
      values.push(r.value||'?');
      if(r.uncertain||r.index<0){
        uncertain.push(i);
        details.push({index:i,reason:r.reason||'Không xác định được ô tô rõ ràng',top:r.top,second:r.second,margin:r.margin});
      }
    });
    return {value:values.join(''),uncertain,details};
  }

  // The numeric part has a distinct grammar: each column may legally be empty.
  // Measure the sheet's P3 columns before choosing digits; do not interpret the
  // darkest printed outline as a mark merely because it wins its column.
  function percentile(values,p){
    if(!values.length)return 0;
    const a=values.slice().sort((x,y)=>x-y),pos=(a.length-1)*p;
    const i=Math.floor(pos),k=pos-i;
    return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*k;
  }

  function measureP3Column(rect,template,pts,rCm){
    const metrics=pts.map(pt=>pt?bubbleInkScore(rect.gray,rect.width,rect.height,template,pt,rCm):null);
    return {metrics,scores:metrics.map(m=>m?m.score:0)};
  }

  function calibrateP3(probes){
    const positives=[],positiveContrast=[],negatives=[];
    for(const probe of probes){
      const ranked=probe.metrics.map((m,i)=>m?{i,v:m.score,m}:null)
        .filter(Boolean).sort((a,b)=>b.v-a.v);
      if(!ranked.length)continue;
      const top=ranked[0],second=ranked[1]||{v:0};
      if(top.v>=0.26&&top.v-second.v>=0.09&&top.m.centerInk25>=0.28){
        positives.push(top.v);
        positiveContrast.push(top.m.centerContrast||0);
      }
      ranked.slice(1).forEach(r=>negatives.push(r.v));
    }
    const background=percentile(negatives,0.90);
    // A few partial marks must not drag down the fill reference. When the
    // sheet is sparse, use a conservative deterministic fallback.
    const reference=positives.length>=5?percentile(positives,0.25):0.58;
    const markGate=Math.max(0.30,background+0.17,reference*0.58);
    const blankGate=Math.max(0.16,Math.min(markGate-0.11,background+0.085));
    const contrastReference=positives.length>=5?percentile(positiveContrast,0.25):0.42;
    const contrastGate=Math.max(0.15,contrastReference*0.38);
    return {background,reference,markGate,blankGate,
      contrastReference,contrastGate,samples:positives.length};
  }

  function chooseP3Ink(probe,calibration){
    const ranked=probe.metrics.map((m,i)=>m?{i,v:m.score,m}:null)
      .filter(Boolean).sort((a,b)=>b.v-a.v);
    const top=ranked[0]||{i:-1,v:0,m:{centerInk25:0,centerInk45:0}};
    const second=ranked[1]||{v:0},margin=top.v-second.v;
    const center=top.m.centerInk25||0,contrast=top.m.centerContrast||0;
    const ratio=top.v/Math.max(0.04,second.v);
    const strong=top.v>=calibration.markGate&&center>=0.24&&
      contrast>=calibration.contrastGate&&margin>=0.075&&ratio>=1.14;
    const blank=top.v<=calibration.blankGate&&center<=0.20;
    const common={scores:probe.scores,top:top.v,second:second.v,
      margin,ratio,centerInk25:center,centerContrast:contrast};
    if(strong)return {...common,index:top.i,blank:false,uncertain:false,reason:''};
    if(blank)return {...common,index:-1,blank:true,uncertain:false,reason:'Ô để trống'};
    // Abstain rather than silently append a digit when the ink evidence is weak.
    return {...common,index:-1,blank:true,uncertain:true,
      reason:'Ô có tín hiệu mực chưa rõ; cần đối chiếu trên phiếu giấy'};
  }

  function readP3QuestionRectified(rect,template,question,labels,rCm,options={}){
    const probes=options.probes||question.map(pts=>measureP3Column(rect,template,pts,rCm));
    const calibration=options.calibration||calibrateP3(probes);
    const cols=probes.map(probe=>chooseP3Ink(probe,calibration));
    const selected=cols.map(x=>x.index<0?'':labels[x.index]),negative=selected.includes('-'),commaCol=selected.findIndex(v=>v===',');
    const digits=selected.map(v=>/^\d$/.test(v)?v:'').join('');
    let value=digits;
    if(commaCol>=0){
      const before=selected.slice(0,commaCol).filter(v=>/^\d$/.test(v)).join('');
      const after=selected.slice(commaCol+1).filter(v=>/^\d$/.test(v)).join('');
      value=(before||'0')+','+after;
    }
    if(negative&&value)value='-'+value;
    const details=cols.map((x,i)=>x.uncertain?{column:i,reason:x.reason,top:x.top,
      second:x.second,margin:x.margin}:null).filter(Boolean);
    return {value,raw:selected,uncertain:details.length>0,details};
  }

  function readP3SectionRectified(rect,template){
    const probes=template.p3.map(q=>q.map(pts=>measureP3Column(rect,template,pts,template.bubbleRadiusCm)));
    const calibration=calibrateP3(probes.flat());
    const questions=template.p3.map((q,i)=>readP3QuestionRectified(
      rect,template,q,template.p3Labels,template.bubbleRadiusCm,
      {probes:probes[i],calibration}
    ));
    return {questions,calibration};
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
    const {data,width:w,height:h}=imageData,gray=grayscale(data,w,h);
    const markers=detectCornerMarkers(gray,w,h);
    if(!markers.ok) return {ok:false,error:'Không nhận đủ 4 mốc góc',markerCandidates:markers.candidates.length};

    const geometry=fastTemplateRegistration(template,markers,w,h);
    if(!geometry.ok) return {
      ok:false,error:'Không căn được phiếu chắc chắn. Giữ trọn 4 mốc góc ngoài và chụp lại phiếu.',
      markerCandidates:markers.candidates.length,markerMatches:geometry.matches,markerRmse:geometry.rmse,
      markerSpan:[geometry.spanX,geometry.spanY],markerArea:geometry.area
    };

    // Bốn mốc vuông ngoài là các điểm khống chế hình học chính. Các mốc nhỏ
    // bên trong chỉ dùng chẩn đoán; không được kéo homography vì có thể bị
    // nhầm với ô tô/chữ in và làm lệch ROI.
    const rect=warpTemplateGray(gray,w,h,geometry.H,template,1800),uncertain=[],uncertainDetails=[];
    const addWarning=(key,label,r)=>{uncertain.push(key);uncertainDetails.push({key,label,reason:r.reason||'Khó xác định ô tô',top:r.top??null,second:r.second??null,margin:r.margin??null});};
    const p1=template.p1.map((pts,i)=>{
      const r=readChoiceGroupRectified(rect,template,pts,template.p1Labels,template.bubbleRadiusCm,{gap:0.075,ratio:1.14});
      if(r.uncertain||r.index<0)addWarning(`P1.${i+1}`,`Phần I – Câu ${i+1}`,r);
      return r.value||'?';
    });
    const p2Flat=template.p2.map((pts,i)=>{
      const r=readChoiceGroupRectified(rect,template,pts,template.p2Labels,template.bubbleRadiusCm,{gap:0.075,ratio:1.14,doubleMin:0.22,doubleGap:0.11});
      const q=Math.floor(i/4)+1,letter='abcd'[i%4];
      if(r.uncertain||r.index<0)addWarning(`P2.${q}${letter}`,`Phần II – Câu ${q}, ý ${letter}`,r);
      return r.value||'?';
    });
    const p2=Array.from({length:4},(_,q)=>p2Flat.slice(q*4,q*4+4).join('-'));
    const p3Section=readP3SectionRectified(rect,template);
    const p3=p3Section.questions.map((r,i)=>{
      r.details.forEach(d=>addWarning(`P3.${i+1}.${d.column+1}`,`Phần III – Câu ${i+1}, vị trí ${d.column+1}`,d));
      return r.value||'?';
    });
    const sbd=readDigitsRectified(rect,template,template.sbd,template.sbdLabels,template.bubbleRadiusCm);
    sbd.details.forEach(d=>addWarning(`SBD.${d.index+1}`,`Số báo danh – chữ số thứ ${d.index+1}`,d));
    const maDe=readDigitsRectified(rect,template,template.maDe,template.maDeLabels,template.bubbleRadiusCm);
    maDe.details.forEach(d=>addWarning(`MADE.${d.index+1}`,`Mã đề – chữ số thứ ${d.index+1}`,d));

    return {
      ok:true,sbd:sbd.value,maDe:maDe.value,p1:p1.join(''),p2,p3,uncertain,uncertainDetails,
      markerCorners:markers.corners,markerMatches:geometry.matches,markerRmse:geometry.rmse,
      markerArea:geometry.area,homography:geometry.H,rectifiedSize:[rect.width,rect.height],
      engine:'CALIBRATED_INK_V3'
    };
  }

  return {grayscale,homographyN,homography4,project,adaptiveBinary,connectedComponents,detectCornerMarkers,estimateTemplateHomography,matchTemplateMarkers,refineTemplateHomography,fastTemplateRegistration,refineTemplateHomographyDeep,warpTemplateGray,bubbleInkScore,chooseInk,calibrateP3,chooseP3Ink,readChoiceGroupRectified,readDigitsRectified,readP3QuestionRectified,readP3SectionRectified,bubbleDarkness,choose,readChoiceGroup,readDigits,readP3Question,analyzeImageData};
});
