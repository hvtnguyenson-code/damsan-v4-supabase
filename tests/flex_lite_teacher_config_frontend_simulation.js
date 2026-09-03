// Deterministic frontend simulation & static verification for FLEX-LITE teacher config + parser fixes.
// Validates giaovien.js, giaovien.html, Tron_De_Trac_Nghiem_V8.html. No network.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// 1. READ ACTUAL SOURCES
const gvJsPath = 'giaovien.js';
const gvHtmlPath = 'giaovien.html';
const v8HtmlPath = 'Tron_De_Trac_Nghiem_V8.html';

assert(fs.existsSync(gvJsPath), `Missing ${gvJsPath}`);
assert(fs.existsSync(gvHtmlPath), `Missing ${gvHtmlPath}`);
assert(fs.existsSync(v8HtmlPath), `Missing ${v8HtmlPath}`);

const gvJs = fs.readFileSync(gvJsPath, 'utf8');
const gvHtml = fs.readFileSync(gvHtmlPath, 'utf8');
const v8Html = fs.readFileSync(v8HtmlPath, 'utf8');

// =========================================================================
// SECTION A: STATIC AST & STRUCTURE CHECKS
// =========================================================================

// 1. Exactly one shared panel in giaovien.html
const panelMatches = gvHtml.match(/id="flexLiteAssessmentPanel"/g);
assert(panelMatches && panelMatches.length === 1, 'CFG-PANEL-01: Exactly one flexLiteAssessmentPanel must exist in giaovien.html');

// 2. Panel contains all required IDs
const requiredIds = [
  'flexLiteAssessmentPanel',
  'flexLiteAssessmentType',
  'flexLiteCustomWeights',
  'flexLiteP1Weight',
  'flexLiteP2Weight',
  'flexLiteP3Weight'
];
for (const id of requiredIds) {
  assert(gvHtml.includes(`id="${id}"`), `CFG-PANEL-02: giaovien.html must contain id="${id}"`);
}

// 3. UI Select contains exactly 5 profiles (NO LEGACY)
const selectBlockMatch = gvHtml.match(/<select\s+id="flexLiteAssessmentType"[\s\S]*?<\/select>/i);
assert(selectBlockMatch, 'CFG-PANEL-03: flexLiteAssessmentType select must exist');
const selectBlock = selectBlockMatch[0];

assert(!/value="LEGACY"/i.test(selectBlock), 'CFG-PANEL-04: UI must NOT contain LEGACY option');
const expectedOptions = ['TOT_NGHIEP', 'MCQ_ONLY', 'TRUE_FALSE_ONLY', 'SHORT_ONLY', 'CUSTOM'];
for (const opt of expectedOptions) {
  assert(selectBlock.includes(`value="${opt}"`), `CFG-PANEL-05: Select must contain option ${opt}`);
}
const optionMatches = selectBlock.match(/<option\s+value="([^"]+)"/g) || [];
assert.strictEqual(optionMatches.length, 5, 'CFG-PANEL-06: Select must have exactly 5 options');

// 3b. TOT_NGHIEP UI Contract check
const totNghiepOptionMatch = selectBlock.match(/<option\s+value="TOT_NGHIEP"[^>]*>([\s\S]*?)<\/option>/i);
assert(totNghiepOptionMatch, 'CFG-TOT-01: TOT_NGHIEP option must exist');
const totNghiepLabel = totNghiepOptionMatch[1];
assert(totNghiepLabel.includes('chấm điểm thô'), 'CFG-TOT-02: TOT_NGHIEP option must contain "chấm điểm thô"');
assert(!totNghiepLabel.includes('0.5'), 'CFG-TOT-03: TOT_NGHIEP option must NOT contain "0.5"');
assert(!/quy\s+đổi\s+thang\s+10/i.test(totNghiepLabel), 'CFG-TOT-04: TOT_NGHIEP option must NOT contain "quy đổi thang 10"');

// 4. Feature flag exists and is strictly true
assert(
  /const\s+FLEX_LITE_TEACHER_CONFIG_ENABLED\s*=\s*true\s*;/i.test(gvJs),
  'CFG-FLAG-01: FLEX_LITE_TEACHER_CONFIG_ENABLED must exist in giaovien.js and be true'
);

// 5. Centralized validator exists and does not compute final score
assert(
  /function\s+validateFlexLiteAssessmentForSave\s*\(/.test(gvJs),
  'CFG-VAL-01: validateFlexLiteAssessmentForSave must exist in giaovien.js'
);
const valFnBodyMatch = gvJs.match(/function\s+validateFlexLiteAssessmentForSave\s*\([^)]*\)\s*\{([\s\S]*?\n)\}/);
assert(valFnBodyMatch, 'CFG-VAL-02: validateFlexLiteAssessmentForSave body extracted');
const valFnBody = valFnBodyMatch[1];
assert(!/final_score\s*=/i.test(valFnBody) && !/\/\s*v_p\d_max\s*\*\s*10/i.test(valFnBody), 'CFG-VAL-03: validateFlexLiteAssessmentForSave must not calculate final scores');

