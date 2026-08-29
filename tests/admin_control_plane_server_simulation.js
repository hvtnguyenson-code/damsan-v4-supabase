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
mustMatch(/v_gv\.quyen = 'Admin' and v_gv\.mat_khau not in \(v_default_hash, '123456'\)/i, 'S10 default-password admin receives no token');
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
// S26-S29: table-level reads may expose identity fields only, never passwords.
mustMatch(/revoke select on table public\.giao_vien from anon, authenticated/i, 'S26 giao_vien SELECT revoked');
mustMatch(/grant select \(id, truong_id, ma_gv, ho_ten, quyen, created_at, mon_id\) on table public\.giao_vien to anon, authenticated/i, 'S27 giao_vien safe columns');
mustMatch(/revoke select on table public\.hoc_sinh from anon, authenticated/i, 'S28 hoc_sinh SELECT revoked');
mustMatch(/grant select \(id, truong_id, ma_hs, ho_ten, lop, quyen, created_at\) on table public\.hoc_sinh to anon, authenticated/i, 'S29 hoc_sinh safe columns');
const loginBody = migration.match(/create or replace function public\.rpc_login_giao_vien[\s\S]*?\$function\$;/i)[0];
assert(!/'mat_khau'\s*,\s*v_gv\.mat_khau/i.test(loginBody), 'S30 login does not return password hash');
mustMatch(/v_gv\.mat_khau in \(v_default_hash, '123456'\)/i, 'S31-S32 default hash and legacy plaintext detected');
mustMatch(/gv\.mat_khau = '123456' and p_mat_khau = v_default_hash/i, 'S33 only default legacy login compatibility');
// S34-S36: staff sessions are opaque, short-lived, and revocable.
mustMatch(/create table if not exists public\.staff_sessions[\s\S]*token_hash text primary key/i, 'S34 staff_sessions');
mustMatch(/staff_sessions[\s\S]*extensions\.gen_random_bytes\(32\)[\s\S]*extensions\.digest\(v_staff_token, 'sha256'\)[\s\S]*interval '24 hours'/i, 'S35 staff token hash and expiry');
mustMatch(/create or replace function public\._staff_session_gv_id[\s\S]*s\.revoked_at is null[\s\S]*s\.expires_at > now\(\)/i, 'S36 staff validator revocation and expiry');
// S37-S42: every teacher-side mutation accepts a session token and old browser entry points are revoked.
mustMatch(/rpc_giao_vien_bank_write\(p_staff_token text, p_ma_gv text, p_truong_id uuid/i, 'S37 teacher bank requires staff token');
mustMatch(/to_regprocedure\('public\.rpc_giao_vien_bank_write\(text,uuid,text,jsonb\)'\)[\s\S]*?execute 'revoke all on function public\.rpc_giao_vien_bank_write\(text, uuid, text, jsonb\) from public, anon, authenticated'/i, 'S38 old teacher bank revoke is guarded');
mustMatch(/rpc_xoa_de_trong_phong\(p_staff_token text, p_ma_gv text, p_truong_id uuid/i, 'S39 exam deletion requires staff token');
mustMatch(/to_regprocedure\('public\.rpc_xoa_de_trong_phong\(text,uuid,uuid\)'\)[\s\S]*?execute 'revoke all on function public\.rpc_xoa_de_trong_phong\(text, uuid, uuid\) from public, anon, authenticated'/i, 'S40 old exam deletion revoke is guarded');
for (const name of ['rpc_luu_de_thi_len_phong', 'rpc_dieu_khien_phong_thi', 'rpc_xoa_phong_thi', 'rpc_reset_room_results', 'rpc_grade_pending_room']) {
  mustMatch(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?p_staff_token text`, 'i'), `S41 ${name} secure signature`);
}
for (const signature of [
  'rpc_dieu_khien_phong_thi\\(text, uuid, uuid, text, text, text, int, boolean\\)',
  'rpc_xoa_phong_thi\\(text, uuid, uuid\\)',
  'rpc_reset_room_results\\(text, uuid, uuid\\)',
  'rpc_grade_pending_room\\(text, uuid, uuid\\)'
]) mustMatch(new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`, 'i'), `S42 old ${signature} revoked`);
// S43-S47: arrays and destructive bank filtering cannot broaden unexpectedly.
assert((migration.match(/jsonb_array_elements_text\(p_payload->'ids'\)/g) || []).length >= 4, 'S43 UUID arrays use text extraction');
assert(!/value::text::uuid/i.test(migration), 'S44 quoted JSON UUID cast removed');
mustMatch(/'code', 'admin_session_invalid'/i, 'S45 admin invalid-session code');
mustMatch(/bank_delete_filter requires truong_id/i, 'S46 bank delete filter requires school');
mustMatch(/nullif\(p_payload->>'mon_id', ''\) is not null[\s\S]*nullif\(btrim\(p_payload->>'bai_hoc'\), ''\) is not null/i, 'S47 empty optional bank filters rejected');
assert(!/create or replace function public\.(rpc_receive_submission|rpc_grade_submission|rpc_submission_receipt_status)/i.test(migration), 'S48 P0 receive/grade/recovery untouched');

// S49-S50: optional legacy signatures must not break a fresh production migration.
const legacyBankRevoke = /to_regprocedure\('public\.rpc_giao_vien_bank_write\(text,uuid,text,jsonb\)'\)[\s\S]*?execute 'revoke all on function public\.rpc_giao_vien_bank_write\(text, uuid, text, jsonb\) from public, anon, authenticated'/i;
const legacyExamRevoke = /to_regprocedure\('public\.rpc_xoa_de_trong_phong\(text,uuid,uuid\)'\)[\s\S]*?execute 'revoke all on function public\.rpc_xoa_de_trong_phong\(text, uuid, uuid\) from public, anon, authenticated'/i;
mustMatch(legacyBankRevoke, 'S49 legacy bank signature guarded by existence check');
mustMatch(legacyExamRevoke, 'S50 legacy exam-delete signature guarded by existence check');
assert(!/^\s*revoke all on function public\.rpc_giao_vien_bank_write\(text, uuid, text, jsonb\)/im.test(migration), 'S50 fresh apply has no direct legacy bank revoke');
assert(!/^\s*revoke all on function public\.rpc_xoa_de_trong_phong\(text, uuid, uuid\)/im.test(migration), 'S50 fresh apply has no direct legacy exam-delete revoke');

const functionBody = (name) => {
  const found = migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, 'i'));
  assert(found, `missing secure function ${name}`);
  return found[0];
};
const saveExamBody = functionBody('rpc_luu_de_thi_len_phong');

