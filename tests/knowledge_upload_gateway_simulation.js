const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const edgePath = path.join(root, 'supabase', 'functions', 'knowledge-upload', 'index.ts');
const htmlPath = path.join(root, 'knowledge.html');
const jsPath = path.join(root, 'knowledge.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function mustMatch(source, regex, message) {
  assert(regex.test(source), message);
}

assert(fs.existsSync(edgePath), 'K030B1-01 knowledge-upload Edge Function exists');
assert(fs.existsSync(htmlPath), 'K030B1-02 knowledge upload page exists');
assert(fs.existsSync(jsPath), 'K030B1-03 knowledge upload client exists');

const edge = fs.readFileSync(edgePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

console.log('=== KNOWLEDGE-030B1 SECURE RAW UPLOAD ===');

mustMatch(edge, /SUPABASE_SERVICE_ROLE_KEY/, 'K030B1-04 Edge Function reads service-role key only from environment');
assert(!/eyJ[A-Za-z0-9_-]{20,}/.test(edge), 'K030B1-05 Edge Function contains no hard-coded JWT/service key');
mustMatch(edge, /from\("staff_sessions"\)[\s\S]*?eq\("token_hash", tokenHash\)[\s\S]*?is\("revoked_at", null\)/,
  'K030B1-06 upload gateway validates opaque staff session');
mustMatch(edge, /expires_at[\s\S]*Date\.now\(\)/, 'K030B1-07 staff-session expiry is enforced');
mustMatch(edge, /teacher\.ma_gv !== maGv/, 'K030B1-08 teacher identity is bound to custom session');
mustMatch(edge, /DEFAULT_PASSWORD_HASH/, 'K030B1-09 default-password sessions are rejected');
console.log('K030B1-04..09 custom-auth gateway: PASSED');

mustMatch(edge, /MAX_FILE_SIZE = 50 \* 1024 \* 1024/, 'K030B1-10 50 MiB file gate');
mustMatch(edge, /application\/pdf/, 'K030B1-11 PDF accepted');
mustMatch(edge, /application\/msword/, 'K030B1-12 DOC accepted');
mustMatch(edge, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/, 'K030B1-13 DOCX accepted');
mustMatch(edge, /createSignedUploadUrl\(storagePath\)/, 'K030B1-14 raw file uses short-lived signed upload capability');
mustMatch(edge, /storagePrefix\(actor\)/, 'K030B1-15 storage path is scoped by school and teacher');
console.log('K030B1-10..15 private Storage upload contract: PASSED');

mustMatch(edge, /action === "prepare"/, 'K030B1-16 prepare phase exists');
mustMatch(edge, /action === "complete"/, 'K030B1-17 completion phase exists');
mustMatch(edge, /findUploadedObject\(storagePath\)/, 'K030B1-18 completion verifies object existence');
mustMatch(edge, /upload_size_mismatch/, 'K030B1-19 completion rejects size mismatch');
mustMatch(edge, /rpc_knowledge_register_upload_service/, 'K030B1-20 completion registers the queue through service RPC');
mustMatch(edge, /idempotent: true/, 'K030B1-21 completion is idempotent for already-registered path');
mustMatch(edge, /remove\(\[storagePath\]\)/, 'K030B1-22 failed registration cleans orphaned raw object');
console.log('K030B1-16..22 two-phase upload integrity: PASSED');

mustMatch(html, /type="file" multiple[\s\S]*accept="\.pdf,\.doc,\.docx/, 'K030B1-23 UI accepts ordinary raw source documents');
mustMatch(html, /Gợi ý cho AI — tùy chọn/, 'K030B1-24 context hint is explicitly optional');
assert(!/name="(?:grade|document_type|lesson_code|page_start|page_end)"/i.test(html),
  'K030B1-25 raw-upload form still does not ask the teacher to normalize document structure');
mustMatch(html, /File gốc luôn được giữ làm nguồn đối chiếu/, 'K030B1-26 raw-document-first provenance promise is visible');
console.log('K030B1-23..26 raw-source UI boundary: PASSED');

mustMatch(js, /sessionStorage\.getItem\('damSan_StaffToken'\)/, 'K030B1-27 client reuses existing staff token');
mustMatch(js, /uploadToSignedUrl\(prepared\.storage_path, prepared\.upload_token, file/, 'K030B1-28 browser uploads directly to signed Storage URL');
mustMatch(js, /rpc_knowledge_library_read/, 'K030B1-29 library refresh uses protected staff RPC');
assert(!/from\(['"]knowledge_(?:documents|units|ingestion_jobs)['"]\)\s*\.\s*(?:insert|update|delete|upsert)/.test(js),
  'K030B1-30 browser does not directly mutate protected knowledge tables');
assert(!/SERVICE_ROLE/i.test(js), 'K030B1-31 frontend never references service-role credentials');
console.log('K030B1-27..31 browser security boundary: PASSED');

mustMatch(js, /setTimeout\(\(\) => knowledgeLoadLibrary\(\), 5000\)/, 'K030B1-32 active jobs are polled automatically');
mustMatch(js, /knowledgeSelectedFiles\.length/, 'K030B1-33 multi-file ingestion is supported');
console.log('K030B1-32..33 automation UX: PASSED');

console.log('PASS: KNOWLEDGE-030B1 secure raw upload structural simulation');
