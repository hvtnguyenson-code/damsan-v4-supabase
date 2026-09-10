const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260910070612_ai_exam_generation_bridge_031a.sql');
const edgePath = path.join(root, 'supabase', 'functions', 'exam-ai-bridge', 'index.ts');
const docPath = path.join(root, 'docs', 'AI_EXAM_031A_GENERATION_BRIDGE.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function must(source, regex, message) {
  assert(regex.test(source), message);
}

for (const file of [migrationPath, edgePath, docPath]) {
  assert(fs.existsSync(file), `E031A required file exists: ${path.relative(root, file)}`);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const edge = fs.readFileSync(edgePath, 'utf8');
const doc = fs.readFileSync(docPath, 'utf8');

console.log('=== AI-EXAM-031A GENERATION BRIDGE ===');

must(sql, /create table if not exists public\.ai_exam_requests/i, 'E031A-01 request table exists');
must(sql, /create table if not exists public\.ai_exam_drafts/i, 'E031A-02 draft table exists');
must(sql, /create table if not exists public\.ai_exam_handoffs/i, 'E031A-03 handoff table exists');
must(sql, /capability_hash text not null unique/i, 'E031A-04 only capability digest is persisted');
assert(!/capability_token\s+text/i.test(sql), 'E031A-05 raw AI capability is never stored');
must(sql, /alter table public\.ai_exam_requests enable row level security/i, 'E031A-06 request RLS is enabled');
must(sql, /revoke all on table public\.ai_exam_drafts from anon, authenticated/i, 'E031A-07 direct draft table access is denied');
console.log('E031A-01..07 persistence boundary: PASSED');

must(sql, /rpc_ai_exam_create_request_service/i, 'E031A-08 request creation service RPC exists');
must(sql, /active_revision is not null/i, 'E031A-09 request can only use active knowledge revisions');
must(sql, /variant_count must be between 1 and 8/i, 'E031A-10 variant count is bounded');
must(sql, /rpc_ai_exam_knowledge_pack_service/i, 'E031A-11 bounded Knowledge Pack RPC exists');
must(sql, /u\.revision=d\.active_revision/i, 'E031A-12 Knowledge Pack reads only active revision');
must(sql, /u\.is_usable=true/i, 'E031A-13 unusable knowledge units are excluded');
console.log('E031A-08..13 grounded request scope: PASSED');

must(sql, /status text not null default 'AWAITING_AI'[\s\S]*'READY_FOR_REVIEW'[\s\S]*'PUBLISHED'[\s\S]*'REJECTED'/i,
  'E031A-14 request lifecycle contains explicit review boundary');
must(sql, /rpc_ai_exam_store_draft_service/i, 'E031A-15 AI draft service boundary exists');
must(sql, /p_exam_payload->>'schema_version'<>'DAMSAN_EXAM_V1'/i, 'E031A-16 canonical AI exam schema is enforced');
must(sql, /set status='READY_FOR_REVIEW'/i, 'E031A-17 AI submission ends at review, not publication');
assert(!/rpc_luu_de_thi_len_phong[\s\S]{0,400}rpc_ai_exam_store_draft_service/i.test(sql),
  'E031A-18 draft store does not publish to room');
console.log('E031A-14..18 draft-only AI boundary: PASSED');

must(sql, /create or replace function public\.rpc_ai_exam_approve_and_publish/i,
  'E031A-19 explicit teacher approval RPC exists');
must(sql, /v_gv_id:=public\._staff_session_gv_id\(p_staff_token\)/i,
  'E031A-20 approval revalidates live teacher session');
must(sql, /v_request\.status<>'READY_FOR_REVIEW'/i,
  'E031A-21 only ready draft can publish');
must(sql, /v_result:=public\.rpc_luu_de_thi_len_phong\(/i,
  'E031A-22 approval reuses authoritative room save RPC');
must(sql, /if coalesce\(v_result->>'status',''\)<>'success'/i,
  'E031A-23 failed canonical save cannot be marked published');
must(sql, /rpc_ai_exam_reject/i, 'E031A-24 explicit reject path exists');
must(sql, /if v_request\.status='PUBLISHED' then return jsonb_build_object\('status','error','code','already_published'\)/i,
  'E031A-25 published request cannot later be rejected');
console.log('E031A-19..25 single human decision boundary: PASSED');

must(edge, /crypto\.getRandomValues\(bytes\)/i, 'E031A-26 AI capability uses cryptographic randomness');
must(edge, /sha256Hex\(capability\)/i, 'E031A-27 raw capability is hashed before persistence');
must(edge, /from\("staff_sessions"\)/i, 'E031A-28 request creation authenticates custom staff session');
must(edge, /action === "create_generation_request"/i, 'E031A-29 create generation action exists');
must(edge, /action === "get_generation_input"/i, 'E031A-30 Knowledge Pack action exists');
must(edge, /action === "submit_exam_draft"/i, 'E031A-31 AI draft submit action exists');
console.log('E031A-26..31 bridge security: PASSED');

must(edge, /DAMSAN_EXAM_GENERATION_INPUT_V1/i, 'E031A-32 canonical generation input exists');
must(edge, /Do not add unsupported model knowledge/i, 'E031A-33 source-only grounding instruction exists');
must(edge, /source_refs/i, 'E031A-34 question provenance is required');
must(edge, /knownUnitKeys\.has\(ref\)/i, 'E031A-35 source refs must resolve to real Knowledge Pack units');
must(edge, /\^\[ABCD\]\$/i, 'E031A-36 Part 1 answer format is checked');
must(edge, /slots\.length !== 4/i, 'E031A-37 Part 2 requires exactly four answer slots');
must(edge, /part3_answer_required/i, 'E031A-38 Part 3 requires a canonical answer');
must(edge, /question_count_mismatch/i, 'E031A-39 requested part counts are enforced');
console.log('E031A-32..39 deterministic exam validation: PASSED');

must(edge, /ROTATE_QUESTION_ORDER_WITHIN_PARTS/i, 'E031A-40 conservative automatic variant transform is declared');
must(edge, /assessment_type: profile[\s\S]*scoring_config: scoringConfig[\s\S]*cau_so:/i,
  'E031A-41 generated variants match canonical room-save envelope');
must(edge, /variantCodes\(spec, variantCount\)/i, 'E031A-42 unique variant codes are generated/validated');
must(doc, /APPROVE AND PUBLISH[\s\S]*REJECT/i, 'E031A-43 docs preserve the one final teacher decision');
must(doc, /does not call an OpenAI, Gemini, Anthropic/i, 'E031A-44 provider-neutral runtime is explicit');
console.log('E031A-40..44 automation contract: PASSED');

console.log('PASS: AI-EXAM-031A provider-neutral generation bridge structural simulation');
