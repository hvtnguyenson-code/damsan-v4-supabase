const assert=require('assert');
const fs=require('fs');
console.log('=== OMR BATCH UX 005 ===');
const html=fs.readFileSync('giaovien.html','utf8');
const studentHtml=fs.readFileSync('hoc_sinh.html','utf8');
const teacherModule=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const core=fs.readFileSync('omr/omr-core.js','utf8');
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

assert(teacherModule.includes('Camera chỉ đọc phiếu trên máy. Điểm chỉ được ghi sau khi giáo viên bấm Xác nhận & Lưu.'));
assert(teacherModule.includes('id="omrReviewUncertain"'));
assert(teacherModule.includes('preview.reviewedUncertain=reviewed'));
assert(teacherModule.includes("q('omrSbd').value=scan.sbd;"),'teacher UI must preserve all 8 SBD digits');
assert(!teacherModule.includes("replace(/^0+(?=\\d)/,''"),'teacher UI must never strip leading zeros from SBD');
assert(teacherModule.includes("SBD phiếu phải theo quy ước 00 + mã học sinh 6 số"));
assert(teacherModule.includes("q('omrSave').disabled=hasUncertain && !reviewed"));
assert(teacherModule.includes('confirm(') && teacherModule.includes('Lưu điểm'));
assert(teacherModule.includes("if(data.status==='conflict')"));
assert(teacherModule.includes('await openCamera()'),'batch flow returns to camera after confirmed save');
assert(!/\.from\(['"]ket_qua['"]\).*?(insert|update|upsert)/s.test(teacherModule),'teacher module never writes result table directly');
assert(!/\.from\(['"]de_thi['"]\).*?(insert|update|upsert|delete)/s.test(teacherModule),'teacher module never mutates exam table');

assert(write.includes("staffRpc('rpc_staff_submit_omr'"));
assert(write.includes('uncertain_scan_requires_review'));
assert(write.includes('uncertain_reviewed: preview.reviewedUncertain === true'));
assert(scoring.includes('options.allowUncertain !== true'));
assert(migration.includes('public.rpc_grade_submission(v_submission.id)'));
assert(!/insert\s+into\s+public\.ket_qua/i.test(migration));
assert(migration.includes("code','existing_result"));

assert(teacherModule.includes("autoScanEnabled:true"),'auto scan must default ON');
assert(teacherModule.includes("setInterval(()=>"),'auto scan loop missing');
assert(teacherModule.includes("fastTemplateRegistration"),'auto scan must validate outer-marker geometry before capture');
assert(teacherModule.includes("state.autoScanStable>=need"),'auto scan stability gate missing');
assert(teacherModule.includes("capture('auto')"),'auto capture trigger missing');
assert(teacherModule.includes("Chụp thủ công"),'manual capture fallback must remain');
assert(teacherModule.includes("Tự động: Bật"),'auto scan toggle missing');
assert(teacherModule.includes("await openCamera();"),'successful save must return to next scan automatically');

assert(core.includes("RECTIFIED_INK_HYBRID_V2"),'hybrid rectified ink engine marker missing');
assert(core.includes("warpTemplateGray"),'sheet must be rectified before recognition');
assert(core.includes("bubbleInkScore"),'per-pixel ink scorer missing');
assert(core.includes("fastTemplateRegistration"),'fast outer registration missing');
assert(core.includes("Có dấu tô ở nhiều ô; mức tô gần nhau"),'double-mark Vietnamese classification missing');
assert(core.includes("Nét tô mờ hoặc chưa kín ô"),'faint-mark Vietnamese classification missing');
assert(teacherModule.includes("Có '+details.length+' vị trí cần kiểm tra"),'warning list must show exact count');
assert(teacherModule.includes("Các ô liên quan đã được đánh dấu màu vàng"),'warning UI must highlight affected fields');
assert(core.includes("Phần II – Câu"),'warning labels must be Vietnamese');
assert(!/confidence/i.test(teacherModule),'teacher warning UX must not expose English technical jargon');
assert(write.includes("uncertain_details"),'warning details must be persisted for audit');
assert(write.includes("vi_tri")&&write.includes("ly_do"),'warning audit metadata must use clear Vietnamese keys');

console.log('PASS omr_batch_ux_005');

assert(teacherModule.includes("O.fastTemplateRegistration"),'auto scan must use fast outer registration');
assert(teacherModule.includes("const need=2"),'auto scan should capture after two stable frames');
assert(teacherModule.includes("},240);"),'auto scan probe interval should remain fast');
