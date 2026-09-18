const fs = require('fs');
const assert = require('assert');

const migration = fs.readFileSync('supabase/migrations/20260918133500_ai_exam_capability_reissue_pgcrypto_063.sql', 'utf8');
const ui = fs.readFileSync('ai_exam_validation_architecture_053.js', 'utf8');

assert(migration.includes('create or replace function public.rpc_ai_exam_reissue_handoff('), '063 must replace the same-request reissue RPC');
assert(migration.includes('security definer'), '063 reissue RPC must remain SECURITY DEFINER');
assert(migration.includes('set search_path = public'), '063 must keep the restricted public search_path');

assert(migration.includes("extensions.gen_random_bytes(32)"), '063 must schema-qualify pgcrypto gen_random_bytes');
assert(migration.includes("extensions.digest(v_token,'sha256')"), '063 must schema-qualify pgcrypto digest');
assert(!/encode\(\s*gen_random_bytes\(/.test(migration), '063 must not reintroduce unqualified gen_random_bytes');
assert(!/encode\(\s*digest\(/.test(migration), '063 must not reintroduce unqualified digest');

assert(migration.includes("v_request.status not in ('AWAITING_AI','AI_WORKING')"), '063 must preserve request-state boundary');
assert(migration.includes('v_request.requested_by is distinct from v_gv_id'), '063 must preserve request-owner boundary');
assert(migration.includes('v_db_ma_gv is distinct from btrim(p_ma_gv)'), '063 must preserve staff identity binding');
assert(migration.includes("now()+interval '90 minutes'"), '063 must preserve 90-minute renewed capability TTL');
assert(migration.includes('public.rpc_ai_exam_issue_handoff_service('), '063 must continue using the canonical handoff issuance service');
assert(migration.includes('grant execute on function public.rpc_ai_exam_reissue_handoff(text,text,uuid) to anon, authenticated;'), '063 must preserve browser RPC execute grants');

assert(ui.includes("rpc_ai_exam_reissue_handoff"), 'UI must continue renewing the same request rather than creating a duplicate request');
assert(ui.includes("['capability_expired','capability_not_claimed','capability_unavailable']"), 'UI must continue retrying after capability expiry/unavailability');
assert(ui.includes('await renewCapability053(aieCurrentRequestId)'), 'UI must renew the currently selected request');

console.log('PASS ai_exam_capability_reissue_063_simulation');

// Keep the focused 064 regression in the existing AI-exam safety path.
require('./ai_exam_rounding_warning_064_simulation.js');
