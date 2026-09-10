const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const overlay = fs.readFileSync('ai_exam_assessment_profile.js','utf8');
const scopeOverlay = fs.readFileSync('ai_exam_knowledge_scope.js','utf8');
const bookOverlay = fs.readFileSync('knowledge_ai_book_structure.js','utf8');
const html = fs.readFileSync('ai_exam.html','utf8');
const knowledgeHtml = fs.readFileSync('knowledge_ai.html','utf8');
const migration = fs.readFileSync('supabase/migrations/20260910150516_geography_assessment_standard_037.sql','utf8');
const scopeMigration = fs.readFileSync('supabase/migrations/20260910152210_knowledge_book_lesson_scope_036.sql','utf8');
const docs = fs.readFileSync('docs/GEOGRAPHY_ASSESSMENT_STANDARD_037.md','utf8');

assert(overlay.includes('DIA_LI_TNTHPT_2025_PLUS_V1'), '037 profile id missing from prompt compiler');
assert(/stimulus chung/i.test(overlay), 'Part II shared stimulus rule missing');
assert(/phương án nhiễu/i.test(overlay), 'Part I distractor rule missing');
assert(/làm tròn/i.test(overlay), 'Part III rounding rule missing');
assert(/không sao chép/i.test(overlay), 'benchmark no-copy policy missing');
assert(/input\.request\.exam_spec/.test(overlay), 'prompt compiler must prefer server authoritative exam_spec');

const elements = {
  profile: { value: 'TOT_NGHIEP' },
  p1Count: { value: 0 },
  p2Count: { value: 0 },
  p3Count: { value: 0 },
};
const context = {
  window: {},
  document: { getElementById: (id) => elements[id] || null },
  AIE_MAX_PROMPT_CHARS: 7_500_000,
  console,
};
context.window.aieProfileChange = () => {};
vm.createContext(context);
vm.runInContext(overlay, context);
context.window.aieProfileChange();
assert.strictEqual(elements.p1Count.value, 18, 'TOT_NGHIEP P1 default must be 18');
assert.strictEqual(elements.p2Count.value, 4, 'TOT_NGHIEP P2 default must be 4');
assert.strictEqual(elements.p3Count.value, 6, 'TOT_NGHIEP P3 default must be 6');

const spec = {
  assessment_type: 'TOT_NGHIEP',
  counts: { p1: 18, p2: 4, p3: 6 },
  assessment_standard: { id: 'DIA_LI_TNTHPT_2025_PLUS_V1' }
};
const prompt = context.window.aieBuildPrompt({
  request: { request_id: 'r1', exam_spec: spec },
  instructions: { exam_spec: spec }
}, [{ unit_key:'u1', content:{ text:'x' } }], { assessment_type:'MCQ_ONLY' });
assert(prompt.includes('DIA_LI_TNTHPT_2025_PLUS_V1'), 'profile rules not emitted into prompt');
assert(prompt.includes('"assessment_type":"TOT_NGHIEP"'), 'server exam_spec must win over stale local spec');
assert(prompt.includes('ĐÚNG/SAI'), 'Part II professional rules missing from compiled prompt');
assert(prompt.includes('TRẢ LỜI NGẮN'), 'Part III professional rules missing from compiled prompt');

assert(/value="18"/.test(html) && /value="4"/.test(html) && /value="6"/.test(html), 'official 18-4-6 defaults missing from UI');
assert(html.includes('ai_exam_assessment_profile.js?v=20260910-geography-assessment-037'), '037 overlay script missing from UI');

assert(migration.includes('_ai_exam_apply_assessment_standard_037'), 'server profile injector missing');
assert(migration.includes("v_subject in ('địa lí','địa lý')"), 'server subject binding missing');
assert(migration.includes('quality_part1_duplicate_options_invalid'), 'Part I deterministic gate missing');
assert(migration.includes('quality_part2_stimulus_invalid'), 'Part II stimulus gate missing');
assert(migration.includes('quality_part2_all_same_invalid'), 'Part II truth-pattern gate missing');
assert(migration.includes('quality_part3_numeric_answer_invalid'), 'Part III numeric answer gate missing');
assert(migration.includes('quality_part3_rounding_invalid'), 'Part III rounding gate missing');
assert(migration.includes("p1\":18") && migration.includes("p2\":4") && migration.includes("p3\":6"), 'official blueprint missing from server standard');

