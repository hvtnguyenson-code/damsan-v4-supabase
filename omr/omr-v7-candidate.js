(function(root,factory){
  const copied=typeof module==='object'&&module.exports
    ?require('./omr-reliability-v7-baseline.js')
    :root.DamSanOmrReliabilityV7Baseline;
  const api=factory(copied);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DamSanOmrV7Candidate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(B){
  'use strict';
  if(typeof B?.analyzeRectified!=='function')throw Error('V7_V6_COPY_NOT_LOADED');
  function checkTemplate(T){
    if(!T||T.p1?.length!==18||T.p2?.length!==16
      ||T.p3?.length!==6||T.p3.some(x=>x.length!==4))
      throw Error('V7_REQUIRES_VALIDATED_18_4_6_TEMPLATE');
  }
  // A non-scoring observational module: no adjustments to baseline pixels,
  // answer choices, threshold decisions, geometry, or candidate risk gates.
  function inspectQuality(rect){
    const {gray:g,width:w,height:h}=rect||{};
    if(!g||w<8||h<8||g.length!==w*h)throw Error('V7_INVALID_RECT');
    const step=Math.max(8,Math.floor(Math.min(w,h)/150));
    let focus=0,bright=0,dark=0,n=0;
    for(let y=2;y<h-2;y+=step)for(let x=2;x<w-2;x+=step){
      const i=y*w+x,v=g[i];
      focus+=Math.abs(4*v-g[i-1]-g[i+1]-g[i-w]-g[i+w]);
      bright+=v>=253?1:0;dark+=v<50?1:0;n++;
    }
    return {relativeFocus:focus/Math.max(1,n),
      clippedFraction:bright/Math.max(1,n),
      darkFraction:dark/Math.max(1,n),samples:n,
      diagnosticOnly:true,changesAnswers:false};
  }
  function analyzeRectified(rect,T){
    checkTemplate(T);
    // ALL THREE SECTIONS AND INTERNAL MARKERS: exact independent V6 copy.
    const baseline=B.analyzeRectified(rect,T);
    const problems=[];
    if(baseline.calibration?.reliable!==true)
      problems.push('Phần I/II chưa hiệu chuẩn được mực tô');
    if(baseline.p3Calibration?.reliable!==true)
      problems.push('Phần III chưa hiệu chuẩn được mực tô');
    const geometryDiagnostic=baseline.geometry?.status||'not_available';
    if(geometryDiagnostic!=='ok')
      problems.push('Mốc khống chế bên trong phiếu chưa đạt chất lượng');
    const byPart={P1:0,P2:0,P3:0};
    for(const issue of baseline.issues||[]){
      const section=String(issue.key).slice(0,2);
      if(Object.prototype.hasOwnProperty.call(byPart,section))byPart[section]++;
    }
    return {...baseline,
      engine:'V7_COMPLETE_CANDIDATE',
      baselineEngine:'V6_EXACT_COPY',
      readOnly:true,validForSave:false,
      ok:problems.length===0,requiresRetake:problems.length>0,
      retakeReasons:problems,requiresReview:baseline.issues.length>0,
      geometryDiagnostic,geometryApplied:false,
      quality:inspectQuality(rect),
      enhancements:{mode:'observe_only',applied:[],answerChanges:0,
        issueCounts:byPart}};
  }
  // The old signature is retained for compatibility. The V6 argument is
  // deliberately unused: V7 owns and runs its own copied V6 engine.
  function analyzeValidatedRectified(rect,T,_v6){
    return analyzeRectified(rect,T);
  }
  function analyzeImageData(imageData,T,core,_v6,opts={}){
    checkTemplate(T);
    if(!core?.grayscale||!core?.detectCornerMarkers
      ||!core?.fastTemplateRegistration||!core?.warpTemplateGray)
      throw Error('V7_MISSING_CANONICAL_GEOMETRY');
    const {data,width:w,height:h}=imageData||{};
    if(!data||!w||!h||data.length!==w*h*4)
      throw Error('V7_INVALID_CAMERA_IMAGE');
    const gray=core.grayscale(data,w,h),markers=core.detectCornerMarkers(gray,w,h);
    if(!markers.ok)return {ok:false,readOnly:true,validForSave:false,
      requiresRetake:true,retakeReasons:['Không đủ bốn mốc góc'],
      error:'Không đủ bốn mốc góc',stage:'registration'};
    const registration=core.fastTemplateRegistration(T,markers,w,h);
    if(!registration.ok)return {ok:false,readOnly:true,validForSave:false,
      requiresRetake:true,retakeReasons:['Nắn phối cảnh không đạt'],
      error:'Nắn phối cảnh không đạt',stage:'registration'};
    const rect=core.warpTemplateGray(gray,w,h,registration.H,T,opts.longSide||1800);
    return {...analyzeRectified(rect,T),markerCorners:markers.corners,
      markerMatches:registration.matches,markerRmse:registration.rmse,
      rectifiedSize:[rect.width,rect.height],registrationOk:true};
  }
  function compare(v6,v7){
    if(v7?.engine!=='V7_COMPLETE_CANDIDATE')
      throw Error('V7 result required');
    if(!v6||!Array.isArray(v6.p2)||!Array.isArray(v6.p3))
      return {available:false,differences:[]};
    const differences=[],add=(key,a,b)=>{
      if(String(a??'')!==String(b??''))differences.push({key,v6:a,v7:b});
    };
    for(let i=0;i<18;i++)add('P1.'+(i+1),v6.p1?.[i],v7.p1?.[i]);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)
      add('P2.'+(i+1)+'abcd'[j],
        v6.p2[i]?.split('-')[j],v7.p2[i]?.split('-')[j]);
    for(let i=0;i<6;i++)add('P3.'+(i+1),v6.p3[i],v7.p3[i]);
    return {available:true,differences,count:differences.length};
  }
  return {inspectQuality,analyzeRectified,analyzeValidatedRectified,
    analyzeImageData,compare};
});
