(function(root,factory){
  'use strict';
  const R=typeof module==='object'&&module.exports
    ?require('./omr-v7-research.js'):root.DamSanOmrV7Research;
  const api=factory(R);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DamSanOmrV7Candidate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(R){
  'use strict';
  if(!R)throw Error('v7_research_dependency_missing');
  const q=R.quantile;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const safeNum=n=>Number.isFinite(n)?n:null;
  function checkTemplate(T){
    if(!T||T.p1?.length!==18||T.p2?.length!==16||T.p3?.length!==6
      ||T.p3.some(x=>x.length!==4)||!Array.isArray(T.markers))
      throw Error('V7 cần đúng mẫu phiếu 18–4–6');
  }
  function measureP3(rect,T,geometry){
    return T.p3.map(question=>question.map(column=>
      column.map(pt=>pt?R.measureBubble(rect,T,pt,geometry):null)));
  }
  // The independent numeric model is calibrated on 24 four-position columns,
  // NOT the V6 P3 threshold logic. A column may be intentionally blank.
  function calibrateP3(matrix,p1Calibration){
    const positives=[],negative=[],blankCandidates=[];
    for(const col of matrix.flat()){
      const ranked=col.filter(Boolean).slice().sort((a,b)=>b.score-a.score);
      if(!ranked.length)continue;
      const top=ranked[0],second=ranked[1]||{score:0};
      for(const m of ranked.slice(1))negative.push(m.score);
      if(top.score>=.17&&top.fill>=.48&&top.score-second.score>=.11
        &&top.score/Math.max(.025,second.score)>=1.45)positives.push(top.score);
      if(top.score<.16)blankCandidates.push(top.score);
    }
    const background=q(negative,.80),native=positives.length>=7;
    const transferred=!native&&p1Calibration?.reliable===true;
    const mark=transferred?p1Calibration.mark:q(positives,.5),span=mark-background;
    return {reliable:negative.length>=20&&span>=.13&&(native||transferred),
      background,mark,span,source:transferred?'P1_TRANSFER':'P3_SELF',
      positiveSamples:positives.length,negativeSamples:negative.length,
      blankSamples:blankCandidates.length};
  }
  function decideP3Column(metrics,labels,cal){
    const ordered=metrics.map((m,index)=>m?{...m,index,token:labels[index]}:null)
      .filter(Boolean).sort((a,b)=>b.score-a.score);
    if(!ordered.length||!cal?.reliable)
      return {state:'review',token:'?',reason:'Không đủ dữ liệu hiệu chuẩn Phần III'};
    const top=ordered[0],second=ordered[1]||{score:0,fill:0,clipped:0};
    const span=Math.max(.13,cal.span);
    const strength=(top.score-cal.background)/span;
    const secondStrength=(second.score-cal.background)/span;
    const margin=(top.score-second.score)/span;
    const ev={top:top.score,second:second.score,topFill:top.fill,
      secondFill:second.fill,strength,secondStrength,margin};
    if(ordered.some(m=>m.clipped>.28))
      return {...ev,state:'review',token:'?',reason:'Phản sáng tại cột số'};
    if(top.score<=cal.background+.10*span&&top.fill<.13)
      return {...ev,state:'blank',token:'',reason:'Cột bỏ trống'};
    // Two independently substantial pencil regions: never choose a winner.
    if(secondStrength>=.55&&second.fill>=.47
      &&second.score/Math.max(.04,top.score)>=.61)
      return {...ev,state:'multiple',token:'?',reason:'Tô nhiều ô tại cùng vị trí số'};
    if(secondStrength>=.26&&second.fill>=.21)
      return {...ev,state:'review',token:'?',reason:'Vết tẩy hoặc nét tô thứ hai tại cột số'};
    if(strength<.34||top.fill<.45||margin<.20||top.gradient>.58)
      return {...ev,state:'review',token:'?',reason:'Nét số hoặc điều kiện sáng chưa rõ'};
    return {...ev,state:'single',token:top.token,index:top.index,reason:''};
  }
  function decodeP3(columns){
    if(!Array.isArray(columns)||columns.length!==4)
      return {value:'?',reason:'Không đủ bốn vị trí số'};
    if(columns.some(c=>c.state==='review'||c.state==='multiple'))
      return {value:'?',reason:'Có vị trí chưa phân biệt được nét tô'};
    const tokens=columns.map(c=>c.token||'');
    const last=tokens.reduce((idx,s,i)=>s!==''?i:idx,-1);
    if(last<0)return {value:'',reason:''};
    const used=tokens.slice(0,last+1);
    if(used.some(s=>s===''))
      return {value:'?',reason:'Bỏ trống giữa các ký tự đã tô'};
    const value=used.join('');
    if(!/^-?\d+(,\d+)?$/.test(value))
      return {value:'?',reason:'Dấu âm, dấu phẩy hoặc chữ số không hợp lệ'};
    return {value,reason:''};
  }
  function readP3(rect,T,geometry,p1Calibration){
    const metrics=measureP3(rect,T,geometry);
    const calibration=calibrateP3(metrics,p1Calibration);
    const questions=[],issues=[];
    metrics.forEach((question,i)=>{
      const columns=question.map(col=>decideP3Column(col,T.p3Labels,calibration));
      const decoded=decodeP3(columns);
      columns.forEach((c,j)=>{
        if(['multiple','review'].includes(c.state))
          issues.push({key:'P3.'+(i+1)+'.'+(j+1),state:c.state,reason:c.reason});
      });
      if(decoded.reason&&!columns.some(c=>['multiple','review'].includes(c.state)))
        issues.push({key:'P3.'+(i+1),state:'review',reason:decoded.reason});
      questions.push({...decoded,columns});
    });
    return {p3:questions.map(x=>x.value),questions,issues,calibration};
  }
  // A real reflection can destroy graphite evidence. Use image metrics only to
  // flag inadequacy; never hallucinate a missing pencil stroke by enhancement.
  function inspectQuality(rect,T){
    const stats=R.frameQuality(rect);
    const backgrounds=[];
    const {gray,width:w,height:h}=rect;
    const step=Math.max(1,Math.floor(Math.min(w,h)/160));
    for(let y=step;y<h-step;y+=step)for(let x=step;x<w-step;x+=step){
      if((x+y)%(step*5)===0)backgrounds.push(gray[y*w+x]);
    }
    const spread=q(backgrounds,.90)-q(backgrounds,.10);
    // Correctly exposed white paper often reaches maximum brightness.
    // Do not call its saturation proof of missing graphite evidence.
    return {...stats,paperSpread:spread,suspectedHighlights:stats.clippedFraction>.35,
      warning:stats.darkFraction>.70?'Ảnh quá tối để chấm tin cậy':'',
      relativeOnly:true};
  }
  function analyzeRectified(rect,T,opts={}){
    checkTemplate(T);
    const quality=inspectQuality(rect,T);
    const geometry=opts.geometryModel?.reliable?opts.geometryModel:null;
    const part12=R.analyzeRectified(rect,T,{geometryModel:geometry});
    const third=readP3(rect,T,geometry,part12.calibration);
    const issues=[...part12.issues,...third.issues];
    const blocking=[];
    if(!part12.calibration.reliable)blocking.push('Không hiệu chuẩn được Phần I/II');
    if(!third.calibration.reliable)blocking.push('Không hiệu chuẩn được Phần III');
    if(opts.geometryRequired&&!geometry)blocking.push('Không xác định đủ mốc hình học nội bộ');
    if(quality.warning)blocking.push(quality.warning);
    // A real dark/bright artifact around individual filled bubbles should
    // create item-level review, never be automatically corrected.
    return {engine:'V7_COMPLETE_CANDIDATE',readOnly:true,validForSave:false,
      captureMode:'research',ok:blocking.length===0,
      p1:part12.p1,p2:part12.p2,p3:third.p3,
      p1Evidence:part12.p1Evidence,p2Evidence:part12.p2Evidence,p3Evidence:third.questions,
      calibration:part12.calibration,p3Calibration:third.calibration,
      quality,geometryApplied:!!geometry,
      invalidMarks:part12.invalidMarks,issues,
      requiresRetake:blocking.length>0,retakeReasons:blocking,
      requiresReview:issues.length>0};
  }
  // Reuse V5's validated four-corner image rather than detecting/warping it
  // twice. V7 alone classifies all answer rows; V6 only inspects printed
  // internal controls and never supplies P1/P2/P3 answers.
  function analyzeValidatedRectified(rect,T,v6){
    checkTemplate(T);
    if(typeof v6?.inspectMarkerGeometry!=='function')
      throw Error('V7 cần kiểm tra mốc khống chế nội bộ');
    const diagnostic=v6.inspectMarkerGeometry(rect,T);
    const r=T.bubbleRadiusCm*
      ((rect.width-1)/T.widthCm+(rect.height-1)/T.heightCm)/2;
    const model=Array.isArray(diagnostic?.markers)
      ?R.fitLocalGeometry(diagnostic.markers.map(m=>({
        region:m.region,predicted:m.predicted,observed:m.observed
      })),r):null;
    const scan=analyzeRectified(rect,T,{geometryModel:model});
    const status=diagnostic?.status||'not_available';
    const blocking=[...scan.retakeReasons];
    if(status!=='ok')blocking.push('Mốc khống chế bên trong chưa đạt ('+status+')');
    return {...scan,ok:blocking.length===0,requiresRetake:blocking.length>0,
      retakeReasons:blocking,geometryDiagnostic:status,
      geometryModel:model?{reliable:model.reliable,matched:model.matched,
        rejected:model.rejected,p90DisplacementR:model.p90DisplacementR}:null};
  }
  // Use the validated existing outer-corner registration for apples-to-apples
  // V6/V7 comparison; no student RPC and no database access whatsoever.
  function analyzeImageData(imageData,T,core,v6,opts={}){
    checkTemplate(T);
    if(!core?.grayscale||!core?.detectCornerMarkers||
      !core?.fastTemplateRegistration||!core?.warpTemplateGray)
      throw Error('V7 thiếu bộ hiệu chỉnh bốn góc đã kiểm chứng');
    const {data,width:w,height:h}=imageData;
    if(!data||!w||!h||data.length!==w*h*4)
      throw Error('Ảnh camera không hợp lệ');
    const gray=core.grayscale(data,w,h);
    const markers=core.detectCornerMarkers(gray,w,h);
    if(!markers.ok)return {ok:false,readOnly:true,validForSave:false,
      error:'Không nhận đủ bốn mốc góc ngoài',stage:'registration'};
    const reg=core.fastTemplateRegistration(T,markers,w,h);
    if(!reg.ok)return {ok:false,readOnly:true,validForSave:false,
      error:'Hình học bốn góc không đạt, chụp lại phiếu',stage:'registration'};
    const rect=core.warpTemplateGray(gray,w,h,reg.H,T,opts.longSide||1800);
    let geometry=null,geometryDiagnostic=null;
    if(v6?.inspectMarkerGeometry){
      geometryDiagnostic=v6.inspectMarkerGeometry(rect,T);
      if(Array.isArray(geometryDiagnostic?.markers)){
        const r=T.bubbleRadiusCm*((rect.width-1)/T.widthCm+(rect.height-1)/T.heightCm)/2;
        geometry=R.fitLocalGeometry(geometryDiagnostic.markers.map(m=>({
          region:m.region,predicted:m.predicted,observed:m.observed
        })),r);
      }
    }
    const scan=analyzeRectified(rect,T,{geometryModel:geometry,
      geometryRequired:opts.requireInternalGeometry===true});
    // Fail closed when the official inner control-marker diagnostic is not
    // acceptable. The corrected coordinates may still be inspected, but no
    // research output can be treated as validated or written to DB.
    if(geometryDiagnostic&&geometryDiagnostic.status!=='ok'){
      scan.requiresRetake=true;
      scan.ok=false;
      scan.retakeReasons=[...scan.retakeReasons,
        'Mốc khống chế bên trong chưa đạt ('+geometryDiagnostic.status+')'];
    }
    return {...scan,markerCorners:markers.corners,
      markerMatches:reg.matches,markerRmse:reg.rmse,
      geometryDiagnostic:geometryDiagnostic?.status||'not_available',
      geometryModel:geometry?{reliable:geometry.reliable,matched:geometry.matched,
        rejected:geometry.rejected,p90DisplacementR:geometry.p90DisplacementR}:null,
      rectifiedSize:[rect.width,rect.height],registrationOk:true};
  }
  function compare(v6,v7){
    if(!v7||v7.engine!=='V7_COMPLETE_CANDIDATE')throw Error('V7 result required');
    if(!v6||!Array.isArray(v6.p2)||!Array.isArray(v6.p3))
      return {available:false,differences:[]};
    const differences=[];
    const add=(key,a,b)=>{if(String(a??'')!==String(b??''))differences.push({key,v6:a,v7:b});};
    for(let i=0;i<18;i++)add('P1.'+(i+1),v6.p1?.[i],v7.p1?.[i]);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)
      add('P2.'+(i+1)+'abcd'[j],v6.p2[i]?.split('-')[j],v7.p2[i]?.split('-')[j]);
    for(let i=0;i<6;i++)add('P3.'+(i+1),v6.p3[i],v7.p3[i]);
    return {available:true,differences,count:differences.length};
  }
  return {measureP3,calibrateP3,decideP3Column,decodeP3,readP3,inspectQuality,
    analyzeRectified,analyzeValidatedRectified,analyzeImageData,compare};
});
