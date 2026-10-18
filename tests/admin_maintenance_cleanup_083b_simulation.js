const fs = require('fs');
const assert = require('assert');

const migration = fs.readFileSync('supabase/migrations/20261018173000_admin_maintenance_cleanup_083b.sql','utf8');
const js = fs.readFileSync('admin_system_maintenance_083b.js','utf8');
const html = fs.readFileSync('giaovien.html','utf8');

console.log('=== ADMIN MAINTENANCE CLEANUP 083B ===');

assert(/create or replace function public\.rpc_admin_maintenance_083b/i.test(migration), '083B RPC missing');
assert(/public\._admin_session_admin_id\(p_admin_token\)/i.test(migration), '083B admin authentication missing');
assert(/p_action = 'preview'/i.test(migration) && /p_action = 'cleanup'/i.test(migration), '083B preview/cleanup actions missing');
assert(/interval '7 days'/i.test(migration), '083B session grace period must be 7 days');
assert(/interval '24 hours'/i.test(migration), '083B AI grace period must be 24 hours');
assert(/not exists[\s\S]*public\.phong_thi/i.test(migration), '083B AI cleanup must exclude real rooms');
assert(/upper\(btrim\(p\.ma_phong\)\)\s*=\s*upper\(btrim\(r\.ma_phong\)\)/i.test(migration), '083B room matching must be normalized');
assert(/r\.published_at is null/i.test(migration), '083B must preserve published AI requests');
assert(/r\.status in \('AI_WORKING','READY_FOR_REVIEW','REJECTED'\)/i.test(migration), '083B AI status allowlist missing');

const deleteTargets = [...migration.matchAll(/delete\s+from\s+public\.([a-z0-9_]+)/ig)].map(m => m[1]);
assert.deepStrictEqual(
  [...new Set(deleteTargets)].sort(),
  ['admin_sessions','ai_exam_requests','staff_sessions','student_sessions'].sort(),
  '083B DELETE target allowlist changed'
);
for (const protectedTable of ['exam_submissions','ket_qua','de_thi','phong_thi','hoc_sinh','giao_vien']) {
  assert(!new RegExp('delete\\s+from\\s+public\\.' + protectedTable, 'i').test(migration), '083B must not delete from ' + protectedTable);
}
assert(!/\b(update|insert|truncate)\b/i.test(migration), '083B must not UPDATE/INSERT/TRUNCATE');

assert(html.includes('id="sys083bCleanupBtn"'), '083B cleanup button missing');
assert(html.includes('id="sys083bPreviewBtn"'), '083B preview button missing');
assert(html.includes('admin_system_maintenance_083b.js?v=20261018-admin-maintenance-083b'), '083B script cache marker missing');
assert(html.includes('Không đụng bài nộp, điểm, đề thi, phòng thi, học sinh hoặc giáo viên.'), '083B safety copy missing');

assert(js.includes("callMaintenance083B('preview')"), '083B preview RPC flow missing');
assert(js.includes("callMaintenance083B('cleanup')"), '083B cleanup RPC flow missing');
assert(js.includes('if (!window.confirm(buildConfirmation(preview))) return;'), '083B explicit confirmation missing');
assert(js.indexOf("callMaintenance083B('preview')", js.indexOf('async function cleanupMaintenance083B')) <
       js.indexOf('window.confirm', js.indexOf('async function cleanupMaintenance083B')),
       '083B must refresh preview before confirm');
assert(js.indexOf('window.confirm', js.indexOf('async function cleanupMaintenance083B')) <
       js.indexOf("callMaintenance083B('cleanup')", js.indexOf('async function cleanupMaintenance083B')),
       '083B cleanup must occur only after confirm');

console.log('PASS admin_maintenance_cleanup_083b_simulation');
