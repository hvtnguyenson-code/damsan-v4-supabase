(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrV7SparseP3=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Research-only extension to an exact independent copy of V6.
// No minimum filled-column count: 0..6 answered questions are valid.
function rank(col){return (col||[]).map((m,i)=>m?{...m,index:i}:null)
 .filter(Boolean).sort((x,y)=>y.score-x.score);}
function calibrate(metrics,B,p1){
 const ordered=metrics.flat().map(rank).filter(r=>r.length>=2);
 const positives=[],negatives=[];
 for(const row of ordered){
  const x=row[0],y=row[1];
  negatives.push(...row.slice(1).map(m=>m.score));
  if(x.score>=.20&&x.score-y.score>=.11
    &&x.score/Math.max(.025,y.score)>=1.45&&x.fill>=.55)
    positives.push(x.score);
 }
 const background=B.quantile(negatives,.78);
 const prior=p1?.reliable===true&&Number.isFinite(p1.markReference)
  &&p1.markReference>background+.12?p1.markReference:null;
 const own=positives.length?B.quantile(positives,.5):null;
 const allBlank=ordered.length===24&&ordered.every(r=>
  r[0].score<=Math.min(.14,background+.065)
  &&r[0].fill<.45&&r[0].score-r[1].score<.055);
 let reference=own??prior,source=own!==null?'p3_positive':
  prior!==null?'p1_transfer':'unavailable';
 if(reference===null&&allBlank){
  reference=background+.30;source='all_columns_blank';
 }
 const span=reference===null?0:reference-background;
 const reliable=ordered.length===24&&negatives.length>=20
  &&Number.isFinite(background)&&span>=.12
  &&(positives.length>0||prior!==null||allBlank);
 return {reliable,positiveSamples:positives.length,
   negativeSamples:negatives.length,background,markReference:reference,
   span,blankGate:background+.18*span,markGate:background+.30*span,
   separationGate:Math.max(.065,.20*span),source,
   globalCountRequirement:0,allBlank,conservative:true};
}
function classify(col,T,B,cal){
 const old=B.classifyP3Column(col,T.p3Labels,cal);
 if(old.state!=='review'
  ||old.reason!=='Không đủ bằng chứng phân biệt nét tô và vết tẩy')
  return old;
 const sorted=rank(col);
 if(sorted.length<2)return old;
 const top=sorted[0],second=sorted[1];
 if(top.score<=Math.min(cal.background+.18*cal.span,cal.background+.085)
  &&top.fill<.48&&top.score-second.score<Math.min(.055,.16*cal.span)
  &&top.gradient<.38)
  return {...old,state:'blank',token:'',index:-1,
   reason:'Cột không tô (V7 nền riêng)',refinement:'weak_ring_blank'};
 return old;
}
function apply(rect,T,B,base){
 if(base?.geometry?.status!=='ok'||base.p3Calibration?.reliable===true)
  return {scan:base,applied:[],activated:false};
 const metrics=B.measureP3Columns(rect,T);
 if(metrics.length!==6||metrics.some(q=>q.length!==4))
  return {scan:base,applied:[],activated:false};
 const cal=calibrate(metrics,B,base.calibration);
 if(!cal.reliable)return {scan:base,applied:[],activated:false};
 const p3=[],evidence=[],issues=[],applied=[];
 for(let i=0;i<6;i++){
  const columns=metrics[i].map(c=>classify(c,T,B,cal));
  const decoded=B.decodeP3Positions(columns);
  p3.push(decoded.value);
  evidence.push({value:decoded.value,raw:columns.map(c=>c.token),
    columns,uncertain:!!decoded.reason,reason:decoded.reason});
  columns.forEach((c,j)=>{
   if(c.state==='review'||c.state==='multiple')
    issues.push({key:'P3.'+(i+1)+'.'+(j+1),
      state:c.state,reason:c.reason,question:i+1,column:j+1});
  });
  if(decoded.reason&&!columns.some(c=>c.state==='review'||c.state==='multiple'))
   issues.push({key:'P3.'+(i+1),state:'review',reason:decoded.reason,question:i+1});
  if(base.p3?.[i]!==decoded.value)applied.push({key:'P3.'+(i+1),
    from:base.p3?.[i],to:decoded.value,method:'sparse_p3_column_evidence'});
 }
 const other=(base.issues||[]).filter(x=>!/^P3\./.test(x.key));
 return {scan:{...base,p3,p3Evidence:evidence,
  p3Calibration:{...cal,mode:'V7_SPARSE_PER_COLUMN'},issues:[...other,...issues]},
  applied,activated:true,
  diagnostic:{source:cal.source,positiveSamples:cal.positiveSamples,
    reviewCount:issues.length}};
}
return {rank,calibrate,classify,apply};
});