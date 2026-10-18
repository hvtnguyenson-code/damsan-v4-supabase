const fs = require('fs');
const assert = require('assert');

const migration = fs.readFileSync('supabase/migrations/20261018170000_admin_system_status_083a.sql','utf8');
const js = fs.readFileSync('admin_system_status_083a.js','utf8');
const html = fs.readFileSync('giaovien.html','utf8');

console.log('=== ADMIN SYSTEM STATUS 083A ===');

assert(/create or replace function public\.rpc_admin_system_status_083a\(p_admin_token text\)/i.test(migration), '083A RPC missing');
assert(/public\._admin_session_admin_id\(p_admin_token\)/i.test(migration), '083A must authenticate admin session');
assert(/security definer/i.test(migration), '083A RPC must be security definer');
assert(/student_sessions/i.test(migration) && /staff_sessions/i.test(migration) && /admin_sessions/i.test(migration), '083A session metrics missing');
assert(/exam_submissions/i.test(migration), '083A submission metrics missing');
assert(/ai_exam_requests/i.test(migration) && /not exists[\s\S]*public\.phong_thi/i.test(migration), '083A AI-unlinked guard missing');
assert(!/\b(delete|update|insert|truncate)\b/i.test(migration.replace(/create or replace/gi,'')), '083A must be read-only');

assert(html.includes('id="btnSubStatus"'), '083A sidebar entry missing');
assert(html.includes('id="subTabStatus"'), '083A status panel missing');
assert(html.includes('Chỉ đọc. Không thay đổi dữ liệu vận hành.'), '083A read-only label missing');
assert(html.includes('admin_system_status_083a.js?v=20261018-admin-system-status-083a'), '083A script cache-bust missing');

assert(js.includes("sb.rpc('rpc_admin_system_status_083a'"), '083A frontend RPC call missing');
assert(js.includes("ensureControlSession('admin')"), '083A frontend admin session guard missing');
assert(js.includes("window.loadSystemStatus083A = loadSystemStatus083A"), '083A UI loader export missing');
assert(!/\.from\([^)]*\)\.(delete|update|insert|upsert)/i.test(js), '083A frontend must not mutate DB');
assert(!/adminRpc\([^)]*(delete|reset|cleanup)/i.test(js), '083A frontend must not invoke destructive admin actions');

console.log('PASS admin_system_status_083a_simulation');
