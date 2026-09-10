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
const lazyMigration = fs.readFileSync('supabase/migrations/20260910155631_knowledge_lazy_segment_analysis_036b.sql','utf8');
const segmentBridge = fs.readFileSync('supabase/functions/knowledge-segment-bridge/index.ts','utf8');
const docs = fs.readFileSync('docs/GEOGRAPHY_ASSESSMENT_STANDARD_037.md','utf8');

assert(overlay.includes('DIA_LI_TNTHPT_2025_PLUS_V1'), '037 profile id missing from prompt compiler');
assert(/stimulus chung/i.test(overlay), 'Part II shared stimulus rule missing');
assert(/phương án nhiễu/i.test(overlay), 'Part I distractor rule missing');
assert(/làm tròn/i.test(overlay), 'Part III rounding rule missing');
assert(/không sao chép/i.test(overlay), 'benchmark no-copy policy missing');
assert(/input\.request\.exam_spec/.test(overlay), 'prompt compiler must prefer server authoritative exam_spec');

const elements = { profile:{value:'TOT_NGHIEP'}, p1Count:{value:0}, p2Count:{value:0}, p3Count:{value:0} };
const context = { window:{}, document:{ getElementById:(id)=>elements[id]||null }, AIE_MAX_PROMPT_CHARS:7_500_000, console };
context.window.aieProfileChange = () => {};
vm.createContext(context);
vm.runInContext(overlay, context);
context.window.aieProfileChange();
assert.strictEqual(elements.p1Count.value,18,'TOT_NGHIEP P1 default must be 18');
assert.strictEqual(elements.p2Count.value,4,'TOT_NGHIEP P2 default must be 4');
assert.strictEqual(elements.p3Count.value,6,'TOT_NGHIEP P3 default must be 6');

const spec = { assessment_type:'TOT_NGHIEP', counts:{p1:18,p2:4,p3:6}, assessment_standard:{id:'DIA_LI_TNTHPT_2025_PLUS_V1'} };
const prompt = context.window.aieBuildPrompt({ request:{request_id:'r1',exam_spec:spec}, instructions:{exam_spec:spec} }, [{unit_key:'u1',content:{text:'x'}}], {assessment_type:'MCQ_ONLY'});
assert(prompt.includes('DIA_LI_TNTHPT_2025_PLUS_V1'),'profile rules not emitted into prompt');
assert(prompt.includes('"assessment_type":"TOT_NGHIEP"'),'server exam_spec must win over stale local spec');
assert(prompt.includes('ĐÚNG/SAI'),'Part II professional rules missing from compiled prompt');
assert(prompt.includes('TRẢ LỜI NGẮN'),'Part III professional rules missing from compiled prompt');
assert(/value="18"/.test(html) && /value="4"/.test(html) && /value="6"/.test(html),'official 18-4-6 defaults missing from UI');
assert(html.includes('ai_exam_assessment_profile.js?v=20260910-geography-assessment-037'),'037 overlay script missing from UI');

assert(migration.includes('_ai_exam_apply_assessment_standard_037'),'server profile injector missing');
assert(migration.includes("v_subject in ('địa lí','địa lý')"),'server subject binding missing');
assert(migration.includes('quality_part1_duplicate_options_invalid'),'Part I deterministic gate missing');
assert(migration.includes('quality_part2_stimulus_invalid'),'Part II stimulus gate missing');
assert(migration.includes('quality_part2_all_same_invalid'),'Part II truth-pattern gate missing');
assert(migration.includes('quality_part3_numeric_answer_invalid'),'Part III numeric answer gate missing');
assert(migration.includes('quality_part3_rounding_invalid'),'Part III rounding gate missing');
assert(migration.includes("p1\":18") && migration.includes("p2\":4") && migration.includes("p3\":6"),'official blueprint missing from server standard');

assert(docs.includes('vqa.moet.gov.vn/vi/news/thong-bao/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-74.html'),'official format source missing');
assert(docs.includes('vqa.moet.gov.vn/vi/news/tin-tuc-su-kien/de-thi-tham-khao-ky-thi-tot-nghiep-thpt-tu-nam-2025-159.html'),'official reference exam source missing');
assert(/Hà Tĩnh/.test(docs) && /Hà Nội/.test(docs) && /Hòa Bình/.test(docs) && /Bình Phước/.test(docs),'provincial benchmark corpus not documented');

