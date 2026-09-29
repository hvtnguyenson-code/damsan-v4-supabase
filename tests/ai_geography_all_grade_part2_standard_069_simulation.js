const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const migration = fs.readFileSync('supabase/migrations/20260929071500_geography_all_grade_part2_standard_069.sql', 'utf8');
const overlay = fs.readFileSync('ai_exam_part2_quality_054.js', 'utf8');

assert(migration.includes("v_grade in (10,11,12)"), '069 must attach Geography item-writing standard to grades 10/11/12');
assert(migration.includes('style_and_quality_only'), '069 must separate item-writing standard from official authority');
assert(migration.includes('official_blueprint_lock_requires_assessment_authority'), '069 must not leak Grade-12 count lock into grades 10/11');
assert(migration.includes('evidence_bearing_stimulus_required'), '069 evidence-bearing Part II stimulus contract missing');
assert(migration.includes('instruction_only_stimulus_forbidden'), '069 instruction-only Part II stems must be forbidden');
assert(migration.includes('statements_must_materially_use_stimulus'), '069 statements must materially use common stimulus');
assert(migration.includes('text_stimulus_min_plain_chars'), '069 minimum text-stimulus substance missing');
assert(migration.includes('quality_part2_stimulus_meta_only'), '069 server meta-only stimulus gate missing');
assert(migration.includes('quality_part2_stimulus_too_thin'), '069 server thin-text stimulus gate missing');
assert(migration.includes('quality_part2_stimulus_table_too_thin'), '069 server thin-table stimulus gate missing');
assert(migration.includes("lower(v_plain) ~ 'một học sinh.*(nhận định|ý kiến)'"), '069 must reject the observed student-meta stem pattern');
assert(migration.includes("lower(v_plain) ~ 'hãy xác định.*(đúng|sai)'"), '069 must reject per-question true/false instruction as stimulus');

const basePrompt = [
  'BASE',
  'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Phần III thêm quantitative theo contract 053.',
  '',
  'YÊU CẦU ĐẦU RA:',
  'END'
].join('\n');
const context = {
  window: { aieBuildPrompt: () => basePrompt, aieQuestionPreview: () => '' },
  DOMParser: class { parseFromString() { return { querySelector() { return null; } }; } },
  aieEscape: (v) => String(v ?? ''),
  console
};
vm.createContext(context);
vm.runInContext(overlay, context);
const spec = { grade:10, assessment_type:'CUSTOM', assessment_standard:{ id:'DIA_LI_TNTHPT_2025_PLUS_V1', version:'069' } };
const prompt = context.window.aieBuildPrompt({ request:{ exam_spec:spec } }, [], spec);
assert(prompt.includes('Mỗi câu Phần II là MỘT stimulus chung'), 'existing 059 common-stimulus authoring block must activate for Grade 10 once 069 attaches the standard');
assert(prompt.includes('Stimulus không được phát biểu sẵn bốn kết luận'), '059 anti-copy stimulus rule must remain active');
assert(prompt.includes('mỗi cụm phải có TH thật + VD thật'), '059 cognitive-depth self-audit must remain active');

console.log('PASS ai_geography_all_grade_part2_standard_069_simulation');
