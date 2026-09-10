const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ai_exam.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'ai_exam.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260910080000_ai_exam_review_ui_guard_031b2.sql'), 'utf8');

function assert(condition, message) { if (!condition) throw new Error(message); }
function must(source, regex, message) { assert(regex.test(source), message); }

console.log('=== AI-EXAM-031B2 REVIEW UI ===');

must(html, /Tạo đề bằng AI — Đam San V4/i, 'A031B2-01 workspace title exists');
must(html, /id="roomCode"/, 'A031B2-02 room input exists');
must(html, /id="profile"/, 'A031B2-03 assessment profile selector exists');
must(html, /id="knowledgeDocs"/, 'A031B2-04 knowledge source selector exists');
must(html, /DAMSAN_EXAM_V1/, 'A031B2-05 canonical schema is visible');
must(html, /PHÊ DUYỆT & ĐƯA LÊN PHÒNG/, 'A031B2-06 explicit final approval exists');
must(html, /TỪ CHỐI ĐỀ/, 'A031B2-07 explicit rejection exists');
must(html, /ai_exam\.js\?v=20260910-ai-exam-ui-031b2/, 'A031B2-08 cache-busted script is loaded');
console.log('A031B2-01..08 UI contract: PASSED');

must(js, /sessionStorage\.getItem\('damSan_StaffToken'\)/, 'A031B2-09 existing custom staff session is reused');
must(js, /damSan_WorkspaceSchool/, 'A031B2-10 Admin school workspace is respected');
must(js, /damSan_Workspace/, 'A031B2-11 Admin subject workspace is respected');
must(js, /rpc_knowledge_library_read/, 'A031B2-12 sources come from protected library RPC');
must(js, /active_revision/, 'A031B2-13 only active knowledge revisions are selectable');
must(js, /action: 'create_generation_request'/, 'A031B2-14 generation request uses bridge');
must(js, /action: 'get_generation_input'/, 'A031B2-15 Knowledge Pack is paged through capability');
must(js, /AIE_MAX_PACK_PAGES = 500/, 'A031B2-16 Knowledge Pack loop is bounded');
must(js, /AIE_MAX_PROMPT_CHARS = 7_500_000/, 'A031B2-17 web prompt size is bounded');
must(js, /Không bổ sung kiến thức vốn có của mô hình/, 'A031B2-18 prompt is source-only grounded');
must(js, /action: 'submit_exam_draft'/, 'A031B2-19 AI draft goes through server validator');
must(js, /rpc_ai_exam_request_read/, 'A031B2-20 validated draft can be resumed/read');
must(js, /rpc_ai_exam_approve_and_publish/, 'A031B2-21 approval uses canonical server publication boundary');
must(js, /rpc_ai_exam_reject/, 'A031B2-22 reject path is explicit');
must(js, /window\.confirm\('Phê duyệt đề này/, 'A031B2-23 publish requires explicit user confirmation');
must(js, /source_refs/, 'A031B2-24 source references are presented in review');
assert(!/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(js), 'A031B2-25 browser contains no service role credential');
assert(!/\.from\(['"](ai_exam_requests|ai_exam_drafts|de_thi|phong_thi)['"]\)/.test(js), 'A031B2-26 browser does not mutate protected exam tables directly');
console.log('A031B2-09..26 browser security and flow: PASSED');

must(sql, /create or replace function public\.rpc_ai_exam_store_draft_service/i, 'A031B2-27 draft persistence boundary is hardened');
must(sql, /r\.exam_spec/, 'A031B2-28 frozen teacher exam_spec is loaded during draft commit');
must(sql, /assessment_type_mismatch/, 'A031B2-29 profile mismatch is rejected');
must(sql, /scoring_config_mismatch/, 'A031B2-30 scoring mismatch is rejected');
must(sql, /v_actual_scoring is distinct from v_expected_scoring/, 'A031B2-31 scoring config comparison is exact');
must(sql, /grant execute on function public\.rpc_ai_exam_store_draft_service\(text,text,text,jsonb,jsonb,jsonb\) to service_role/i, 'A031B2-32 draft mutation remains service-only');
console.log('A031B2-27..32 authoritative scoring guard: PASSED');

console.log('PASS: AI-EXAM-031B2 review UI structural simulation');
