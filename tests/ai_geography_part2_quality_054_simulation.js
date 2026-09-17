const fs = require('fs');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const overlay = fs.readFileSync('ai_exam_part2_quality_054.js', 'utf8');
const html = fs.readFileSync('ai_exam.html', 'utf8');
const migration054 = fs.readFileSync('supabase/migrations/20260916210500_geography_part2_cognitive_blueprint_054.sql', 'utf8');
const migration058 = fs.readFileSync('supabase/migrations/20260917153500_geography_part2_cognitive_depth_058.sql', 'utf8');

const basePrompt = [
  'BASE PROMPT',
  'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Phần III thêm quantitative theo contract 053.',
  '',
  'YÊU CẦU ĐẦU RA:',
  'END'
].join('\n');

const context = {
  window: { aieBuildPrompt: () => basePrompt }
};
vm.createContext(context);
vm.runInContext(overlay, context);

const spec = { assessment_standard: { id: 'DIA_LI_TNTHPT_2025_PLUS_V1', version: '058' } };
const prompt = context.window.aieBuildPrompt({ request: { exam_spec: spec } }, [], spec);

assert(prompt.includes('PHẦN II — 058 ĐỘ SÂU NHẬN THỨC TH/VD'), '058 Part II depth block missing');
assert(prompt.includes('ít nhất 01 lệnh THỰC CHẤT ở mức TH'), '058 must require genuine TH per cluster');
assert(prompt.includes('ít nhất 01 lệnh THỰC CHẤT ở mức VD'), '058 must require genuine VD per cluster');
assert(prompt.includes('CẤM gắn nhãn VD'), '058 must forbid relabelling shallow statements as VD');
assert(prompt.includes('tính một chênh lệch đơn giản'), '058 must explicitly classify one-step difference as non-VD');
assert(prompt.includes('statement_reasoning'), '058 statement reasoning contract missing');
assert(prompt.includes('reasoning_steps>=2'), '058 VD minimum reasoning steps missing');
assert(prompt.includes('derived_quantity=true hoặc transfer_context=true'), '058 VD transfer/derived requirement missing');
assert(prompt.includes('Phần II thêm statement_levels và statement_reasoning'), '058 output schema extension missing');

assert(html.includes('ai_exam_part2_quality_054.js?v=20260916-part2-quality-054'), 'Part II overlay is not loaded');
assert(html.indexOf('ai_exam_validation_architecture_053.js') < html.indexOf('ai_exam_part2_quality_054.js'), 'Part II overlay must wrap final 053 prompt builder');

assert(migration054.includes('statement_levels_required'), '054 base statement-level gate must remain in history');
assert(migration058.includes("profile_version='058'"), '058 profile version sync missing');
assert(migration058.includes('required_levels_per_cluster'), '058 TH/VD requirement missing from authority profile');
assert(migration058.includes('statement_reasoning_required'), '058 reasoning metadata requirement missing');
assert(migration058.includes('quality_part2_th_required'), '058 server must reject clusters without TH');
assert(migration058.includes('quality_part2_vd_required'), '058 server must reject clusters without VD');
assert(migration058.includes('quality_part2_th_too_shallow'), '058 server must reject shallow TH');
assert(migration058.includes('quality_part2_vd_too_shallow'), '058 server must reject shallow VD');
assert(migration058.includes("'multi_step_calculation','rate_ratio_percent','index_normalization','evidence_synthesis'"), '058 VD operation allowlist missing');
assert(migration058.includes('v_evidence<2 or v_steps<2'), '058 VD minimum evidence/steps gate missing');
assert(migration058.includes('(not v_derived and not v_transfer)'), '058 VD derived/transfer gate missing');
assert(!migration058.includes('option_length'), '058 must not import Part I option-length balancing into Part II');

console.log('PASS ai_geography_part2_quality_058_simulation');
