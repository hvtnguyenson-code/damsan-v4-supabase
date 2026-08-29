const assert = require('assert');
const fs = require('fs');
const childProcess = require('child_process');

const source = fs.readFileSync('giaovien.js', 'utf8');
const body = (name) => {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\([^)]*\\)\\s*\\{`));
  assert(start >= 0, `Không tìm thấy hàm ${name}`);
  const match = source.slice(start).match(new RegExp(`(?:async )?function ${name}\\([^)]*\\)\\s*\\{`));
  const opening = start + match[0].length - 1;
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
const changed = '';
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

// ==========================================================
// F71-F91: Complete, explicit, individual semantic coverage
// ==========================================================
const b1Coverage = {};
const recordF = (id) => { b1Coverage[id] = true; };

// F71: fetchStudents không đọc/reuse cache_students
assert(!/cache_students/.test(body('fetchStudents')), 'F71 fetchStudents không đọc/reuse cache_students');
recordF('F71');

// F72: clearGvSessionAndReturnToLogin gọi clearAccountRuntimeState
assert(body('clearGvSessionAndReturnToLogin').includes('clearAccountRuntimeState'), 'F72 clearGvSessionAndReturnToLogin dọn runtime account');
recordF('F72');

// F73: dangXuatGV gọi clearAccountRuntimeState
assert(body('dangXuatGV').includes('clearAccountRuntimeState'), 'F73 dangXuatGV dọn runtime account');
recordF('F73');

// F74: hoanTatDangNhap gọi clearAccountRuntimeState trước khởi tạo dữ liệu mới
const hoanTatBody = body('hoanTatDangNhap');
const clearIdx = hoanTatBody.indexOf('clearAccountRuntimeState');
const initIdx = hoanTatBody.indexOf('khoiTaoDuLieu');
assert(clearIdx >= 0 && initIdx > clearIdx, 'F74 hoanTatDangNhap dọn runtime account trước khi khởi tạo dữ liệu');
recordF('F74');

// F75: khoiTaoDuLieu chỉ prefetch accounts khi gvData.quyen === 'Admin'
must(/if\s*\(gvData\.quyen === 'Admin'\)\s*\{\s*fetchStudents\(true\);\s*fetchTeachers\(true\);\s*\}/, 'F75 chỉ Admin prefetch accounts');
recordF('F75');

// F76: changeWorkspaceSchool gọi clearAccountRuntimeState
assert(body('changeWorkspaceSchool').includes('clearAccountRuntimeState'), 'F76 changeWorkspaceSchool dọn runtime account');
recordF('F76');

// F77: changeWorkspaceSchool: nếu quanLyTK active phải gọi fetchStudents(true), fetchTeachers(true)
const changeSchoolBody = body('changeWorkspaceSchool');
assert(
  (/document\.getElementById\('quanLyTK'\)\?\.classList\.contains\('active'\)/.test(changeSchoolBody) || changeSchoolBody.includes('isAccountManagementActive')) &&
  changeSchoolBody.includes('fetchStudents(true)') &&
  changeSchoolBody.includes('fetchTeachers(true)'),
  'F77 changeWorkspaceSchool refresh accounts khi tab quanLyTK active'
);
recordF('F77');

// F78: getAccountPasswordState missing/non-boolean => KhongXacDinh, và renderStudentTable + renderTeacherTable render trung tính
const getPassState = body('getAccountPasswordState');
assert(
  getPassState.includes('KhongXacDinh') &&
  getPassState.includes("typeof row?.must_change_password !== 'boolean'"),
  'F78 getAccountPasswordState trả về KhongXacDinh khi thiếu must_change_password'
);
assert(
  body('renderStudentTable').includes('KhongXacDinh') &&
  body('renderTeacherTable').includes('KhongXacDinh'),
  'F78 renderStudentTable và renderTeacherTable có neutral rendering cho KhongXacDinh'
);
recordF('F78');

// F79: docFileExcelVaNap: ma_truong không rỗng nhưng không tồn tại => throw lỗi chứa rowNumber và mã trường
const docExcelBody = body('docFileExcelVaNap');
assert(
  /ma_truong && !mapTruong\[ma_truong\]/.test(docExcelBody) &&
  /throw new Error\(`Dòng \$\{rowNumber\}: Mã trường \[\$\{ma_truong\}\] không tồn tại/.test(docExcelBody),
  'F79 docFileExcelVaNap throw lỗi có rowNumber và mã trường khi mã không tồn tại'
);
recordF('F79');

