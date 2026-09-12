const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const migration = fs.readFileSync('supabase/migrations/20260912090000_chunked_knowledge_normalization_042.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/knowledge-chunked-normalization/index.ts', 'utf8');
const ui = fs.readFileSync('knowledge_chunked_normalization.js', 'utf8');
const resume = fs.readFileSync('knowledge_chunked_resume.js', 'utf8');
const batch = fs.readFileSync('knowledge_chunked_batch.js', 'utf8');
const feedbackFix = fs.readFileSync('knowledge_chunked_feedback_fix.js', 'utf8');
const guided = fs.readFileSync('knowledge_guided_flow.js', 'utf8');
const guard = fs.readFileSync('knowledge_long_source_guard.js', 'utf8');
const html = fs.readFileSync('knowledge.html', 'utf8');

new vm.Script(ui, { filename: 'knowledge_chunked_normalization.js' });
new vm.Script(resume, { filename: 'knowledge_chunked_resume.js' });
new vm.Script(batch, { filename: 'knowledge_chunked_batch.js' });
new vm.Script(feedbackFix, { filename: 'knowledge_chunked_feedback_fix.js' });
new vm.Script(guided, { filename: 'knowledge_guided_flow.js' });
new vm.Script(guard, { filename: 'knowledge_long_source_guard.js' });

assert(migration.includes('knowledge_normalization_plans'), '042 plan staging table missing');
assert(migration.includes('knowledge_normalization_chunks'), '042 chunk staging table missing');
assert(migration.includes("chunk_type in ('LESSON','NON_LESSON','UNRESOLVED')"), '042 chunk type boundary missing');
assert(migration.includes("status in ('PENDING','ACCOUNTED','IMPORTED','NEEDS_REVIEW','INCOMPLETE')"), '042 chunk status boundary missing');
assert(migration.includes('enable row level security'), '042 staging tables must have RLS enabled');
assert(migration.includes('grant all on table public.knowledge_normalization_plans to service_role'), '042 plan table must remain service-only');
assert(migration.includes('_knowledge_long_source_chunk_guard_042'), '042 server-side long-source canonical guard missing');
assert(migration.includes("coalesce(new.page_count,0)>40"), '042 server-side long-source threshold missing');
assert(migration.includes("@> '[\"CHUNKED_NORMALIZATION_042\"]'::jsonb"), '042 server must require assembler audit marker for long knowledge sources');
assert(migration.includes('long_knowledge_source_requires_chunked_normalization'), '042 fail-closed long-source error missing');
assert(migration.includes('_knowledge_chunk_plan_review_guard_042'), '042 review-plan guard missing');
assert(migration.includes("new.plan_status:='NEEDS_REVIEW'"), '042 uncertain assembled revisions must leave the plan repairable');

assert(edge.includes('DAMSAN_SOURCE_PLAN_V1'), '042 structure-plan schema missing');
assert(edge.includes('DOCUMENT STRUCTURE SCANNER'), '042 structure scanner prompt missing');
assert(edge.includes('LESSON NORMALIZATION WORKER'), '042 lesson worker prompt missing');
assert(edge.includes('KHÔNG XUẤT MANIFEST TOÀN SÁCH'), '042 chunk worker must not emit whole-book manifest');
assert(edge.includes('processed_pages: []'), '042 worker prompt must start with zero processed pages');
assert(edge.includes('missing_pages: pageList'), '042 worker prompt must start with assigned pages missing rather than claiming success');
assert(edge.includes('uncertainPages.some((page) => !processed.has(page))'), '042 uncertain pages must be a subset of actually processed pages');
assert(edge.includes('plan_coverage_gap_or_overlap'), '042 server must require exact structure-plan page coverage');
assert(edge.includes('TARGET_CHUNK_PAGES = 12'), '042 server chunk size policy missing');
assert(edge.includes('assembly_unresolved_ranges'), '042 assembler must reject unresolved ranges');
assert(edge.includes('assembly_chunks_incomplete_'), '042 assembler must reject pending/incomplete lesson chunks');
assert(edge.includes('processed_pages_count: accountedPages.size'), '042 final processed-page count must be computed, not hard-coded');
assert(edge.includes('CHUNKED_NORMALIZATION_042'), '042 final manifest audit marker missing');
assert(edge.includes('rpc_knowledge_import_normalized_source_service'), '042 assembler must reuse canonical normalized-source commit service');
assert(!/rpc_luu_de_thi_len_phong|\bphong_thi\b|\bde_thi\b/.test(edge), '042 must not access room/exam persistence');

