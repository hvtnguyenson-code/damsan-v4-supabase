const assert = require('assert');
const fs = require('fs');

const migration = fs.readFileSync('supabase/migrations/20260829000002_admin_control_plane.sql', 'utf8');
const mustMatch = (pattern, label) => assert(pattern.test(migration), label);

// S1-S2: a hashed-token-only session table is present.
mustMatch(/create table if not exists public\.admin_sessions\s*\([\s\S]*token_hash text primary key/i, 'S1 admin_sessions');
assert(!/admin_sessions\s*\([^)]*\btoken\s+(?!hash)/i.test(migration), 'S2 no raw token column');
// S3-S5: tokens are cryptographically random, hashed, and bounded to 24 hours.
mustMatch(/extensions\.gen_random_bytes\(32\)/i, 'S3 32-byte token');
mustMatch(/extensions\.digest\(v_raw_token, 'sha256'\)/i, 'S4 sha256 token hash');
mustMatch(/now\(\) \+ interval '24 hours'/i, 'S5 24-hour expiry');
// S6-S8: validator verifies admin role, revocation, and expiry.
mustMatch(/create or replace function public\._admin_session_admin_id[\s\S]*gv\.quyen = 'Admin'/i, 'S6 validator admin role');
mustMatch(/_admin_session_admin_id[\s\S]*s\.revoked_at is null/i, 'S7 validator revocation');
mustMatch(/_admin_session_admin_id[\s\S]*s\.expires_at > now\(\)/i, 'S8 validator expiry');
// S9-S12: login, default-password handling, logout, and password change contracts.
mustMatch(/rpc_login_giao_vien[\s\S]*admin_token[\s\S]*admin_expires_at/i, 'S9 admin login token contract');
mustMatch(/v_gv\.quyen = 'Admin' and v_gv\.mat_khau <> v_default_hash/i, 'S10 default-password admin receives no token');
mustMatch(/create or replace function public\.rpc_admin_logout/i, 'S11 admin logout');
mustMatch(/create or replace function public\.rpc_change_giao_vien_password\s*\(\s*p_gv_id uuid, p_truong_id uuid, p_current_password text, p_new_password text/i, 'S12 teacher password change');
// S13-S15: the global admin dispatcher has every action and does not scope targets to admin school.
mustMatch(/create or replace function public\.rpc_admin_control/i, 'S13 admin dispatcher');
const actions = ['accounts_upsert','accounts_delete','accounts_reset_password','teacher_update_school','teacher_update_subject','normalize_legacy_passwords','bank_insert','bank_update','bank_delete_ids','bank_delete_filter','bank_delete_all','exam_delete_only','school_create','school_delete','subject_create','subject_delete'];
for (const action of actions) assert(migration.includes(`when '${action}'`), `S14 missing action ${action}`);
const adminBody = migration.match(/create or replace function public\.rpc_admin_control[\s\S]*?\$function\$;/i)[0];
assert(!/truong_id\s*=\s*v_admin_id|v_admin_id\s*=\s*truong_id/i.test(adminBody), 'S15 admin targets must be global');
// S16-S18: teacher bank writes are scoped and exam-only deletion preserves rooms/results/submissions.
mustMatch(/create or replace function public\.rpc_giao_vien_bank_write/i, 'S16 teacher bank RPC');
mustMatch(/truong_id=p_truong_id and mon_id=v_mon_id/i, 'S17 teacher school + subject scope');
mustMatch(/create or replace function public\.rpc_xoa_de_trong_phong[\s\S]*delete from public\.de_thi/i, 'S18 exam-only delete RPC');
// S19-S20: orphan precheck precedes the student cascade FK.
mustMatch(/left join public\.hoc_sinh hs on hs\.id=es\.hs_id where hs\.id is null/i, 'S19 orphan precheck');
mustMatch(/exam_submissions_hs_id_fkey foreign key\(hs_id\) references public\.hoc_sinh\(id\) on delete cascade/i, 'S20 student cascade FK');
// S21-S24: browser direct writes are hardened.
mustMatch(/drop policy if exists room_update_minimal\s+on public\.phong_thi/i, 'S21 room update policy dropped');
mustMatch(/revoke update on public\.phong_thi from anon, authenticated/i, 'S22 room UPDATE revoked');
mustMatch(/revoke insert, update, delete on public\.truong_hoc from anon, authenticated/i, 'S23 school writes revoked');
mustMatch(/revoke insert, update, delete on public\.mon_hoc from anon, authenticated/i, 'S24 subject writes revoked');
// S25: this migration must not replace the P0 receive/grade path.
assert(!/create or replace function public\.(rpc_receive_submission|rpc_grade_submission|nop_bai_va_cham_diem)/i.test(migration), 'S25 P0 receive/grade functions untouched');

console.log('admin_control_plane_server_simulation: S1-S25 passed');
