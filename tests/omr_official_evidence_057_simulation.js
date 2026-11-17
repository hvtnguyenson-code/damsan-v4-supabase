'use strict';
const assert=require('assert'),fs=require('fs');
const client=require('../omr/omr-evidence-client.js');
const desktop=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const bridge=fs.readFileSync('teacher/omr-v7-runtime-20261116-046.js','utf8');
const backend=fs.readFileSync('supabase/functions/omr-evidence/index.ts','utf8');
const html=fs.readFileSync('teacher/index.html','utf8');
const desktopHtml=fs.readFileSync('giaovien.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
for(const [name,source] of [['desktop',desktop],['PWA',bridge]]){
 const start=source.indexOf('function renderEvidence(){');
 const end=source.indexOf('async function saveTestEvidence(');
 const render=source.slice(start,end);
 assert(start>=0&&end>start);
 assert(!render.includes('setTimeout(()=>saveTestEvidence'),name+' preview must never upload');
 assert(render.includes("mode:trial?'test':'official'"));
 assert(render.includes("state.evidenceCommittedSubmissionId?'official':'preview'"));
 assert(render.includes('state.evidenceCommittedSubmissionId||\'draft\''));
 const save=source.slice(source.indexOf('async function saveCurrent(){'),source.indexOf('function updateProgress()'));
 const commit=save.indexOf('await W.submitConfirmed(state.lastPreview,staffRpc)');
 const id=save.indexOf('state.evidenceCommittedSubmissionId=data.submission_id||null');
 const image=save.indexOf('await saveTestEvidence(true)');
 assert(commit>=0&&id>commit&&image>id,name+' image must be bound to committed submission');
 assert(save.includes('savedEvidence?.status')&&save.includes('KHÔNG quét lại'));
 const fn=source.slice(source.indexOf('async function saveTestEvidence('),source.indexOf('async function showEvidenceArchive()'));
 assert(fn.includes('submissionId:state.evidenceCommittedSubmissionId'));
 assert(fn.includes("mode:evidenceRoomCode()==='OMR_V7_TEST'?'test':'official'"));
 assert(fn.includes('return {status:\'error\''));
 assert(!source.includes("if(evidenceRoomCode()!=='OMR_V7_TEST'||!EvidenceExport"));
 assert(!source.includes("if(evidenceRoomCode()!=='OMR_V7_TEST'){panel.textContent="));
}
assert(backend.includes('const OFFICIAL_ENABLED = true;'));
assert(backend.includes('if(mode==="test"&&room.ma_phong!=="OMR_V7_TEST")'));
assert(backend.includes('if(mode==="official"&&!OFFICIAL_ENABLED)'));
assert(!backend.includes('test_evidence_quota_reached'));
assert(!backend.includes('test_quota_check_failed'));
assert(backend.includes('official_submission_required'));
assert(backend.includes('official_score_mismatch'));
assert(backend.includes('official_answers_mismatch'));
assert(backend.includes('(!adminRole(actor.role)&&s.submitted_by_staff_id!==actor.id)'));
assert(backend.includes('s.truong_id!==actor.school||s.phong_id!==room.id'));
assert(backend.includes('status:submission?"COMPLETE":"TEST"'));
assert(backend.includes('const MAX_IMAGE = 1_500_000;'));
assert(backend.includes('eq("scan_id",scanId).eq("revision",revision)'));
assert(backend.includes('freshUploads.length'));
assert(html.includes('omr-official=057'));
assert(desktopHtml.includes('omr-official=057'));
assert(sw.includes('omr059'));
assert(client.prepare.toString().includes("submission_id:submissionId"));
(async()=>{
 const calls=[];
 global.document={};
 const canvas={width:10,height:10,toDataURL:fmt=>'data:'+fmt+';base64,AA=='};
 const sb={functions:{invoke:async(name,opts)=>{
  calls.push({name,body:opts.body});
  return {data:{status:'success',artifact_id:'artifact-1'},error:null};
 }}};
 const preview={ok:true,room:{id:'room-1'},student:{id:'student-1'},variant:{code:'101'}};
 const response=await client.save(sb,'x'.repeat(35),{
  scanId:'scan-1',revision:1,submissionId:'receipt-1',
  preview,canvas,capture:canvas,report:{version:'OMR_EVIDENCE_01'},mode:'official'
 });
 assert.equal(response.status,'success');
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'omr-evidence');
 assert.equal(calls[0].body.action,'save');
 assert.equal(calls[0].body.mode,'official');
 assert.equal(calls[0].body.submission_id,'receipt-1');
 assert.equal(calls[0].body.student_id,'student-1');
 assert.equal(calls[0].body.room_id,'room-1');
 assert.equal(calls[0].body.staff_token,'x'.repeat(35));
 console.log('PASS OMR 057: real-room official mode, receipt binding, unlimited trial records, single final evidence');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{delete global.document;});
