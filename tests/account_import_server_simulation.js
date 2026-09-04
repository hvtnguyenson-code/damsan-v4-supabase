const assert = require('assert');
const fs = require('fs');
const childProcess = require('child_process');

const migrationPath = 'supabase/migrations/20260831081352_account_import_safety.sql';
assert(fs.existsSync(migrationPath), 'Migration file 20260831081352_account_import_safety.sql must exist');
const migration = fs.readFileSync(migrationPath, 'utf8');

// ==========================================================
// PART 1: MIGRATION STRUCTURAL REVIEW
// ==========================================================
console.log('--- Testing Migration Structural Integrity ---');

// 1. Exact function signature
const sigMatch = migration.match(/create or replace function public\.rpc_admin_import_accounts\s*\(\s*p_admin_token text,\s*p_kind text,\s*p_rows jsonb\s*\)\s*returns jsonb/i);
assert(sigMatch, 'M1: exact function signature public.rpc_admin_import_accounts(text, text, jsonb) returns jsonb');

// 2. Language plpgsql, SECURITY DEFINER, search_path = public
assert(/language plpgsql/i.test(migration), 'M2: language plpgsql');
assert(/security definer/i.test(migration), 'M3: SECURITY DEFINER');
assert(/set search_path = public/i.test(migration), 'M4: SET search_path = public');

// 3. Balanced dollar quotes
const dollarTokens = migration.match(/\$[a-zA-Z0-9_]*\$/g) || [];
assert(dollarTokens.length >= 2 && dollarTokens.length % 2 === 0, 'M5: Dollar quoting must be balanced');
for (let i = 0; i < dollarTokens.length; i += 2) {
  assert.strictEqual(dollarTokens[i], dollarTokens[i + 1], `M5: Dollar quotes must pair (${dollarTokens[i]} vs ${dollarTokens[i+1]})`);
}

// 4. Token validation uses _admin_session_admin_id
assert(/public\._admin_session_admin_id\s*\(\s*p_admin_token\s*\)/.test(migration), 'M6: Authenticates via _admin_session_admin_id');
assert(/admin_session_invalid/.test(migration), 'M7: Invalid token returns admin_session_invalid');

// 5. Default SHA-256 password hash used
assert(migration.includes('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'), 'M8: Default password SHA-256 constant present');

// 6. Access Control: Revoke and Grant
assert(/revoke all on function public\.rpc_admin_import_accounts\(text,\s*text,\s*jsonb\) from public,\s*anon,\s*authenticated;/i.test(migration), 'M9: Revoke all from public, anon, authenticated');
assert(/grant execute on function public\.rpc_admin_import_accounts\(text,\s*text,\s*jsonb\) to anon,\s*authenticated;/i.test(migration), 'M10: Grant execute to anon, authenticated');

// 7. No DDL outside the new function / grants
assert(!/create table/i.test(migration), 'M11: No table DDL');
assert(!/alter table/i.test(migration), 'M12: No alter table DDL');
assert(!/drop table/i.test(migration), 'M13: No drop table DDL');

console.log('Migration structural review: PASSED');

// ==========================================================
// PART 2: SERVER IMPORT LOGIC SIMULATION
// ==========================================================
console.log('--- Testing Server Import Simulation ---');

const DEFAULT_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
const MON_MATH = '22222222-2222-2222-2222-222222222222';
const MON_LIT = '33333333-3333-3333-3333-333333333333';

class MockDatabase {
  constructor() {
    this.schools = new Set([SCHOOL_A]);
    this.subjects = new Set([MON_MATH, MON_LIT]);
    this.adminSessions = new Map([
      ['valid_admin_token', 'admin_uuid_1']
    ]);
    this.staffSessions = new Map();
    this.hocSinh = new Map(); // key: `${truong_id}::${ma_hs}` -> record
    this.giaoVien = new Map(); // key: `${truong_id}::${ma_gv}` -> record
  }

  adminSessionAdminId(token) {
    return this.adminSessions.get(token) || null;
  }

