const assert=require('assert');
const fs=require('fs');
console.log('=== OMR BATCH UX 005 ===');
const html=fs.readFileSync('giaovien.html','utf8');
const studentHtml=fs.readFileSync('hoc_sinh.html','utf8');
const module=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const write=fs.readFileSync('omr/omr-result-write.js','utf8');
const scoring=fs.readFileSync('omr/omr-scoring.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261105143000_omr_staff_submission_004.sql','utf8');

assert.strictEqual((html.match(/id="omrTeacherNavBtn"/g)||[]).length,1,'exactly one OMR nav entry');
assert(html.includes('Chấm Phiếu'));
[
 'omr-template-moet-18-4-6.js',
 'omr-core.js',
 'omr-room-binding.js',
 'omr-scoring.js',
 'omr-result-write.js',
 'omr-teacher-module.js'
].forEach(name=>assert(html.includes(name),'teacher HTML loads '+name));
assert(html.includes('3. Bảng Điểm & Thống kê'),'existing dashboard label preserved');
assert(html.includes('4. Quản lý Tài khoản'),'existing account label preserved');
assert(!studentHtml.includes('omr-teacher-module.js'),'student runtime must remain untouched by OMR teacher UX');

assert(module.includes('Camera chỉ đọc phiếu trên máy. Điểm chỉ được ghi sau khi giáo viên bấm Xác nhận & Lưu.'));
assert(module.includes('id="omrReviewUncertain"'));
assert(module.includes('preview.reviewedUncertain=reviewed'));
assert(module.includes("q('omrSave').disabled=hasUncertain && !reviewed"));
assert(module.includes('confirm(') && module.includes('Lưu điểm'));
assert(module.includes("if(data.status==='conflict')"));
assert(module.includes('await openCamera()'),'batch flow returns to camera after confirmed save');
assert(!/\.from\(['"]ket_qua['"]\).*?(insert|update|upsert)/s.test(module),'teacher module never writes result table directly');
assert(!/\.from\(['"]de_thi['"]\).*?(insert|update|upsert|delete)/s.test(module),'teacher module never mutates exam table');

assert(write.includes("staffRpc('rpc_staff_submit_omr'"));
assert(write.includes('uncertain_scan_requires_review'));
assert(write.includes('uncertain_reviewed: preview.reviewedUncertain === true'));
assert(scoring.includes('options.allowUncertain !== true'));
assert(migration.includes('public.rpc_grade_submission(v_submission.id)'));
assert(!/insert\s+into\s+public\.ket_qua/i.test(migration));
assert(migration.includes("code','existing_result"));

console.log('PASS omr_batch_ux_005');