// 6. Snapshot function exists
assert(
  /function\s+snapshotFlexLiteAssessmentConfig\s*\(/.test(gvJs),
  'CFG-SNAP-01: snapshotFlexLiteAssessmentConfig must exist in giaovien.js'
);

// 7. xoaDeTrongPhong uses safe staffRpc and deprecates exam_delete_only
const xoaDeBodyMatch = gvJs.match(/async\s+function\s+xoaDeTrongPhong\s*\([^)]*\)\s*\{([\s\S]*?\n)\}/);
assert(xoaDeBodyMatch, 'CFG-DEL-01: xoaDeTrongPhong body extracted');
const xoaDeBody = xoaDeBodyMatch[1];
assert(xoaDeBody.includes("staffRpc('rpc_xoa_de_trong_phong'"), 'CFG-DEL-02: xoaDeTrongPhong must call staffRpc rpc_xoa_de_trong_phong');
assert(!/^\s*(?:await\s+)?adminRpc\('exam_delete_only'/m.test(xoaDeBody), 'CFG-DEL-03: xoaDeTrongPhong must not execute adminRpc exam_delete_only');

// 8. All 4 creation paths call snapshot & converge on luuDeThiLenSupabase
assert(/function\s+dayDeThuCong[\s\S]*?snapshotFlexLiteAssessmentConfig\(\)[\s\S]*?luuDeThiLenSupabase\(danhSachDeThi,\s*assessmentConfig\)/.test(gvJs), 'Manual path snapshots & passes config to save');
assert(/async\s+function\s+generateFromMatrix[\s\S]*?snapshotFlexLiteAssessmentConfig\(\)[\s\S]*?luuDeThiLenSupabase\(danhSachDeThi,\s*assessmentConfig\)/.test(gvJs), 'Matrix path snapshots & passes config to save');
assert(/async\s+function\s+layDeTuIframe[\s\S]*?snapshotFlexLiteAssessmentConfig\(\)[\s\S]*?luuDeThiLenSupabase\(danhSachDeIframe,\s*assessmentConfig\)/.test(gvJs), 'Iframe path snapshots & passes config to save');
assert(/window\.processFile\s*=\s*async\s+function[\s\S]*?snapshotFlexLiteAssessmentConfig\(\)[\s\S]*?window\.continueProcessingFile/.test(gvJs), 'Direct Word path snapshots config before processing');

// =========================================================================
// SECTION B: BASELINE REGRESSION GUARDS FOR GIAOVIEN.JS
// =========================================================================

// REG-01: Initialization & Subtab switching
assert(
  /function\s+khoiTaoGiaoDienHeThong\s*\(\)\s*\{[\s\S]*?syncFlexLiteAssessmentPanel\('direct'\);/.test(gvJs),
  'REG-01a: khoiTaoGiaoDienHeThong must call syncFlexLiteAssessmentPanel("direct")'
);
assert(
  /function\s+switchSubTabTaoDe\s*\(\s*mode\s*\)\s*\{[\s\S]*?syncFlexLiteAssessmentPanel\(\s*mode\s*\);/.test(gvJs),
  'REG-01b: switchSubTabTaoDe must call syncFlexLiteAssessmentPanel(mode)'
);
const switchTabMatch = gvJs.match(/function\s+switchTab\s*\([^)]*\)\s*\{([\s\S]*?\n)\}/);
assert(switchTabMatch, 'REG-01c: switchTab extracted');
assert(
  !switchTabMatch[1].includes("syncFlexLiteAssessmentPanel('direct')"),
  'REG-01d: switchTab must NOT blindly force syncFlexLiteAssessmentPanel("direct")'
);

// REG-02: Matrix creation path integrity
const matrixMatch = gvJs.match(/async\s+function\s+generateFromMatrix\s*\([^)]*\)\s*\{([\s\S]*?\n)\}/);
assert(matrixMatch, 'REG-02a: generateFromMatrix extracted');
const matrixBody = matrixMatch[1];
assert(matrixBody.includes('if (fullBankData.length === 0) await fetchFullBank(true);'), 'REG-02b: generateFromMatrix has fetchFullBank fallback');
assert(matrixBody.includes('let selectedQuestions = new Array();'), 'REG-02c: generateFromMatrix declares selectedQuestions');
assert(matrixBody.includes('if (selectedQuestions.length === 0) throw new Error'), 'REG-02d: generateFromMatrix has empty-selection guard');

// REG-03: Dashboard fetch integrity
const dashMatch = gvJs.match(/async\s+function\s+fetchDashboard\s*\([^)]*\)\s*\{([\s\S]*?\n)\}/);
assert(dashMatch, 'REG-03a: fetchDashboard extracted');
const dashBody = dashMatch[1];
assert(dashBody.includes('let pArr = new Array();'), 'REG-03b: fetchDashboard declares pArr');
assert(dashBody.includes('rpc_lay_ket_qua_phong_gv'), 'REG-03c: fetchDashboard pushes grade-result RPC');
assert(dashBody.includes('let myFetchId = ++globalFetchDashId;'), 'REG-03d: fetchDashboard declares myFetchId');
assert(
  dashBody.includes('if (myFetchId !== globalFetchDashId)') &&
    dashBody.includes("return { status: 'stale' };"),
  'REG-03e: fetchDashboard returns structured stale status when fetch ID is stale'
);

