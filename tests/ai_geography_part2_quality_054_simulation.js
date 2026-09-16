const fs = require('fs');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const overlay = fs.readFileSync('ai_exam_part2_quality_054.js', 'utf8');
const html = fs.readFileSync('ai_exam.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260916210500_geography_part2_cognitive_blueprint_054.sql', 'utf8');

const basePrompt = [
  'BASE PROMPT',
  'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Phần III thêm quantitative theo contract 053.',
  '',
  'YÊU CẦU ĐẦU RA:',
  'END'
].join('\n');

const context = {
  window: {
    aieBuildPrompt: () => basePrompt
  }
};
vm.createContext(context);
vm.runInContext(overlay, context);

const spec = { assessment_standard: { id: 'DIA_LI_TNTHPT_2025_PLUS_V1', version: '054' } };
const prompt = context.window.aieBuildPrompt({ request: { exam_spec: spec } }, [], spec);

assert(prompt.includes('PHẦN II — 054 CỤM ĐÚNG/SAI CÓ PHÂN HÓA NHẬN THỨC'), '054 Part II prompt block missing');
assert(prompt.includes('ÍT NHẤT HAI mức độ'), '054 must require at least two cognitive levels per Part II cluster');
assert(prompt.includes('KHÔNG cân bằng độ dài như Phần I'), '054 must explicitly allow variable statement length');
assert(prompt.includes('statement_levels'), '054 statement_levels contract missing');
assert(prompt.includes('Phần II thêm statement_levels'), '054 output schema extension missing');
assert(prompt.includes('NB: nhận biết'), '054 cognitive-level semantics missing');
assert(prompt.includes('TH: so sánh'), '054 TH semantics missing');
assert(prompt.includes('VD: tính toán'), '054 VD semantics missing');

assert(html.includes('ai_exam_part2_quality_054.js?v=20260916-part2-quality-054'), '054 overlay must be cache-busted and loaded');
assert(html.indexOf('ai_exam_validation_architecture_053.js') < html.indexOf('ai_exam_part2_quality_054.js'), '054 must wrap the final 053 prompt builder');

assert(migration.includes("profile_version='054'"), '054 profile version sync missing');
assert(migration.includes('statement_levels_required'), '054 profile must declare statement-level metadata');
assert(migration.includes('min_distinct_statement_levels'), '054 profile must declare minimum cognitive diversity');
assert(migration.includes('_ai_exam_part2_blueprint_054'), '054 server blueprint helper missing');
assert(migration.includes('quality_part2_statement_levels_required'), '054 server must reject missing Part II statement levels');
assert(migration.includes('quality_part2_cognitive_mix_insufficient'), '054 server must reject one-level Part II clusters');
assert(migration.includes("'part2_blueprint_quality',v_p2_quality"), '054 validation report must retain Part II blueprint result');
assert(!migration.includes('option_length'), '054 must not impose Part I option-length balancing on Part II statements');

console.log('PASS ai_geography_part2_quality_054_simulation');