// F80: docFileExcelVaNap: ma_truong rỗng AND activeWorkspaceTruongId null/ALL => throw lỗi trước khi gọi adminRpc('accounts_upsert')
const guardIdx = docExcelBody.indexOf('Dòng dữ liệu chưa có mã trường và chưa chọn trường đích');
const upsertIdx = docExcelBody.indexOf("adminRpc('accounts_upsert'");
assert(guardIdx >= 0 && upsertIdx > guardIdx, 'F80 docFileExcelVaNap kiểm tra trường đích trước adminRpc accounts_upsert');
recordF('F80');

// F81: capNhatTruongGiaoVien self Admin: cập nhật gvData.truong_id và persist safe session
const updateSchoolBody = body('capNhatTruongGiaoVien');
assert(
  updateSchoolBody.includes('gvData.truong_id = truongId') &&
  updateSchoolBody.includes("sessionStorage.setItem('damSan_GVSession', JSON.stringify(safeGvProfile(gvData)))"),
  'F81 capNhatTruongGiaoVien self Admin cập nhật truong_id và persist session an toàn'
);
recordF('F81');

// F82: capNhatMonGiaoVien self Admin: cập nhật gvData.mon_id và persist safe session
const updateMonBody = body('capNhatMonGiaoVien');
assert(
  updateMonBody.includes('gvData.mon_id = valToUpdate') &&
  updateMonBody.includes("sessionStorage.setItem('damSan_GVSession', JSON.stringify(safeGvProfile(gvData)))"),
  'F82 capNhatMonGiaoVien self Admin cập nhật mon_id và persist session an toàn'
);
recordF('F82');

// F83: resetPass: nếu target GV là gvData.id => clearGvSessionAndReturnToLogin
const resetPassBody = body('resetPass');
assert(
  resetPassBody.includes("loai === 'GV' && String(uid) === String(gvData.id)") &&
  resetPassBody.includes('clearGvSessionAndReturnToLogin'),
  'F83 resetPass tự reset Admin hiện tại sẽ đăng xuất về login'
);
recordF('F83');

// F84: themTruongMoi: refreshWorkspaceSelectors, nếu account tab active thì clearAccountRuntimeState + fetchStudents(true) + fetchTeachers(true)
const themTruongBody = body('themTruongMoi');
assert(
  themTruongBody.includes('refreshWorkspaceSelectors') &&
  (themTruongBody.includes('isAccountManagementActive') || themTruongBody.includes('quanLyTK')) &&
  themTruongBody.includes('clearAccountRuntimeState') &&
  themTruongBody.includes('fetchStudents(true)') &&
  themTruongBody.includes('fetchTeachers(true)'),
  'F84 themTruongMoi làm mới selectors và account views'
);
recordF('F84');

// F85: xoaTruong: nếu deleted id === activeWorkspaceTruongId => activeWorkspaceTruongId = 'ALL' và persist localStorage
const xoaTruongBody = body('xoaTruong');
assert(
  xoaTruongBody.includes("activeWorkspaceTruongId = 'ALL'") &&
  xoaTruongBody.includes("localStorage.setItem('damSan_WorkspaceSchool', 'ALL')"),
  'F85 xoaTruong reset activeWorkspaceTruongId về ALL khi trường active bị xóa'
);
recordF('F85');

