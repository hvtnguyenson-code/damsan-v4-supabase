const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const bridgeMigration = read('supabase/migrations/20260910070612_ai_exam_generation_bridge_031a.sql');
const normalizedEdge = read('supabase/functions/knowledge-normalized-source/index.ts');
const normalizedUi = read('knowledge_normalized_source.js');
const authorityUi = read('ai_exam_grade_authority.js');
const authorityMigrations = [
  'supabase/migrations/20260911164000_normalized_knowledge_authority_038_039.sql',
  'supabase/migrations/20260911165000_assessment_authority_pack_039a.sql',
  'supabase/migrations/20260911165500_assessment_authority_unique_profile_link_039b.sql',
  'supabase/migrations/20260911170000_explicit_authority_binding_039c.sql',
].map(read).join('\n');
const aiExamUi = read('ai_exam.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoRoomWrite(source, label) {
  const directDml = /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:phong_thi|de_thi)\b/i;
  assert(!directDml.test(source), `${label}: AI plane must not directly mutate phong_thi/de_thi`);
  assert(!/rpc_luu_de_thi_len_phong\s*\(/i.test(source), `${label}: AI plane must not call canonical room-save RPC directly`);
}

console.log('=== AI ROOM BOUNDARY INVARIANT ===');

// 038/039 are isolated preparation/authority planes. They are not allowed to write room state.
assertNoRoomWrite(normalizedEdge, 'normalized edge');
assertNoRoomWrite(normalizedUi, 'normalized UI');
assertNoRoomWrite(authorityUi, 'authority UI');
assertNoRoomWrite(authorityMigrations, '038/039 authority migrations');
console.log('ROOM-BOUNDARY-01..04 isolated AI preparation plane: PASSED');

// AI may only reach the room after a validated draft and an explicit teacher approval.
assert(/set status='READY_FOR_REVIEW'/i.test(bridgeMigration), 'ROOM-BOUNDARY-05 AI draft must stop at READY_FOR_REVIEW');
assert(/create or replace function public\.rpc_ai_exam_approve_and_publish/i.test(bridgeMigration), 'ROOM-BOUNDARY-06 explicit approval bridge missing');
assert(/v_request\.status<>'READY_FOR_REVIEW'/i.test(bridgeMigration), 'ROOM-BOUNDARY-07 publish bridge must require READY_FOR_REVIEW');
assert(/v_gv_id:=public\._staff_session_gv_id\(p_staff_token\)/i.test(bridgeMigration), 'ROOM-BOUNDARY-08 publish bridge must revalidate live teacher session');
assert(/v_result:=public\.rpc_luu_de_thi_len_phong\(/i.test(bridgeMigration), 'ROOM-BOUNDARY-09 final publish must reuse canonical room-save RPC');
assert(/if coalesce\(v_result->>'status',''\)<>'success'/i.test(bridgeMigration), 'ROOM-BOUNDARY-10 failed canonical save must not become PUBLISHED');
assert(/Phê duyệt đề này và đưa chính thức lên phòng thi/i.test(aiExamUi), 'ROOM-BOUNDARY-11 final room write must require explicit teacher confirmation');
console.log('ROOM-BOUNDARY-05..11 single controlled publication bridge: PASSED');

// 038/039 must not redefine the canonical room-save function or room lifecycle functions.
assert(!/create or replace function public\.rpc_luu_de_thi_len_phong/i.test(authorityMigrations), 'ROOM-BOUNDARY-12 038/039 must not replace canonical room-save RPC');
assert(!/create or replace function public\.rpc_(?:dieu_khien|xoa|mo_|thu_|cong_bo|xem_)/i.test(authorityMigrations), 'ROOM-BOUNDARY-13 038/039 must not replace room lifecycle RPCs');
console.log('ROOM-BOUNDARY-12..13 existing room/trộn đề authority remains untouched: PASSED');

console.log('PASS: AI features are fail-closed and isolated from canonical room operations');
