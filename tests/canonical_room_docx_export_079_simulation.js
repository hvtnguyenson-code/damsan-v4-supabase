const assert = require('assert');
const fs = require('fs');

const bridge = require('../canonical_exam_print_bridge.js');
const teacherHtml = fs.readFileSync('giaovien.html', 'utf8');
const teacherOverlay = fs.readFileSync('teacher_canonical_export_079.js', 'utf8');
const aiHtml = fs.readFileSync('ai_exam.html', 'utf8');
const aiJs = fs.readFileSync('ai_exam.js', 'utf8');
const v8 = fs.readFileSync('Tron_De_Trac_Nghiem_V8.html', 'utf8');

console.log('=== CANONICAL ROOM DOCX EXPORT 079 ===');

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
assert(teacherHtml.includes('canonical_exam_print_bridge.js?v=20261013-canonical-room-docx-079'));
assert(teacherHtml.includes('teacher_canonical_export_079.js?v=20261013-canonical-room-docx-079'));
assert(teacherOverlay.includes('previewExamData'));
assert(teacherOverlay.includes('DamSanCanonicalPrint.exportCanonicalExams'));
assert(!/\.from\(['"]de_thi['"]\)/.test(teacherOverlay));

// C079-03: AI export is available only after PUBLISHED and re-reads canonical room state.
assert(aiHtml.includes('id="btnExportWord"'));
assert(aiHtml.includes('canonical_exam_print_bridge.js?v=20261013-canonical-room-docx-079'));
assert(aiHtml.includes('ai_exam.js?v=20261013-canonical-room-docx-079'));
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

// C079-05: no alternate Word renderer is introduced.
assert(!teacherOverlay.includes('Packer'));
assert(!aiJs.includes('Packer'));
assert(bridge.version === '20261013-canonical-room-docx-079');

console.log('PASS canonical_room_docx_export_079_simulation');
