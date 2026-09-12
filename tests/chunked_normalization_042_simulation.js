const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const migration = fs.readFileSync('supabase/migrations/20260912090000_chunked_knowledge_normalization_042.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/knowledge-chunked-normalization/index.ts', 'utf8');
const ui = fs.readFileSync('knowledge_chunked_normalization.js', 'utf8');
const resume = fs.readFileSync('knowledge_chunked_resume.js', 'utf8');
const batch = fs.readFileSync('knowledge_chunked_batch.js', 'utf8');
const feedbackFix = fs.readFileSync('knowledge_chunked_feedback_fix.js', 'utf8');
const guard = fs.readFileSync('knowledge_long_source_guard.js', 'utf8');
const html = fs.readFileSync('knowledge.html', 'utf8');

new vm.Script(ui, { filename: 'knowledge_chunked_normalization.js' });
new vm.Script(resume, { filename: 'knowledge_chunked_resume.js' });
new vm.Script(batch, { filename: 'knowledge_chunked_batch.js' });
new vm.Script(feedbackFix, { filename: 'knowledge_chunked_feedback_fix.js' });
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

// 042C feedback fix: live card id is #chunkedSourceCard, not the stale helper id.
assert(feedbackFix.includes("getElementById('chunkedSourceCard')"), '042C feedback must bind the live chunked card');
assert(feedbackFix.includes('is-busy') && feedbackFix.includes('is-success') && feedbackFix.includes('is-error'), '042C explicit visual states missing');
assert(!/rpc_luu_de_thi_len_phong|\bphong_thi\b|\bde_thi\b/.test(feedbackFix), '042C feedback must be visual-only');

assert(guard.includes('LONG_PAGE_THRESHOLD = 40'), '042 long-source one-shot threshold missing');
assert(guard.includes("role === 'KNOWLEDGE_SOURCE'"), '042 guard must be knowledge-source scoped');
assert(guard.includes("#btnNormalizedPrompt,#btnNormalizedImport"), '042 guard must block old one-shot prepare/import actions for long knowledge sources');
assert(guard.includes('Scanner → Chunk → Assembler'), '042 guard must redirect teachers to chunked flow');
assert(!/rpc_luu_de_thi_len_phong|\bphong_thi\b|\bde_thi\b/.test(guard), '042 guard must not touch room/exam persistence');
assert(html.includes('knowledge_chunked_normalization.js?v=20260912-chunked-normalization-042'), '042 knowledge page chunked cache-bust missing');
assert(html.includes('knowledge_chunked_resume.js?v=20260912-chunked-refresh-resume-042b'), '042B refresh-resume helper loader missing');
assert(html.includes('knowledge_chunked_feedback_fix.js?v=20260912-chunked-feedback-042c'), '042C chunk feedback fix loader missing');
assert(html.includes('knowledge_chunked_batch.js?v=20260912-chunked-batch-042c'), '042C batch helper loader missing');
assert(html.includes('knowledge_long_source_guard.js?v=20260912-long-source-guard-042'), '042 long-source guard cache-bust missing');

console.log('PASS chunked normalization 042/042B/042C scanner -> chunks -> assembler + refresh resume + web batch invariants');
