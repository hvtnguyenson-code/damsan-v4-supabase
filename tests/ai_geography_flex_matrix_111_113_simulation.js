const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('ai_exam.html','utf8');
const ui=fs.readFileSync('ai_exam_geography_matrix_111.js','utf8');
const activation=fs.readFileSync('ai_exam_planned_activation_109.js','utf8');
const flex=fs.readFileSync('supabase/functions/_shared/exam_geography_flex_matrix_112.ts','utf8');
const planned=fs.readFileSync('supabase/functions/_shared/exam_planned_generation_105.ts','utf8');
const calibration=fs.readFileSync('supabase/functions/_shared/exam_geography_calibration_108.ts','utf8');
const bridge=fs.readFileSync('supabase/functions/exam-ai-bridge/index.ts','utf8');

assert(html.includes('ai_exam_geography_curriculum_catalog_114.js?v=20261105-curriculum-catalog-114'),'114 curriculum catalog overlay missing');
assert(html.includes('ai_exam_geography_matrix_111.js?v=20261105-curriculum-catalog-114'),'111/114 matrix overlay missing');
assert(html.indexOf('ai_exam_geography_curriculum_catalog_114.js') < html.indexOf('ai_exam_geography_matrix_111.js'),'114 catalog must load before matrix 111');
assert(html.indexOf('ai_exam_geography_matrix_111.js') < html.indexOf('ai_exam_planned_activation_109.js'),'111 must load before planned activation 109');

assert(ui.includes("const SCHEMA='DAMSAN_GEO_ASSESSMENT_MATRIX_V1'"),'111 matrix schema missing');
assert(ui.includes("if(!isGeography()||strict()) return spec"),'111 STRICT_TNTHPT isolation missing');
assert(ui.includes("mode:'FLEX_GEOGRAPHY'"),'111 FLEX mode missing');
assert(ui.includes('THIẾT LẬP MA TRẬN ĐÁNH GIÁ ĐỊA LÍ'),'111 matrix panel missing');
for(const label of ['P1 Biết','P1 Hiểu','P1 VD','P2','P3','Stimulus','Mức cho phép']){
  assert(ui.includes(label),'111 matrix column missing '+label);
}
assert(ui.includes('aieGeoCurriculumCatalog114'),'111 must bind to catalog 114');
assert(!ui.includes('function inferTopic'),'111 must not infer curriculum topic from title regex');
assert(!ui.includes("requirement_basis:'CURRICULUM_NORMALIZED'"),'111 must not falsely label heuristic rows as normalized curriculum');
assert(ui.includes("Khối 11 chưa có SGK normalized"),'111 must not invent grade-11 lesson mapping');
assert(!/rpc_luu_de_thi_len_phong|rpc_ai_exam_approve_and_publish|service_role|SERVICE_ROLE/.test(ui),'111 UI must not publish or expose privileged credentials');

assert(flex.includes('DAMSAN_GEO_ASSESSMENT_MATRIX_V1'),'112 matrix schema gate missing');
assert(flex.includes('FLEX_GEOGRAPHY'),'112 FLEX mode missing');
assert(flex.includes('flex_matrix_count_mismatch'),'112 matrix count hard gate missing');
assert(flex.includes('flex_cognitive_level_not_allowed'),'112 cognitive allowance gate missing');
assert(flex.includes('requirement_id'),'112 YCCD requirement identity missing');
assert(flex.includes('indicator_id'),'112 assessment indicator identity missing');
assert(flex.includes('assessment_mode:"FLEX_GEOGRAPHY"'),'112 FLEX plan mode missing');
assert(flex.includes('quality_benchmark:"MOET_GEOGRAPHY_2025_2026_FINGERPRINT_V1"'),'112 must retain TNTHPT quality benchmark');
assert(flex.includes('structure_basis:"TEACHER_LOCKED_MATRIX"'),'112 structure must use teacher matrix');
assert(flex.includes('effectiveGeographySpec112'),'112 effective spec compiler missing');

assert(planned.includes('part1.length !== 18 || part2.length !== 4 || part3.length !== 6'),'105 strict 18-4-6 invariant must remain');
assert(planned.includes('assessmentMode === "FLEX_GEOGRAPHY"'),'105 FLEX branch missing');
assert(planned.includes('part1.length !== p1 || part2.length !== p2 || part3.length !== p3'),'105 FLEX dynamic count gate missing');
assert(planned.includes('chunk(part1, 6)'),'105 P1 batching policy missing');
assert(planned.includes('chunk(part2, 2)'),'105 P2 batching policy missing');
assert(planned.includes('chunk(part3, 2)'),'105 P3 batching policy missing');

assert(activation.includes('state.manifest?.item_slot_count'),'109 dynamic slot manifest missing');
assert(!activation.includes('questions.length !== 28'),'109 must not hard-code 28 slots after FLEX');
assert(activation.includes('get_planned_generation_input'),'109 planned path retained');
assert(activation.includes('get_independent_critic_input'),'109 critic path retained');
assert(activation.includes('submit_planned_exam_draft'),'109 final planned submit retained');

assert(calibration.includes('matrix_structure_mismatch'),'113 FLEX structure calibration reason missing');
assert(calibration.includes('official_structure_mismatch'),'113 strict official structure reason must remain');
assert(calibration.includes('FLEX_GEOGRAPHY'),'113 FLEX calibration branch missing');
assert(calibration.includes('benchmark_stimulus_mix_weak'),'113 TN quality benchmark gate must remain');
assert(calibration.includes('independent_critic_not_passed'),'113 critic quality gate must remain');

assert(bridge.includes('../_shared/exam_geography_flex_matrix_112.ts'),'bridge FLEX compiler import missing');
for(const anchor of [
  'const spec = effectiveGeographySpec112(asObject(claim.exam_spec));',
  'action === "validate_flex_matrix_preview"',
  'DAMSAN_FLEX_MATRIX_PREVIEW_V1'
]) assert(bridge.includes(anchor),'bridge FLEX integration missing '+anchor);

for(const path of ['hoc_sinh.js','hoc_sinh.html']){
  const content=fs.readFileSync(path,'utf8');
  assert(!content.includes('DAMSAN_GEO_ASSESSMENT_MATRIX_V1'),'student runtime must not depend on assessment matrix');
}

console.log('AI_GEOGRAPHY_FLEX_MATRIX_111_113_STATIC_PASS');
