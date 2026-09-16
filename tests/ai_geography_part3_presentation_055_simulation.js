const fs = require('fs');
const assert = require('assert');

const overlay = fs.readFileSync('ai_exam_part3_presentation_055.js','utf8');
const html = fs.readFileSync('ai_exam.html','utf8');
const migration = fs.readFileSync('supabase/migrations/20260916214500_geography_part3_table_answer_format_055.sql','utf8');
const studentJs = fs.readFileSync('hoc_sinh.js','utf8');
const studentHtml = fs.readFileSync('hoc_sinh.html','utf8');

assert(overlay.includes('PHẦN III — 055 BẢNG SỐ LIỆU + ĐÁP ÁN TỐI ĐA 4 KÍ TỰ'), '055 Part III prompt contract missing');
assert(overlay.includes('"22,2"') && overlay.includes('"2,22"') && overlay.includes('"-222"'), '055 compact-answer examples missing');
assert(overlay.includes('data-damsan-p3="1"'), '055 table marker missing from prompt');
assert(overlay.includes('từ 3 số liệu thô trở lên'), '055 table threshold missing from prompt');
assert(overlay.includes('result_divisor'), '055 result unit-scaling contract missing from prompt');
assert(overlay.includes('KHÔNG dùng style'), '055 semantic-table prompt must avoid numeric inline-style noise');
assert(overlay.includes('renderP3Stem055'), '055 teacher preview table renderer missing');
assert(html.includes('ai_exam_part3_presentation_055.js?v=20260916-part3-presentation-055'), '055 overlay is not loaded by ai_exam.html');

// Student UI already has the safe rich-text path and table CSS. 055 must reuse it rather than adding a second room payload.
assert(/safeHTML\(cau\.noi_dung\s*\|\|\s*cau\.NoiDung\)/.test(studentJs), 'student question renderer no longer renders sanitized noi_dung');
assert(/\.q-text\s+table/.test(studentHtml), 'student UI table styling for question stems is missing');
assert(/dompurify\/3\.0\.6\/purify\.min\.js/i.test(studentHtml), 'student UI must sanitize authored table HTML with DOMPurify');

assert(/profile_version='055'/i.test(migration), '055 profile version not persisted');
assert(/answer_max_characters\":4/.test(migration), '055 max answer length not in profile');
assert(/quality_part3_answer_compact_format_invalid/.test(migration), '055 answer-format hard gate missing');
assert(/quality_part3_table_required/.test(migration), '055 table-required hard gate missing');
assert(/quality_part3_visible_data_insufficient/.test(migration), '055 visible-data gate missing');
assert(/quality_part3_table_inputs_not_exposed/.test(migration), '055 per-input table exposure gate missing');
assert(/regexp_replace\(v_stem,'<\[\^>\]\+>'/i.test(migration), '055 visible-data check must strip HTML tags/attributes');
assert(/result_divisor_policy/.test(migration), '055 result divisor profile policy missing');
assert(/_ai_exam_part3_recompute_053_base/.test(migration), '055 must preserve the 053 arithmetic engine as a base');
assert(/v_result\/v_divisor/.test(migration), '055 result divisor must be applied server-side before rounding');
assert(/trg_ai_exam_draft_normalize_055/i.test(migration), '055 canonical-answer trigger missing');
assert(/v_standard_id='DIA_LI_TNTHPT_2025_PLUS_V1'/.test(migration), '055 draft normalization must be scoped to Geography TNTHPT');
assert(/replace\(btrim\(coalesce\(q\.value->>'dap_an_dung'/i.test(migration), '055 decimal-comma normalization missing');

function canonical(value) {
  return String(value).trim().replace('.', ',');
}
function valid(value) {
  const s = canonical(value);
  return /^-?[0-9]+(,[0-9]+)?$/.test(s) && s.length <= 4;
}
function applyDivisor(result, divisor = 1) {
  const allowed = new Set([1,10,100,1000,10000,100000,1000000,10000000,100000000,1000000000]);
  if (!allowed.has(divisor)) return null;
  return result / divisor;
}

for (const value of ['2','22','222','2222','22,2','2,22','-222','-2,2','54.8']) {
  assert(valid(value), `expected valid compact answer: ${value}`);
}
for (const value of ['1919,4','111,2','12345','-22,2','2,222','2 22','+22']) {
  assert(!valid(value), `expected invalid compact answer: ${value}`);
}
assert.strictEqual(canonical('54.8'),'54,8','dot must canonicalize to decimal comma');
assert.strictEqual(applyDivisor(12345,1000),12.345,'result_divisor should support legitimate unit scaling');
assert.strictEqual(applyDivisor(12345,60),null,'arbitrary result scaling must be rejected');

console.log('AI Geography Part III presentation 055 simulation: PASSED');
