(function(root,factory){
  const copied=typeof module==='object'&&module.exports
    ?require('./omr-reliability-v7-baseline.js')
    :root.DamSanOmrReliabilityV7Baseline;
  const local=typeof module==='object'&&module.exports
    ?require('./omr-v7-local-refinement.js')
    :root.DamSanOmrV7LocalRefinement;
  const plugin=name=>typeof module==='object'&&module.exports
    ?require('./omr-v7-'+name+'.js')
    :root['DamSanOmrV7'+({quality:'Quality',geometry:'Geometry',
      lighting:'Lighting',marks:'Marks',numeric:'Numeric'}[name])];
  const api=factory(copied,local,{
    quality:plugin('quality'),geometry:plugin('geometry'),
    lighting:plugin('lighting'),marks:plugin('marks'),numeric:plugin('numeric')
  });
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DamSanOmrV7Candidate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(B,Refine,Ext){
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
  function analyzeRectified(rect,T,opts={}){
    checkTemplate(T);
    // ALL THREE SECTIONS AND INTERNAL MARKERS: exact independent V6 copy.
    const baseline=B.analyzeRectified(rect,T);
    // Experimental only: explicitly opt in, and let the additive module
    // operate solely on existing V6 lighting-review rows with valid markers.
    // The normal PWA path stays exact-V6 until validated on real photos.
    if(opts.experimentalRefinement===true&&typeof Refine?.apply!=='function')
      throw Error('V7_REFINEMENT_MODULE_MISSING');
    const experiment=opts.experimentalRefinement===true;
    const geo=Ext.geometry.fit(rect,T,baseline.geometry);
    const local=experiment?Refine.apply(rect,T,B,baseline):
      {scan:baseline,applied:[]};
    let result=local.scan;
    const applied=[...local.applied];
    if(experiment){
      const lighting=applyLighting(rect,T,B,result,geo);
      result=lighting.scan;applied.push(...lighting.applied);
      const numeric=Ext.numeric.apply(rect,T,B,result);
      result=numeric.scan;applied.push(...numeric.applied);
    }
    const problems=[];
    if(result.calibration?.reliable!==true)
      problems.push('Phần I/II chưa hiệu chuẩn được mực tô');
    if(result.p3Calibration?.reliable!==true)
      problems.push('Phần III chưa hiệu chuẩn được mực tô');
    const geometryDiagnostic=result.geometry?.status||'not_available';
    if(geometryDiagnostic!=='ok')
      problems.push('Mốc khống chế bên trong phiếu chưa đạt chất lượng');
    const byPart={P1:0,P2:0,P3:0};
    for(const issue of result.issues||[]){
      const section=String(issue.key).slice(0,2);
      if(Object.prototype.hasOwnProperty.call(byPart,section))byPart[section]++;
    }
    return {...result,
      engine:'V7_COMPLETE_CANDIDATE',
      baselineEngine:'V6_EXACT_COPY',
      readOnly:true,validForSave:false,
      ok:problems.length===0,requiresRetake:problems.length>0,
      retakeReasons:problems,requiresReview:result.issues.length>0,
      geometryDiagnostic,geometryApplied:false,
      quality:{...inspectQuality(rect),...Ext.quality.assess(rect),
        answerZones:Ext.quality.inspectZones(rect,T)},
      enhancements:{mode:experiment?'experimental_all_modules':'observe_only',
        applied,answerChanges:applied.length,issueCounts:byPart,
        geometry:{reliable:geo.reliable,regions:geo.regions},
        markRisk:Ext.marks.inspect(baseline)}};
  }
  // Secondary 8-probe illumination model: cannot override V6 singles,
  // blank rows, multiple marks, or anything other than lighting reviews.
  function applyLighting(rect,T,B,baseline,geometry){
    const edits=[],changed=new Set(),e1=baseline.p1Evidence.slice(),
      e2=baseline.p2Evidence.slice();
    if(baseline.geometry?.status!=='ok'
      ||baseline.calibration?.reliable!==true)
      return {scan:baseline,applied:edits};
    function handle(rows,evidence,labels,section){
      rows.forEach((row,i)=>{
        const original=evidence[i];
        if(original?.state!=='review'||
          original.reason!=='Nền sáng không đều và dấu tô chưa đủ tách biệt'
          ||original.secondRelative>=.20||original.secondFill>=.18)
          return;
        const key=section==='P1'?'P1.'+(i+1):
          'P2.'+(Math.floor(i/4)+1)+'abcd'[i%4];
        if((baseline.invalidMarks||[]).includes(key))return;
        const baseMetrics=row.map(p=>B.measureBubble(rect,T,p));
        const ranked=baseMetrics.map((m,j)=>({j,score:m.score}))
          .sort((a,b)=>b.score-a.score);
        const best=ranked[0];
        if(!best||best.score-(ranked[1]?.score||0)<.08)return;
        const geom=Ext.geometry.offset(geometry,section,rect,T);
        const center=Ext.lighting.inspect(rect,T,B,row,
          baseline.calibration,labels,geom);
        if(center.glare||center.choice.state!=='single'
          ||center.choice.index!==best.j||center.choice.topFill<.62
          ||center.choice.secondRelative>=.18)return;
        let consensus=0;
        const radius=T.bubbleRadiusCm;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const samples=[.2,.4,.6].map(level=>Ext.lighting.inspect(
            rect,T,B,row,baseline.calibration,labels,
            {dx:geom.dx+dx*level*radius,dy:geom.dy+dy*level*radius}));
          if(samples.every(s=>!s.glare&&s.choice.state==='single'
             &&s.choice.index===best.j&&s.choice.topFill>=.60
             &&s.choice.secondRelative<.18))consensus++;
        }
        if(consensus<1)return;
        evidence[i]={...original,...center.choice,
          refinement:'robust_eight_probe_lighting'};
        edits.push({key,from:original.value,to:center.choice.value,
          method:'robust_eight_probe_lighting',consensus});
        changed.add(key);
      });
    }
    handle(T.p1,e1,T.p1Labels,'P1');
    handle(T.p2,e2,T.p2Labels,'P2');
    if(!edits.length)return {scan:baseline,applied:edits};
    const items=e2.map(e=>e.value||'?');
    return {scan:{...baseline,
      p1:e1.map(e=>e.value||'?').join(''),
      p2:Array.from({length:4},(_,i)=>items.slice(i*4,i*4+4).join('-')),
      p1Evidence:e1,p2Evidence:e2,
      issues:baseline.issues.filter(x=>!changed.has(x.key))},
      applied:edits};
  }
  // The old signature is retained for compatibility. The V6 argument is
  // deliberately unused: V7 owns and runs its own copied V6 engine.
  function analyzeValidatedRectified(rect,T,_v6,opts={}){
    return analyzeRectified(rect,T,opts);
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
    return {...analyzeRectified(rect,T,opts),markerCorners:markers.corners,
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
  return {inspectQuality,applyLighting,analyzeRectified,analyzeValidatedRectified,
    analyzeImageData,compare};
});
