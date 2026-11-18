'use strict';
const assert=require('node:assert/strict');
const W=require('../omr/omr-result-write.js');
const Pipeline=require('../omr/omr-v7-pipeline-060.js');
const researchResult={readOnly:true,validForSave:false,_labReadOnly:true,
  captureMode:'compare',recognitionEngine:'V7_060',
  candidate:{engine:'OMR060_RESEARCH_CANDIDATE'}};
const researchScan=Pipeline.toResearchScan(researchResult);
assert.throws(()=>Pipeline.toResearchScan({readOnly:false}),/omr060_invalid_research_result/);
const defaultScan={recognitionEngine:'V7',captureMode:'v7',
  templateId:'MOET_TLTN_2025_18_4_6_V1',uncertain:[],invalidMarks:[]};
function preview(scan=defaultScan){
 return {ok:true,student:{id:'offline-student'},room:{id:'offline-room',ma_phong:'OMR_V7_TEST'},
  variant:{code:'105'},rawAnswers:Array.from({length:28},(_,i)=>({chon:String(i%4)})),
  scan:{...scan},reviewedUncertain:false,grade:{score:8.25}};
}
(async()=>{
 let writes=0,last=null;
 const rpc=async(name,payload)=>{writes++;last={name,payload};return {id:'mock-grade-id'};};
 async function blocked(p,reason){
  const before=writes;
  await assert.rejects(W.submitConfirmed(p,rpc),new RegExp(reason));
  assert.equal(writes,before,'a rejected preview must not reach RPC');
 }
 await blocked(preview(researchScan),'comparison_mode_never_writes');
 await blocked(preview({...researchScan,captureMode:'v7'}),'comparison_mode_never_writes');
 await blocked(preview({...researchScan,_labReadOnly:false}),'comparison_mode_never_writes');
 await blocked(preview({...researchScan,recognitionEngine:'V7'}),'comparison_mode_never_writes');
 await blocked(preview({...researchScan,captureMode:'omr060'}),'comparison_mode_never_writes');
 await blocked(preview({...defaultScan,_labReadOnly:true}),'comparison_mode_never_writes');
 await blocked(preview({...defaultScan,captureMode:'compare'}),'comparison_mode_never_writes');
 await blocked(preview({...defaultScan,_requiresRetake:true}),'unreliable_omr_requires_retake');
 await blocked(preview({...defaultScan,uncertain:['P3.2'],uncertainDetails:[{key:'P3.2'}]}),
   'uncertain_scan_requires_review');
 const corrected=preview({...defaultScan,uncertain:['P3.2'],uncertainDetails:[{key:'P3.2'}]});
 corrected.reviewedUncertain=true;
 const response=await W.submitConfirmed(corrected,rpc);
 assert.equal(response.id,'mock-grade-id');
 assert.equal(writes,1,'only an explicitly reviewed canonical scan may call mocked RPC');
 assert.equal(last.name,'rpc_staff_submit_omr');
 assert.equal(last.payload.p_ma_de,'105');
 assert.equal(last.payload.p_raw_answers.length,28);
 assert.equal(last.payload.p_source_metadata.uncertain_count,1);
 assert.equal(last.payload.p_source_metadata.uncertain_reviewed,true);
 const safe=await W.submitConfirmed(preview(),rpc);
 assert.equal(safe.id,'mock-grade-id');assert.equal(writes,2);
 console.log('PASS OMR 060 write boundary: 9 rejections, 2 mock-only canonical accepted; 0 real RPC calls');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});