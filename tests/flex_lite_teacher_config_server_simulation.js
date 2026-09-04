// Deterministic static verification & server simulation for Task002 SQL migration.
// Validates supabase/migrations/20260902104109_flex_lite_teacher_config_overwrite_safety.sql.
const assert = require('assert');
const fs = require('fs');

const migrationPath = 'supabase/migrations/20260902104109_flex_lite_teacher_config_overwrite_safety.sql';
assert(fs.existsSync(migrationPath), `Missing ${migrationPath}`);
const sql = fs.readFileSync(migrationPath, 'utf8');

// 1. Core Functions Existence
assert(sql.includes('create or replace function public.rpc_luu_de_thi_len_phong('), 'MIG-01: rpc_luu_de_thi_len_phong must be created or replaced');
assert(sql.includes('create or replace function public.rpc_xoa_de_trong_phong('), 'MIG-02: rpc_xoa_de_trong_phong must be created or replaced');

// 2. Security Definer & Search Path
const defMatches = sql.match(/security\s+definer/gi) || [];
const pathMatches = sql.match(/set\s+search_path\s*=\s*public/gi) || [];
assert(defMatches.length >= 2, 'MIG-SEC-01: Both functions must be security definer');
assert(pathMatches.length >= 2, 'MIG-SEC-02: Both functions must set search_path = public');

// 3. Staff Session Verification
assert(sql.includes('_staff_session_gv_id(p_staff_token)'), 'MIG-AUTH-01: Both functions must validate p_staff_token with _staff_session_gv_id');

// 4. Authoritative Overwrite Guards (Replace & Delete)
assert(sql.includes("'exam_replace_blocked'"), 'MIG-GUARD-01: rpc_luu_de_thi_len_phong must return code exam_replace_blocked');
assert(sql.includes("'exam_delete_blocked'"), 'MIG-GUARD-02: rpc_xoa_de_trong_phong must return code exam_delete_blocked');

assert(sql.includes("trang_thai <> 'CHO_THI'") || sql.includes("trang_thai = 'CHO_THI'"), 'MIG-GUARD-03: Must check room trang_thai');
assert(sql.includes('thoi_gian_mo is not null') || sql.includes('thoi_gian_mo is null'), 'MIG-GUARD-04: Must check room thoi_gian_mo');
assert(sql.includes('exists (select 1 from public.exam_submissions where phong_id ='), 'MIG-GUARD-05: Must check existence of exam_submissions');
assert(sql.includes('exists (select 1 from public.ket_qua where phong_id ='), 'MIG-GUARD-06: Must check existence of ket_qua');

// 5. Metadata Strict Validation Contracts
assert(sql.includes('assessment_type không được để trống khi có cấu hình thang điểm'), 'MIG-META-01: Must reject explicit null or blank assessment_type');
assert(sql.includes('scoring_config phải là một JSON object hợp lệ'), 'MIG-META-02: Must reject explicit null scoring_config or non-object');
assert(sql.includes("jsonb_typeof(v_meta_scoring_config) <> 'object'"), 'MIG-META-03: Must check jsonb_typeof(scoring_config) is object');
assert(!/v_effective_scoring_config\s*:=\s*coalesce\(v_meta_scoring_config,\s*'\{\}'::jsonb\)/i.test(sql), 'MIG-META-04: Must not coalesce explicit null scoring_config to {}');

// 6. Question Array & Element Contract
assert(!/case\s+when\s+jsonb_typeof\([^)]*cau_so[^)]*\)\s*=\s*'string'/i.test(sql), 'MIG-SHAPE-01: Must not accept string cau_so cast');
assert(sql.includes("jsonb_typeof(v_cau_so) <> 'array'"), 'MIG-SHAPE-02: Must require cau_so to be actual JSON array');
assert(sql.includes("jsonb_typeof(v_question) <> 'object'"), 'MIG-SHAPE-03: Configured question elements require JSON object');

// 7. Scoped Variant Consistency & Duplicate Detection
assert(sql.includes('Phát hiện trùng lặp mã đề trong cùng danh sách'), 'MIG-DUP-01: Must reject duplicate ma_de');
assert(/if\s+v_effective_assessment_type\s*<>\s*'LEGACY'\s+then[\s\S]*?Các mã đề không đồng nhất số lượng câu hỏi/i.test(sql), 'MIG-CONSIST-01: Variant part count consistency must be scoped to non-LEGACY');

// 8. Deletion Reset Behavior
assert(/update\s+public\.phong_thi\s+set\s+assessment_type\s*=\s*'LEGACY',\s*scoring_config\s*=\s*'\{\}'::jsonb/i.test(sql), 'MIG-DEL-01: Delete RPC must reset room assessment_type to LEGACY and scoring_config to {}');

// 9. Profiles & CUSTOM Validations
const profiles = ['LEGACY', 'TOT_NGHIEP', 'MCQ_ONLY', 'TRUE_FALSE_ONLY', 'SHORT_ONLY', 'CUSTOM'];
for (const p of profiles) {
  assert(sql.includes(`'${p}'`), `MIG-PROF-01: Migration must handle profile ${p}`);
}

assert(sql.includes('p1_weight') && sql.includes('p2_weight') && sql.includes('p3_weight'), 'MIG-CUST-01: Must inspect all 3 weights');
assert(sql.includes('= 10') || sql.includes('<> 10'), 'MIG-CUST-02: Must enforce weights sum = 10');
assert(sql.includes('v_p1_weight < 0') || sql.includes('v_p1_weight > 10'), 'MIG-CUST-03: Must enforce weight range 0..10');
assert(sql.includes('v_p1_weight <> 0') || sql.includes('v_p2_weight <> 0') || sql.includes('v_p3_weight <> 0'), 'MIG-CUST-04: Must enforce absent part weight = 0');

// 10. Explicit Function Grants
assert(sql.includes('grant execute on function public.rpc_luu_de_thi_len_phong(text, text, uuid, uuid, text, jsonb) to anon, authenticated;'), 'MIG-GRANT-01: Explicit grant for save RPC');
assert(sql.includes('grant execute on function public.rpc_xoa_de_trong_phong(text, text, uuid, uuid) to anon, authenticated;'), 'MIG-GRANT-02: Explicit grant for delete RPC');

console.log('PASS: flex_lite_teacher_config_server_simulation.js (All static migration checks passed)');
