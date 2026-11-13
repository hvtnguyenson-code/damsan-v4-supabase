(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DamSanOmrReliabilityV7Baseline=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Opt-in experimental classifier loaded only for V5/V6 read-only comparison.
  // It never replaces the canonical V5 scoring or writes any result.
  function quantile(values,p){
    if(!values.length)return 0;
    const a=values.slice().sort((x,y)=>x-y),k=(a.length-1)*p,i=Math.floor(k);
    return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(k-i);
  }
  function samplePaper(gray,w,h,x,y,rad){
    const pixels=[],r2=rad*rad;
    const x0=Math.max(0,Math.floor(x-rad)),x1=Math.min(w-1,Math.ceil(x+rad));
    const y0=Math.max(0,Math.floor(y-rad)),y1=Math.min(h-1,Math.ceil(y+rad));
    for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
      if((xx-x)*(xx-x)+(yy-y)*(yy-y)<=r2)pixels.push(gray[yy*w+xx]);
    }
    return pixels.length?quantile(pixels,.80):200;
  }
  // The four nearby paper samples estimate a local illumination plane.
  // Correct each center pixel relative to that plane, not to fixed grayscale.
  // Pencil erasure and print-grey background then share the same measurement.
  function measureBubble(rect,template,point){
    if(!point)return {score:0,contrast:0,fill:0,gradient:0,paper:0};
    const {gray,width:w,height:h}=rect;
    const x=point[0]*(w-1)/template.widthCm,y=point[1]*(h-1)/template.heightCm;
    const r=Math.max(3,template.bubbleRadiusCm*((w-1)/template.widthCm+(h-1)/template.heightCm)/2);
    const d=r*1.55,pad=r*.28;
    const left=samplePaper(gray,w,h,x-d,y,pad),right=samplePaper(gray,w,h,x+d,y,pad);
    const up=samplePaper(gray,w,h,x,y-d,pad),down=samplePaper(gray,w,h,x,y+d,pad);
    const paper=(left+right+up+down)/4,core=r*.47,coreSq=core*core;
    const gradient=(Math.max(left,right,up,down)-Math.min(left,right,up,down))/Math.max(64,paper);
    let ink=0,fill=0,n=0;
    const y0=Math.max(0,Math.floor(y-core)),y1=Math.min(h-1,Math.ceil(y+core));
    const x0=Math.max(0,Math.floor(x-core)),x1=Math.min(w-1,Math.ceil(x+core));
    for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
      const dx=xx-x,dy=yy-y;
      if(dx*dx+dy*dy>coreSq)continue;
      const localPaper=paper+(right-left)*dx/(2*d)+(down-up)*dy/(2*d);
      const deficit=Math.max(0,(localPaper-gray[yy*w+xx])/Math.max(64,localPaper));
      ink+=deficit;
      if(deficit>.12)fill++;
      n++;
    }
    const contrast=n?ink/n:0,coverage=n?fill/n:0;
    return {score:.8*contrast+.1*coverage,contrast,fill:coverage,gradient,paper};
  }
  function measureGroups(rect,template,rows){
    return rows.map(row=>row.map(pt=>measureBubble(rect,template,pt)));
  }
  // The sheet supplies its own filled/empty calibration. Using P1 with 18
  // four-option responses avoids tuning a threshold to one troublesome P2 row.
  function calibrateSheet(p1Metrics){
    const positives=[],negatives=[];
    for(const row of p1Metrics){
      const a=row.slice().sort((x,y)=>y.score-x.score);
      if(a[0]&&a[0].score>.12&&a[0].fill>.30)positives.push(a[0].score);
      for(const m of a.slice(1))negatives.push(m.score);
    }
    const markReference=positives.length>=6?quantile(positives,.50):.35;
    const blankReference=negatives.length>=12?quantile(negatives,.67):.035;
    return {markReference,blankReference,positiveSamples:positives.length,
      reliable:positives.length>=6&&markReference>blankReference+.09};
  }
  function classifyRow(metrics,calibration,labels){
    const order=metrics.map((m,i)=>({...m,i})).sort((a,b)=>b.score-a.score);
    const top=order[0],second=order[1]||{score:0,fill:0,contrast:0};
    const denominator=Math.max(.07,calibration.markReference-calibration.blankReference);
    const topRelative=(top.score-calibration.blankReference)/denominator;
    const secondRelative=(second.score-calibration.blankReference)/denominator;
    const ratio=second.score/Math.max(.01,top.score);
    // A four-probe brightness spread is NOT by itself a poor-quality mark:
    // one probe can cross the form's printed frame, numeral, or gray panel.
    // The sheet-normalized separation is independent evidence of a clear mark.
    const separation=(top.score-second.score)/denominator;
    const decisiveSingle=topRelative>=.40&&top.fill>=.55&&separation>=.20;
    const evidence={top:top.score,second:second.score,ratio,
      topRelative,secondRelative,topFill:top.fill,secondFill:second.fill,
      separation,decisiveSingle,
      maxLightingGradient:Math.max(...metrics.map(m=>m.gradient))};
    if(!calibration.reliable)return {...evidence,state:'review',value:'?',index:-1,
      reason:'Không đủ dấu tô chắc chắn để hiệu chuẩn phiếu'};
    if(topRelative<.25||top.fill<.13)return {...evidence,state:'blank',value:'',index:-1,
      reason:'Để trống'};
    // Clear two marks remain invalid even when one is the correct answer.
    if(secondRelative>=.50&&ratio>=.85&&second.fill>=.32)
      return {...evidence,state:'multiple',value:'?',index:-1,
        reason:'Hai ô đều có dấu tô rõ và tương đương'};
    if(secondRelative>=.32&&ratio>=.58&&second.fill>=.22)
      return {...evidence,state:'review',value:'?',index:-1,
        reason:'Dấu tô thứ hai đáng kể; cần kiểm tra vết tẩy'};
    // Only escalate background variation if mark evidence is inconclusive.
    // Confirmed double marks and meaningful second marks were handled above.
    if(top.gradient>.35&&!decisiveSingle)
      return {...evidence,state:'review',value:'?',index:-1,
        reason:'Nền sáng không đều và dấu tô chưa đủ tách biệt'};
    return {...evidence,state:'single',index:top.i,value:labels[top.i],reason:''};
  }
  function inspectLighting(metrics){
    const values=metrics.flat().map(x=>x.paper).filter(Number.isFinite);
    const gradients=metrics.flat().map(x=>x.gradient);
    const p10=quantile(values,.10),p90=quantile(values,.90);
    return {paperP10:p10,paperP90:p90,
      illuminationSpread:p90>0?(p90-p10)/p90:1,
      worstLocalGradient:Math.max(0,...gradients)};
  }

  // Validate internal printed square markers independently of the four-corner
  // homography. Never use these observations to deform the recognized sheet.
  function measureControlMarker(rect,template,mk){
    const {gray,width:w,height:h}=rect;
    const x=mk.x*(w-1)/template.widthCm,y=mk.y*(h-1)/template.heightCm;
    const side=(mk.size||.25)*((w-1)/template.widthCm+(h-1)/template.heightCm)/2;
    const radius=Math.max(10,Math.ceil(side*1.85));
    const x0=Math.max(0,Math.floor(x-radius)),x1=Math.min(w-1,Math.ceil(x+radius));
    const y0=Math.max(0,Math.floor(y-radius)),y1=Math.min(h-1,Math.ceil(y+radius));
    const width=x1-x0+1,height=y1-y0+1;
    if(width<8||height<8)return null;
    const samples=[];
    for(let yy=y0;yy<=y1;yy+=3)
      for(let xx=x0;xx<=x1;xx+=3)samples.push(gray[yy*w+xx]);
    const background=quantile(samples,.80);
    const threshold=Math.max(35,Math.min(145,background*.52));
    const seen=new Uint8Array(width*height),queue=new Int32Array(width*height);
    let best=null;
    const minSide=side*.53,maxSide=side*1.55;
    for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){
      const start=yy*width+xx;
      if(seen[start]||gray[(yy+y0)*w+xx+x0]>=threshold)continue;
      let head=0,tail=1;queue[0]=start;seen[start]=1;
      let count=0,sumX=0,sumY=0,minX=xx,maxX=xx,minY=yy,maxY=yy;
      while(head<tail){
        const idx=queue[head++],py=Math.floor(idx/width),px=idx-py*width;
        count++;sumX+=px;sumY+=py;
        if(px<minX)minX=px;if(px>maxX)maxX=px;
        if(py<minY)minY=py;if(py>maxY)maxY=py;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;
          const nx=px+dx,ny=py+dy;
          if(nx<0||ny<0||nx>=width||ny>=height)continue;
          const j=ny*width+nx;
          if(seen[j]||gray[(ny+y0)*w+nx+x0]>=threshold)continue;
          seen[j]=1;queue[tail++]=j;
        }
      }
      const bw=maxX-minX+1,bh=maxY-minY+1,solidity=count/(bw*bh);
      if(bw<minSide||bh<minSide||bw>maxSide||bh>maxSide
        ||bw/bh<.66||bw/bh>1.52||solidity<.66)continue;
      const observed=[sumX/count+x0,sumY/count+y0];
      const displacement=Math.hypot(observed[0]-x,observed[1]-y);
      if(displacement>side*1.45)continue;
      const candidate={name:mk.name,predicted:[x,y],observed,
        residualPx:displacement,solidity,sidePx:side};
      const ranking=displacement+Math.abs((bw+bh)/2-side)*.18;
      if(!best||ranking<best.ranking)best={...candidate,ranking};
    }
    if(!best)return null;
    const {ranking,...marker}=best;
    return marker;
  }
  function inspectMarkerGeometry(rect,template){
    const markers=(template.markers||[]).filter(m=>!['TL','TR','BR','BL'].includes(m.name));
    const bubbleRadius=Math.max(1,template.bubbleRadiusCm*
      ((rect.width-1)/template.widthCm+(rect.height-1)/template.heightCm)/2);
    const found=[],byRegion={};
    const regionOf=name=>name.startsWith('P1')?'P1':
      name.startsWith('P2')?'P2':name.startsWith('P3')?'P3':'ID';
    const totals={};
    for(const marker of markers){
      const region=regionOf(marker.name);
      totals[region]=(totals[region]||0)+1;
      const m=measureControlMarker(rect,template,marker);
      if(!m)continue;
      found.push({...m,region,residualR:m.residualPx/bubbleRadius});
      (byRegion[region]||(byRegion[region]=[])).push(m.residualPx/bubbleRadius);
    }
    const regions={};
    for(const [region,total] of Object.entries(totals)){
      const values=byRegion[region]||[];
      regions[region]={matched:values.length,total,
        medianR:values.length?quantile(values,.5):null,
        p90R:values.length?quantile(values,.9):null};
    }
    const enough=found.length>=Math.ceil(markers.length*.60)
      &&['P1','P2','P3'].every(r=>(regions[r]?.matched||0)>=3);
    const affected=Object.entries(regions).filter(([r,s])=>
      ['P1','P2','P3'].includes(r)&&s.matched>=3&&s.p90R>.80).map(([r])=>r);
    // Research-only screening threshold. Not a calibrated failure probability.
    return {status:!enough?'insufficient':affected.length?'review':'ok',
      matched:found.length,total:markers.length,
      medianResidualR:found.length?quantile(found.map(x=>x.residualR),.5):null,
      p90ResidualR:found.length?quantile(found.map(x=>x.residualR),.9):null,
      affected,regions,markers:found};
  }


  // P3 has its own measurement calibration and positional grammar: unlike P1/P2
  // each of its four columns may be empty, '-' is only available at position 1,
  // and ',' is available only in positions 2/3. Never append a guessed zero.
  function measureP3Columns(rect,template){
    return template.p3.map(question=>question.map(column=>
      column.map(point=>point?measureBubble(rect,template,point):null)
    ));
  }
  function calibrateP3(columns){
    const positives=[],negatives=[];
    for(const col of columns){
      const ranked=col.filter(Boolean).slice().sort((a,b)=>b.score-a.score);
      if(!ranked.length)continue;
      const top=ranked[0],next=ranked[1]||{score:0};
      for(const item of ranked.slice(1))negatives.push(item.score);
      // Seed the model using CLEAR columns, including fully marked punctuation.
      // A weak or erased second mark must not influence the positive reference.
      if(top.score>=.20&&top.score-next.score>=.11
        &&top.score/Math.max(.025,next.score)>=1.45&&top.fill>=.55)
        positives.push(top.score);
    }
    const background=quantile(negatives,.78);
    const markReference=quantile(positives,.50);
    const span=markReference-background;
    const reliable=positives.length>=8&&negatives.length>=20&&span>=.12;
    return {
      reliable,positiveSamples:positives.length,negativeSamples:negatives.length,
      background,markReference,
      blankGate:background+.18*span,markGate:background+.30*span,
      separationGate:Math.max(.065,.20*span)
    };
  }
  function classifyP3Column(column,labels,calibration){
    const ranked=column.map((m,i)=>m?{...m,index:i,token:labels[i]}:null)
      .filter(Boolean).sort((a,b)=>b.score-a.score);
    const top=ranked[0],second=ranked[1]||{score:0,fill:0};
    if(!top||!calibration.reliable)
      return {state:'review',token:'?',index:-1,
        reason:'Không đủ dữ liệu rõ để hiệu chuẩn Phần III'};
    const margin=top.score-second.score,relative=second.score/Math.max(.01,top.score);
    const evidence={top:top.score,second:second.score,margin,relative,
      topFill:top.fill,secondFill:second.fill};
    // A clean blank has neither a marked center nor separation from printed
    // outlines. A faint isolated stroke is *review*, not quietly discarded.
    if(top.score<=calibration.blankGate&&top.fill<.57
      &&margin<calibration.separationGate)
      return {...evidence,state:'blank',token:'',index:-1,reason:'Cột không tô'};
    // Two substantial marks in one numeric column must not silently form
    // a legal number. This is a review, not an arbitrary chosen digit.
    if(second.score>=calibration.markGate&&relative>=.72&&second.fill>=.55)
      return {...evidence,state:'multiple',token:'?',index:-1,
        reason:'Cùng một cột có từ hai dấu tô đáng kể'};
    if(top.score<calibration.markGate||top.fill<.57
      ||margin<calibration.separationGate)
      return {...evidence,state:'review',token:'?',index:-1,
        reason:'Không đủ bằng chứng phân biệt nét tô và vết tẩy'};
    return {...evidence,state:'single',token:top.token,index:top.index,reason:''};
  }
  function decodeP3Positions(columns){
    if(columns.length!==4)return {value:'?',reason:'Phiếu không đủ bốn vị trí Phần III'};
    if(columns.some(col=>col.state==='review'||col.state==='multiple'))
      return {value:'?',reason:'Ít nhất một vị trí chưa xác định chắc chắn'};
    const tokens=columns.map(col=>col.token||'');
    const last=tokens.reduce((m,v,i)=>v?i:m,-1);
    if(last<0)return {value:'',reason:''}; // legitimate unanswered P3 question
    if(tokens.slice(0,last+1).some(v=>!v))
      return {value:'?',reason:'Có vị trí bỏ trống giữa các ký tự được tô'};
    const encoded=tokens.slice(0,last+1).join('');
    if(!/^-?\d+(,\d+)?$/.test(encoded))
      return {value:'?',reason:'Vị trí dấu âm, dấu phẩy hoặc chữ số không hợp lệ'};
    return {value:encoded,reason:''};
  }
  function readP3Section(rect,template){
    const metrics=measureP3Columns(rect,template);
    const calibration=calibrateP3(metrics.flat());
    const issues=[],questions=[];
    for(let i=0;i<metrics.length;i++){
      const columns=metrics[i].map((column,j)=>
        classifyP3Column(column,template.p3Labels,calibration));
      const decoded=decodeP3Positions(columns);
      columns.forEach((c,j)=>{
        if(c.state==='review'||c.state==='multiple')issues.push({
          key:'P3.'+(i+1)+'.'+(j+1),state:c.state,
          reason:c.reason,question:i+1,column:j+1
        });
      });
      if(decoded.reason&&!columns.some(c=>['review','multiple'].includes(c.state)))
        issues.push({key:'P3.'+(i+1),state:'review',
          reason:decoded.reason,question:i+1});
      questions.push({value:decoded.value,raw:columns.map(c=>c.token),
        columns,uncertain:!!decoded.reason,reason:decoded.reason});
    }
    return {p3:questions.map(q=>q.value),questions,calibration,issues};
  }

  function analyzeRectified(rect,template){
    if(!rect||!rect.gray||rect.width<1||rect.height<1)throw Error('Rectified gray image required');
    const p1metrics=measureGroups(rect,template,template.p1);
    const p2metrics=measureGroups(rect,template,template.p2);
    const calibration=calibrateSheet(p1metrics);
    const p1raw=p1metrics.map(row=>classifyRow(row,calibration,template.p1Labels));
    const p2raw=p2metrics.map(row=>classifyRow(row,calibration,template.p2Labels));
    const issues=[],invalidMarks=[];
    for(let i=0;i<p1raw.length;i++)if(['review','multiple'].includes(p1raw[i].state)){
      const key='P1.'+(i+1);issues.push({key,reason:p1raw[i].reason,state:p1raw[i].state});
      if(p1raw[i].state==='multiple')invalidMarks.push(key);
    }
    for(let i=0;i<p2raw.length;i++)if(['review','multiple'].includes(p2raw[i].state)){
      const key='P2.'+(Math.floor(i/4)+1)+'abcd'[i%4];
      issues.push({key,reason:p2raw[i].reason,state:p2raw[i].state});
      if(p2raw[i].state==='multiple')invalidMarks.push(key);
    }
    const choices=p2raw.map(row=>row.value||'?');
    const p3Section=readP3Section(rect,template);
    issues.push(...p3Section.issues);
    return {engine:'SHEET_NORMALIZED_V6_EXPERIMENTAL',calibration,
      p1:p1raw.map(row=>row.value||'?').join(''),
      p2:Array.from({length:4},(_,i)=>choices.slice(i*4,i*4+4).join('-')),
      p1Evidence:p1raw,p2Evidence:p2raw,
      p3:p3Section.p3,p3Evidence:p3Section.questions,
      p3Calibration:p3Section.calibration,issues,invalidMarks,
      lighting:inspectLighting([...p1metrics,...p2metrics]),
      geometry:inspectMarkerGeometry(rect,template)};
  }
  return {quantile,samplePaper,measureBubble,calibrateSheet,classifyRow,inspectLighting,
    measureControlMarker,inspectMarkerGeometry,analyzeRectified,
    measureP3Columns,calibrateP3,classifyP3Column,decodeP3Positions,readP3Section};
});