assert(docs.includes('vqa.moet.gov.vn/vi/news/thong-bao/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-74.html'), 'official format source missing');
assert(docs.includes('vqa.moet.gov.vn/vi/news/tin-tuc-su-kien/de-thi-tham-khao-ky-thi-tot-nghiep-thpt-tu-nam-2025-159.html'), 'official reference exam source missing');
assert(/Hà Tĩnh/.test(docs) && /Hà Nội/.test(docs) && /Hòa Bình/.test(docs) && /Bình Phước/.test(docs), 'provincial benchmark corpus not documented');

// 036 — whole-book / lesson scope contract.
assert(html.includes('ai_exam_knowledge_scope.js?v=20260910-book-lesson-scope-036'), '036 lesson-scope overlay missing from exam UI');
assert(knowledgeHtml.includes('knowledge_ai_book_structure.js?v=20260910-book-lesson-scope-036'), '036 book-structure overlay missing from semantic-analysis UI');
assert(scopeOverlay.includes('DAMSAN_KNOWLEDGE_SCOPE_V1'), '036 scope schema missing from browser request');
assert(scopeOverlay.includes('rpc_knowledge_scope_catalog_read'), '036 browser must use protected lesson catalog RPC');
assert(scopeOverlay.includes('knowledge-lesson-check'), '036 lesson selector UI missing');
assert(scopeOverlay.includes("mode: 'LESSONS'"), '036 lesson-only request mode missing');
assert(/tick ô này nếu thật sự muốn dùng toàn bộ tài liệu/.test(scopeOverlay), 'multi-lesson document must not be silently selected in full');

assert(scopeMigration.includes('_knowledge_scope_key_036'), '036 stable lesson scope key missing');
assert(scopeMigration.includes('_ai_exam_normalize_scope_036'), '036 server scope normalization missing');
assert(scopeMigration.includes('rpc_knowledge_scope_catalog_read'), '036 secure scope catalog missing');
assert(scopeMigration.includes('_ai_exam_scope_allows_unit_036'), '036 server pack scope filter missing');
assert(scopeMigration.includes('rpc_ai_exam_knowledge_pack_service'), '036 scoped knowledge pack override missing');
assert(scopeMigration.includes('_ai_exam_scope_quality_gate_036'), '036 draft provenance scope gate missing');
assert(scopeMigration.includes('knowledge_source_ref_outside_scope'), '036 out-of-scope source ref rejection missing');
assert(scopeMigration.includes('_ai_exam_quality_gate_037'), '036 must preserve the 037 assessment quality gate');

assert(bookOverlay.includes('lesson_code') && bookOverlay.includes('lesson_title'), '036 semantic prompt must require lesson metadata');
assert(bookOverlay.includes('BAI_01'), '036 semantic prompt must define stable lesson codes');
assert(/không gộp kiến thức của hai bài khác nhau/i.test(bookOverlay), '036 semantic prompt must preserve lesson boundaries');
const bookContext = {
  kaiBuildPrompt: () => 'BASE\nSOURCE PACKAGE:{"x":1}',
  console,
};
vm.createContext(bookContext);
vm.runInContext(bookOverlay, bookContext);
const bookPrompt = bookContext.kaiBuildPrompt({}, []);
assert(bookPrompt.includes('CẤU TRÚC SÁCH / CHƯƠNG / BÀI'), '036 book structure rules not injected');
assert(bookPrompt.indexOf('lesson_code') < bookPrompt.indexOf('SOURCE PACKAGE:'), '036 structure rules must precede source package');

console.log('PASS ai_geography_assessment_standard_simulation + book_lesson_scope_036');