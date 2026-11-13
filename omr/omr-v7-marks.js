(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DamSanOmrV7Marks=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function inspect(baseline){
 const flags=[];
 for(const section of ['P1','P2']){
  const data=section==='P1'?baseline.p1Evidence:baseline.p2Evidence;
  (data||[]).forEach((e,i)=>{
   const key=section==='P1'?'P1.'+(i+1):'P2.'+(Math.floor(i/4)+1)+'abcd'[i%4];
   if(e.state==='multiple')flags.push({key,type:'invalid_double',preserveInvalid:true});
   else if(e.state==='review'&&/thứ hai|vết tẩy|hai ô/i.test(e.reason||''))
    flags.push({key,type:'possible_erasure',requiresReview:true});
   else if(e.state==='single'&&e.secondRelative>=.28&&e.secondFill>=.2)
    flags.push({key,type:'secondary_ink_evidence',diagnosticOnly:true});
  });
 }
 for(let i=0;i<(baseline.p3Evidence||[]).length;i++)
  (baseline.p3Evidence[i].columns||[]).forEach((e,j)=>{
   if(e.state==='multiple')flags.push({key:'P3.'+(i+1)+'.'+(j+1),
    type:'numeric_multiple',preserveUncertain:true});
  });
 return {flags,invalidCount:(baseline.invalidMarks||[]).length,
  diagnosticOnly:true,changesAnswers:false};
}
return {inspect};
});