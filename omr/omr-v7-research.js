(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DamSanOmrV7Research=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // V7 RESEARCH ONLY. It does not integrate with the official PWA or scoring.
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function quantile(values,p){
    if(!values.length)return 0;
    const a=values.slice().sort((x,y)=>x-y),i=(a.length-1)*clamp(p,0,1),k=Math.floor(i);
    return a[k]+(a[Math.min(a.length-1,k+1)]-a[k])*(i-k);
  }
  function validImage(x){
    if(!x||!x.gray||!Number.isInteger(x.width)||!Number.isInteger(x.height)
      ||x.width<8||x.height<8||x.gray.length!==x.width*x.height)
      throw Error('v7_invalid_image');
  }
  // Compare adjacent frames of one sheet, never treat focus as a probability.
  function frameQuality(image){
    validImage(image);
    const {gray:g,width:w,height:h}=image;
    const stride=Math.max(1,Math.floor(Math.min(w,h)/540));
    let focus=0,edges=0,bright=0,dark=0,n=0;
    const luminances=[];
    for(let y=2;y<h-2;y+=stride)for(let x=2;x<w-2;x+=stride){
      const i=y*w+x,v=g[i],lap=Math.abs(4*v-g[i-1]-g[i+1]-g[i-w]-g[i+w]);
      focus+=lap;edges+=lap>=15?1:0;
      bright+=v>=253?1:0;dark+=v<50?1:0;n++;
      if(n%47===0)luminances.push(v);
    }
    return {focus:focus/n,edgeFraction:edges/n,clippedFraction:bright/n,
      darkFraction:dark/n,illuminationSpread:quantile(luminances,.9)-quantile(luminances,.1)};
  }
  function chooseFrame(frames){
    if(!Array.isArray(frames)||!frames.length)throw Error('v7_no_frames');
    const ranked=frames.map((frame,index)=>{
      const q=frameQuality(frame);
      return {index,quality:q,rank:q.focus-Math.max(0,q.clippedFraction-.22)*80
        -Math.max(0,q.darkFraction-.38)*55};
    }).sort((a,b)=>b.rank-a.rank);
    return {index:ranked[0].index,quality:ranked[0].quality,candidates:ranked};
  }
  // Landmarks must be independent, correctly identified printed controls in
  // rectified pixel coordinates. Conservative small-displacement model.
  function fitLocalGeometry(markers,radiusPx){
    const r=Number(radiusPx);
    if(!Array.isArray(markers)||!Number.isFinite(r)||r<=0)
      return {reliable:false,reason:'missing_landmarks',points:[]};
    const points=markers.filter(m=>Array.isArray(m.predicted)&&Array.isArray(m.observed)
      &&m.predicted.length===2&&m.observed.length===2
      &&[...m.predicted,...m.observed].every(Number.isFinite))
      .map(m=>({...m,dx:m.observed[0]-m.predicted[0],dy:m.observed[1]-m.predicted[1]}));
    const regions=new Set(points.map(m=>m.region));
    const deviation=points.map(m=>Math.hypot(m.dx,m.dy));
    const spread=quantile(points.map(m=>m.dx),.9)-quantile(points.map(m=>m.dx),.1)
      +quantile(points.map(m=>m.dy),.9)-quantile(points.map(m=>m.dy),.1);
    const reliable=points.length>=9&&['P1','P2','P3'].every(s=>regions.has(s))
      &&quantile(deviation,.9)<=.9*r&&spread<=1.2*r;
    return {reliable,reason:reliable?'':'inconsistent_landmarks',
      radiusPx:r,points:reliable?points:[],matched:points.length,
      p90DisplacementR:quantile(deviation,.9)/r};
  }
  function correctedPoint(x,y,model){
    if(!model?.reliable)return [x,y];
    let dx=0,dy=0,sum=0;
    const sigma2=(model.radiusPx*35)**2;
    for(const m of model.points){
      const d2=(x-m.predicted[0])**2+(y-m.predicted[1])**2;
      const weight=1/(sigma2+d2);
      dx+=weight*m.dx;dy+=weight*m.dy;sum+=weight;
    }
    if(!sum)return [x,y];
    const bound=.9*model.radiusPx;
    return [x+clamp(dx/sum,-bound,bound),y+clamp(dy/sum,-bound,bound)];
  }
  function paperSample(gray,w,h,x,y,r){
    const values=[];
    for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(h-1,Math.ceil(y+r));yy++)
      for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(w-1,Math.ceil(x+r));xx++)
        if((xx-x)**2+(yy-y)**2<=r*r)values.push(gray[yy*w+xx]);
    return values.length?quantile(values,.8):255;
  }
  function measureBubble(rect,template,point,geometry){
    if(!point)return {score:0,fill:0,deep:0,gradient:0,clipped:0};
    const {gray:g,width:w,height:h}=rect;
    const sx=(w-1)/template.widthCm,sy=(h-1)/template.heightCm;
    const r=Math.max(2.5,template.bubbleRadiusCm*(sx+sy)/2);
    let [x,y]=correctedPoint(point[0]*sx,point[1]*sy,geometry);
    const d=1.55*r,p=.28*r;
    const left=paperSample(g,w,h,x-d,y,p),right=paperSample(g,w,h,x+d,y,p);
    const up=paperSample(g,w,h,x,y-d,p),down=paperSample(g,w,h,x,y+d,p);
    const bg=(left+right+up+down)/4;
    const gradient=(Math.max(left,right,up,down)-Math.min(left,right,up,down))/Math.max(64,bg);
    const core=.47*r;
    let contrast=0,fill=0,deep=0,clipped=0,n=0;
    for(let yy=Math.max(0,Math.floor(y-core));yy<=Math.min(h-1,Math.ceil(y+core));yy++)
      for(let xx=Math.max(0,Math.floor(x-core));xx<=Math.min(w-1,Math.ceil(x+core));xx++){
        const dx=xx-x,dy=yy-y;
        if(dx*dx+dy*dy>core*core)continue;
        const paper=bg+(right-left)*dx/(2*d)+(down-up)*dy/(2*d);
        const value=g[yy*w+xx],loss=clamp((paper-value)/Math.max(64,paper),0,1);
        contrast+=loss;fill+=loss>.12?1:0;deep+=loss>.29?1:0;
        clipped+=(value>=253&&bg<247)?1:0;n++;
      }
    const c=n?contrast/n:0,f=n?fill/n:0,dn=n?deep/n:0;
    return {score:.74*c+.19*f+.07*dn,contrast:c,fill:f,deep:dn,
      gradient,clipped:n?clipped/n:0,paper:bg};
  }
  function calibrate(rows){
    const positive=[],negative=[];
    for(const row of rows){
      const s=row.slice().sort((a,b)=>b.score-a.score);
      if(s[0]&&s[0].score>=.19&&s[0].fill>=.43)positive.push(s[0].score);
      for(const m of s.slice(1))negative.push(m.score);
    }
    const mark=quantile(positive,.5),blank=quantile(negative,.65);
    return {reliable:positive.length>=6&&negative.length>=12&&mark>blank+.13,
      mark,blank,span:mark-blank,positiveSamples:positive.length};
  }
  // Each bubble contributes independent mark evidence. Second filled choices
  // invalidate P1/P2; erasures with insufficient evidence require review.
  function decideRow(metrics,cal,labels){
    if(!cal?.reliable)return {state:'review',value:'?',reason:'Không hiệu chuẩn được phiếu'};
    const a=metrics.map((v,index)=>({...v,index})).sort((x,y)=>y.score-x.score);
    if(!a.length)return {state:'review',value:'?',reason:'Thiếu dữ liệu ô tô'};
    const top=a[0],second=a[1]||{score:0,fill:0},span=Math.max(.13,cal.span);
    const strength=(top.score-cal.blank)/span,secondStrength=(second.score-cal.blank)/span;
    const evidence={top:top.score,second:second.score,topFill:top.fill,secondFill:second.fill};
    if(metrics.some(m=>m.clipped>.28))
      return {...evidence,state:'review',value:'?',reason:'Vùng ô tô bị phản sáng'};
    if(strength<.18&&top.fill<.18)
      return {...evidence,state:'blank',value:'',reason:'Không tô'};
    if(strength<.39||top.fill<.45)
      return {...evidence,state:'review',value:'?',reason:'Nét tô mờ'};
    if(secondStrength>=.58&&second.fill>=.52
      &&second.score/Math.max(.05,top.score)>=.52)
      return {...evidence,state:'multiple',value:'?',reason:'Tô từ hai ô'};
    if(secondStrength>=.30&&second.fill>=.20)
      return {...evidence,state:'review',value:'?',reason:'Dấu thứ hai hoặc vết tẩy'};
    if((top.score-second.score)/span<.19||top.gradient>.55)
      return {...evidence,state:'review',value:'?',reason:'Tương phản không đủ tin cậy'};
    return {...evidence,state:'single',value:labels[top.index],index:top.index,reason:''};
  }
  // P3 is deliberately V6-unchanged when supplied; otherwise not evaluated.
  function analyzeRectified(rect,template,opts={}){
    validImage(rect);
    if(template?.p1?.length!==18||template.p2?.length!==16)
      throw Error('v7_requires_18_4_6_template');
    const geometry=opts.geometryModel?.reliable?opts.geometryModel:null;
    const p1=template.p1.map(row=>row.map(p=>measureBubble(rect,template,p,geometry)));
    const p2=template.p2.map(row=>row.map(p=>measureBubble(rect,template,p,geometry)));
    const cal=calibrate(p1);
    const a=p1.map(m=>decideRow(m,cal,template.p1Labels));
    const b=p2.map(m=>decideRow(m,cal,template.p2Labels));
    const issues=[],invalidMarks=[];
    a.forEach((v,i)=>{if(['review','multiple'].includes(v.state)){
      const key='P1.'+(i+1);issues.push({key,state:v.state,reason:v.reason});
      if(v.state==='multiple')invalidMarks.push(key);
    }});
    b.forEach((v,i)=>{if(['review','multiple'].includes(v.state)){
      const key='P2.'+(Math.floor(i/4)+1)+'abcd'[i%4];
      issues.push({key,state:v.state,reason:v.reason});
      if(v.state==='multiple')invalidMarks.push(key);
    }});
    const p3=typeof opts.v6?.readP3Section==='function'?opts.v6.readP3Section(rect,template):null;
    return {engine:'V7_OFFLINE_RESEARCH',readOnly:true,validForSave:false,
      p1:a.map(x=>x.value||'?').join(''),
      p2:Array.from({length:4},(_,i)=>b.slice(4*i,4*i+4).map(x=>x.value||'?').join('-')),
      p3:p3?.p3||null,p3Source:p3?'V6_UNCHANGED':'NOT_EVALUATED',
      p1Evidence:a,p2Evidence:b,calibration:cal,geometryApplied:!!geometry,
      issues,invalidMarks,requiresReview:!cal.reliable||issues.length>0};
  }
  return {quantile,frameQuality,chooseFrame,fitLocalGeometry,correctedPoint,
    measureBubble,calibrate,decideRow,analyzeRectified};
});
