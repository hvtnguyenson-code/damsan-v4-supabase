const assert = require('assert');
const fs = require('fs');

const bridge = require('../canonical_exam_print_bridge.js');
const teacherHtml = fs.readFileSync('giaovien.html', 'utf8');
const teacherOverlay = fs.readFileSync('teacher_canonical_export_079.js', 'utf8');
const aiHtml = fs.readFileSync('ai_exam.html', 'utf8');
const aiJs = fs.readFileSync('ai_exam.js', 'utf8');
const v8 = fs.readFileSync('Tron_De_Trac_Nghiem_V8.html', 'utf8');

console.log('=== CANONICAL ROOM DOCX EXPORT 079 + PRINT METADATA 080 ===');

// C079-01: canonical DB rows normalize to the exact print renderer shape.
const normalized = bridge.normalizeCanonicalExams([
  {
    ma_de: '501',
    cau_so: [
      { phan:'1', noi_dung:'Q1', A:'A1', B:'B1', C:'C1', D:'D1', dap_an_dung:'A' },
      { phan:'2', noi_dung:'Q2', A:'a2', B:'b2', C:'c2', D:'d2', dap_an_dung:'Đ-S-Đ-S' },
      { phan:'3', noi_dung:'Q3', dap_an_dung:'12,5' }
    ]
  },
  {
    ma_de: '502',
    cau_so: JSON.stringify([
      { Phan:'1', NoiDung:'Q4', DapAnA:'A4', DapAnB:'B4', DapAnC:'C4', DapAnD:'D4', DapAnDung:'D' }
    ])
  }
]);
assert.strictEqual(normalized.length, 4);
assert.deepStrictEqual(
  Object.keys(normalized[0]).sort(),
  ['Phan','MucDo','NoiDung','DapAnA','DapAnB','DapAnC','DapAnD','DapAnDung','CauSo','MaDe'].sort()
);
assert.strictEqual(normalized[0].CauSo, 'P1_1');
assert.strictEqual(normalized[1].CauSo, 'P2_1');
assert.strictEqual(normalized[2].CauSo, 'P3_1');
assert.strictEqual(normalized[3].CauSo, 'P1_1');
assert.strictEqual(normalized[3].MaDe, '502');
assert.strictEqual(normalized[3].DapAnDung, 'D');

// C079-02: teacher export consumes only rpc_staff_exam_preview data already loaded in previewExamData.
assert(teacherHtml.includes('id="btnExportPreviewWord"'));
assert(teacherHtml.includes('canonical_exam_print_bridge.js?v=20261013-canonical-room-print-080'));
assert(teacherHtml.includes('teacher_canonical_export_079.js?v=20261013-canonical-room-print-080'));
assert(teacherOverlay.includes('previewExamData'));
assert(teacherOverlay.includes('DamSanCanonicalPrint.exportCanonicalExams'));
assert(!/\.from\(['"]de_thi['"]\)/.test(teacherOverlay));

// C079-03: AI export is available only after PUBLISHED and re-reads canonical room state.
assert(aiHtml.includes('id="btnExportWord"'));
assert(aiHtml.includes('canonical_exam_print_bridge.js?v=20261013-canonical-room-print-080'));
assert(aiHtml.includes('ai_exam.js?v=20261013-canonical-room-print-080'));
assert(aiJs.includes("request.status !== 'PUBLISHED'"));
assert(aiJs.includes('request.publish_result?.phong_id'));
assert(aiJs.includes("rpc_staff_exam_preview"));
assert(aiJs.includes("source: 'ai-published-room'"));
assert(!/exportCanonicalExams\s*\(\s*request\.draft|variants_payload/.test(
  aiJs.slice(aiJs.indexOf('async function aieExportPublishedWord'), aiJs.indexOf('async function aieReject'))
), 'AI export must not use draft/variants payload as the archival source');

// C079-04: bridge page is same-origin, source-state preserving, and reuses the existing A4 exporter.
assert(v8.includes("data.type !== 'DAMSAN_EXPORT_CANONICAL_PRINT'"));
assert(v8.includes('ev.origin !== window.location.origin'));
assert(v8.includes('const previousDanhSach = danhSachDeThi'));
assert(v8.includes('danhSachDeThi = previousDanhSach'));
assert(v8.includes('exportWordExamOnly()'));
assert(v8.includes("type: 'DAMSAN_CANONICAL_PRINT_RESULT'"));


// C080-01: room metadata, not stale local print text, drives school/subject/class/duration/title.
assert(teacherOverlay.includes('canonicalRoomPrintContext080'));
assert(teacherOverlay.includes("pcTruong: String(room.TenTruong"));
assert(teacherOverlay.includes('pcKyThi: canonicalRoomPrintTitle080(room.TenDotKiemTra)'));
assert(teacherOverlay.includes('pcMon: canonicalRoomSubjectName080()'));
assert(teacherOverlay.includes("pcLop: (!className || /^TatCa$/i.test(className)) ? '' : className"));
assert(teacherOverlay.includes("duration + ' phút (không kể thời gian phát đề)'"));
assert(teacherOverlay.includes("if (/KTTX|THUONG[ _-]*XUYEN/.test(folded)) return 'KIỂM TRA THƯỜNG XUYÊN'"));

// C080-02: AI published export also re-reads canonical room metadata and subject name.
assert(aiJs.includes("rpc_lay_danh_sach_phong_thi_gv"));
assert(aiJs.includes("aieCanonicalRoomPrintContext080"));
assert(aiJs.includes("pcTruong: String(room.ten_truong"));
assert(aiJs.includes("pcKyThi: aieCanonicalPrintTitle080(room.ten_dot)"));
assert(aiJs.includes("pcMon: subjectName"));
assert(aiJs.includes("printContext"));
assert(aiJs.includes("aieSb.from('mon_hoc').select('id,ten_mon')"));

// C080-03: print context is temporary. Existing A4/font/margin profile remains authoritative and unchanged.
const canonicalHandler = v8.slice(
  v8.indexOf("if (data.type !== 'DAMSAN_EXPORT_CANONICAL_PRINT')"),
  v8.indexOf("let fpConfig =")
);
assert(canonicalHandler.includes("const previousPrintFields"));
assert(canonicalHandler.includes("const previousFpConfig"));
assert(canonicalHandler.includes("fpConfig = previousFpConfig"));
assert(canonicalHandler.includes("el.value = previousPrintFields[id]"));
assert(!canonicalHandler.includes("localStorage.setItem"), '080 canonical export must not persist temporary room metadata');
assert(!canonicalHandler.includes("fp_margin_"), '080 must not override the optimized A4 margin profile');
assert(!canonicalHandler.includes("fp_font"), '080 must not override the optimized font profile');

// C080-04: bridge carries metadata into the exact same renderer; it does not create a second layout engine.
const bridgeSource = fs.readFileSync('canonical_exam_print_bridge.js', 'utf8');
assert(bridgeSource.includes("printContext: options.printContext"));
assert(v8.includes("if (data.exportMode === 'answer') exportWordAnswerOnly()"));
assert(v8.includes("else exportWordExamOnly()"));

// C079-05: no alternate Word renderer is introduced.
assert(!teacherOverlay.includes('Packer'));
assert(!aiJs.includes('Packer'));
assert(bridge.version === '20261013-canonical-room-print-080');

console.log('PASS canonical_room_docx_export_079_simulation + print metadata 080');
