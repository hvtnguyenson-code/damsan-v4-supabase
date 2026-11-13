(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DamSanOmrV7LocalRefinement=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // A targeted additive refinement. NEVER reclassify existing V6 singles,
  // blank rows, multiple marks or potential erasures. Only V6 reviews caused
  // by a high-gradient probe may be eligible, and never with unverified
  // internal marker geometry.
  const DIRECTIONS=[
    {dx:1,dy:0,label:'x+'},{dx:-1,dy:0,label:'x-'},
    {dx:0,dy:1,label:'y+'},{dx:0,dy:-1,label:'y-'}
  ];
  const LEVELS=[.2,.4,.6];
  const LIGHTING_REASON='Nền sáng không đều và dấu tô chưa đủ tách biệt';
  function candidateAt(rect,T,B,points,cal,labels,dx,dy){
    const radius=T.bubbleRadiusCm;
    const metrics=points.map(point=>B.measureBubble(rect,T,
      [point[0]+dx*radius,point[1]+dy*radius]));
    return B.classifyRow(metrics,cal,labels);
  }
  function eligible(original,cal){
    return cal?.reliable===true
      &&original?.state==='review'
      &&original.reason===LIGHTING_REASON
      &&Number.isFinite(original.topRelative)
      &&original.topRelative>=.34
      &&original.topFill>=.25
      &&original.separation>=.22
      &&original.secondRelative<.20
      &&original.secondFill<.18;
  }
  function isDecisive(sample){
    return sample?.state==='single'
      &&sample.topFill>=.67
      &&sample.topRelative>=.56
      &&sample.separation>=.30
      &&sample.secondRelative<.18
      &&sample.secondFill<.18
      &&sample.maxLightingGradient<=.38;
  }
  function tryRecover(rect,T,B,points,cal,labels,original){
    if(!eligible(original,cal))return null;
    const atZero=points.map(p=>B.measureBubble(rect,T,p));
    const ranked=atZero.map((m,i)=>({...m,i})).sort((a,b)=>b.score-a.score);
    if(!ranked.length||ranked[0].score-rankedSecond(ranked)<.08)return null;
    const topIndex=ranked[0].i; // Never switch to another option.
    const decisions=[];
    for(const dir of DIRECTIONS){
      const scans=LEVELS.map(level=>candidateAt(rect,T,B,points,cal,labels,
        dir.dx*level,dir.dy*level));
      if(scans.every(s=>isDecisive(s)&&s.index===topIndex))
        decisions.push(dir.label);
    }
    if(!decisions.length)return null;
    return {state:'single',value:labels[topIndex],index:topIndex,
      direction:decisions[0],paths:decisions.length,
      reason:'',refinement:'consistent_local_recenter'};
  }
  function rankedSecond(a){return a[1]?.score||0;}
  function apply(rect,T,B,baseline){
    if(!baseline||!B?.measureBubble||!B?.classifyRow
      ||baseline.calibration?.reliable!==true
      ||baseline.geometry?.status!=='ok')
      return {scan:baseline,applied:[],reason:'geometry_or_calibration_not_verified'};
    const e1=baseline.p1Evidence.slice(),e2=baseline.p2Evidence.slice();
    const applied=[],keys=new Set();
    function recover(rows,evidence,labels,section){
      for(let i=0;i<rows.length;i++){
        const original=evidence[i];
        const fixed=tryRecover(rect,T,B,rows[i],baseline.calibration,
          labels,original);
        if(!fixed)continue;
        const key=section==='P1'?'P1.'+(i+1):
          'P2.'+(Math.floor(i/4)+1)+'abcd'[i%4];
        if(baseline.invalidMarks.includes(key))continue;
        evidence[i]={...original,...fixed};
        keys.add(key);
        applied.push({key,from:original.value,to:fixed.value,
          method:fixed.refinement,axis:fixed.direction});
      }
    }
    recover(T.p1,e1,T.p1Labels,'P1');
    recover(T.p2,e2,T.p2Labels,'P2');
    if(!applied.length)return {scan:baseline,applied};
    const choices=e2.map(e=>e.value||'?');
    const scan={...baseline,p1:e1.map(e=>e.value||'?').join(''),
      p2:Array.from({length:4},(_,i)=>choices.slice(i*4,i*4+4).join('-')),
      p1Evidence:e1,p2Evidence:e2,
      issues:baseline.issues.filter(issue=>!keys.has(issue.key))};
    return {scan,applied};
  }
  return {LEVELS,LIGHTING_REASON,eligible,isDecisive,
    candidateAt,tryRecover,apply};
});