// S51-S54: role is loaded from the staff-session account, with distinct admin and teacher subject paths.
assert(/select ma_gv, truong_id, mon_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen[\s\S]*?where id=v_gv_id[\s\S]*?v_teacher_ma_gv is distinct from trim\(p_ma_gv\)/i.test(saveExamBody), 'S51 exam push loads Admin role from token identity');
assert(/if v_quyen = 'Admin' then[\s\S]*?p_mon_id is null[\s\S]*?v_effective_mon_id := p_mon_id;/i.test(saveExamBody), 'S52-S53 Admin accepts null account mon_id and uses requested subject');
assert(/else[\s\S]*?v_teacher_mon_id is null[\s\S]*?p_mon_id is not null and p_mon_id <> v_teacher_mon_id[\s\S]*?v_effective_mon_id := v_teacher_mon_id;/i.test(saveExamBody), 'S54 non-Admin remains bound to assigned subject');

// S55-S58: secure exam push restores room creation and validates a meaningful payload.
assert(/if v_phong_id is null then[\s\S]*?insert into public\.phong_thi\(ma_phong, truong_id, mon_id, ten_dot, doi_tuong, thoi_gian, trang_thai\)[\s\S]*?returning id into v_phong_id/i.test(saveExamBody), 'S55 exam push creates a missing room');
assert(/if nullif\(trim\(p_ma_phong\), ''\) is null then/i.test(saveExamBody), 'S56 exam push rejects empty room code');
assert(/if jsonb_typeof\(p_de_thi\) <> 'array' then[\s\S]*?if jsonb_array_length\(p_de_thi\) = 0 then/i.test(saveExamBody), 'S57 exam push rejects non-array and empty exam payloads');
assert(/jsonb_build_object\('status','success','phong_id',v_phong_id,'count',v_count\)/i.test(saveExamBody), 'S58 exam push returns phong_id');

// S59-S61: all room mutations use a staff token and preserve global Admin school authority.
const roomMutations = ['rpc_dieu_khien_phong_thi', 'rpc_xoa_phong_thi', 'rpc_reset_room_results', 'rpc_grade_pending_room', 'rpc_xoa_de_trong_phong'];
for (const name of roomMutations) {
  const body = functionBody(name);
  assert(/v_gv_id := public\._staff_session_gv_id\(p_staff_token\)/i.test(body), `S61 ${name} staff-token authenticated`);
  assert(/where id=v_gv_id[\s\S]*?v_teacher_ma_gv is distinct from trim\(p_ma_gv\)/i.test(body), `S61 ${name} verifies supplied identity`);
  assert(/v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id/i.test(body), `S59-S60 ${name} gives Admin global school authority but scopes teachers`);
}
assert(/if v_quyen = 'Admin' then[\s\S]*?v_effective_truong_id := p_truong_id;/i.test(saveExamBody), 'S59 Admin exam push may target another school');
assert(/else[\s\S]*?p_truong_id is distinct from v_teacher_truong_id/i.test(saveExamBody), 'S60 non-Admin exam push must use own school');

// S62: the P0 submission pipeline remains outside this migration.
assert(!/create or replace function public\.(rpc_receive_submission|rpc_grade_submission|rpc_submission_receipt_status|rpc_submission_room_counts)/i.test(migration), 'S62 P0 functions untouched');

console.log('admin_control_plane_server_simulation: S1-S62 passed');
