const fs = require('fs');
const assert = require('assert');

const prompt = fs.readFileSync('ai_exam_validation_architecture_053.js', 'utf8');
const bridge = fs.readFileSync('supabase/functions/exam-ai-bridge/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261008094500_ai_exam_item_writing_quality_074.sql', 'utf8');
const review = fs.readFileSync('ai_exam_quality_review_053.js', 'utf8');
const html = fs.readFileSync('ai_exam.html', 'utf8');

assert(prompt.includes('PHẦN I — CÂU DẪN VÀ PHƯƠNG ÁN:'), '074 must add explicit Part I stem-writing rules');
assert(prompt.includes('không được bọc câu nhớ bằng một đoạn dẫn'), '074 must forbid pseudo-application wrapping');
assert(prompt.includes('Mọi dữ kiện trong noi_dung phải cần cho việc giải'), '074 must require relevant stem evidence only');
assert(prompt.includes('Theo giả thuyết được trình bày trong bài học'), '074 must include the observed bad-stem example');
assert(bridge.includes('Student-facing stems must never mention the lesson, source package, knowledge_units, source_refs, unit_key'), 'Edge generation contract must carry standalone-stem rule');

assert(migration.includes('_ai_exam_quality_gate_074_base'), '074 must preserve and wrap the previous quality gate');
assert(migration.includes('quality_part1_meta_stem_invalid'), '074 must hard-block authoring metadata in Part I stems');
assert(migration.includes('part1_generic_judgement_shell'), '074 must warn on generic judgement shells');
assert(migration.includes('part1_nb_stem_overlong'), '074 must warn on overlong NB stems');
assert(review.includes('part1_generic_judgement_shell') && review.includes('part1_nb_stem_overlong'), '074 warnings must be teacher-visible');

const metaStemPattern = /(trong bài học|được nêu trong bài|được trình bày trong bài|quy luật trong bài|nguồn nêu|knowledge[ _-]?package|knowledge_units|source_refs|unit_key)/i;
assert(metaStemPattern.test('Theo giả thuyết được trình bày trong bài học, các hành tinh được hình thành từ quá trình nào?'), 'Observed meta stem #1 must be rejected');
assert(metaStemPattern.test('Độ dày của thạch quyển được nêu trong bài vào khoảng'), 'Observed meta stem #2 must be rejected');
assert(metaStemPattern.test('Dự đoán nào phù hợp nhất với quy luật trong bài?'), 'Observed meta stem #3 must be rejected');
assert(!metaStemPattern.test('Theo giả thuyết về sự hình thành Hệ Mặt Trời, Trái Đất được hình thành từ'), 'Clean standalone stem must remain allowed');

assert(html.includes('ai_exam_validation_architecture_053.js?v=20261008-item-writing-074'), '074 validation prompt cache marker missing');
assert(html.includes('ai_exam_quality_review_053.js?v=20261008-item-writing-074'), '074 warning UI cache marker missing');

console.log('AI exam item-writing quality 074 simulation: PASS');
