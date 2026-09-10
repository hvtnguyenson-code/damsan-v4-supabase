const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260910054053_knowledge_automatic_reader_030b2.sql');
const queueSafetyPath = path.join(root, 'supabase', 'migrations', '20260910054814_knowledge_reader_queue_stage_safety_030b2.sql');
const edgePath = path.join(root, 'supabase', 'functions', 'knowledge-extraction', 'index.ts');
const htmlPath = path.join(root, 'knowledge.html');
const baseJsPath = path.join(root, 'knowledge.js');
const readerPath = path.join(root, 'knowledge_reader.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function must(source, regex, message) {
  assert(regex.test(source), message);
}

for (const file of [migrationPath, queueSafetyPath, edgePath, htmlPath, baseJsPath, readerPath]) {
  assert(fs.existsSync(file), `K030B2 required file exists: ${path.relative(root, file)}`);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const queueSql = fs.readFileSync(queueSafetyPath, 'utf8');
const edge = fs.readFileSync(edgePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const baseJs = fs.readFileSync(baseJsPath, 'utf8');
const reader = fs.readFileSync(readerPath, 'utf8');

console.log('=== KNOWLEDGE-030B2 AUTOMATIC DOCUMENT READER ===');

must(sql, /'knowledge-artifacts'[\s\S]*?false[\s\S]*?8388608[\s\S]*?application\/json/i,
  'K030B2-01 private JSON artifact bucket is 8 MiB');
must(sql, /add column if not exists extraction_manifest jsonb not null default '\{\}'::jsonb/i,
  'K030B2-02 extraction manifest exists');
must(sql, /pipeline_status in \([^)]*'EXTRACTED'/i, 'K030B2-03 EXTRACTED pipeline state exists');
must(sql, /create or replace function public\.rpc_knowledge_commit_extraction_service/i,
  'K030B2-04 extraction commit RPC exists');
must(sql, /p_manifest->>'schema_version' <> 'DAMSAN_EXTRACT_V1'/i,
  'K030B2-05 canonical extraction schema is enforced');
must(sql, /pipeline_status = 'EXTRACTED'/i, 'K030B2-06 document advances to EXTRACTED');
must(sql, /current_stage = 'ANALYZE'/i, 'K030B2-07 job advances to ANALYZE');
must(sql, /revoke all on function public\.rpc_knowledge_commit_extraction_service\(uuid, text, jsonb\) from public, anon, authenticated/i,
  'K030B2-08 browser roles cannot call service commit RPC');
must(sql, /grant execute on function public\.rpc_knowledge_commit_extraction_service\(uuid, text, jsonb\) to service_role/i,
  'K030B2-09 only service role receives extraction commit execution');
assert(!/artifact_path'\s*,\s*d\.extraction_manifest->>'artifact_path'/i.test(sql),
  'K030B2-10 library RPC must not disclose private artifact path');
console.log('K030B2-01..10 persistence boundary: PASSED');

must(queueSql, /j\.status = 'QUEUED'[\s\S]*j\.current_stage = 'EXTRACT'/i,
  'K030B2-11 extraction claim is stage-scoped');
assert(!/where j\.status = 'QUEUED'\s*\n\s*order by/i.test(queueSql),
  'K030B2-12 ANALYZE jobs cannot be pulled back into EXTRACT');
console.log('K030B2-11..12 queue stage safety: PASSED');

must(edge, /SUPABASE_SERVICE_ROLE_KEY/, 'K030B2-13 edge uses server service credential');
must(edge, /from\("staff_sessions"\)[\s\S]*token_hash[\s\S]*expires_at[\s\S]*revoked_at/i,
  'K030B2-14 edge validates opaque staff session');
must(edge, /document\.owner_gv_id !== actor\.id \|\| document\.truong_id !== actor\.truong_id/i,
  'K030B2-15 edge binds extraction to owned document');
must(edge, /createSignedUploadUrl\(storagePath\)/i, 'K030B2-16 artifact uses signed upload capability');
must(edge, /action === "prepare_artifact"/i, 'K030B2-17 prepare action exists');
must(edge, /action === "complete_artifact"/i, 'K030B2-18 complete action exists');
must(edge, /rpc_knowledge_commit_extraction_service/i, 'K030B2-19 edge commits through service RPC');
must(edge, /artifactPrefix\(actor, owned\)/i, 'K030B2-20 storage path is actor/document/job scoped');
console.log('K030B2-13..20 secure extraction gateway: PASSED');

must(html, /worker-src 'self' blob: https:\/\/cdn\.jsdelivr\.net/i,
  'K030B2-21 CSP allows only declared OCR/PDF worker source');
must(html, /connect-src[^;]*https:\/\/tessdata\.projectnaptha\.com/i,
  'K030B2-22 CSP allows OCR language data source');
must(html, /mammoth@1\.12\.2\/mammoth\.browser\.min\.js/i, 'K030B2-23 Mammoth is pinned');
must(html, /tesseract\.js@7\.0\.0\/dist\/tesseract\.min\.js/i, 'K030B2-24 Tesseract is pinned');
must(html, /Alpaq92\/JSDoc@821695a884e0c0bb8592a635d9524bb3e116cd67\/src\/docToText\.js/i,
  'K030B2-25 legacy DOC parser is pinned to exact reviewed revision');
must(html, /knowledge_reader\.js\?v=20260910-knowledge-reader-030b2/i,
  'K030B2-26 automatic reader is loaded after upload base');
console.log('K030B2-21..26 browser dependency/CSP contract: PASSED');

must(reader, /pdfjs-dist@\$\{KNOWLEDGE_PDFJS_VERSION\}\/build\/pdf\.mjs/i,
  'K030B2-27 PDF.js module extraction is used');
must(reader, /pdf\.worker\.mjs/i, 'K030B2-28 PDF.js worker is configured');
must(reader, /mammoth\.extractRawText\(\{ arrayBuffer:/i, 'K030B2-29 DOCX extraction uses Mammoth');
must(reader, /window\.docToText\(await file\.arrayBuffer\(\)\)/i, 'K030B2-30 legacy DOC extraction is automatic');
must(reader, /createWorker\('vie\+eng'/i, 'K030B2-31 OCR is Vietnamese + English');
must(reader, /if \(knowledgeReaderNeedsOcr\(text\)\) sparsePages\.push\(pageNumber\)/i,
  'K030B2-32 OCR is selective, not applied blindly to every PDF page');
must(reader, /DAMSAN_EXTRACT_V1/i, 'K030B2-33 extraction artifact is canonical');
must(reader, /uploadToSignedUrl\(prepared\.storage_path, prepared\.upload_token, artifactBlob/i,
  'K030B2-34 full extracted text goes directly to private Storage');
must(reader, /knowledgeUploadSelected = async function knowledgeUploadSelected030B2/i,
  'K030B2-35 upload action automatically continues into document reading');
must(reader, /pipeline_status \|\| 'EXTRACTED'/i, 'K030B2-36 UI reports extracted state');
console.log('K030B2-27..36 automatic reader pipeline: PASSED');

assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(baseJs), 'K030B2-37 base browser code has no service-role key');
assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(reader), 'K030B2-38 reader browser code has no service-role key');
assert(!/service_role/i.test(reader), 'K030B2-39 browser reader does not assume service-role access');
console.log('K030B2-37..39 browser credential isolation: PASSED');

console.log('PASS: KNOWLEDGE-030B2 automatic document reader structural simulation');
