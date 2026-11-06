const assert=require('assert');
const fs=require('fs');
const W=require('../omr/omr-result-write.js');
console.log('=== OMR RESULT WRITE 004 ===');
const migration=fs.readFileSync('supabase/migrations/20261105143000_omr_staff_submission_004.sql','utf8');
assert(migration.includes("add column if not exists source text not null default 'ONLINE'"));
assert(migration.includes("source in ('ONLINE','OMR')"));
assert(migration.includes('public._staff_session_gv_id(p_staff_token)'));
assert(migration.includes("v_room.doi_tuong <> 'TatCa'"));
assert(migration.includes("v_room.mon_id is distinct from v_gv.mon_id"));
assert(migration.includes("code','subject_forbidden"));
assert(migration.includes("jsonb_typeof(p_source_metadata) <> 'object'"));
assert(migration.includes("dt.ma_de::numeric = trim(p_ma_de)::numeric"));
assert(migration.includes("jsonb_array_length(p_raw_answers) <> jsonb_array_length(v_exam)"));
assert(migration.includes("code','existing_result"));
assert(migration.includes("'OMR', v_gv_id"));
assert(migration.includes('public.rpc_grade_submission(v_submission.id)'));
assert(!/insert\s+into\s+public\.ket_qua/i.test(migration),'OMR RPC must never write ket_qua directly');
assert(migration.includes('revoke all on function public.rpc_staff_submit_omr'));
const preview={
  ok:true,
  room:{id:'room1'},
  student:{id:'student1'},
  variant:{code:'444'},
  rawAnswers:[{chon:'A'}],
  grade:{score:8.5},
  scan:{uncertain:[],templateId:'MOET_TLTN_2025_18_4_6_V1'}
};
assert.doesNotThrow(()=>W.assertConfirmed(preview));
assert.throws(()=>W.assertConfirmed({...preview,scan:{uncertain:['P1.2']}}),/uncertain/);
(async()=>{
  let call;
  const res=await W.submitConfirmed(preview,async(name,args)=>{call={name,args};return {status:'success',score:8.5};});
  assert.strictEqual(call.name,'rpc_staff_submit_omr');
  assert.strictEqual(call.args.p_phong_id,'room1');
  assert.strictEqual(call.args.p_hs_id,'student1');
  assert.strictEqual(call.args.p_ma_de,'444');
  assert.deepStrictEqual(call.args.p_raw_answers,[{chon:'A'}]);
  assert.strictEqual(call.args.p_source_metadata.reviewed,true);
  assert.strictEqual(res.status,'success');
  console.log('PASS omr_result_write_004');
})().catch(e=>{console.error(e);process.exit(1);});
