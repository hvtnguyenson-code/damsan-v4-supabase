const assert = require('assert');
const fs = require('fs');

const exporter = fs.readFileSync('print_docx_exporter.js', 'utf8');
const v8 = fs.readFileSync('Tron_De_Trac_Nghiem_V8.html', 'utf8');
const teacherHtml = fs.readFileSync('giaovien.html', 'utf8');

// N077-01: native exporter is versioned and pinned to an explicit docx.js release.
assert(exporter.includes("20261013-native-docx-078"), 'N077-01 exporter version marker missing');
assert(exporter.includes("const DOCX_VERSION = '9.10.0'"), 'N077-01 docx.js version must be pinned');
assert(exporter.includes('cdn.jsdelivr.net/npm/docx@') && exporter.includes('unpkg.com/docx@'), 'N077-01 CDN fallback pair missing');

// N077-02: actual OOXML generator APIs are used; HTML altChunk wrappers are forbidden.
for (const token of ['new api.Document', 'api.Packer.toBlob', 'new api.Table', 'new api.ImageRun', 'new api.Footer', 'api.PageNumber.CURRENT', 'api.PageNumber.TOTAL_PAGES']) {
  assert(exporter.includes(token), 'N077-02 missing native DOCX primitive: ' + token);
}
assert(!/altChunk|htmlDocx|application\/msword/.test(exporter), 'N077-02 native exporter must not use HTML-as-Word/altChunk packaging');

// N077-03: A4 is explicit in OOXML section properties.
assert(exporter.includes('const A4_WIDTH_TWIP = 11906'), 'N077-03 A4 width missing');
assert(exporter.includes('const A4_HEIGHT_TWIP = 16838'), 'N077-03 A4 height missing');
assert(exporter.includes('orientation: api.PageOrientation.PORTRAIT'), 'N077-03 portrait A4 missing');
assert(exporter.includes('margin: ctx.margins'), 'N077-03 configured margins must flow to the native section');

// N077-04: exporter fails closed if the package is not a ZIP/OOXML blob.
assert(exporter.includes('bytes[0] !== 0x50') && exporter.includes('bytes[1] !== 0x4B'), 'N077-04 PK signature verification missing');
assert(exporter.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), 'N077-04 standard DOCX MIME missing');

// N077-05: tables/images are embedded into native Word structures.
assert(exporter.includes('tableFromElement') && exporter.includes('TableCell') && exporter.includes('TableRow'), 'N077-05 native table mapping missing');
assert(exporter.includes('decodeDataUrl') && exporter.includes('ImageRun'), 'N077-05 image embedding path missing');
assert(exporter.includes("if (!type) throw new Error"), 'N077-05 unsupported images must fail rather than silently disappear');

// N077-06: current print layout remains authoritative; only the download engine changes.
assert(v8.includes('@page WordSection1 { size: 595.3pt 841.9pt; margin: ${top}pt ${right}pt ${bot}pt ${left}pt;'), 'N077-06 legacy A4 layout source changed');
assert(v8.includes('if (maxL > 35)') && v8.includes('if (maxL > 14)'), 'N077-06 answer layout thresholds changed');
assert(v8.includes('tab-stops:120.0pt 240.0pt 360.0pt;'), 'N077-06 four-choice tab layout changed');
assert(v8.includes('tab-stops:240.0pt;'), 'N077-06 two-column choice tab layout changed');
assert(v8.includes('Mã đề ${md} - Trang') && v8.includes('NUMPAGES'), 'N077-06 footer layout source changed');
assert(v8.includes('----------HẾT---------'), 'N077-06 end-of-exam layout changed');

// N077-07: native export is default, but rollback is one switch and legacy bytes are preserved verbatim.
assert(v8.includes('function downloadLegacyWord(html, filename)'), 'N077-07 legacy exporter must remain available');
assert(v8.includes("type: 'application/msword'"), 'N077-07 legacy exporter payload changed');
assert(v8.includes("window.DAM_SAN_NATIVE_DOCX_ENABLED = true"), 'N077-07 native exporter must default ON');
assert(v8.includes("window.DAM_SAN_NATIVE_DOCX_ENABLED === false"), 'N077-07 emergency rollback switch missing');
assert(v8.includes("replace(/\\.doc$/i, '.docx')"), 'N077-07 output extension must become .docx');
assert(v8.includes('Chưa xuất file để tránh tạo Word giả'), 'N077-07 native failure must not silently emit a fake .doc');

// N077-08: frame cache is busted so deployed browsers receive the new exporter immediately.
assert(teacherHtml.includes('Tron_De_Trac_Nghiem_V8.html?v=20261013-canonical-room-docx-079'), 'N077-08 iframe cache marker missing');
assert(v8.includes('print_docx_exporter.js?v=20261013-native-docx-078'), 'N077-08 exporter cache marker missing');

// N077-09: online-room bridge remains present and independent.
assert(v8.includes("data.type === 'DAMSAN_GET_EXAMS'") && v8.includes("type: 'DAMSAN_EXAMS'"), 'N077-09 original DAMSAN_GET_EXAMS bridge must remain available');

// N077-10: answer export still uses the existing renderer and routes only at the final download boundary.
assert(v8.includes('function xuatDapAnWord('), 'N077-10 answer renderer missing');
assert(v8.includes('downloadWord(content, `DapAn_CacMaDe.doc`)'), 'N077-10 answer renderer should remain unchanged before packaging');

console.log('PASS native_docx_print_export_077_simulation');