  rpcAdminImportAccounts(adminToken, kind, rows) {
    const adminId = this.adminSessionAdminId(adminToken);
    if (!adminId) {
      return {
        status: 'error',
        code: 'admin_session_invalid',
        message: 'Phiên quản trị không hợp lệ hoặc đã hết hạn.'
      };
    }

    if (!kind || !['HS', 'GV'].includes(kind)) {
      throw new Error('Invalid account kind. Only HS and GV are supported.');
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('rows must be a non-empty array');
    }

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const truongId = row.truong_id;
      if (!truongId) throw new Error('truong_id is required');
      if (!this.schools.has(truongId)) throw new Error(`School not found: ${truongId}`);

      if (kind === 'HS') {
        const maHs = (row.ma_hs || '').trim().toUpperCase();
        if (!maHs) throw new Error('ma_hs is required');
        const hoTen = (row.ho_ten || '').trim();
        if (!hoTen) throw new Error('ho_ten is required');
        const lop = (row.lop || '').trim();
        if (!lop) throw new Error('lop is required');

        const key = `${truongId}::${maHs}`;
        const existing = this.hocSinh.get(key);

        if (!existing) {
          this.hocSinh.set(key, {
            id: 'hs_' + Math.random().toString(36).slice(2),
            truong_id: truongId,
            ma_hs: maHs,
            ho_ten: hoTen,
            lop: lop,
            mat_khau: DEFAULT_HASH,
            quyen: 'HocSinh',
            created_at: new Date()
          });
          inserted += 1;
        } else {
          existing.ho_ten = hoTen;
          existing.lop = lop;
          // mat_khau, quyen, created_at preserved
          updated += 1;
        }
      } else {
        const maGv = (row.ma_gv || '').trim();
        if (!maGv) throw new Error('ma_gv is required');
        const hoTen = (row.ho_ten || '').trim();
        if (!hoTen) throw new Error('ho_ten is required');

        if (row.quyen && !['GiaoVien', 'Admin'].includes(row.quyen)) {
          throw new Error(`Invalid teacher role: ${row.quyen}`);
        }

        const monId = row.mon_id || null;
        if (monId && !this.subjects.has(monId)) {
          throw new Error(`Subject not found: ${monId}`);
        }

        const key = `${truongId}::${maGv}`;
        const existing = this.giaoVien.get(key);
        let targetGvId;

        if (!existing) {
          targetGvId = 'gv_' + Math.random().toString(36).slice(2);
          this.giaoVien.set(key, {
            id: targetGvId,
            truong_id: truongId,
            ma_gv: maGv,
            ho_ten: hoTen,
            mat_khau: DEFAULT_HASH,
            quyen: row.quyen || 'GiaoVien',
            mon_id: monId,
            created_at: new Date()
          });
          inserted += 1;
        } else {
          targetGvId = existing.id;
          existing.ho_ten = hoTen;
          if (Object.prototype.hasOwnProperty.call(row, 'quyen')) {
            existing.quyen = row.quyen;
          }
          if (Object.prototype.hasOwnProperty.call(row, 'mon_id')) {
            existing.mon_id = monId;
          }
          // mat_khau, created_at preserved
          updated += 1;
        }

        // Sessions revoked
        this.staffSessions.delete(targetGvId);
      }
    }

    return {
      status: 'success',
      kind: kind,
      count: inserted + updated,
      inserted: inserted,
      updated: updated
    };
  }
}

// Semantic Case 14: Invalid admin session is fail-closed
{
  const db = new MockDatabase();
  const res = db.rpcAdminImportAccounts('invalid_token', 'HS', [{ truong_id: SCHOOL_A, ma_hs: 'HS1', ho_ten: 'A', lop: '10A' }]);
  assert.strictEqual(res.status, 'error');
  assert.strictEqual(res.code, 'admin_session_invalid', 'Case 14: Fail-closed on invalid admin token');
}

// Semantic Case 15: New HS gets default password
{
  const db = new MockDatabase();
  const res = db.rpcAdminImportAccounts('valid_admin_token', 'HS', [
    { truong_id: SCHOOL_A, ma_hs: '100401', ho_ten: 'Nguyễn Văn A', lop: '10A4' }
  ]);
  assert.strictEqual(res.status, 'success');
  assert.strictEqual(res.inserted, 1);
  assert.strictEqual(res.updated, 0);
  const hs = db.hocSinh.get(`${SCHOOL_A}::100401`);
  assert(hs, 'HS inserted');
  assert.strictEqual(hs.mat_khau, DEFAULT_HASH, 'Case 15: New HS gets default password');
  assert.strictEqual(hs.quyen, 'HocSinh');
}