// REG-04: Preview rendering integrity
const previewMatch = gvJs.match(/function\s+renderPreviewContent\s*\([^)]*\)\s*\{([\s\S]*?\n)\}/);
assert(previewMatch, 'REG-04a: renderPreviewContent extracted');
const previewBody = previewMatch[1];
assert(previewBody.includes('previewCountMsg'), 'REG-04b: renderPreviewContent updates previewCountMsg');
assert(previewBody.includes('let p1 = examArray.filter'), 'REG-04c: renderPreviewContent declares p1 from examArray');

// REG-05: Quarantine rendering integrity
const qrtMatch = gvJs.match(/(?:window\.)?renderQuarantineItem\s*=\s*function\s*\([^)]*\)\s*\{([\s\S]*?\n)\};/);
assert(qrtMatch, 'REG-05a: renderQuarantineItem extracted');
const qrtBody = qrtMatch[1];
assert(qrtBody.includes('qrt-noidung'), 'REG-05b: renderQuarantineItem resets qrt-noidung');
assert(qrtBody.includes('changePhanQrt()'), 'REG-05c: renderQuarantineItem calls changePhanQrt');

// =========================================================================
// SECTION C: EVALUATING ACTUAL PARSERS (ONLINE & V8) IN VM
// =========================================================================

