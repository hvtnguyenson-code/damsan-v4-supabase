const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const migration = fs.readFileSync('supabase/migrations/20260911164000_normalized_knowledge_authority_038_039.sql','utf8');
const authorityPackMigration = fs.readFileSync('supabase/migrations/20260911165000_assessment_authority_pack_039a.sql','utf8');
const autoLinkMigration = fs.readFileSync('supabase/migrations/20260911165500_assessment_authority_unique_profile_link_039b.sql','utf8');
const bridge = fs.readFileSync('supabase/functions/knowledge-normalized-source/index.ts','utf8');
const knowledgeUi = fs.readFileSync('knowledge_normalized_source.js','utf8');
const knowledgeHtml = fs.readFileSync('knowledge.html','utf8');
const examUi = fs.readFileSync('ai_exam_grade_authority.js','utf8');
const examHtml = fs.readFileSync('ai_exam.html','utf8');

new vm.Script(knowledgeUi, { filename:'knowledge_normalized_source.js' });
new vm.Script(examUi, { filename:'ai_exam_grade_authority.js' });

// 038: source identity and grade are explicit, never inferred from the AI output.
assert(migration.includes("source_role text not null default 'KNOWLEDGE_SOURCE'"), '038 source_role column missing');
assert(migration.includes("'KNOWLEDGE_SOURCE','ASSESSMENT_RULE','ASSESSMENT_BENCHMARK'"), '038 source-role boundary missing');
assert(migration.includes("normalization_schema='DAMSAN_SOURCE_V2'"), '038 normalized schema persistence missing');
assert(migration.includes('normalized_source_page_count_mismatch'), '038 source-page coverage gate missing');
assert(migration.includes('normalized_coverage_incomplete'), '038 incomplete coverage must be rejected');
assert(migration.includes("v_role='KNOWLEDGE_SOURCE' and v_lesson_units<1"), '038 knowledge source must contain lesson units');
assert(migration.includes('rpc_knowledge_import_normalized_source_service'), '038 canonical import RPC missing');
assert(migration.includes("d.source_role='KNOWLEDGE_SOURCE'"), '038/039 exam catalog must exclude rule/benchmark documents from knowledge scope');

assert(bridge.includes('DAMSAN_SOURCE_V2'), '038 edge schema missing');
assert(bridge.includes('prepare_prompt') && bridge.includes('import_jsonl'), '038 edge actions missing');
assert(bridge.includes('coverage.missing_pages.length > 0'), '038 edge must reject missing pages');
assert(bridge.includes('processedPageCount !== sourcePageCount'), '038 edge must reject partial processing');
assert(bridge.includes('SỐ TRANG VẬT LÝ CỦA PDF'), '038 prompt must define physical PDF-page provenance');
assert(/KHÔNG phải tóm tắt ngắn/.test(bridge), '038 knowledge normalization must preserve detail instead of summarizing');
assert(/không sao chép câu hỏi/i.test(bridge), '038 benchmark normalization must forbid verbatim reuse');
assert(!/openai\.com\/v1|generativelanguage\.googleapis\.com|anthropic\.com\/v1/i.test(bridge), '038 bridge must not call a paid model API');

assert(knowledgeHtml.includes('knowledge_normalized_source.js?v=20260911-normalized-source-038'), '038 knowledge UI script missing');
assert(knowledgeUi.includes("<option value=\"10\">Khối 10</option>"), '038 grade 10 option missing');
assert(knowledgeUi.includes("<option value=\"11\">Khối 11</option>"), '038 grade 11 option missing');
assert(knowledgeUi.includes("<option value=\"12\">Khối 12</option>"), '038 grade 12 option missing');
const normalizedGradeSelect = /<select id="normalizedGrade">([\s\S]*?)<\/select>/.exec(knowledgeUi)?.[1] || '';
assert(normalizedGradeSelect && !/Tất cả khối/i.test(normalizedGradeSelect), '038 must not offer All grades for normalized-source identity');
assert(knowledgeUi.includes('ASSESSMENT_RULE') && knowledgeUi.includes('ASSESSMENT_BENCHMARK'), '038 authority source-role selectors missing');
assert(knowledgeUi.includes('Tài liệu/khối/vai trò đã thay đổi'), '038 import must detect metadata drift after prompt generation');

