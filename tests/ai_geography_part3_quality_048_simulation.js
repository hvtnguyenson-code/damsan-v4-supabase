const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const overlay = fs.readFileSync('ai_exam_assessment_profile.js','utf8');
const architecture053 = fs.readFileSync('ai_exam_validation_architecture_053.js','utf8');
const qualityReview053 = fs.readFileSync('ai_exam_quality_review_053.js','utf8');
const html = fs.readFileSync('ai_exam.html','utf8');
const migration = fs.readFileSync('supabase/migrations/20260914140500_geography_part3_quantitative_quality_048.sql','utf8');
const recovery = fs.readFileSync('supabase/migrations/20260914224500_ai_exam_validation_recovery_049.sql','utf8');
const architectureMigration = fs.readFileSync('supabase/migrations/20260916150000_ai_exam_validation_architecture_053.sql','utf8');
const profileSync053 = fs.readFileSync('supabase/migrations/20260916150100_ai_exam_validation_profile_sync_053a.sql','utf8');

assert(overlay.includes('version 048'), '048 prompt version missing');
assert(/xử lí số liệu địa lí/i.test(overlay), 'geographic quantitative reasoning instruction missing');
assert(/CẤM câu chỉ đổi đơn vị/i.test(overlay), 'unit-conversion-only prohibition missing');
assert(/chỉ cộng hai tỉ lệ phần trăm/i.test(overlay), 'simple percent-sum prohibition missing');
assert(/chỉ trừ hai mốc độ cao/i.test(overlay), 'arbitrary altitude subtraction prohibition missing');
assert(overlay.includes('quantitative gồm: skill_code, operation_code, data_form, inputs'), '048 Part III quantitative metadata schema missing');
assert(overlay.includes('SUM_DIFFERENCE_TWO_GROUPS'), 'two-series raw-data operation missing');
assert(overlay.includes('tối đa 2 câu một bước') && overlay.includes('ít nhất 4 câu từ hai bước'), 'full-exam cognitive mix missing');
assert(html.includes('ai_exam_assessment_profile.js?v=20260914-validation-recovery-049'), '049 prompt/recovery cache-bust marker missing from AI exam UI');
assert(html.includes('ai_exam_validation_architecture_053.js?v=20260916-validation-architecture-053'), '053 architecture overlay missing from AI exam UI');
assert(html.includes('ai_exam_quality_review_053.js?v=20260916-quality-review-053'), '053 quality review overlay missing from AI exam UI');

const context = {
  window:{},
  document:{ getElementById:()=>null, addEventListener:()=>{}, querySelectorAll:()=>[] },
  AIE_MAX_PROMPT_CHARS:7_500_000,
  console
};
vm.createContext(context);
vm.runInContext(overlay, context);
vm.runInContext(architecture053, context);
const spec = {
  assessment_type:'TOT_NGHIEP',
  counts:{p1:18,p2:4,p3:6},
  assessment_standard:{id:'DIA_LI_TNTHPT_2025_PLUS_V1',version:'053'}
};
const prompt = context.window.aieBuildPrompt(
  {request:{request_id:'r053',exam_spec:spec},instructions:{exam_spec:spec}},
  [{unit_key:'u1',content:{text:'sample'}}],
  spec
);
assert(prompt.includes('053 SERVER-CANONICAL'), '053 compiled prompt missing');
assert(prompt.includes('quantitative gồm operation_code, inputs'), '053 must use reduced calculation recipe');
assert(prompt.includes('KHÔNG cần skill_code, data_form, reasoning_steps'), '053 must stop delegating descriptive metadata to AI');
assert(prompt.includes('Server tự tính lại đáp án'), '053 server recomputation instruction missing');
assert(prompt.includes('học sinh nhìn thấy'), '053 student-visible source-data rule missing');

assert(migration.includes('"version":"048"'), 'server standard version 048 history missing');
assert(migration.includes('_ai_exam_part3_recompute_048'), 'server Part III recomputation helper missing');
assert(migration.includes('quality_part3_quantitative_metadata_required'), '048 quantitative metadata gate missing');
assert(migration.includes('quality_part3_recompute_mismatch'), '048 server answer recomputation gate missing');

assert(recovery.includes('DAMSAN_AI_VALIDATION_FAILURE_V1'), '049 persisted validation diagnostic schema missing');
assert(recovery.includes("'processing_error',r.processing_error"), '049 protected request reader must expose validation diagnostic');
assert(recovery.includes("'recoverable',true"), '049 recoverable validation marker missing');
assert(!recovery.includes("set status='REJECTED'"), '049 failed validation must never reject the request');
assert(!recovery.includes('rpc_luu_de_thi_len_phong'), '049 validation recovery must not touch the room publish path');

assert(architectureMigration.includes('quality_batch_invalid'), '053 must aggregate hard validation errors');
assert(architectureMigration.includes("'errors',v_errors"), '053 aggregated error payload missing');
assert(architectureMigration.includes('_ai_exam_part3_recompute_053'), '053 recomputation helper missing');
assert(architectureMigration.includes("v_family:=case"), '053 server-derived operation family missing');
assert(architectureMigration.includes("v_reasoning_steps:=case"), '053 server-derived reasoning complexity missing');
assert(architectureMigration.includes("v_input_count>=3"), '053 rich-data credit must derive from actual input count');
assert(architectureMigration.includes('quality_mix_is_advisory'), '053 quality mix must be advisory');
assert(architectureMigration.includes("part3_too_many_single_step"), '053 advisory mix warning missing');
assert(architectureMigration.includes('rpc_ai_exam_reissue_handoff'), '053 same-request capability recovery missing');
assert(architectureMigration.includes("now()+interval '90 minutes'"), '053 renewed capability TTL missing');
assert(!architectureMigration.includes('quality_part3_skill_operation_mismatch'), '053 must not hard-reject AI skill/operation self-labels');
assert(!architectureMigration.includes('quality_part3_table_series_too_small'), '053 must not hard-reject AI data_form labels');
assert(!architectureMigration.includes('quality_part3_reasoning_steps_invalid'), '053 must not hard-reject AI reasoning self-ratings');

assert(profileSync053.includes('"ai_descriptive_metadata_trusted":false'), '053 stored authority profile must distrust descriptive AI metadata');
assert(profileSync053.includes('"quality_mix_is_advisory":true'), '053 stored authority profile must mark quality mix advisory');
assert(profileSync053.includes('"quantitative_core_required":["operation_code","inputs"]'), '053 stored authority profile must expose reduced hard contract');
assert(!profileSync053.includes('"quantitative_metadata_required":true'), '053 stored profile must not retain obsolete full metadata hard requirement');

assert(architecture053.includes('rpc_ai_exam_reissue_handoff'), '053 UI must renew capability on the same request');
assert(architecture053.includes('quality_batch_invalid') || architecture053.includes('errors'), '053 UI must understand aggregate diagnostics');
assert(architecture053.includes('Sao chép toàn bộ lỗi cho AI sửa'), '053 one-pass repair UX missing');
assert(architecture053.includes('window.aieValidateDraft = async function aieValidateDraft053'), '053 validation handler override missing');
assert(architecture053.includes("capability_expired','capability_not_claimed','capability_unavailable"), '053 automatic capability recovery codes missing');
assert(qualityReview053.includes('Cảnh báo chất lượng cần giáo viên xem trước khi phê duyệt'), '053 teacher-facing warning panel missing');
assert(qualityReview053.includes('Hard gate đã qua'), '053 warning panel must distinguish advisory quality from correctness');

console.log('PASS ai_geography_part3_quality_048 + recovery_049 + validation_architecture_053_simulation');