// Setup minimal mock browser environment for VM execution
function createVMEnv(domValues = {}) {
  const elements = {};
  function getEl(id) {
    if (!elements[id]) {
      const defaultVal = domValues[id] !== undefined
        ? domValues[id]
        : (id === 'flexLiteAssessmentType' ? 'TOT_NGHIEP' : '');
      elements[id] = {
        id,
        value: defaultVal,
        checked: false,
        style: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        appendChild: () => {},
        insertBefore: () => {},
        addEventListener: () => {},
        removeEventListener: () => {}
      };
    }
    return elements[id];
  }
  const sandbox = {
    console,
    Math,
    Object,
    Array,
    String,
    Number,
    RegExp,
    parseFloat,
    parseInt,
    isNaN,
    JSON,
    Reflect,
    setTimeout: (fn) => {},
    clearTimeout: (id) => {},
    setInterval: (fn) => {},
    clearInterval: (id) => {},
    safeHTML: (h) => (h || '').trim(),
    supabase: {
      createClient: () => ({
        from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [] }) }) }),
        rpc: () => Promise.resolve({ data: null, error: null })
      })
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    document: {
      createElement: (tag) => ({
        src: '',
        style: {},
        innerHTML: '',
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        appendChild: () => {},
        insertBefore: () => {}
      }),
      getElementById: (id) => getEl(id),
      querySelectorAll: () => [],
      querySelector: () => null,
      head: { appendChild: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  return sandbox;
}

// 1. Setup Online Parser (giaovien.js)
const gvContext = createVMEnv();
vm.createContext(gvContext);
vm.runInContext(gvJs, gvContext);

assert(typeof gvContext.parseHTMLToJSON === 'function', 'parseHTMLToJSON must exist in giaovien.js');
const parseOnline = gvContext.parseHTMLToJSON;

// 2. Setup V8 Parser (Tron_De_Trac_Nghiem_V8.html)
const allScripts = v8Html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
let v8Script = '';
for (const s of allScripts) {
  const content = s.replace(/<script\b[^>]*>|<\/script>/gi, '');
  if (content.includes('parseHTMLToJSON')) {
    v8Script = content;
    break;
  }
}
assert(v8Script, 'Could not find script block with parseHTMLToJSON in Tron_De_Trac_Nghiem_V8.html');

const v8Context = createVMEnv();
vm.createContext(v8Context);
vm.runInContext(v8Script, v8Context);

assert(typeof v8Context.parseHTMLToJSON === 'function', 'parseHTMLToJSON must be defined in V8 script');
const parseV8 = v8Context.parseHTMLToJSON;

// Helper to run fixtures on BOTH actual parsers
function verifyBothParsers(testName, html, expectedCounts) {
  const parsers = [
    { name: 'parseOnline (giaovien.js)', fn: parseOnline },
    { name: 'parseV8 (Tron_De_Trac_Nghiem_V8.html)', fn: parseV8 }
  ];

  for (const p of parsers) {
    const res = p.fn(html);
    assert(res && res.hopLe, `${testName} [${p.name}]: Parsing must be hopLe=true`);
    const duLieu = res.duLieu || [];
    assert.strictEqual(
      duLieu.length,
      expectedCounts.total,
      `${testName} [${p.name}]: Total count must be ${expectedCounts.total}, got ${duLieu.length}`
    );

    const p1Count = duLieu.filter(q => String(q.Phan ?? q.phan) === '1').length;
    const p2Count = duLieu.filter(q => String(q.Phan ?? q.phan) === '2').length;
    const p3Count = duLieu.filter(q => String(q.Phan ?? q.phan) === '3').length;

    assert.strictEqual(p1Count, expectedCounts.p1, `${testName} [${p.name}]: P1 count must be ${expectedCounts.p1}, got ${p1Count}`);
    assert.strictEqual(p2Count, expectedCounts.p2, `${testName} [${p.name}]: P2 count must be ${expectedCounts.p2}, got ${p2Count}`);
    assert.strictEqual(p3Count, expectedCounts.p3, `${testName} [${p.name}]: P3 count must be ${expectedCounts.p3}, got ${p3Count}`);
  }
}

// --- PARSER FIXTURES (PARSER-01 through PARSER-12) ---

// PARSER-01: Section I only
{
  const html = `
    <p><b>PHẦN I: CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN</b></p>
    <p><b>Câu 1:</b> Thủ đô của Việt Nam là gì?</p>
    <p>A. Hà Nội</p><p>B. TP.HCM</p><p>C. Đà Nẵng</p><p>D. Cần Thơ</p>
    <p>Đáp án: A</p>
  `;
  verifyBothParsers('PARSER-01', html, { total: 1, p1: 1, p2: 0, p3: 0 });
}

// PARSER-02: Section II only
{
  const html = `
    <p><b>PHẦN II: CÂU HỎI ĐÚNG SAI</b></p>
    <p><b>Câu 1:</b> Cho hàm số f(x). Xét tính đúng sai:</p>
    <p>a) f(0) = 1</p><p>b) f'(x) > 0</p><p>c) Đồ thị đi qua gốc tọa độ</p><p>d) Hàm số đồng biến trên R</p>
    <p>Đáp án: Đ-S-Đ-S</p>
  `;
  verifyBothParsers('PARSER-02', html, { total: 1, p1: 0, p2: 1, p3: 0 });
}

// PARSER-03: Section III only
{
  const html = `
    <p><b>PHẦN III: CÂU HỎI TRẢ LỜI NGẮN</b></p>
    <p><b>Câu 1:</b> Tìm giá trị nhỏ nhất của hàm số y = x^2 + 2x + 3.</p>
    <p>Đáp án: 2</p>
  `;
  verifyBothParsers('PARSER-03', html, { total: 1, p1: 0, p2: 0, p3: 1 });
}

// PARSER-04: Section I + Section II
{
  const html = `
    <p><b>PHẦN I: TRẮC NGHIỆM</b></p>
    <p><b>Câu 1:</b> 1 + 1 = ?</p>
    <p>A. 2</p><p>B. 3</p><p>C. 4</p><p>D. 5</p>
    <p>Đáp án: A</p>
    <p><b>PHẦN II: ĐÚNG SAI</b></p>
    <p><b>Câu 1:</b> Số 2 là số chẵn?</p>
    <p>a) Đúng</p><p>b) Sai</p><p>c) Đúng</p><p>d) Sai</p>
    <p>Đáp án: Đ-S-Đ-S</p>
  `;
  verifyBothParsers('PARSER-04', html, { total: 2, p1: 1, p2: 1, p3: 0 });
}

// PARSER-05: Section I + Section III
{
  const html = `
    <p><b>PHẦN I: TRẮC NGHIỆM</b></p>
    <p><b>Câu 1:</b> 2 + 2 = ?</p>
    <p>A. 4</p><p>B. 5</p><p>C. 6</p><p>D. 7</p>
    <p>Đáp án: A</p>
    <p><b>PHẦN III: TRẢ LỜI NGẮN</b></p>
    <p><b>Câu 1:</b> Căn bậc hai của 16 là bao nhiêu?</p>
    <p>Đáp án: 4</p>
  `;
  verifyBothParsers('PARSER-05', html, { total: 2, p1: 1, p2: 0, p3: 1 });
}

// PARSER-06: Section II + Section III
{
  const html = `
    <p><b>PHẦN II: CÂU HỎI ĐÚNG SAI</b></p>
    <p><b>Câu 1:</b> Mệnh đề toán học:</p>
    <p>a) 2 > 1</p><p>b) 3 < 2</p><p>c) 4 = 4</p><p>d) 5 != 5</p>
    <p>Đáp án: Đ-S-Đ-S</p>
    <p><b>PHẦN III: CÂU HỎI TRẢ LỜI NGẮN</b></p>
    <p><b>Câu 1:</b> 10 / 2 = ?</p>
    <p>Đáp án: 5</p>
  `;
  verifyBothParsers('PARSER-06', html, { total: 2, p1: 0, p2: 1, p3: 1 });
}

// PARSER-07: Section I + Section II + Section III
{
  const html = `
    <p><b>PHẦN I: TRẮC NGHIỆM</b></p>
    <p><b>Câu 1:</b> Q1</p>
    <p>A. a</p><p>B. b</p><p>C. c</p><p>D. d</p>
    <p>Đáp án: A</p>
    <p><b>PHẦN II: ĐÚNG SAI</b></p>
    <p><b>Câu 1:</b> Q2</p>
    <p>a) a</p><p>b) b</p><p>c) c</p><p>d) d</p>
    <p>Đáp án: Đ-S-Đ-S</p>
    <p><b>PHẦN III: TRẢ LỜI NGẮN</b></p>
    <p><b>Câu 1:</b> Q3</p>
    <p>Đáp án: 42</p>
  `;
  verifyBothParsers('PARSER-07', html, { total: 3, p1: 1, p2: 1, p3: 1 });
}

// PARSER-08: Heading with &nbsp;
{
  const html = `
    <p><b>PHẦN&nbsp;II:</b>&nbsp;CÂU HỎI ĐÚNG SAI</p>
    <p><b>Câu 1:</b> Q1</p>
    <p>a) a</p><p>b) b</p><p>c) c</p><p>d) d</p>
    <p>Đáp án: Đ-S-Đ-S</p>
    <p><b>PHẦN&nbsp;III:</b>&nbsp;TRẢ LỜI NGẮN</p>
    <p><b>Câu 1:</b> Q2</p>
    <p>Đáp án: 100</p>
  `;
  verifyBothParsers('PARSER-08', html, { total: 2, p1: 0, p2: 1, p3: 1 });
}

// PARSER-09: Heading with inline HTML tags (<b>, <i>, <span>)
{
  const html = `
    <p><b>PHẦN&nbsp;II:</b>&nbsp;<i><span>CÂU HỎI ĐÚNG SAI</span></i></p>
    <p><b>Câu 1:</b> Q1</p>
    <p>a) a</p><p>b) b</p><p>c) c</p><p>d) d</p>
    <p>Đáp án: Đ-S-Đ-S</p>
    <p><b>PHẦN&nbsp;III:</b>&nbsp;<span>TRẢ LỜI NGẮN</span></p>
    <p><b>Câu 1:</b> Q2</p>
    <p>Đáp án: 100</p>
  `;
  verifyBothParsers('PARSER-09', html, { total: 2, p1: 0, p2: 1, p3: 1 });
}

// PARSER-10: P1 questions before PHẦN II, WITHOUT heading PHẦN I => keeps P1 + P2
{
  const html = `
    <p><b>Câu 1:</b> Câu hỏi trắc nghiệm không có tiêu đề Phần 1</p>
    <p>A. Đáp án A</p><p>B. Đáp án B</p><p>C. Đáp án C</p><p>D. Đáp án D</p>
    <p>Đáp án: A</p>
    <p><b>PHẦN II: CÂU HỎI ĐÚNG SAI</b></p>
    <p><b>Câu 1:</b> Câu hỏi đúng sai</p>
    <p>a) a</p><p>b) b</p><p>c) c</p><p>d) d</p>
    <p>Đáp án: Đ-S-Đ-S</p>
  `;
  verifyBothParsers('PARSER-10', html, { total: 2, p1: 1, p2: 1, p3: 0 });
}

// PARSER-11: P1 questions before PHẦN III, WITHOUT heading PHẦN I => keeps P1 + P3
{
  const html = `
    <p><b>Câu 1:</b> Câu hỏi trắc nghiệm không có tiêu đề Phần 1</p>
    <p>A. Đáp án A</p><p>B. Đáp án B</p><p>C. Đáp án C</p><p>D. Đáp án D</p>
    <p>Đáp án: B</p>
    <p><b>PHẦN III: CÂU HỎI TRẢ LỜI NGẮN</b></p>
    <p><b>Câu 1:</b> Câu hỏi trả lời ngắn</p>
    <p>Đáp án: 99</p>
  `;
  verifyBothParsers('PARSER-11', html, { total: 2, p1: 1, p2: 0, p3: 1 });
}

// PARSER-12: P1 questions before PHẦN II then PHẦN III, WITHOUT heading PHẦN I => keeps P1 + P2 + P3
{
  const html = `
    <p><b>Câu 1:</b> Câu hỏi trắc nghiệm không có tiêu đề Phần 1</p>
    <p>A. Đáp án A</p><p>B. Đáp án B</p><p>C. Đáp án C</p><p>D. Đáp án D</p>
    <p>Đáp án: C</p>
    <p><b>PHẦN II: CÂU HỎI ĐÚNG SAI</b></p>
    <p><b>Câu 1:</b> Câu hỏi đúng sai</p>
    <p>a) a</p><p>b) b</p><p>c) c</p><p>d) d</p>
    <p>Đáp án: Đ-S-Đ-S</p>
    <p><b>PHẦN III: CÂU HỎI TRẢ LỜI NGẮN</b></p>
    <p><b>Câu 1:</b> Câu hỏi trả lời ngắn</p>
    <p>Đáp án: 123</p>
  `;
  verifyBothParsers('PARSER-12', html, { total: 3, p1: 1, p2: 1, p3: 1 });
}

// =========================================================================
// SECTION D: EVALUATING VALIDATOR AND DOM SNAPSHOT LOGIC
// =========================================================================

assert(typeof gvContext.validateFlexLiteAssessmentForSave === 'function', 'validateFlexLiteAssessmentForSave must be exposed');
const validateFn = gvContext.validateFlexLiteAssessmentForSave;

// CFG-01: TOT_NGHIEP valid
{
  const exam = [
    { MaDe: '101', Phan: '1', NoiDung: 'Q1' },
    { MaDe: '101', Phan: '2', NoiDung: 'Q2' },
    { MaDe: '101', Phan: '3', NoiDung: 'Q3' }
  ];
  const config = { assessment_type: 'TOT_NGHIEP', scoring_config: {} };
  const res = validateFn(exam, config);
  assert(res.valid, 'CFG-01: TOT_NGHIEP mixed must be valid');
}

// CFG-02: MCQ_ONLY P1 valid
{
  const exam = [
    { MaDe: '101', Phan: '1', NoiDung: 'Q1' },
    { MaDe: '101', Phan: '1', NoiDung: 'Q2' }
  ];
  const config = { assessment_type: 'MCQ_ONLY', scoring_config: {} };
  const res = validateFn(exam, config);
  assert(res.valid, 'CFG-02: MCQ_ONLY with all P1 must be valid');
}

// CFG-03: MCQ_ONLY with P2 invalid
{
  const exam = [
    { MaDe: '101', Phan: '1', NoiDung: 'Q1' },
    { MaDe: '101', Phan: '2', NoiDung: 'Q2' }
  ];
  const config = { assessment_type: 'MCQ_ONLY', scoring_config: {} };
  assert.throws(() => validateFn(exam, config), /MCQ_ONLY|Phần 1/i, 'CFG-03: MCQ_ONLY with P2 must throw error');
}

// CFG-04: TRUE_FALSE_ONLY P2 valid
{
  const exam = [
    { MaDe: '101', Phan: '2', NoiDung: 'Q1' },
    { MaDe: '101', Phan: '2', NoiDung: 'Q2' }
  ];
  const config = { assessment_type: 'TRUE_FALSE_ONLY', scoring_config: {} };
  const res = validateFn(exam, config);
  assert(res.valid, 'CFG-04: TRUE_FALSE_ONLY with all P2 must be valid');
}

// CFG-05: SHORT_ONLY P3 valid
{
  const exam = [
    { MaDe: '101', Phan: '3', NoiDung: 'Q1' },
    { MaDe: '101', Phan: '3', NoiDung: 'Q2' }
  ];
  const config = { assessment_type: 'SHORT_ONLY', scoring_config: {} };
  const res = validateFn(exam, config);
  assert(res.valid, 'CFG-05: SHORT_ONLY with all P3 must be valid');
}

// CFG-06: CUSTOM valid
{
  const exam = [
    { MaDe: '101', Phan: '1', NoiDung: 'Q1' },
    { MaDe: '101', Phan: '2', NoiDung: 'Q2' },
    { MaDe: '101', Phan: '3', NoiDung: 'Q3' }
  ];
  const config = {
    assessment_type: 'CUSTOM',
    scoring_config: { p1_weight: 4, p2_weight: 4, p3_weight: 2 }
  };
  const res = validateFn(exam, config);
  assert(res.valid, 'CFG-06: Valid CUSTOM weights must pass');
}

// CFG-07: CUSTOM weight sum invalid
{
  const exam = [
    { MaDe: '101', Phan: '1', NoiDung: 'Q1' },
    { MaDe: '101', Phan: '2', NoiDung: 'Q2' }
  ];
  const config = {
    assessment_type: 'CUSTOM',
    scoring_config: { p1_weight: 5, p2_weight: 4, p3_weight: 2 } // sum = 11
  };
  assert.throws(() => validateFn(exam, config), /Tổng các trọng số CUSTOM phải bằng đúng 10/i, 'CFG-07: CUSTOM sum != 10 must throw error');
}

// CFG-08: CUSTOM null/NaN/nonfinite invalid
{
  const exam = [{ MaDe: '101', Phan: '1', NoiDung: 'Q1' }];
  const configNull = {
    assessment_type: 'CUSTOM',
    scoring_config: { p1_weight: 10, p2_weight: null, p3_weight: null }
  };
  assert.throws(() => validateFn(exam, configNull), /mang giá trị null|số hợp lệ/i, 'CFG-08a: Null weight must throw error');

  const configNaN = {
    assessment_type: 'CUSTOM',
    scoring_config: { p1_weight: 10, p2_weight: NaN, p3_weight: 0 }
  };
  assert.throws(() => validateFn(exam, configNaN), /số hợp lệ/i, 'CFG-08b: NaN weight must throw error');
}

// CFG-09: absent part nonzero weight invalid
{
  const exam = [{ MaDe: '101', Phan: '1', NoiDung: 'Q1' }];
  const config = {
    assessment_type: 'CUSTOM',
    scoring_config: { p1_weight: 6, p2_weight: 4, p3_weight: 0 } // P2 is absent
  };
  assert.throws(() => validateFn(exam, config), /Trọng số Phần 2 phải bằng 0/i, 'CFG-09: Absent part with weight > 0 must throw error');
}

// CFG-10: unknown part invalid
{
  const exam = [{ MaDe: '101', Phan: '4', NoiDung: 'Q1' }];
  const config = { assessment_type: 'TOT_NGHIEP', scoring_config: {} };
  assert.throws(() => validateFn(exam, config), /Phát hiện phần câu hỏi không hợp lệ/i, 'CFG-10: Unknown part 4 must throw error');
}

// CFG-11: variants different part counts invalid
{
  const exam = [
    { MaDe: '101', Phan: '1', NoiDung: 'Q1' },
    { MaDe: '101', Phan: '2', NoiDung: 'Q2' },
    { MaDe: '102', Phan: '1', NoiDung: 'Q1' },
    { MaDe: '102', Phan: '1', NoiDung: 'Q2' } // 102 has 2 P1s instead of 1 P1 + 1 P2
  ];
  const config = { assessment_type: 'TOT_NGHIEP', scoring_config: {} };
  assert.throws(() => validateFn(exam, config), /không đồng nhất số lượng câu hỏi hoặc cấu trúc phần/i, 'CFG-11: Different part counts between variants must throw error');
}

// CFG-12: Empty exam validation guard
{
  const config = { assessment_type: 'TOT_NGHIEP', scoring_config: {} };
  assert.throws(() => validateFn([], config), /Đề thi không có câu hỏi nào để lưu/i, 'CFG-12a: Empty exam array must throw error');
  assert.throws(() => validateFn(null, config), /Đề thi không có câu hỏi nào để lưu/i, 'CFG-12b: Non-array exam must throw error');
}

// =========================================================================
// SECTION E: DOM UI SYNC, ACTIVE SNAPSHOT AND CUSTOM WEIGHT TESTS
// =========================================================================

// UI-01: syncFlexLiteAssessmentPanel across creation modes & unsupported modes
{
  const uiEnv = createVMEnv();
  vm.createContext(uiEnv);
  vm.runInContext(gvJs, uiEnv);

  const panel = uiEnv.document.getElementById('flexLiteAssessmentPanel');
  const customWeights = uiEnv.document.getElementById('flexLiteCustomWeights');
  const typeSelect = uiEnv.document.getElementById('flexLiteAssessmentType');

  // Creation modes must display the panel
  for (const mode of ['direct', 'manual', 'matrix', 'offline']) {
    panel.style.display = 'none';
    uiEnv.syncFlexLiteAssessmentPanel(mode);
    assert.strictEqual(panel.style.display, 'block', `UI-01: ${mode} mode must display panel`);
  }

  // Non-create / unsupported modes must hide the panel
  for (const unsupportedMode of ['bank', 'room', 'view', null, 'unknown']) {
    panel.style.display = 'block';
    uiEnv.syncFlexLiteAssessmentPanel(unsupportedMode);
    assert.strictEqual(panel.style.display, 'none', `UI-01: ${unsupportedMode} mode must hide panel`);
  }

  // CUSTOM selection shows custom-weight inputs
  typeSelect.value = 'CUSTOM';
  uiEnv.syncFlexLiteAssessmentPanel('direct');
  assert.strictEqual(panel.style.display, 'block', 'UI-01: direct mode displays panel with CUSTOM');
  assert.strictEqual(customWeights.style.display, 'block', 'UI-01: CUSTOM displays custom weights');

  // Non-CUSTOM profiles hide custom-weight inputs
  for (const profile of ['TOT_NGHIEP', 'MCQ_ONLY', 'TRUE_FALSE_ONLY', 'SHORT_ONLY']) {
    typeSelect.value = profile;
    uiEnv.onFlexLiteAssessmentTypeChange();
    assert.strictEqual(customWeights.style.display, 'none', `UI-01: ${profile} hides custom weights`);
  }
}

// UI-02: Active snapshot generation for all 5 teacher profiles
{
  // Non-CUSTOM profiles return active metadata with empty scoring_config
  for (const profile of ['TOT_NGHIEP', 'MCQ_ONLY', 'TRUE_FALSE_ONLY', 'SHORT_ONLY']) {
    const ctx = createVMEnv({ flexLiteAssessmentType: profile });
    vm.createContext(ctx);
    vm.runInContext(gvJs, ctx);
    const snap = ctx.snapshotFlexLiteAssessmentConfig();
    assert.notStrictEqual(snap, null, `UI-02: Profile ${profile} snapshot must not be null when active`);
    assert.strictEqual(snap.assessment_type, profile, `UI-02: Profile ${profile} assessment_type must match`);
    assert.strictEqual(typeof snap.scoring_config, 'object', `UI-02: Profile ${profile} scoring_config must be object`);
    assert.strictEqual(Object.keys(snap.scoring_config).length, 0, `UI-02: Profile ${profile} scoring_config must be empty`);
  }

  // Default snapshot (without explicit override) is TOT_NGHIEP contract
  const defaultCtx = createVMEnv();
  vm.createContext(defaultCtx);
  vm.runInContext(gvJs, defaultCtx);
  const defaultSnap = defaultCtx.snapshotFlexLiteAssessmentConfig();
  assert.strictEqual(defaultSnap.assessment_type, 'TOT_NGHIEP', 'UI-02: Default snapshot is TOT_NGHIEP contract');
  assert.strictEqual(Object.keys(defaultSnap.scoring_config).length, 0, 'UI-02: Default snapshot scoring_config is empty');
}

// Test with mocked DOM values for CUSTOM weight snapshotting
function testSnapshotWithDom(domValues) {
  const customContext = createVMEnv(domValues);
  vm.createContext(customContext);
  vm.runInContext(gvJs, customContext);
  return {
    snapshot: customContext.snapshotFlexLiteAssessmentConfig(),
    validate: customContext.validateFlexLiteAssessmentForSave
  };
}

// DOM-SNAP-01: Blank input for p2 => snapshot has NaN => validate throws
{
  const { snapshot, validate } = testSnapshotWithDom({
    flexLiteAssessmentType: 'CUSTOM',
    flexLiteP1Weight: '10',
    flexLiteP2Weight: '',
    flexLiteP3Weight: '0'
  });
  assert(Number.isNaN(snapshot.scoring_config.p2_weight), 'DOM-SNAP-01a: Blank p2 must snapshot as NaN');
  assert.throws(
    () => validate([{ MaDe: '101', Phan: '1', NoiDung: 'Q' }], snapshot),
    /số hợp lệ/i,
    'DOM-SNAP-01b: Snapshot with blank p2 must fail validation'
  );
}

// DOM-SNAP-02: String 'abc' for p2 => snapshot has NaN => validate throws
{
  const { snapshot, validate } = testSnapshotWithDom({
    flexLiteAssessmentType: 'CUSTOM',
    flexLiteP1Weight: '10',
    flexLiteP2Weight: 'abc',
    flexLiteP3Weight: '0'
  });
  assert(Number.isNaN(snapshot.scoring_config.p2_weight), 'DOM-SNAP-02a: abc p2 must snapshot as NaN');
  assert.throws(
    () => validate([{ MaDe: '101', Phan: '1', NoiDung: 'Q' }], snapshot),
    /số hợp lệ/i,
    'DOM-SNAP-02b: Snapshot with abc p2 must fail validation'
  );
}

// DOM-SNAP-03: String 'NaN' for p2 => snapshot has NaN => validate throws
{
  const { snapshot, validate } = testSnapshotWithDom({
    flexLiteAssessmentType: 'CUSTOM',
    flexLiteP1Weight: '10',
    flexLiteP2Weight: 'NaN',
    flexLiteP3Weight: '0'
  });
  assert(Number.isNaN(snapshot.scoring_config.p2_weight), 'DOM-SNAP-03a: NaN p2 must snapshot as NaN');
  assert.throws(
    () => validate([{ MaDe: '101', Phan: '1', NoiDung: 'Q' }], snapshot),
    /số hợp lệ/i,
    'DOM-SNAP-03b: Snapshot with NaN p2 must fail validation'
  );
}

// DOM-SNAP-04: Valid 4/4/2 => snapshot has 4, 4, 2 => validate passes
{
  const { snapshot, validate } = testSnapshotWithDom({
    flexLiteAssessmentType: 'CUSTOM',
    flexLiteP1Weight: '4',
    flexLiteP2Weight: '4',
    flexLiteP3Weight: '2'
  });
  assert.strictEqual(snapshot.scoring_config.p1_weight, 4);
  assert.strictEqual(snapshot.scoring_config.p2_weight, 4);
  assert.strictEqual(snapshot.scoring_config.p3_weight, 2);
  const exam = [
    { MaDe: '101', Phan: '1', NoiDung: 'Q1' },
    { MaDe: '101', Phan: '2', NoiDung: 'Q2' },
    { MaDe: '101', Phan: '3', NoiDung: 'Q3' }
  ];
  const res = validate(exam, snapshot);
  assert(res.valid, 'DOM-SNAP-04: Valid 4/4/2 snapshot must pass validation');
}

console.log('PASS: flex_lite_teacher_config_frontend_simulation.js (All PARSER-01..12, CFG-01..12, REG-01..05, UI-01..02, DOM-SNAP-01..04 passed on BOTH parseOnline and parseV8)');
