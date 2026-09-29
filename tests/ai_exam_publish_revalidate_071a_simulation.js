const fs=require('fs');
const sql=fs.readFileSync('supabase/migrations/20260929161000_ai_exam_publish_revalidate_071a.sql','utf8');
function must(v,m){if(!v)throw new Error(m);}

must(/create or replace function public\.rpc_ai_exam_approve_and_publish/i.test(sql),'071A-01 publish RPC replacement missing');
must(/v_quality:=public\._ai_exam_quality_gate_037\(v_request\.id,v_draft\.exam_payload\)/.test(sql),'071A-02 publish must rerun current quality gate');
must(/draft_quality_stale/.test(sql),'071A-03 stale-quality rejection code missing');
must(/if coalesce\(\(v_quality->>'valid'\)::boolean,false\) is not true/.test(sql),'071A-04 publish must stop when current gate fails');
const gatePos=sql.indexOf('v_quality:=public._ai_exam_quality_gate_037');
const publishPos=sql.indexOf('v_result:=public.rpc_luu_de_thi_len_phong');
must(gatePos>=0&&publishPos>gatePos,'071A-05 revalidation must occur before canonical room mutation');
must(/status='PUBLISHED'/.test(sql)&&/status='VALIDATED'/.test(sql),'071A-06 historical lifecycle semantics must remain intact');
must(/target_class/.test(sql)&&/doi_tuong/.test(sql),'071A-07 class-target publication behavior must be preserved');
must(!/drop\s+(table|function)/i.test(sql),'071A-08 migration must be non-destructive');

console.log('PASS ai_exam_publish_revalidate_071a_simulation');
