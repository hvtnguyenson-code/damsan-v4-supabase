(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrFieldComparison060=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// The V7 legacy camera result does not expose SBD or exam-code recognition.
// Counting their absence as answer changes falsely inflated the real-world
// comparison by two positions. Only actual P1/P2/P3 answer values are comparable.
const ANSWER=/^(?:P1\.(?:[1-9]|1[0-8])|P2\.[1-4][abcd]|P3\.[1-6])$/;
function answerOnly(raw){
 if(!raw||!Array.isArray(raw.changes))return null;
 const changes=raw.changes.filter(x=>x&&ANSWER.test(String(x.key||'')))
  .map(x=>({key:String(x.key),old:x.old??null,proposed:x.proposed??null}));
 return {count:changes.length,changes,compared:true,
  scope:'ANSWERS_P1_P2_P3_ONLY',
  identityCompared:false};
}
function exportWithAudit(report){
 if(!report||typeof report!=='object')return report;
 const updated=answerOnly(report.comparison);
 if(!updated)return report;
 if(report.comparison?.count===updated.count&&
   report.comparison?.changes?.length===updated.changes.length)
  return {...report,comparison:updated};
 return {...report,comparison:updated,
  comparisonBeforeCorrection:report.comparison};
}
return {answerOnly,exportWithAudit};
});