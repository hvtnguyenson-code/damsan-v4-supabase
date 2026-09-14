const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const overlay = fs.readFileSync('ai_exam_assessment_profile.js','utf8');
const html = fs.readFileSync('ai_exam.html','utf8');
const migration = fs.readFileSync('supabase/migrations/20260914140500_geography_part3_quantitative_quality_048.sql','utf8');
const recovery = fs.readFileSync('supabase/migrations/20260914224500_ai_exam_validation_recovery_049.sql','utf8');

assert(overlay.includes('version 048'), '048 prompt version missing');
assert(/xử lí số liệu địa lí/i.test(overlay), 'geographic quantitative reasoning instruction missing');
assert(/CẤM câu chỉ đổi đơn vị/i.test(overlay), 'unit-conversion-only prohibition missing');
assert(/chỉ cộng hai tỉ lệ phần trăm/i.test(overlay), 'simple percent-sum prohibition missing');
assert(/chỉ trừ hai mốc độ cao/i.test(overlay), 'arbitrary altitude subtraction prohibition missing');
assert(overlay.includes('quantitative gồm: skill_code, operation_code, data_form, inputs'), 'Part III quantitative metadata schema missing');
assert(overlay.includes('SUM_DIFFERENCE_TWO_GROUPS'), 'two-series raw-data operation missing');
assert(overlay.includes('tối đa 2 câu một bước') && overlay.includes('ít nhất 4 câu từ hai bước'), 'full-exam cognitive mix missing');
assert(html.includes('ai_exam_assessment_profile.js?v=20260914-validation-recovery-049'), '049 prompt/recovery cache-bust marker missing from AI exam UI');

const context = {
  window:{},
  document:{ getElementById:()=>null, addEventListener:()=>{} },
  AIE_MAX_PROMPT_CHARS:7_500_000,
  console
};
vm.createContext(context);
vm.runInContext(overlay, context);
const spec = {
  assessment_type:'TOT_NGHIEP',
  counts:{p1:18,p2:4,p3:6},
  assessment_standard:{id:'DIA_LI_TNTHPT_2025_PLUS_V1',version:'048'}
};
const prompt = context.window.aieBuildPrompt(
  {request:{request_id:'r048',exam_spec:spec},instructions:{exam_spec:spec}},
  [{unit_key:'u1',content:{text:'sample'}}],
  spec
);
assert(prompt.includes('Riêng Phần III bắt buộc thêm quantitative'), 'compiled prompt must require quantitative metadata');
assert(prompt.includes('inputs là MẢNG SỐ THÔ'), 'compiled prompt must require raw numeric inputs');
assert(prompt.includes('học sinh không nhìn thấy Knowledge Pack'), 'student-visible source-data rule missing');
assert(prompt.includes('"question_fields":["phan","noi_dung","A","B","C","D","dap_an_dung","loi_giai","source_refs","muc_do","bai_hoc","quantitative"]'), '049 compiled generation contract must include quantitative metadata');
assert(prompt.includes('quantitative is mandatory for Geography Part III'), '049 must override the stale generic Part III contract');

assert(migration.includes('"version":"048"'), 'server standard version 048 missing');
assert(migration.includes('_ai_exam_part3_recompute_048'), 'server Part III recomputation helper missing');
assert(migration.includes('quality_part3_quantitative_metadata_required'), 'quantitative metadata gate missing');
assert(migration.includes('quality_part3_skill_operation_mismatch'), 'skill/operation compatibility gate missing');
assert(migration.includes('quality_part3_source_data_not_exposed'), 'student-visible raw-data gate missing');
assert(migration.includes('quality_part3_recompute_mismatch'), 'server answer recomputation gate missing');
assert(migration.includes('quality_part3_too_many_single_step'), 'single-step cap missing');
assert(migration.includes('quality_part3_multistep_mix_invalid'), 'multistep minimum missing');
assert(migration.includes('quality_part3_rich_data_mix_invalid'), 'rich-data minimum missing');
assert(migration.includes('quality_part3_skill_diversity_invalid'), 'skill diversity gate missing');
assert(migration.includes('quality_part3_skill_repetition_invalid'), 'skill repetition gate missing');
assert(migration.includes("v_op='SUM' and v_input_count<3"), 'two-value SUM must be rejected');
assert(migration.includes("v_assessment_type='TOT_NGHIEP' and v_p3_count=6"), 'full TNTHPT collection gate missing');

assert(recovery.includes('DAMSAN_AI_VALIDATION_FAILURE_V1'), '049 persisted validation diagnostic schema missing');
assert(recovery.includes("'processing_error',r.processing_error"), '049 protected request reader must expose validation diagnostic');
assert(recovery.includes("'recoverable',true"), '049 recoverable validation marker missing');
assert(recovery.includes("set processing_error=left(v_failure::text,12000),updated_at=now()"), '049 failed validation must be observable in DB');
assert(recovery.includes("set status='READY_FOR_REVIEW',active_draft_revision=v_revision,ready_at=now(),processing_error=null"), '049 success must clear stale validation error');
assert(!recovery.includes("set status='REJECTED'"), '049 failed validation must never reject the request');
assert(!recovery.includes('rpc_luu_de_thi_len_phong'), '049 validation recovery must not touch the room publish path');

assert(overlay.includes('Sao chép yêu cầu AI sửa lỗi'), '049 one-click repair UX missing');
assert(overlay.includes('Request vẫn còn hiệu lực; không cần tạo gói mới'), '049 retry guidance missing');
assert(overlay.includes("rpc_ai_exam_request_read"), '049 browser must read persisted validation diagnostic');
assert(overlay.includes("window.aieValidateDraft = async function aieValidateDraft049"), '049 validation handler override missing');

console.log('PASS ai_geography_part3_quality_048 + validation_recovery_049_simulation');