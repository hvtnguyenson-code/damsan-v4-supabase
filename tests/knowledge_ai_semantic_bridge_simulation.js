const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260910065405_knowledge_ai_semantic_bridge_030c.sql');
const compatPath = path.join(root, 'supabase', 'migrations', '20260910124105_knowledge_ai_payload_shape_compat_034.sql');
const edgePath = path.join(root, 'supabase', 'functions', 'knowledge-ai-bridge', 'index.ts');
const docPath = path.join(root, 'docs', 'KNOWLEDGE_030C_AI_SEMANTIC_BRIDGE.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function must(source, regex, message) {
  assert(regex.test(source), message);
}

for (const file of [migrationPath, compatPath, edgePath, docPath]) {
  assert(fs.existsSync(file), `K030C required file exists: ${path.relative(root, file)}`);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const compat = fs.readFileSync(compatPath, 'utf8');
const edge = fs.readFileSync(edgePath, 'utf8');
const doc = fs.readFileSync(docPath, 'utf8');

console.log('=== KNOWLEDGE-030C AI SEMANTIC BRIDGE ===');

must(sql, /create table if not exists public\.knowledge_ai_handoffs/i,
  'K030C-01 capability handoff table exists');
must(sql, /capability_hash text not null unique/i,
  'K030C-02 only capability hash is persisted');
assert(!/capability_token\s+text/i.test(sql),
  'K030C-03 raw capability token is never stored in PostgreSQL');
must(sql, /expires_at > now\(\) \+ interval '2 hours'/i,
  'K030C-04 handoff TTL is capped at two hours');
must(sql, /status in \('PENDING','CLAIMED','COMPLETED','EXPIRED','REVOKED'\)/i,
  'K030C-05 handoff lifecycle is explicit');
must(sql, /alter table public\.knowledge_ai_handoffs enable row level security/i,
  'K030C-06 RLS is enabled');
must(sql, /revoke all on table public\.knowledge_ai_handoffs from anon, authenticated/i,
  'K030C-07 browser roles cannot query handoff table directly');
console.log('K030C-01..07 capability persistence: PASSED');

must(sql, /rpc_knowledge_issue_analysis_handoff_service/i,
  'K030C-08 issue service RPC exists');
must(sql, /current_stage <> 'ANALYZE'/i,
  'K030C-09 handoff can only target ANALYZE stage');
must(sql, /status = 'REVOKED'[\s\S]*status in \('PENDING','CLAIMED'\)/i,
  'K030C-10 reissue revokes older live capabilities');
must(sql, /rpc_knowledge_claim_analysis_handoff_service/i,
  'K030C-11 claim service RPC exists');
must(sql, /job_status = 'QUEUED'[\s\S]*status='RUNNING'[\s\S]*pipeline_status='ANALYZING'/i,
  'K030C-12 first AI read atomically advances analysis job');
must(sql, /extraction_manifest->>'artifact_path'/i,
  'K030C-13 only service boundary can resolve extraction artifact path');
console.log('K030C-08..13 analysis lease: PASSED');

must(sql, /p_payload->>'schema_version' <> 'DAMSAN_KNOWLEDGE_V1'/i,
  'K030C-14 canonical semantic schema is enforced');
must(sql, /v_low_confidence \* 5 <= v_unit_count/i,
  'K030C-15 low-confidence threshold is deterministic at 20 percent');
must(sql, /v_missing_provenance \* 10 <= v_unit_count/i,
  'K030C-16 missing-provenance threshold is deterministic at 10 percent');
must(sql, /v_extraction_quality='COMPLETE'/i,
  'K030C-17 AUTO_ACCEPTED requires complete extraction');
must(sql, /v_unresolved_count=0/i,
  'K030C-18 AUTO_ACCEPTED requires zero unresolved OCR pages');
must(sql, /rpc_knowledge_commit_analysis_service/i,
  'K030C-19 validated result uses canonical revision commit RPC');
assert(!/p_quality_status\s+text/i.test(sql),
  'K030C-20 AI caller cannot supply its own quality status');
console.log('K030C-14..20 deterministic quality gate: PASSED');

must(edge, /randomCapability\(\)/i,
  'K030C-21 capability is generated server-side');
must(edge, /crypto\.getRandomValues\(bytes\)/i,
  'K030C-22 capability uses cryptographic randomness');
must(edge, /sha256Hex\(capability\)/i,
  'K030C-23 only capability digest goes to persistence RPC');
must(edge, /from\("staff_sessions"\)/i,
  'K030C-24a create handoff validates against staff_sessions');
must(edge, /\.select\("gv_id,expires_at,revoked_at"\)/i,
  'K030C-24b staff validation reads expiry and revocation state');
must(edge, /\.eq\("token_hash", tokenHash\)/i,
  'K030C-24c opaque staff token is SHA-256 bound');
must(edge, /\.is\("revoked_at", null\)/i,
  'K030C-24d revoked staff sessions are rejected');
must(edge, /new Date\(session\.expires_at\)\.getTime\(\) <= Date\.now\(\)/i,
  'K030C-24e expired staff sessions are rejected');
must(edge, /action === "create_analysis_handoff"/i,
  'K030C-25 staff create action exists');
must(edge, /action === "get_analysis_input"/i,
  'K030C-26 AI read action exists');
must(edge, /action === "submit_analysis"/i,
  'K030C-27 AI submit action exists');
console.log('K030C-21..27 secure bridge actions: PASSED');

must(edge, /MAX_CHUNK_PAGES = 30/i,
  'K030C-28 physical-page chunks are bounded');
must(edge, /MAX_LOGICAL_CHARS = 120000/i,
  'K030C-29 logical-document chunks are bounded');
must(edge, /boundaryMode === "LOGICAL_DOCUMENT"/i,
  'K030C-30 DOC and DOCX use logical chunking');
must(edge, /pages\.slice\(startPage - 1, endPage\)/i,
  'K030C-31 PDF page chunking preserves physical page boundaries');
must(edge, /Do not add model knowledge unless the source explicitly contains it/i,
  'K030C-32 source-only grounding is explicit');
must(edge, /Do not invent physical page numbers/i,
  'K030C-33 logical Word provenance cannot fabricate page numbers');
console.log('K030C-28..33 scalable source delivery: PASSED');

must(edge, /SUPABASE_SERVICE_ROLE_KEY/i, 'K030C-34 service role exists only in Edge Function runtime');
assert(!/capability_token[\s\S]{0,120}insert\(/i.test(sql),
  'K030C-35 SQL never persists a raw capability token');
must(doc, /single mandatory teacher decision/i,
  'K030C-36 documentation preserves single final human-control gate');
must(doc, /does not hard-code OpenAI, Google, Anthropic/i,
  'K030C-37 bridge is provider-neutral');
console.log('K030C-34..37 architecture invariants: PASSED');

console.log('=== KNOWLEDGE-034 WEB-AI PAYLOAD SHAPE COMPATIBILITY ===');
must(compat, /create or replace function public\._knowledge_normalize_ai_units\(p_units jsonb\)/i,
  'K034-01 normalization helper exists');
must(compat, /when 'array' then jsonb_build_object\('path', v_unit->'hierarchy'\)/i,
  'K034-02 hierarchy array is normalized to canonical object path');
must(compat, /when 'string' then jsonb_build_object\('text', v_unit->>'content'\)/i,
  'K034-03 content string is normalized to canonical object text');
must(compat, /v_provenance->>'page_number'/i,
  'K034-04 physical page provenance is projected to page_start/page_end');
must(compat, /v_units := public\._knowledge_normalize_ai_units\(p_payload->'units'\)/i,
  'K034-05 bridge normalizes before deterministic validation and commit');
must(compat, /unit_content_invalid/i,
  'K034-06 invalid content shape returns deterministic client-safe code');
must(compat, /unit_hierarchy_invalid/i,
  'K034-07 invalid hierarchy shape returns deterministic client-safe code');
must(compat, /rpc_knowledge_commit_analysis_service/i,
  'K034-08 normalized payload still uses canonical atomic commit RPC');
must(compat, /validator_version','034'/i,
  'K034-09 validation report records compatibility validator version');
console.log('K034-01..09 Web-AI payload shape compatibility: PASSED');

console.log('PASS: KNOWLEDGE-030C AI semantic bridge structural simulation');
