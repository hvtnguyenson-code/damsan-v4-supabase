const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const overlay = fs.readFileSync('ai_exam_assessment_profile.js','utf8');
const migration = fs.readFileSync('supabase/migrations/20260914140500_geography_part3_quantitative_quality_048.sql','utf8');

assert(overlay.includes('version 048'), '048 prompt version missing');
assert(/xử lí số liệu địa lí/i.test(overlay), 'geographic quantitative reasoning instruction missing');
assert(/CẤM câu chỉ đổi đơn vị/i.test(overlay), 'unit-conversion-only prohibition missing');
assert(/chỉ cộng hai tỉ lệ phần trăm/i.test(overlay), 'simple percent-sum prohibition missing');
assert(/chỉ trừ hai mốc độ cao/i.test(overlay), 'arbitrary altitude subtraction prohibition missing');
assert(overlay.includes('quantitative gồm: skill_code, operation_code, data_form, inputs'), 'Part III quantitative metadata schema missing');
assert(overlay.includes('SUM_DIFFERENCE_TWO_GROUPS'), 'two-series raw-data operation missing');
assert(overlay.includes('tối đa 2 câu một bước') && overlay.includes('ít nhất 4 câu từ hai bước'), 'full-exam cognitive mix missing');

const context = { window:{}, document:{ getElementById:()=>null }, AIE_MAX_PROMPT_CHARS:7_500_000, console };
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

console.log('PASS ai_geography_part3_quality_048_simulation');