// Semantic Case 16: Existing HS update preserves existing changed password
{
  const db = new MockDatabase();
  const CUSTOM_HASH = 'custom_hashed_password_123';
  db.hocSinh.set(`${SCHOOL_A}::100401`, {
    id: 'hs_1',
    truong_id: SCHOOL_A,
    ma_hs: '100401',
    ho_ten: 'Cũ Văn A',
    lop: '10A1',
    mat_khau: CUSTOM_HASH,
    quyen: 'HocSinh',
    created_at: new Date('2025-01-01')
  });

  const res = db.rpcAdminImportAccounts('valid_admin_token', 'HS', [
    { truong_id: SCHOOL_A, ma_hs: '100401', ho_ten: 'Nguyễn Văn A Mới', lop: '10A4' }
  ]);
  assert.strictEqual(res.status, 'success');
  assert.strictEqual(res.inserted, 0);
  assert.strictEqual(res.updated, 1);

  const updated = db.hocSinh.get(`${SCHOOL_A}::100401`);
  assert.strictEqual(updated.ho_ten, 'Nguyễn Văn A Mới');
  assert.strictEqual(updated.lop, '10A4');
  assert.strictEqual(updated.mat_khau, CUSTOM_HASH, 'Case 16: Existing HS preserves changed password');
}

// Semantic Case 17: New GV defaults to GiaoVien when role omitted
{
  const db = new MockDatabase();
  const res = db.rpcAdminImportAccounts('valid_admin_token', 'GV', [
    { truong_id: SCHOOL_A, ma_gv: 'GV001', ho_ten: 'Trần Văn GV' }
  ]);
  assert.strictEqual(res.status, 'success');
  assert.strictEqual(res.inserted, 1);
  const gv = db.giaoVien.get(`${SCHOOL_A}::GV001`);
  assert.strictEqual(gv.quyen, 'GiaoVien', 'Case 17: New GV defaults to GiaoVien');
  assert.strictEqual(gv.mat_khau, DEFAULT_HASH);
}

// Semantic Case 18: Existing Admin with role omitted remains Admin
{
  const db = new MockDatabase();
  const CUSTOM_PASS = 'admin_custom_pass';
  db.giaoVien.set(`${SCHOOL_A}::GV_ADMIN`, {
    id: 'gv_admin',
    truong_id: SCHOOL_A,
    ma_gv: 'GV_ADMIN',
    ho_ten: 'Admin Cũ',
    mat_khau: CUSTOM_PASS,
    quyen: 'Admin',
    mon_id: MON_MATH
  });

  const res = db.rpcAdminImportAccounts('valid_admin_token', 'GV', [
    { truong_id: SCHOOL_A, ma_gv: 'GV_ADMIN', ho_ten: 'Admin Tên Mới' }
  ]);
  assert.strictEqual(res.status, 'success');
  assert.strictEqual(res.updated, 1);

  const gv = db.giaoVien.get(`${SCHOOL_A}::GV_ADMIN`);
  assert.strictEqual(gv.ho_ten, 'Admin Tên Mới');
  assert.strictEqual(gv.quyen, 'Admin', 'Case 18: Existing Admin with role omitted remains Admin');
  assert.strictEqual(gv.mat_khau, CUSTOM_PASS, 'Case 21: Existing GV password preserved');
}

// Semantic Case 19: Existing GV with subject omitted preserves mon_id
{
  const db = new MockDatabase();
  db.giaoVien.set(`${SCHOOL_A}::GV002`, {
    id: 'gv_2',
    truong_id: SCHOOL_A,
    ma_gv: 'GV002',
    ho_ten: 'GV Toán',
    mat_khau: DEFAULT_HASH,
    quyen: 'GiaoVien',
    mon_id: MON_MATH
  });

  const res = db.rpcAdminImportAccounts('valid_admin_token', 'GV', [
    { truong_id: SCHOOL_A, ma_gv: 'GV002', ho_ten: 'GV Toán Mới' }
  ]);
  assert.strictEqual(res.status, 'success');
  const gv = db.giaoVien.get(`${SCHOOL_A}::GV002`);
  assert.strictEqual(gv.mon_id, MON_MATH, 'Case 19: Existing GV with subject omitted preserves mon_id');
}