assert(ui.includes('Scanner → từng bài/chunk → Assembler'), '042 long-book UI heading missing');
assert(ui.includes('btnChunkedStructure'), '042 structure prompt action missing');
assert(ui.includes('btnChunkedPlanImport'), '042 plan import action missing');
assert(ui.includes('btnChunkedPrompt'), '042 chunk prompt action missing');
assert(ui.includes('btnChunkedImport'), '042 chunk import action missing');
assert(ui.includes('btnChunkedAssemble'), '042 assemble action missing');
assert(ui.includes("rpc_knowledge_set_subject_grade"), '042 browser must keep explicit subject/grade binding');
assert(ui.includes("rpc_knowledge_set_authority_binding"), '042 browser must keep KNOWLEDGE_SOURCE role binding');
assert(!/rpc_luu_de_thi_len_phong|\bphong_thi\b|\bde_thi\b/.test(ui), '042 UI must not touch room/exam persistence');

// 042B: a reload/navigation must resume persisted server progress rather than presenting an empty workflow.
assert(resume.includes("STORAGE_PREFIX = 'damsan.chunked.resume.v1'"), '042B local resume key missing');
assert(resume.includes("action: 'read_plan'"), '042B must recover from authoritative persisted plan state');
assert(resume.includes('findLatestServerPlan'), '042B first-upgrade server fallback missing');
assert(resume.includes("document.getElementById('chunkedDocument')"), '042B document restoration missing');
assert(resume.includes("dispatchEvent(new Event('change'"), '042B must reuse canonical document-change/loadPlan path');
assert(resume.includes("document.getElementById('chunkedChunkSelect')"), '042B chunk selection restoration missing');
assert(resume.includes('Không cần nhập lại kế hoạch'), '042B user-visible recovery confirmation missing');
assert(!/import_structure_plan|import_chunk_jsonl|assemble_chunks|prepare_chunk_prompt/.test(resume), '042B recovery helper must be read-only and never mutate normalization state');
assert(!/rpc_luu_de_thi_len_phong|\bphong_thi\b|\bde_thi\b/.test(resume), '042B must remain outside room/exam persistence');

// 042C: preserve per-chunk server gates while batching manual web-AI interactions.
assert(batch.includes('MAX_BATCH_CHUNKS = 5'), '042C batch chunk ceiling missing');
assert(batch.includes('MAX_BATCH_PAGES = 24'), '042C batch page ceiling missing');
assert(batch.includes('BATCH LESSON NORMALIZATION WORKER'), '042C batch worker prompt missing');
assert(batch.includes("action: 'prepare_chunk_prompt'"), '042C must reuse canonical server-generated chunk prompts');
assert(batch.includes("action: 'import_chunk_jsonl'"), '042C must commit each batch segment through canonical per-chunk validation');
assert(batch.includes('splitBatchJsonl'), '042C browser batch splitter missing');
assert(batch.includes("record_type || '').toLowerCase() === 'chunk_status'"), '042C batch boundaries must be chunk_status records');
assert(batch.includes('Không gộp hai chunk'), '042C prompt must forbid cross-chunk merging');
assert(batch.includes('Cùng một chat thì chỉ cần đính kèm PDF một lần'), '042C reduced-interaction guidance missing');
assert(!/rpc_luu_de_thi_len_phong|\bphong_thi\b|\bde_thi\b/.test(batch), '042C must remain outside room/exam persistence');

// 043/044 bootstrap: raw upload is secondary and the guided layer loads with an explicit cache version.
assert(feedbackFix.includes("heading.textContent = 'Thêm tài liệu nguồn'"), '043 compact raw-source heading missing');
assert(feedbackFix.includes("toggle.textContent = '＋ Thêm file mới'"), '043 collapsed source-intake affordance missing');
assert(feedbackFix.includes("knowledge_guided_flow.js?v=20260912-guided-flow-044"), '044 guided-flow bootstrap missing');
assert(feedbackFix.includes('Sau khi tải lên, hệ thống sẽ tự xác định tiến độ'), '044 raw-source copy must defer workflow complexity to the system');
assert(!/rpc_luu_de_thi_len_phong|\bphong_thi\b|\bde_thi\b/.test(feedbackFix), '043/044 feedback/bootstrap must remain visual-only');