assert(html.includes('ai_exam_knowledge_scope.js?v=20260910-book-lesson-scope-036'),'036 lesson-scope overlay missing from exam UI');
assert(knowledgeHtml.includes('knowledge_ai_book_structure.js?v=20260910-lazy-book-semantic-036b'),'036B book-structure overlay cache version missing from semantic-analysis UI');
assert(scopeOverlay.includes('DAMSAN_KNOWLEDGE_SCOPE_V1'),'036 scope schema missing from browser request');
assert(scopeOverlay.includes('rpc_knowledge_scope_catalog_read'),'036 browser must use protected lesson catalog RPC');
assert(scopeOverlay.includes('knowledge-lesson-check'),'036 lesson selector UI missing');
assert(scopeOverlay.includes("mode: 'LESSONS'"),'036 lesson-only request mode missing');
assert(/tick ô này nếu thật sự muốn dùng toàn bộ tài liệu/.test(scopeOverlay),'multi-lesson document must not be silently selected in full');
assert(scopeMigration.includes('_knowledge_scope_key_036'),'036 stable lesson scope key missing');
assert(scopeMigration.includes('_ai_exam_normalize_scope_036'),'036 server scope normalization missing');
assert(scopeMigration.includes('rpc_knowledge_scope_catalog_read'),'036 secure scope catalog missing');
assert(scopeMigration.includes('_ai_exam_scope_allows_unit_036'),'036 server pack scope filter missing');
assert(scopeMigration.includes('rpc_ai_exam_knowledge_pack_service'),'036 scoped knowledge pack override missing');
assert(scopeMigration.includes('_ai_exam_scope_quality_gate_036'),'036 draft provenance scope gate missing');
assert(scopeMigration.includes('knowledge_source_ref_outside_scope'),'036 out-of-scope source ref rejection missing');
assert(scopeMigration.includes('_ai_exam_quality_gate_037'),'036 must preserve the 037 assessment quality gate');

assert(bookOverlay.includes('lesson_code') && bookOverlay.includes('lesson_title'),'036 semantic prompt must require lesson metadata');
assert(bookOverlay.includes('BAI_01'),'036 semantic prompt must define stable lesson codes');
assert(/không gộp kiến thức của hai bài khác nhau/i.test(bookOverlay),'036 semantic prompt must preserve lesson boundaries');
assert(bookOverlay.includes('knowledge-segment-bridge'),'036B UI must use dedicated scoped semantic bridge');
assert(bookOverlay.includes('inspect_document'),'036B UI must inspect whole-book structure');
assert(bookOverlay.includes('create_segment_handoff'),'036B UI must issue segment-bound capability');
assert(bookOverlay.includes('book-segment-check'),'036B UI must expose lesson selection');
assert(/không gửi cả cuốn sách sang AI/i.test(bookOverlay),'036B must refuse silent whole-book handoff');
assert(bookOverlay.includes("pipeline_version:'DAMSAN_KNOWLEDGE_V1/036B'"),'036B semantic submission version missing');

assert(lazyMigration.includes('DAMSAN_BOOK_INDEX_V1'),'036B persistent mechanical book index missing');
assert(lazyMigration.includes('knowledge_segment_handoffs'),'036B segment capability table missing');
assert(lazyMigration.includes('rpc_knowledge_issue_segment_handoff_service'),'036B scoped handoff issue RPC missing');
assert(lazyMigration.includes('rpc_knowledge_claim_segment_handoff_service'),'036B scoped handoff claim RPC missing');
assert(lazyMigration.includes('rpc_knowledge_complete_segment_handoff_service'),'036B merge commit RPC missing');
assert(lazyMigration.includes('_knowledge_segment_scope_matches_unit_036b'),'036B server unit-scope guard missing');
assert(lazyMigration.includes('unit_outside_segment_scope'),'036B out-of-scope AI unit rejection missing');
assert(lazyMigration.includes("pipeline_status=case when v_quality_status='AUTO_ACCEPTED' and v_remaining=0 then 'READY' else 'EXTRACTED' end"),'036B incomplete books must remain eligible for later lesson analysis');
assert(lazyMigration.includes('rpc_knowledge_commit_analysis_service'),'036B must reuse canonical knowledge commit boundary');

assert(segmentBridge.includes('detectBookIndex'),'036B mechanical lesson detector missing');
assert(segmentBridge.includes('(perPage.get(c.page) || 0) < 3'),'036B table-of-contents false-positive guard missing');
assert(segmentBridge.includes('selected_ranges'),'036B scoped source chunk metadata missing');
assert(segmentBridge.includes('buildScopedChunk'),'036B server must slice artifact by selected page ranges');
assert(segmentBridge.includes('rpc_knowledge_store_book_index_service'),'036B detected index must be persisted');
assert(segmentBridge.includes('rpc_knowledge_complete_segment_handoff_service'),'036B edge must use transactional merge RPC');

console.log('PASS ai_geography_assessment_standard_simulation + book_lesson_scope_036 + lazy_segment_036b');