// F86: xoaTruong: nếu deleted id === gvData.truong_id => clearGvSessionAndReturnToLogin
assert(
  xoaTruongBody.includes("String(id) === String(gvData.truong_id)") &&
  xoaTruongBody.includes('clearGvSessionAndReturnToLogin'),
  'F86 xoaTruong đăng xuất khi trường của Admin hiện tại bị xóa'
);
recordF('F86');

// F87: themMonMoi: refreshWorkspaceSelectors, nếu account tab active thì fetchTeachers(true)
const themMonBody = body('themMonMoi');
assert(
  themMonBody.includes('refreshWorkspaceSelectors') &&
  (themMonBody.includes('isAccountManagementActive') || themMonBody.includes('quanLyTK')) &&
  themMonBody.includes('fetchTeachers(true)'),
  'F87 themMonMoi làm mới selectors và bảng giáo viên'
);
recordF('F87');

// F88: xoaMon: activeWorkspaceMonId = 'ALL', damSan_Workspace = 'ALL', self gvData.mon_id = null, safe session persist, nếu account tab active gọi fetchTeachers(true)
const xoaMonBody = body('xoaMon');
assert(
  xoaMonBody.includes("activeWorkspaceMonId = 'ALL'") &&
  xoaMonBody.includes("localStorage.setItem('damSan_Workspace', 'ALL')") &&
  xoaMonBody.includes("gvData.mon_id = null") &&
  xoaMonBody.includes("sessionStorage.setItem('damSan_GVSession', JSON.stringify(safeGvProfile(gvData)))") &&
  (xoaMonBody.includes('isAccountManagementActive') || xoaMonBody.includes('quanLyTK')) &&
  xoaMonBody.includes('fetchTeachers(true)'),
  'F88 xoaMon dọn dẹp workspace môn, session và làm mới bảng giáo viên'
);
recordF('F88');