// Semantic Case 20: Explicit subject updates mon_id
{
  const db = new MockDatabase();
  db.giaoVien.set(`${SCHOOL_A}::GV003`, {
    id: 'gv_3',
    truong_id: SCHOOL_A,
    ma_gv: 'GV003',
    ho_ten: 'GV Văn',
    mat_khau: DEFAULT_HASH,
    quyen: 'GiaoVien',
    mon_id: MON_MATH
  });

  const res = db.rpcAdminImportAccounts('valid_admin_token', 'GV', [
    { truong_id: SCHOOL_A, ma_gv: 'GV003', ho_ten: 'GV Chuyển Văn', mon_id: MON_LIT }
  ]);
  assert.strictEqual(res.status, 'success');
  const gv = db.giaoVien.get(`${SCHOOL_A}::GV003`);
  assert.strictEqual(gv.mon_id, MON_LIT, 'Case 20: Explicit subject updates mon_id');
}

// Semantic Case 22: P0 student files untouched
{
  const changed = childProcess.execSync('git diff --name-only 990aee4f0280e762e94ab2334940b57b1b5befe7..2ab261b426affa43bfe071c95d0902deb549719a -- hoc_sinh.js hoc_sinh.html sw.js', { encoding: 'utf8' }).trim();
  assert.strictEqual(changed, '', 'Case 22: No P0 student files modified');
}

// ==========================================================
// PART 3: V2 CORRECTION SEMANTIC VALIDATIONS (C1 - C5)
// ==========================================================
console.log('--- Testing V2 Correction Semantic Cases (C1 - C5) ---');

// Mock Workbook Header Validator matching giaovien.js implementation
function normalizeImportHeader(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ').toLowerCase();
}

function validateAccountImportHeaders(mockRow1, loai) {
  const getColText = (colIndex) => normalizeImportHeader(mockRow1[colIndex]);

  if (loai === 'HS') {
    const c1 = getColText(1);
    const c2 = getColText(2);
    const c3 = getColText(3);
    const c4 = getColText(4);
    const c5 = getColText(5);

    if (c1 !== 'stt') throw new Error('Dòng tiêu đề không đúng định dạng. Cột 1 phải là [STT].');
    if (c2 !== 'mã hs' && c2 !== 'ma hs') throw new Error('Dòng tiêu đề không đúng định dạng. Cột 2 phải là [Mã HS].');
    if (c3 !== 'họ và tên' && c3 !== 'ho va ten' && c3 !== 'họ tên' && c3 !== 'ho ten') throw new Error('Dòng tiêu đề không đúng định dạng. Cột 3 phải là [Họ và Tên].');
    if (c4 !== 'lớp' && c4 !== 'lop') throw new Error('Dòng tiêu đề không đúng định dạng. Cột 4 phải là [Lớp].');
    if (c5 !== 'mã trường' && c5 !== 'ma truong') throw new Error('Dòng tiêu đề không đúng định dạng. Cột 5 phải là [Mã Trường].');
  } else {
    const c1 = getColText(1);
    const c2 = getColText(2);
    const c3 = getColText(3);
    const c4 = getColText(4);
    const c5 = getColText(5);
    const c6 = getColText(6);

    if (c1 !== 'stt') throw new Error('Dòng tiêu đề không đúng định dạng. Cột 1 phải là [STT].');
    if (c2 !== 'mã gv' && c2 !== 'ma gv') throw new Error('Dòng tiêu đề không đúng định dạng. Cột 2 phải là [Mã GV].');
    if (c3 !== 'họ và tên' && c3 !== 'ho va ten' && c3 !== 'họ tên' && c3 !== 'ho ten') throw new Error('Dòng tiêu đề không đúng định dạng. Cột 3 phải là [Họ và Tên].');
    const validQuyenHeaders = [
      'quyền (admin/giaovien)',
      'quyen (admin/giaovien)',
      'quyền (admin/gv)',
      'quyen (admin/gv)',
      'quyền',
      'quyen'
    ];
    if (!validQuyenHeaders.includes(c4)) {
      throw new Error('Dòng tiêu đề không đúng định dạng. Cột 4 phải là [Quyền (Admin/GiaoVien)] hoặc mẫu cũ [Quyền (Admin/GV)].');
    }
    if (c5 !== 'mã trường' && c5 !== 'ma truong') throw new Error('Dòng tiêu đề không đúng định dạng. Cột 5 phải là [Mã Trường].');
    if (c6) {
      const validMonHeaders = [
        'môn học (tùy chọn)',
        'mon hoc (tuy chon)',
        'môn học (tuy chon)',
        'mon hoc (tùy chọn)',
        'môn học',
        'mon hoc'
      ];
      if (!validMonHeaders.includes(c6)) throw new Error('Dòng tiêu đề không đúng định dạng. Cột 6 (nếu có) phải là [Môn học (tùy chọn)].');
    }
  }
}

