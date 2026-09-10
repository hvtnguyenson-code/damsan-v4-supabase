const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260910043000_ai_knowledge_ingestion_foundation.sql'
);
const architecturePath = path.join(__dirname, '..', 'docs', 'KNOWLEDGE_AI_PIPELINE.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mustMatch(source, regex, message) {
  assert(regex.test(source), message);
}

assert(fs.existsSync(migrationPath), 'K030A-01 migration file exists');
assert(fs.existsSync(architecturePath), 'K030A-02 architecture document exists');

const sql = fs.readFileSync(migrationPath, 'utf8');
const doc = fs.readFileSync(architecturePath, 'utf8');

console.log('=== KNOWLEDGE-030A AI-NATIVE INGESTION FOUNDATION ===');

for (const table of ['knowledge_documents', 'knowledge_units', 'knowledge_ingestion_jobs']) {
  mustMatch(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'), `K030A table ${table} exists`);
  mustMatch(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `K030A ${table} enables RLS`);
  mustMatch(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'), `K030A ${table} revokes browser table access`);
}
console.log('K030A-03 protected knowledge tables: PASSED');

mustMatch(sql, /insert into storage\.buckets[\s\S]*?'knowledge-source'[\s\S]*?false[\s\S]*?52428800/i,
  'K030A-04 private knowledge-source bucket with 50 MiB limit');
mustMatch(sql, /application\/pdf/i, 'K030A-05 PDF accepted');
mustMatch(sql, /application\/msword/i, 'K030A-06 DOC accepted');
mustMatch(sql, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i,
  'K030A-07 DOCX accepted');
assert(!/public\s*=\s*true/i.test(sql), 'K030A-08 knowledge bucket is never made public');
console.log('K030A-04..08 private raw-source storage contract: PASSED');

mustMatch(sql, /analysis_revision integer not null default 0/i, 'K030A-09 revision counter exists');
mustMatch(sql, /active_revision integer null/i, 'K030A-10 active revision exists');
mustMatch(sql, /active_revision is null or active_revision <= analysis_revision/i,
  'K030A-11 active revision cannot exceed latest analysis revision');
mustMatch(sql, /AUTO_ACCEPTED[\s\S]*NEEDS_REVIEW/i, 'K030A-12 automated quality states exist');
console.log('K030A-09..12 revision and quality model: PASSED');

mustMatch(sql, /create or replace function public\.rpc_knowledge_register_upload_service/i,
  'K030A-13 service upload registration RPC exists');
mustMatch(sql, /p_context_hint jsonb default '\{\}'::jsonb/i,
  'K030A-14 upload registration accepts optional context hints');
assert(!/rpc_knowledge_register_upload_service[\s\S]*p_grade\s+smallint/i.test(sql),
  'K030A-15 teacher is not required to normalize grade during raw upload');
assert(!/rpc_knowledge_register_upload_service[\s\S]*p_document_type\s+text/i.test(sql),
  'K030A-16 teacher is not required to classify document type during raw upload');
console.log('K030A-13..16 raw-document-first registration: PASSED');

mustMatch(sql, /create or replace function public\.rpc_knowledge_claim_job_service[\s\S]*for update of j skip locked/i,
  'K030A-17 worker claim uses FOR UPDATE SKIP LOCKED');
mustMatch(sql, /current_stage text not null default 'EXTRACT'[\s\S]*'OCR'[\s\S]*'ANALYZE'[\s\S]*'VALIDATE'[\s\S]*'COMMIT'/i,
  'K030A-18 pipeline stages cover extraction, OCR, AI analysis, validation, commit');
console.log('K030A-17..18 automation queue semantics: PASSED');

mustMatch(sql, /create or replace function public\.rpc_knowledge_commit_analysis_service/i,
  'K030A-19 atomic analysis commit RPC exists');
mustMatch(sql, /jsonb_array_length\(p_units\) = 0/i, 'K030A-20 empty AI unit output rejected');
mustMatch(sql, /unique\(document_id, revision, unit_key\)/i, 'K030A-21 unit identity is revision-scoped');
mustMatch(sql, /active_revision = case when p_quality_status = 'AUTO_ACCEPTED' then v_revision else active_revision end/i,
  'K030A-22 low-quality reanalysis cannot replace a previous active revision');
mustMatch(sql, /knowledge unit confidence must be between 0 and 1/i,
  'K030A-23 unit confidence is validated');
console.log('K030A-19..23 AI commit validation and revision safety: PASSED');

for (const signature of [
  'rpc_knowledge_register_upload_service\\(uuid, text, text, text, bigint, text, jsonb\\)',
  'rpc_knowledge_claim_job_service\\(text\\)',
  'rpc_knowledge_set_stage_service\\(uuid, text, jsonb\\)',
  'rpc_knowledge_commit_analysis_service\\(uuid, text, text, text, jsonb, jsonb, text\\)',
  'rpc_knowledge_fail_job_service\\(uuid, text, text, jsonb\\)'
]) {
  mustMatch(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`, 'i'),
    `K030A service RPC ${signature} revoked from browser roles`);
  mustMatch(sql, new RegExp(`grant execute on function public\\.${signature} to service_role`, 'i'),
    `K030A service RPC ${signature} granted only to service_role`);
}
console.log('K030A-24 service-only mutation boundary: PASSED');

mustMatch(sql, /create or replace function public\.rpc_knowledge_library_read\([\s\S]*public\._staff_session_gv_id\(p_staff_token\)/i,
  'K030A-25 staff library read validates custom staff session');
mustMatch(sql, /v_actor\.ma_gv <> trim\(p_ma_gv\)/i,
  'K030A-26 staff library read binds teacher identity');
mustMatch(sql, /where v_actor\.quyen = 'Admin' or d\.owner_gv_id = v_gv_id/i,
  'K030A-27 normal teacher is limited to own knowledge documents');
console.log('K030A-25..27 staff read boundary: PASSED');

assert(!/embedding/i.test(sql), 'K030A-28 foundation does not add embeddings/vector payloads');
assert(!/vector\s*\(/i.test(sql), 'K030A-29 foundation does not add vector schema');
assert(!/search_text/i.test(sql), 'K030A-30 foundation avoids duplicate large plain-text storage');
console.log('K030A-28..30 storage-efficiency invariants: PASSED');

mustMatch(doc, /teacher must be able to provide ordinary source documents/i,
  'K030A-31 architecture forbids teacher-side normalization requirement');
mustMatch(doc, /ONE mandatory teacher decision: APPROVE AND PUBLISH \/ REJECT/i,
  'K030A-32 architecture defines one mandatory human decision gate');
mustMatch(doc, /No generated exam may be published merely because an AI model or validator returned success/i,
  'K030A-33 AI cannot bypass teacher publication authority');
mustMatch(doc, /does not assume a paid model API/i,
  'K030A-34 provider-neutral/no-paid-API assumption is preserved');
console.log('K030A-31..34 product architecture invariants: PASSED');

console.log('PASS: KNOWLEDGE-030A AI-native ingestion foundation structural simulation');