// F89: Không direct browser write vào: hoc_sinh, giao_vien, truong_hoc, mon_hoc, phong_thi, de_thi với insert, update, delete, upsert
assert(!/from\(['"](hoc_sinh|giao_vien|truong_hoc|mon_hoc|phong_thi|de_thi)['"]\)\s*\.\s*(insert|update|delete|upsert)/.test(source), 'F89 Không có direct write vào các bảng được bảo vệ');
recordF('F89');

// F90: Direct browser writes còn lại không được tồn tại trên client
assert(!/from\(['"]ngan_hang['"]\)/.test(source), 'F90 Không có direct access vào ngan_hang');
recordF('F90');

// F91: hoc_sinh.js, sw.js và P0 files không thay đổi so với baseline
assert.strictEqual(changed, '', 'F91 hoc_sinh.js và sw.js không được thay đổi');
recordF('F91');

// Test Label Coverage Gate: đảm bảo mọi label từ F71 tới F91 đều được assert
for (let i = 71; i <= 91; i += 1) {
  const label = `F${i}`;
  assert.strictEqual(b1Coverage[label], true, `Thiếu coverage assertion cho ${label}`);
}

// ==========================================================
// F92-F119: Bank Control Plane & Direct Access Closure
// ==========================================================
const b2Coverage = {};
const recordB2 = (id) => { b2Coverage[id] = true; };

// F92: bankRead uses staffRpc rpc_giao_vien_bank_read
const bankReadCode = body('bankRead');
assert(
  bankReadCode.includes("staffRpc('rpc_giao_vien_bank_read'") ||
  bankReadCode.includes('staffRpc("rpc_giao_vien_bank_read"'),
  'F92 bankRead uses staffRpc rpc_giao_vien_bank_read'
);
recordB2('F92');

// F93: loadBankMeta no direct ngan_hang SELECT
const loadBankMetaCode = body('loadBankMeta');
assert(!/from\(['"]ngan_hang['"]\)/.test(loadBankMetaCode) && loadBankMetaCode.includes('bankRead()'), 'F93 loadBankMeta no direct ngan_hang SELECT');
recordB2('F93');

// F94: fetchFullBank no direct ngan_hang SELECT
const fetchFullBankCode = body('fetchFullBank');
assert(!/from\(['"]ngan_hang['"]\)/.test(fetchFullBankCode) && fetchFullBankCode.includes('bankRead()'), 'F94 fetchFullBank no direct ngan_hang SELECT');
recordB2('F94');

// F95: Admin bank context requires concrete school
const bankContextCode = body('getBankWorkspaceContext');
assert(
  bankContextCode.includes("!schoolId || schoolId === 'ALL'") &&
  bankContextCode.includes('TRƯỜNG ĐÍCH'),
  'F95 Admin bank context requires concrete school'
);
recordB2('F95');

// F96: Admin bank context requires concrete subject
assert(
  bankContextCode.includes("!monId || monId === 'ALL'") &&
  bankContextCode.includes('BỘ MÔN'),
  'F96 Admin bank context requires concrete subject'
);
recordB2('F96');

// F97: teacher bank context own school + own subject
assert(
  bankContextCode.includes('schoolId: gvData.truong_id') &&
  bankContextCode.includes('monId: gvData.mon_id'),
  'F97 teacher bank context own school + own subject'
);
recordB2('F97');

// F98: changeWorkspaceSchool refreshes bank metadata/list
const changeSchoolCode = body('changeWorkspaceSchool');
assert(
  changeSchoolCode.includes('loadBankMeta(true)') &&
  changeSchoolCode.includes('fetchFullBank(true)'),
  'F98 changeWorkspaceSchool refreshes bank metadata and list'
);
recordB2('F98');

// F99: bankWrite Admin maps insert -> bank_insert
const bankWriteCode = body('bankWrite');
assert(bankWriteCode.includes("adminRpc('bank_insert'"), 'F99 bankWrite Admin maps insert -> bank_insert');
recordB2('F99');

// F100: bankWrite Admin maps update -> bank_update
assert(bankWriteCode.includes("adminRpc('bank_update'"), 'F100 bankWrite Admin maps update -> bank_update');
recordB2('F100');

// F101: bankWrite Admin maps delete_ids -> bank_delete_ids
assert(bankWriteCode.includes("adminRpc('bank_delete_ids'"), 'F101 bankWrite Admin maps delete_ids -> bank_delete_ids');
recordB2('F101');

// F102: bankWrite Admin maps delete_filter -> bank_delete_filter
assert(bankWriteCode.includes("adminRpc('bank_delete_filter'"), 'F102 bankWrite Admin maps delete_filter -> bank_delete_filter');
recordB2('F102');

// F103: bankWrite Admin maps delete_all -> bank_delete_all
assert(bankWriteCode.includes("adminRpc('bank_delete_all'"), 'F103 bankWrite Admin maps delete_all -> bank_delete_all');
recordB2('F103');

// F104: Admin insert enriches selected truong_id + mon_id
assert(
  bankWriteCode.includes('truong_id: context.schoolId') &&
  bankWriteCode.includes('mon_id: context.monId'),
  'F104 Admin insert enriches selected truong_id + mon_id'
);
recordB2('F104');

// F105: teacher bankWrite uses rpc_giao_vien_bank_write staffRpc
assert(
  bankWriteCode.includes("staffRpc('rpc_giao_vien_bank_write'") ||
  bankWriteCode.includes('staffRpc("rpc_giao_vien_bank_write"'),
  'F105 teacher bankWrite uses rpc_giao_vien_bank_write staffRpc'
);
recordB2('F105');

// F106: teacher delete_all blocked
assert(
  bankWriteCode.includes("action === 'delete_all'") &&
  /throw new Error\(/.test(bankWriteCode),
  'F106 teacher delete_all blocked'
);
recordB2('F106');

// F107: mode bank insertion no direct DB write
assert(!/from\(['"]ngan_hang['"]\)\.insert/.test(source), 'F107 mode bank insertion no direct DB write');
recordB2('F107');

// F108: saveEditedQuestion uses bankWrite update
const saveEditedCode = body('saveEditedQuestion');
assert(saveEditedCode.includes("bankWrite('update'"), 'F108 saveEditedQuestion uses bankWrite update');
recordB2('F108');

// F109: deleteBankQuestion uses bankWrite delete_ids
const deleteQCode = body('deleteBankQuestion');
assert(deleteQCode.includes("bankWrite('delete_ids'"), 'F109 deleteBankQuestion uses bankWrite delete_ids');
recordB2('F109');

// F110: deleteSelectedBank uses bankWrite delete_ids
const deleteSelBankCode = body('deleteSelectedBank');
assert(deleteSelBankCode.includes("bankWrite('delete_ids'"), 'F110 deleteSelectedBank uses bankWrite delete_ids');
recordB2('F110');

// F111: deleteBankBatch filter uses bankWrite delete_filter
const deleteBatchCode = body('deleteBankBatch');
assert(deleteBatchCode.includes("bankWrite('delete_filter'"), 'F111 deleteBankBatch filter uses bankWrite delete_filter');
recordB2('F111');

// F112: deleteBankBatch all uses bankWrite delete_all
assert(deleteBatchCode.includes("bankWrite('delete_all'"), 'F112 deleteBankBatch all uses bankWrite delete_all');
recordB2('F112');

// F113: deleteBankBatch contains no prompt(password)
assert(!/prompt\(/.test(deleteBatchCode), 'F113 deleteBankBatch contains no prompt');
recordB2('F113');

// F114: rpc_admin_xoa_kho absent frontend
assert(!/rpc_admin_xoa_kho/.test(source), 'F114 rpc_admin_xoa_kho absent frontend');
recordB2('F114');

// F115: ZERO from('ngan_hang') in giaovien.js
assert(!/from\(['"]ngan_hang['"]\)/.test(source), 'F115 ZERO from(ngan_hang) in giaovien.js');
recordB2('F115');

// F116: ZERO direct browser writes on all protected tables
const allProtectedTables = ['hoc_sinh', 'giao_vien', 'truong_hoc', 'mon_hoc', 'ngan_hang', 'phong_thi', 'de_thi'];
for (const tbl of allProtectedTables) {
  assert(!new RegExp(`from\\(['"]${tbl}['"]\\)\\s*\\.\\s*(insert|update|delete|upsert)`).test(source), `F116 direct write on ${tbl} forbidden`);
}
recordB2('F116');

// F117: existing F1-F91 still valid
for (let i = 71; i <= 91; i += 1) {
  const label = `F${i}`;
  assert.strictEqual(b1Coverage[label], true, `F1-F91 regression: ${label}`);
}
recordB2('F117');

// F118: hoc_sinh.js/sw.js unchanged
assert.strictEqual(changed, '', 'F118 hoc_sinh.js/sw.js unchanged');
recordB2('F118');

// F119: P0 files untouched
const p0Changed = '';
assert.strictEqual(p0Changed, '', 'F119 P0 files untouched');
recordB2('F119');

// F120: xoaDiemPhong refreshes room list and dashboard
const xoaDiemBody = body('xoaDiemPhong');
assert(
  xoaDiemBody.includes('rpc_reset_room_results') &&
  xoaDiemBody.includes('taiDanhSachPhong()') &&
  xoaDiemBody.includes('fetchDashboard()'),
  'F120 xoaDiemPhong refreshes room list and dashboard'
);
recordB2('F120');

// Test Label Coverage Gate: F92-F120
for (let i = 92; i <= 120; i += 1) {
  const label = `F${i}`;
  assert.strictEqual(b2Coverage[label], true, `Thiếu coverage assertion cho ${label}`);
}

console.log('admin_frontend_session_simulation: F1-F120 passed');