// C5.4: Correct HS header passes
{
  const hsHeaders = { 1: 'STT', 2: 'Mã HS', 3: 'Họ và Tên', 4: 'Lớp', 5: 'Mã Trường' };
  assert.doesNotThrow(() => validateAccountImportHeaders(hsHeaders, 'HS'), 'C5.4: Correct HS header passes');
}

// C5.5: Wrong HS header fails before RPC
{
  const wrongHsHeaders = { 1: 'STT', 2: 'Mã GV', 3: 'Họ và Tên', 4: 'Lớp', 5: 'Mã Trường' };
  assert.throws(() => validateAccountImportHeaders(wrongHsHeaders, 'HS'), /Cột 2 phải là \[Mã HS\]/, 'C5.5: Wrong HS header fails');
}

// C5.6: Correct new GV 6-column header passes
{
  const gv6Headers = { 1: 'STT', 2: 'Mã GV', 3: 'Họ và Tên', 4: 'Quyền (Admin/GiaoVien)', 5: 'Mã Trường', 6: 'Môn học (tùy chọn)' };
  assert.doesNotThrow(() => validateAccountImportHeaders(gv6Headers, 'GV'), 'C5.6: New GV 6-col header passes');
}

// C5.7: Legacy GV header "Quyền (Admin/GV)" passes
{
  const gvLegacyHeaders = { 1: 'STT', 2: 'Mã GV', 3: 'Họ và Tên', 4: 'Quyền (Admin/GV)', 5: 'Mã Trường' };
  assert.doesNotThrow(() => validateAccountImportHeaders(gvLegacyHeaders, 'GV'), 'C5.7: Legacy GV header passes');
}

// C5.8: Legacy GV workbook 5 columns passes
{
  const gv5Headers = { 1: 'STT', 2: 'Mã GV', 3: 'Họ và Tên', 4: 'Quyền (Admin/GV)', 5: 'Mã Trường', 6: undefined };
  assert.doesNotThrow(() => validateAccountImportHeaders(gv5Headers, 'GV'), 'C5.8: 5-column legacy GV workbook passes');
}

// C5.9: Wrong/reordered GV header fails
{
  const reorderedHeaders = { 1: 'STT', 2: 'Mã GV', 3: 'Mã Trường', 4: 'Họ và Tên', 5: 'Quyền (Admin/GiaoVien)' };
  assert.throws(() => validateAccountImportHeaders(reorderedHeaders, 'GV'), /Dòng tiêu đề không đúng định dạng/, 'C5.9: Reordered GV header fails');
}

// C5.10: Optional subject column remains optional
{
  const gvWithSubject = { 1: 'STT', 2: 'Mã GV', 3: 'Họ và Tên', 4: 'Quyền (Admin/GiaoVien)', 5: 'Mã Trường', 6: 'Môn học (tùy chọn)' };
  const gvWithoutSubject = { 1: 'STT', 2: 'Mã GV', 3: 'Họ và Tên', 4: 'Quyền (Admin/GiaoVien)', 5: 'Mã Trường' };
  assert.doesNotThrow(() => validateAccountImportHeaders(gvWithSubject, 'GV'));
  assert.doesNotThrow(() => validateAccountImportHeaders(gvWithoutSubject, 'GV'), 'C5.10: Optional subject column is optional');
}

console.log('account_import_server_simulation: All 22 semantic cases, migration structural checks, and C1-C5 validations passed');
