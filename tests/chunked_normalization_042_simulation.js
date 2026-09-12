const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const migration = fs.readFileSync('supabase/migrations/20260912090000_chunked_knowledge_normalization_042.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/knowledge-chunked-normalization/index.ts', 'utf8');
const ui = fs.readFileSync('knowledge_chunked_normalization.js', 'utf8');
const html = fs.readFileSync('knowledge.html', 'utf8');

new vm.Script(ui, { filename: 'knowledge_chunked_normalization.js' });

assert(migration.includes('knowledge_normalization_plans'), '042 plan staging table missing');
assert(migration.includes('knowledge_normalization_chunks'), '042 chunk staging table missing');
assert(migration.includes("chunk_type in ('LESSON','NON_LESSON','UNRESOLVED')"), '042 chunk type boundary missing');
assert(migration.includes("status in ('PENDING','ACCOUNTED','IMPORTED','NEEDS_REVIEW','INCOMPLETE')"), '042 chunk status boundary missing');
assert(migration.includes('enable row level security'), '042 staging tables must have RLS enabled');
assert(migration.includes('grant all on table public.knowledge_normalization_plans to service_role'), '042 plan table must remain service-only');

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
assert(html.includes('knowledge_chunked_normalization.js?v=20260912-chunked-normalization-042'), '042 knowledge page cache-bust missing');

console.log('PASS chunked normalization 042 scanner -> chunks -> assembler invariants');