// 039: assessment rules and benchmarks are a separate authority plane.
assert(migration.includes('create table if not exists public.assessment_authority_profiles'), '039 authority profile registry missing');
assert(migration.includes('create table if not exists public.assessment_profile_sources'), '039 authority source linkage missing');
assert(migration.includes('DIA_LI_TNTHPT_2025_PLUS_V1'), '039 Geography TNTHPT profile missing');
assert(migration.includes("'p1',18,'p2',4,'p3',6"), '039 official 18-4-6 blueprint missing');
assert(migration.includes("'benchmark_policy','STYLE_ONLY_NO_COPY'"), '039 benchmark no-copy policy missing');
assert(migration.includes('_assessment_authority_snapshot_039'), '039 immutable request authority snapshot missing');
assert(migration.includes('snapshot_hash'), '039 authority snapshot hash missing');
assert(migration.includes('rpc_assessment_authority_resolve'), '039 teacher authority resolver missing');
assert(migration.includes('assessment_grade_required'), '039 request grade must be mandatory');
assert(migration.includes("d.grade=v_grade and d.source_role='KNOWLEDGE_SOURCE'"), '039 request creation must enforce grade and content role');
assert(migration.includes('official_blueprint_counts_locked_18_4_6'), '039 official Geography blueprint must be server-locked');
assert(migration.includes('_ai_exam_authority_gate_039'), '039 deterministic authority gate missing');
assert(migration.includes('authority_official_blueprint_mismatch'), '039 generated draft must be rejected when official counts drift');
assert(migration.includes("v_grade=12 and v_profile"), '039 legacy Geography standard must be grade-12 scoped');

assert(authorityPackMigration.includes('rpc_ai_exam_authority_pack_service'), '039A authority-pack service missing');
assert(authorityPackMigration.includes("s.source_kind='ASSESSMENT_RULE' and u.unit_type='ASSESSMENT_RULE'"), '039A rule corpus boundary missing');
assert(authorityPackMigration.includes("s.source_kind='ASSESSMENT_BENCHMARK' and u.unit_type='BENCHMARK_PATTERN'"), '039A benchmark corpus boundary missing');
assert(authorityPackMigration.includes('limit 240'), '039A browser authority corpus must be bounded');
assert(authorityPackMigration.includes("'authority_pack'"), '039A teacher resolver must return separate authority pack');

assert(autoLinkMigration.includes('_assessment_auto_link_unique_profile_039'), '039B deterministic authority auto-link trigger missing');
assert(autoLinkMigration.includes('v_profile_count<>1'), '039B must refuse implicit linkage when subject/grade profile is ambiguous');
assert(autoLinkMigration.includes("new.source_role not in ('ASSESSMENT_RULE','ASSESSMENT_BENCHMARK')"), '039B auto-link must only apply to authority source roles');
assert(autoLinkMigration.includes('AUTO_LINK_UNIQUE_PROFILE_039B'), '039B audit marker missing');

assert(examHtml.includes('id="gradeSelect"'), '039 mandatory grade selector missing from exam UI');
assert(examHtml.includes('id="assessmentAuthorityPanel"'), '039 authority evidence panel missing');
assert(examHtml.includes('ai_exam_grade_authority.js?v=20260911-grade-authority-039'), '039 grade/authority overlay missing');
assert(examUi.includes('rpc_assessment_authority_resolve'), '039 browser must resolve authority from server');
assert(examUi.includes('DAMSAN_ASSESSMENT_AUTHORITY_PACKAGE_V1'), '039 authority prompt package missing');
assert(/ASSESSMENT_RULE có quyền ưu tiên cao hơn ASSESSMENT_BENCHMARK/.test(examUi), '039 rule-over-benchmark precedence missing');
assert(/source_refs của câu hỏi chỉ được trỏ tới KNOWLEDGE PACKAGE/.test(examUi), '039 authority units must never masquerade as factual source refs');
assert(examUi.includes('Number(doc.grade || 0) === grade'), '039 browser grade filter missing');
assert(examUi.includes("doc.source_role === 'KNOWLEDGE_SOURCE'"), '039 browser must exclude authority docs from factual source picker');
assert(examUi.includes('Hãy chọn khối 10, 11 hoặc 12'), '039 grade-required UX missing');
assert(examUi.includes('el.disabled = true'), '039 official count lock UX missing');

console.log('PASS normalized knowledge 038 + assessment authority 039/039A/039B');
