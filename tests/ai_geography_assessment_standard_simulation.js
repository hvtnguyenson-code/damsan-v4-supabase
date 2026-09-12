const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const overlay = fs.readFileSync('ai_exam_assessment_profile.js','utf8');
const scopeOverlay = fs.readFileSync('ai_exam_knowledge_scope.js','utf8');
const bookOverlay = fs.readFileSync('knowledge_ai_book_structure.js','utf8');
const bookRepair = fs.readFileSync('knowledge_ai_book_repair.js','utf8');
const html = fs.readFileSync('ai_exam.html','utf8');
const knowledgeHtml = fs.readFileSync('knowledge_ai.html','utf8');
const migration = fs.readFileSync('supabase/migrations/20260910150516_geography_assessment_standard_037.sql','utf8');
const scopeMigration = fs.readFileSync('supabase/migrations/20260910152210_knowledge_book_lesson_scope_036.sql','utf8');
const lazyMigration = fs.readFileSync('supabase/migrations/20260910155631_knowledge_lazy_segment_analysis_036b.sql','utf8');
const segmentBridge = fs.readFileSync('supabase/functions/knowledge-segment-bridge/index.ts','utf8');
const bookIndexBridge = fs.readFileSync('supabase/functions/knowledge-book-index-v2/index.ts','utf8');
const bookDiagnosticBridge = fs.readFileSync('supabase/functions/knowledge-book-index-diagnostics/index.ts','utf8');
const docs = fs.readFileSync('docs/GEOGRAPHY_ASSESSMENT_STANDARD_037.md','utf8');

new vm.Script(bookRepair, { filename:'knowledge_ai_book_repair.js' });

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
assert(html.includes('ai_exam_assessment_profile.js?v=20260911-assessment-authority-039'),'037/039 prompt overlay script missing from UI');

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

assert(html.includes('ai_exam_knowledge_scope.js?v=20260913-explicit-lesson-scope-045'),'045 explicit lesson-scope overlay missing from exam UI');
assert(html.includes('Phạm vi kiến thức — chọn bài cần ra đề'),'045 lesson-scope heading must be explicit in main setup UI');
assert(knowledgeHtml.includes('knowledge_ai_book_structure.js?v=20260910-lazy-book-semantic-036b'),'036B book-structure overlay missing from semantic-analysis UI');
assert(knowledgeHtml.includes('r=036b2'),'036B2 cache-bust marker missing from semantic-analysis UI');
assert(knowledgeHtml.includes('knowledge_ai_book_repair.js?v=20260911-ocr-toc-recovery-036b5b'),'036B5B repair cache-bust missing from semantic-analysis UI');
assert(scopeOverlay.includes('DAMSAN_KNOWLEDGE_SCOPE_V1'),'036 scope schema missing from browser request');
assert(scopeOverlay.includes('rpc_knowledge_scope_catalog_read'),'036 browser must use protected lesson catalog RPC');
assert(scopeOverlay.includes('knowledge-lesson-check'),'036 lesson selector UI missing');
assert(scopeOverlay.includes("mode: 'LESSONS'"),'036 lesson-only request mode missing');
assert(scopeOverlay.includes('PHẠM VI KIẾN THỨC'),'045 visible knowledge-scope panel missing');
assert(scopeOverlay.includes('scope-selection-summary'),'045 selected lesson-count summary missing');
assert(scopeOverlay.includes('Dùng toàn bộ sách'),'045 full-book scope must be explicit opt-in');
assert(scopeOverlay.includes('data-scope-action="all-lessons"'),'045 quick all-lessons control missing');
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
assert(bookOverlay.includes("pipeline_version:'DAMSAN_KNOWLEDGE_V1/036B2'"),'036B2 semantic submission version missing');
assert(bookOverlay.includes('LARGE_DOCUMENT_PAGE_THRESHOLD'),'036B2 large-document guard missing from browser');
assert(/Đã chặn tạo prompt toàn cuốn/.test(bookOverlay),'036B2 unsafe whole-book fallback must be blocked');
assert(/Chưa nhận diện được cấu trúc Bài/.test(bookOverlay),'036B2 visible detector failure diagnostic missing');

assert(bookRepair.includes('knowledge-book-index-v2'),'036B5B UI must use book-index repair bridge');
assert(bookRepair.includes("action:'repair_book_index'"),'036B5B UI must request server-side book-index repair');
assert(bookRepair.includes('MutationObserver'),'036B5B repair must react to book-index UI changes');
assert(bookRepair.includes('LARGE_DOCUMENT_PAGE_THRESHOLD'),'036B5B must recheck large documents even when an earlier partial index exists');
assert(/036B5B đang khôi phục các dòng mục lục bị OCR làm phẳng/.test(bookRepair),'036B5B OCR-TOC recovery UX missing');
assert(/Không gửi nội dung sách sang AI/.test(bookRepair),'036B5B repair UX must state that source content is not sent to AI');
assert(/vẫn chặn gửi toàn cuốn/.test(bookRepair),'036B5B repair failure must preserve whole-book safety gate');

