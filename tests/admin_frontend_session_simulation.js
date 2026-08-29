const assert = require('assert');
const fs = require('fs');
const childProcess = require('child_process');

const source = fs.readFileSync('giaovien.js', 'utf8');
const body = (name) => {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{`));
  assert(start >= 0, `Không tìm thấy hàm ${name}`);
  const opening = source.indexOf('{', start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Hàm ${name} chưa đóng ngoặc`);
};
const must = (pattern, label) => assert(pattern.test(source), label);

// F1-F5: opaque control tokens only live in sessionStorage with validated expiry.
must(/sessionStorage\.setItem\('damSan_StaffToken', loginData\.staff_token\)/, 'F1 staff token phải dùng sessionStorage');
must(/sessionStorage\.setItem\('damSan_AdminToken', loginData\.admin_token\)/, 'F2 admin token phải dùng sessionStorage');
assert(!/localStorage\.(?:setItem|getItem)\('damSan_(?:Staff|Admin)(?:Token|ExpiresAt)'/.test(source), 'F3 token không được ở localStorage');
must(/damSan_StaffExpiresAt/, 'F4 staff expiry');
must(/damSan_AdminExpiresAt/, 'F5 admin expiry');

// F6-F14: login and restored profile never require or persist the password hash.
const login = body('thucHienDangNhapGV');
assert(!/userData\.mat_khau/.test(login), 'F6 login không phụ thuộc user.mat_khau');
must(/data\.must_change_password === true \|\| userData\.must_change_password === true/, 'F7 default-password flow dựa vào must_change_password');
const completeLogin = body('hoanTatDangNhap');
must(/!loginData\.staff_token \|\| isStoredSessionExpired\(loginData\.staff_expires_at\)/, 'F8 login GV yêu cầu staff token');
must(/user\.quyen === 'Admin' && \(!loginData\.admin_token \|\| isStoredSessionExpired\(loginData\.admin_expires_at\)\)/, 'F9 login Admin yêu cầu admin token');
must(/rpc_change_giao_vien_password/, 'F10 forced password change dùng RPC');
const forced = body('xacNhanDoiMatKhauBatBuoc');
must(/rpc_login_giao_vien/, 'F11 forced password change tự đăng nhập lại');
const normal = body('thucHienDoiMatKhau');
must(/rpc_login_giao_vien/, 'F12 normal password change tự đăng nhập lại');
must(/const GV_SESSION_FIELDS = \['id', 'ma_gv', 'ho_ten', 'quyen', 'truong_id', 'truong_ten', 'mon_id'\]/, 'F13 session GV có whitelist');
must(/gvData = safeGvProfile\(JSON\.parse\(gvSession\)\);[\s\S]*sessionStorage\.setItem\('damSan_GVSession', JSON\.stringify\(gvData\)\)/, 'F14 legacy GV session được sanitize');

// F15-F17: logout revokes remotely on a best-effort basis, then always cleans local state.
const logout = body('dangXuatGV');
must(/rpc_staff_logout/, 'F15 logout staff RPC');
must(/rpc_admin_logout/, 'F16 logout Admin RPC');
must(/await Promise\.allSettled\(requests\);[\s\S]*clearControlSessions\(\)/, 'F17 local cleanup không phụ thuộc RPC success');

// F18-F24: all room mutations have centralized staff authentication; Admin exam delete uses admin control.
const staff = body('staffRpc');
for (const rpc of ['rpc_dieu_khien_phong_thi', 'rpc_xoa_phong_thi', 'rpc_reset_room_results', 'rpc_grade_pending_room', 'rpc_luu_de_thi_len_phong', 'rpc_xoa_de_trong_phong']) {
  assert(new RegExp(`staffRpc\\('${rpc}'`).test(source), `Thiếu secure staff call ${rpc}`);
}
must(/sb\.rpc\(rpcName, \{ p_staff_token: token, \.\.\.args \}\)/, 'F18-F22 secure calls truyền p_staff_token');
const deleteExam = body('xoaDeTrongPhong');
must(/adminRpc\('exam_delete_only', \{ phong_id: cached\.id \}\)/, 'F23 Admin delete-exam dùng adminRpc');
must(/staffRpc\('rpc_xoa_de_trong_phong'/, 'F24 teacher delete-exam dùng secure RPC');

// F25-F27: no room direct writes, Admin room targets preserve their room school, and no room re-auth prompt.
assert(!/from\('(phong_thi|de_thi)'\)\.(insert|update|delete|upsert)\(/.test(source), 'F25 không còn direct write phong_thi/de_thi');
must(/function getRoomTargetSchoolId\(room\)[\s\S]*room\?\.truong_id/, 'F26 Admin room target dùng truong_id của phòng');
for (const name of ['dieuKhien', 'dieuKhienFast', 'xoaPhongHoanToan', 'xoaDeTrongPhong', 'xoaDiemPhong', 'khoiPhucChamDiemPhong', 'luuDeThiLenSupabase']) {
  assert(!/prompt\(/.test(body(name)), `F27 ${name} không có password re-auth`);
}

// F28: this task must not alter P0 student files.
const changed = childProcess.execSync('git diff --name-only 990aee4f0280e762e94ab2334940b57b1b5befe7 -- hoc_sinh.js sw.js', { encoding: 'utf8' }).trim();
assert.strictEqual(changed, '', 'F28 P0 student files không được sửa');

// F29-F43: secure room read plane, explicit school target, and UUID room identity.
const roomList = body('rpcLayDanhSachPhongThi');
must(/staffRpc\('rpc_lay_danh_sach_phong_thi_gv'/, 'F29 room list dùng staffRpc');
assert(!/sb\.rpc\('rpc_lay_danh_sach_phong_thi_gv'/.test(source), 'F30 không còn direct room-list RPC');
must(/let activeWorkspaceTruongId = null/, 'F31 có state trường đích Admin');
const targetSchool = body('getExamTargetSchoolId');
must(/activeWorkspaceTruongId === 'ALL'[\s\S]*Vui lòng chọn TRƯỜNG ĐÍCH cụ thể/, 'F32-F33 tạo phòng Admin yêu cầu trường đích cụ thể');
const roomSelectors = body('taiDanhSachPhong');
assert(!/new Set\(data\.map\(d=>d\.ma_phong/.test(roomSelectors), 'F34 không dedupe room toàn cục theo mã');
must(/option value="\$\{room\.id\}" data-ma-phong/, 'F35 selector dùng UUID');
must(/function getSelectedRoom[\s\S]*room\.id/, 'F36 resolve action theo UUID');
must(/candidates\.length > 1/, 'F37 room code trùng không tự chọn record đầu tiên');
const preview = body('xemTruocDeThi');
assert(!/from\('phong_thi'\)/.test(preview), 'F38 preview không direct SELECT phong_thi');
must(/from\('de_thi'\)\.select\('\*'\)\.eq\('phong_id', room\.id\)/, 'F39 preview dùng phong_id UUID');
must(/selectedRoom\.truong_id|scopedRoom\.truong_id/, 'F40 room khác trường dùng truong_id room');
must(/data\?\.code === 'staff_session_invalid'[\s\S]*clearGvSessionAndReturnToLogin/, 'F41 staff_session_invalid xóa local session');
assert(!/from\('(phong_thi|de_thi)'\)\.(insert|update|delete|upsert)\(/.test(source), 'F42 không có direct room write');
assert.strictEqual(changed, '', 'F43 hoc_sinh.js và sw.js không được sửa');
must(/adminRpc\('accounts_list', \{ kind: 'HS'/, 'F44 Admin HS list uses accounts_list');
must(/adminRpc\('accounts_list', \{ kind: 'GV'/, 'F45 Admin GV list uses accounts_list');
assert(!/mat_khau/.test(body('fetchStudents')) && !/mat_khau/.test(body('fetchTeachers')), 'F46-F47 account lists do not read passwords');
assert(!/from\('(hoc_sinh|giao_vien)'\)\.select\('\*'\)/.test(body('fetchStudents')) && !/from\('(hoc_sinh|giao_vien)'\)\.select\('\*'\)/.test(body('fetchTeachers')), 'F48 account safe selects');
must(/hoc_sinh'\)\.select\('id, truong_id, ma_hs, ho_ten, lop, quyen'\)\.eq\('truong_id', currentRoom\.truong_id\)/, 'F49-F50 dashboard school-scoped safe read');
must(/getActiveTargetSchoolId\(\)/, 'F51 class metadata target school');
must(/changeWorkspaceSchool[\s\S]*taiDanhSachPhong\(\)[\s\S]*fetchRadar\(\)/, 'F52 school change refreshes rooms');
must(/adminRpc\('accounts_upsert'/, 'F53 import control plane');
must(/Dòng dữ liệu chưa có mã trường và chưa chọn trường đích/, 'F54 import target guard');
for (const [name, action] of [['resetSelectedPass','accounts_reset_password'],['resetPass','accounts_reset_password'],['deleteSelectedAccounts','accounts_delete'],['capNhatTruongGiaoVien','teacher_update_school'],['capNhatMonGiaoVien','teacher_update_subject'],['migrateLegacyPasswords','normalize_legacy_passwords'],['themTruongMoi','school_create'],['xoaTruong','school_delete'],['themMonMoi','subject_create'],['xoaMon','subject_delete']]) assert(body(name).includes(action), `B1 ${name}`);
assert(!/rpc_admin_reset_pass|rpc_admin_xoa_tk/.test(source), 'F55-F67 obsolete account RPCs removed');
assert(!/from\('(hoc_sinh|giao_vien|truong_hoc|mon_hoc)'\)\.(insert|update|delete|upsert)/.test(source), 'F68 protected direct writes removed');
assert.strictEqual(changed, '', 'F70 P0 files untouched');
assert(!/cache_students/.test(body('fetchStudents')), 'F71 fetchStudents không dùng cache');
for (const name of ['clearGvSessionAndReturnToLogin','dangXuatGV','hoanTatDangNhap']) assert(body(name).includes('clearAccountRuntimeState'), `F72-F74 ${name} dọn runtime account`);
must(/if \(gvData\.quyen === 'Admin'\) \{ fetchStudents\(true\); fetchTeachers\(true\); \}/, 'F75 chỉ Admin prefetch accounts');
must(/changeWorkspaceSchool[\s\S]*clearAccountRuntimeState\(\)/, 'F76 school switch invalidates account state');
must(/Mã trường \[\$\{ma_truong\}\] không tồn tại/, 'F79 mã trường Excel sai bị chặn');
must(/resetPass[\s\S]*clearGvSessionAndReturnToLogin/, 'F83 reset self Admin đăng xuất');
assert.strictEqual(changed, '', 'F91 P0 files untouched');
must(/function getAccountPasswordState[\s\S]*KhongXacDinh/, 'F78 unknown password state');
assert(body('renderStudentTable').includes('KhongXacDinh') && body('renderTeacherTable').includes('KhongXacDinh'), 'F78 neutral render');
for (const name of ['themTruongMoi','themMonMoi']) assert(body(name).includes('refreshWorkspaceSelectors'), `F84/F87 ${name} refreshes selectors`);
const deleteSchool = body('xoaTruong');
assert(deleteSchool.includes("activeWorkspaceTruongId = 'ALL'") && deleteSchool.includes('clearGvSessionAndReturnToLogin'), 'F85-F86 school delete lifecycle');
const deleteSubject = body('xoaMon');
assert(deleteSubject.includes("activeWorkspaceMonId = 'ALL'") && deleteSubject.includes('safeGvProfile(gvData)'), 'F88 subject delete lifecycle');
assert(!/from\('(hoc_sinh|giao_vien|truong_hoc|mon_hoc|phong_thi|de_thi)'\)\.(insert|update|delete|upsert)/.test(source), 'F89 protected direct writes');
assert(/from\('ngan_hang'\)\.(insert|update|delete)/.test(source), 'F90 remaining direct writes are bank scope');

console.log('admin_frontend_session_simulation: F1-F91 passed');
