(function(root,factory){
 const resolve=(name,globalName)=>typeof module==='object'&&module.exports?
  require('./'+name+'.js'):root[globalName];
 const api=factory(resolve('omr-v7-geometry-066','DamSanOmrV7Geometry066'),
  resolve('omr-v7-ink-060','DamSanOmrV7Ink060'));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrV7Pipeline066=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Geometry,Ink){
'use strict';
// OMR 066 isolated geometry experiment based on 060. No submission, storage or PWA hooks.
// Official V7 and research 060 remain unchanged; fallback geometry only in 066.
function readIdentity(rect,T,Core){
 const fields=[
  {key:'SBD',name:'sbd',points:T.sbd,labels:T.sbdLabels,length:8},
  {key:'MADE',name:'maDe',points:T.maDe,labels:T.maDeLabels,length:4}
 ];
 const values={},issues=[];
 for(const field of fields){
  const out=Core.readDigitsRectified(rect,T,field.points,field.labels,T.bubbleRadiusCm);
  values[field.name]=out.value;
  for(const detail of out.details||[])
   issues.push({key:field.key+'.'+(detail.index+1),
    reason:detail.reason||'Chữ số chưa xác định',
    top:detail.top??null,second:detail.second??null});
  // A letter-like or partly absent ID cannot be promoted by a known student
  // list, an exam code, or the presumed score. Fail closed.
  if(!new RegExp('^[0-9]{'+field.length+'}$').test(out.value))
   issues.push({key:field.key,reason:'Chưa đọc đủ '+field.length+' chữ số'});
  for(let i=0;i<field.points.length;i++){
   const metrics=field.points[i].map(pt=>Core.bubbleInkScore(
    rect.gray,rect.width,rect.height,T,pt,T.bubbleRadiusCm));
   const ranked=metrics.map((m,j)=>({index:j,score:m.score,
     center:m.centerInk25||0,contrast:m.centerContrast||0}))
    .sort((a,b)=>b.score-a.score);
   const top=ranked[0],second=ranked[1];
   if(!top||!second)continue;
   const relative=second.score/Math.max(.05,top.score);
   if(top.score>=.27&&second.score>=.27&&relative>=.72
     &&second.center>=.30&&second.contrast>=.14){
    issues.push({key:field.key+'.'+(i+1),
      reason:'Hai dấu tô đáng kể trong một cột danh tính',
      top:top.score,second:second.score});
   }
  }
 }
 return {sbd:values.sbd,maDe:values.maDe,
  valid:issues.length===0,
  issues:[...new Map(issues.map(e=>[e.key,e])).values()]};
}
function compareAnswers(reference,candidate){
 const changes=[],add=(k,a,b)=>{
   const lhs=String(a??''),rhs=String(b??'');
   const numeric=(k==='SBD'||k==='MADE')&&/^[0-9]+$/.test(lhs)&&/^[0-9]+$/.test(rhs);
   if(!(numeric?Number(lhs)===Number(rhs):lhs===rhs))
     changes.push({key:k,old:a??null,proposed:b??null});
 };
 if(reference){
  add('SBD',reference.sbd,candidate.identity?.sbd);
  add('MADE',reference.maDe,candidate.identity?.maDe);
  for(let i=0;i<18;i++)add('P1.'+(i+1),reference.p1?.[i],candidate.answers?.p1?.[i]);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)
   add('P2.'+(i+1)+'abcd'[j],reference.p2?.[i]?.split('-')?.[j],
    candidate.answers?.p2?.[i]?.split('-')?.[j]);
  for(let i=0;i<6;i++)add('P3.'+(i+1),reference.p3?.[i],candidate.answers?.p3?.[i]);
 }
 return {compared:!!reference,changes,count:changes.length};
}
function analyze(imageData,T,{core,V7,reference=null,longSide=1800,expectedStudentCode=null,expectedExamCode=null}={}){
 const {width:w,height:h,data}=imageData||{};
 if(!core||!V7||!data||!Number.isInteger(w)||!Number.isInteger(h)
   ||data.length!==w*h*4||w<80||h<80)
  return {ok:false,readOnly:true,reason:'invalid_camera_frame'};
 const started=typeof performance!=='undefined'?performance.now():Date.now();
 const gray=core.grayscale(data,w,h); // once, not legacy V5 followed by V7
 const registration=Geometry.register(gray,w,h,T,core);
 if(!registration.ok)return {ok:false,readOnly:true,
  reason:registration.reason,stage:'registration',
  registration,answers:null,identity:null};
 // 32 captured sheets replayed at 1500px produced P3 differences, whereas
 // 1800px matched all recorded automatic decisions. Preserve that resolution.
 const requested=Number(longSide);
 const safeLongSide=Math.max(1800,Math.min(2254,Number.isFinite(requested)?Math.round(requested):1800));
 const rect=core.warpTemplateGray(gray,w,h,registration.H,T,safeLongSide);
 const measured=readIdentity(rect,T,core);
 // Optional binding against an already selected DB student/variant: fail
 // closed on mismatch. NEVER invent or correct answer marks from DB identity.
 const sameDigits=(a,b)=>/^[0-9]+$/.test(String(a))&&/^[0-9]+$/.test(String(b))
   &&Number(a)===Number(b);
 const bindingIssues=[];
 if(expectedStudentCode!=null&&!sameDigits(measured.sbd,expectedStudentCode))
   bindingIssues.push({key:'SBD_BINDING',reason:'SBD trên phiếu không trùng hồ sơ được gắn'});
 if(expectedExamCode!=null&&!sameDigits(measured.maDe,expectedExamCode))
   bindingIssues.push({key:'MADE_BINDING',reason:'Mã đề trên phiếu không trùng mã đề đã gắn'});
 const identity={...measured,valid:measured.valid&&bindingIssues.length===0,
   issues:[...measured.issues,...bindingIssues]};
 // The same perspective-normalized pixels are used for SBD, variant and
 // P1/II/III. No second warp and NO legacy three-part V5 analysis.
 const candidate={...V7.analyzeValidatedRectified(rect,T,null,
  {experimentalRefinement:true}),
   engine:'OMR066_RESEARCH_CANDIDATE',omr066ResearchOnly:true};
 const ink=Ink.inspect(rect,T,candidate);
 const answers={p1:candidate.p1,p2:candidate.p2,p3:candidate.p3};
 const issues=[...identity.issues,...(candidate.issues||[])];
 const analysis={ok:identity.valid&&candidate.ok===true,
  readOnly:true,validForSave:false,
  _labReadOnly:true,captureMode:'compare',recognitionEngine:'V7_066',
  requiresReview:issues.length>0||!!candidate.requiresReview,
  requiresRetake:!identity.valid||candidate.requiresRetake===true,
  identity,answers,issues,
  registration:{corners:registration.corners,
   internalNames:registration.internalNames,
   internalMatches:registration.internalMatches,
   rmse:registration.rmse,area:registration.area,
   spanX:registration.spanX,spanY:registration.spanY},
  ink,geometryStatus:candidate.geometryDiagnostic,
  templateId:T.id,
  normalization:{width:rect.width,height:rect.height,
   singleWarp:true},
  candidate, // internal diagnostic, not a direct score/write payload
  elapsedMs:Math.round((typeof performance!=='undefined'?
   performance.now():Date.now())-started)};
 analysis.comparison=compareAnswers(reference,analysis);
 return analysis;
}
// The only supported bridge to a preview keeps the 060 result explicitly
// research-only. The untouched V7 ScanAdapter rejects the distinct engine.
function toResearchScan(result){
 if(!result||result.readOnly!==true||result.validForSave!==false
   ||result.candidate?.engine!=='OMR066_RESEARCH_CANDIDATE')
  throw Error('omr060_invalid_research_result');
 return {...result,_labReadOnly:true,captureMode:'compare',
   recognitionEngine:'V7_066'};
}
return {analyze,readIdentity,compareAnswers,toResearchScan};
});