assert(bookRepair.includes('knowledge-book-index-diagnostics'),'036B5A UI must retain the read-only production diagnostic bridge');
assert(bookRepair.includes("action:'diagnose_book_index'"),'036B5A UI must request bounded server-side diagnostics');
assert(bookRepair.includes('compactDiagnostic'),'036B5A UI must compact diagnostics before browser exposure');
assert(bookRepair.includes('__DAMSAN_BOOK_DIAGNOSTIC_036B5A__'),'036B5A compact diagnostic browser handle missing');
assert(bookRepair.includes('Sao chép chẩn đoán 036B5A'),'036B5A copy action missing');
assert(bookRepair.includes("hit.mode === 'STRICT_RAW'") && bookRepair.includes('index > 3500'),'036B5A must preserve structural evidence for the old 3500-character body-prefix hypothesis');
assert(!/first_lines:\s*page\?\.first_lines/.test(bookRepair),'036B5A compact copy must not retain OCR line text');
assert(!/context:\s*String\(hit\?\.context/.test(bookRepair),'036B5A compact copy must not retain OCR context text');
assert(bookDiagnosticBridge.includes('read_only: true'),'036B5A server response must declare read-only operation');
assert(bookDiagnosticBridge.includes('MAX_EARLY_PAGES = 15'),'036B5A server diagnostics must remain bounded');
assert(!bookDiagnosticBridge.includes('rpc_knowledge_store_book_index_service'),'036B5A diagnostic bridge must never persist a book index');

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
assert(segmentBridge.includes('(perPage.get(c.page) || 0) < 3'),'036B table-of-contents false-positive guard compatibility marker missing');
assert(segmentBridge.includes('detectBookIndexDetailed'),'036B2 detector diagnostics missing');
assert(segmentBridge.includes('foldOcr'),'036B2 OCR-tolerant normalization missing');
assert(segmentBridge.includes('detector_version: "036B2"'),'036B2 detector version missing');
assert(segmentBridge.includes('large_document'),'036B2 large-document inspection metadata missing');
assert(segmentBridge.includes('selected_ranges'),'036B scoped source chunk metadata missing');
assert(segmentBridge.includes('buildScopedChunk'),'036B server must slice artifact by selected page ranges');
assert(segmentBridge.includes('rpc_knowledge_store_book_index_service'),'036B detected index must be persisted');
assert(segmentBridge.includes('rpc_knowledge_complete_segment_handoff_service'),'036B edge must use transactional merge RPC');

assert(bookIndexBridge.includes('DETECTOR_VERSION = "036B5B"'),'036B5B detector version missing');
assert(bookIndexBridge.includes('OCR_TOC_LINE_SEQUENCE'),'036B5B OCR-TOC sequence method missing');
assert(bookIndexBridge.includes('foldOcrLines'),'036B5B must preserve OCR line boundaries for TOC recovery');
assert(bookIndexBridge.includes('parseTocBlocks'),'036B5B must retain explicit TOC-block parsing');
assert(bookIndexBridge.includes('parseTocLines'),'036B5B line/window TOC parser missing');
assert(bookIndexBridge.includes('ORPHAN_NUMERIC_ROW'),'036B5B orphan numeric TOC row recovery missing');
assert(bookIndexBridge.includes('selectMonotonicSequence'),'036B5B monotonic lesson/page sequence selection missing');
assert(bookIndexBridge.includes('roman_lesson_tokens_ignored: true'),'036B5B must explicitly ignore Roman lesson tokens to prevent Vietnamese “vì” false positives');
assert(bookIndexBridge.includes('collectPrintedPageOffsets'),'036B5B printed-page calibration missing');
assert(bookIndexBridge.includes('chooseOffset'),'036B5B offset consensus selector missing');
assert(bookIndexBridge.includes('BOOK_INDEX_PARTIAL_REJECTED'),'036B5B must reject partial late-book indexes');
assert(bookIndexBridge.includes('beginsNearFirstLesson'),'036B5B first-lesson plausibility gate missing');
assert(bookIndexBridge.includes('contiguousRatio'),'036B5B sequence coverage gate missing');
assert(bookIndexBridge.includes('rpc_knowledge_store_book_index_service'),'036B5B repaired index must use canonical persistence RPC');
assert(bookIndexBridge.includes('staff_sessions') && bookIndexBridge.includes('staff_identity_mismatch'),'036B5B repair bridge must preserve custom staff authentication');
assert(!bookIndexBridge.includes('[IVXLCDM]'),'036B5B must not restore Roman-numeral lesson matching');

console.log('PASS ai_geography_assessment_standard_simulation + explicit_lesson_scope_045 + book_lesson_scope_036 + lazy_segment_036b2 + ocr_toc_recovery_036b5b + diagnostics_036b5a');