// 044: one-next-action guided flow, recognition over recall, and a single AI-result inbox.
assert(guided.includes('Chuẩn hóa nguồn tri thức'), '044 guided card heading missing');
assert(guided.includes('VIỆC TIẾP THEO'), '044 one-next-action cue missing');
assert(guided.includes('Dán kết quả AI'), '044 clipboard result action missing');
assert(guided.includes('kéo file JSON/JSONL vào đây'), '044 unified drop result inbox missing');
assert(guided.includes('navigator.clipboard.readText'), '044 clipboard result ingestion missing');
assert(guided.includes('Array.isArray(parsed)'), '044 must normalize JSON-array AI output rather than burden the teacher');
assert(guided.includes('plan_manifest') && guided.includes('chunk_status'), '044 must auto-detect scanner versus lesson output');
assert(guided.includes("action: 'import_structure_plan'"), '044 guided scanner result must use canonical plan import');
assert(guided.includes("action: 'import_chunk_jsonl'"), '044 guided lesson result must use canonical chunk import');
assert(guided.includes("action: 'assemble_chunks'"), '044 guided completion must reuse canonical assembler');
assert(guided.includes("action: 'prepare_structure_prompt'"), '044 scanner prompt preparation missing');
assert(guided.includes("action: 'prepare_chunk_prompt'"), '044 batch/review prompt preparation missing');
assert(guided.includes('MAX_BATCH_CHUNKS = 5') && guided.includes('MAX_BATCH_PAGES = 24'), '044 must preserve bounded web-AI workload');
assert(guided.includes('canonicalChunkPromptFix'), '044 must correct per-chunk first-record wording automatically');
assert(guided.includes('RECORD ĐẦU TIÊN BẮT BUỘC CỦA CHUNK'), '044 corrected chunk wording missing');
assert(guided.includes('expected_chunk_keys'), '044 must remember the expected batch and reject accidental old-batch reuse');
assert(guided.includes("rpc_knowledge_set_subject_grade") && guided.includes("rpc_knowledge_set_authority_binding"), '044 must keep explicit subject/grade/role server binding');
assert(guided.includes("chunked.style.display = 'none'") && guided.includes("normalized.style.display = 'none'"), '044 technical workflows must be progressively disclosed');
assert(guided.includes('Tiến độ được lưu trên server'), '044 save-and-return reassurance missing');
assert(!/from\(['"]knowledge_(?:documents|units|normalization_plans|normalization_chunks)['"]\)\s*\.\s*(?:insert|update|delete|upsert)/.test(guided), '044 browser must not directly mutate protected knowledge tables');
assert(!/rpc_luu_de_thi_len_phong|\bphong_thi\b|\bde_thi\b/.test(guided), '044 guided flow must remain outside room/exam persistence');

// 042C feedback fix still binds the live technical card for advanced/fallback use.
assert(feedbackFix.includes("getElementById('chunkedSourceCard')"), '042C feedback must bind the live chunked card');
assert(feedbackFix.includes('is-busy') && feedbackFix.includes('is-success') && feedbackFix.includes('is-error'), '042C explicit visual states missing');

assert(guard.includes('LONG_PAGE_THRESHOLD = 40'), '042 long-source one-shot threshold missing');
assert(guard.includes("role === 'KNOWLEDGE_SOURCE'"), '042 guard must be knowledge-source scoped');
assert(guard.includes("#btnNormalizedPrompt,#btnNormalizedImport"), '042 guard must block old one-shot prepare/import actions for long knowledge sources');
assert(guard.includes('Scanner → Chunk → Assembler'), '042 guard must redirect teachers to chunked flow');
assert(!/rpc_luu_de_thi_len_phong|\bphong_thi\b|\bde_thi\b/.test(guard), '042 guard must not touch room/exam persistence');
assert(html.includes('knowledge_chunked_normalization.js?v=20260912-chunked-normalization-042'), '042 knowledge page chunked cache-bust missing');
assert(html.includes('knowledge_chunked_resume.js?v=20260912-chunked-refresh-resume-042b'), '042B refresh-resume helper loader missing');
assert(html.includes('knowledge_chunked_feedback_fix.js?v=20260912-guided-bootstrap-044'), '044 guided bootstrap cache-bust missing');
assert(html.includes('knowledge_chunked_batch.js?v=20260912-chunked-batch-042c'), '042C batch helper loader missing');
assert(html.includes('knowledge_long_source_guard.js?v=20260912-long-source-guard-042'), '042 long-source guard cache-bust missing');
assert(html.includes('Hệ thống tự lưu để có thể rời trang rồi quay lại sau'), '044 save-and-return header copy missing');

console.log('PASS chunked normalization 042/042B/042C + compact intake 043 + guided low-interaction UX 044');
