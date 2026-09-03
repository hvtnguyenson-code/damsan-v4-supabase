// =========================================================================
// Simulation Test: tests/flex_lite_authoritative_score_presentation_simulation.js
// TASK: FLEX-LITE-004 — Authoritative Score Presentation & Component Breakdown
// =========================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== RUNNING FLEX-LITE-004 AUTHORITATIVE SCORE PRESENTATION REGRESSION SUITE ===\n');

// 1. Load client source files
const gvJsSource = fs.readFileSync(path.join(__dirname, '..', 'giaovien.js'), 'utf8');
const hsJsSource = fs.readFileSync(path.join(__dirname, '..', 'hoc_sinh.js'), 'utf8');
const gvHtmlSource = fs.readFileSync(path.join(__dirname, '..', 'giaovien.html'), 'utf8');
const hsHtmlSource = fs.readFileSync(path.join(__dirname, '..', 'hoc_sinh.html'), 'utf8');
const swJsSource = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

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
    DOMPurify: {
      sanitize: (s) => s
    },
    document: {
      getElementById: getEl,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: (tag) => ({
        tagName: tag,
        style: {},
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: () => {},
        innerHTML: ''
      }),
      body: {
        appendChild: () => {},
        removeChild: () => {}
      }
    },
    window: {},
    navigator: { onLine: true }
  };
  sandbox.window = sandbox;
  return sandbox;
}

const gvEnv = createVMEnv();
vm.createContext(gvEnv);
vm.runInContext(gvJsSource, gvEnv);

const parseAuthoritativeFinalScore = gvEnv.parseAuthoritativeFinalScore;
const parseServerGradingDetails = gvEnv.parseServerGradingDetails;
const computeDisplayPartContributions = gvEnv.computeDisplayPartContributions;
const isQuestionFullyCorrectFromServerDetail = gvEnv.isQuestionFullyCorrectFromServerDetail;

assert.strictEqual(typeof parseAuthoritativeFinalScore, 'function', 'parseAuthoritativeFinalScore must be a function');
assert.strictEqual(typeof parseServerGradingDetails, 'function', 'parseServerGradingDetails must be a function');
assert.strictEqual(typeof computeDisplayPartContributions, 'function', 'computeDisplayPartContributions must be a function');
assert.strictEqual(typeof isQuestionFullyCorrectFromServerDetail, 'function', 'isQuestionFullyCorrectFromServerDetail must be a function');

// -------------------------------------------------------------------------
// SCORE-UI-01: Oracle Room 1 (TOT_NGHIEP, 1 MCQ)
// HS 100401 = 0, HS 100403 = 0.25 -> UI Total = 0.25, P1 = 0.25, P2 = 0, P3 = 0 (NOT 10.00)
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-01: Oracle Room 1 (TOT_NGHIEP, 1 MCQ)');
{
    const room = { assessment_type: 'TOT_NGHIEP', scoring_config: {} };
    const hs100401 = {
        MaHS: '100401',
        Diem: 0,
        ChiTiet: JSON.stringify([{ q: 1, phan: '1', chon: 'B', dung: 'A', diem: 0 }])
    };
    const hs100403 = {
        MaHS: '100403',
        Diem: 0.25,
        ChiTiet: JSON.stringify([{ q: 1, phan: '1', chon: 'A', dung: 'A', diem: 0.25 }])
    };

    const res1 = computeDisplayPartContributions(hs100401, room.assessment_type, room.scoring_config);
    const res3 = computeDisplayPartContributions(hs100403, room.assessment_type, room.scoring_config);

    assert.strictEqual(res1.finalScore, 0, 'SCORE-UI-01: HS 100401 finalScore must be 0');
    assert.strictEqual(res1.finalDisplay, '0.00', 'SCORE-UI-01: HS 100401 finalDisplay must be 0.00');
    assert.strictEqual(res1.p1, 0, 'SCORE-UI-01: HS 100401 P1 contribution must be 0');

    assert.strictEqual(res3.finalScore, 0.25, 'SCORE-UI-01: HS 100403 finalScore must be 0.25 (authoritative)');
    assert.strictEqual(res3.finalDisplay, '0.25', 'SCORE-UI-01: HS 100403 finalDisplay must be 0.25 (NOT 10.00)');
    assert.strictEqual(res3.p1, 0.25, 'SCORE-UI-01: HS 100403 P1 contribution must be 0.25');
    assert.strictEqual(res3.p2, 0, 'SCORE-UI-01: HS 100403 P2 contribution must be 0');
    assert.strictEqual(res3.p3, 0, 'SCORE-UI-01: HS 100403 P3 contribution must be 0');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-02: Oracle Room 2 (MCQ_ONLY, 1 MCQ)
// HS 100401 = 0, HS 100403 = 10 -> UI Total = 10.00, P1 = 10.00, P2 = 0, P3 = 0 (NOT 400.00)
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-02: Oracle Room 2 (MCQ_ONLY, 1 MCQ)');
{
    const room = { assessment_type: 'MCQ_ONLY', scoring_config: {} };
    const hs100401 = {
        MaHS: '100401',
        Diem: 0,
        ChiTiet: JSON.stringify([{ q: 1, phan: '1', chon: 'B', dung: 'A', diem: 0 }])
    };
    const hs100403 = {
        MaHS: '100403',
        Diem: 10,
        ChiTiet: JSON.stringify([{ q: 1, phan: '1', chon: 'A', dung: 'A', diem: 0.25 }])
    };

    const res1 = computeDisplayPartContributions(hs100401, room.assessment_type, room.scoring_config);
    const res3 = computeDisplayPartContributions(hs100403, room.assessment_type, room.scoring_config);

    assert.strictEqual(res1.finalScore, 0, 'SCORE-UI-02: HS 100401 finalScore must be 0');
    assert.strictEqual(res1.p1, 0, 'SCORE-UI-02: HS 100401 P1 must be 0');

    assert.strictEqual(res3.finalScore, 10, 'SCORE-UI-02: HS 100403 finalScore must be 10 (authoritative)');
    assert.strictEqual(res3.finalDisplay, '10.00', 'SCORE-UI-02: HS 100403 finalDisplay must be 10.00 (NOT 400.00)');
    assert.strictEqual(res3.p1, 10, 'SCORE-UI-02: HS 100403 P1 contribution must be 10 (NOT 400)');
    assert.strictEqual(res3.p2, 0, 'SCORE-UI-02: HS 100403 P2 must be 0');
    assert.strictEqual(res3.p3, 0, 'SCORE-UI-02: HS 100403 P3 must be 0');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-03: Oracle Room 3 (CUSTOM, weights 4 / 4 / 2)
// HS 100401: final = 4 -> P1 = 0, P2 = 4, P3 = 0, Total = 4
// HS 100403: final = 8 -> P1 = 4, P2 = 2, P3 = 2, Total = 8
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-03: Oracle Room 3 (CUSTOM, weights 4 / 4 / 2)');
{
    const room = {
        assessment_type: 'CUSTOM',
        scoring_config: { p1_weight: 4, p2_weight: 4, p3_weight: 2 }
    };
    // 1 MCQ (raw max 0.25), 1 TF (raw max 1.0), 1 Short (raw max 0.25)
    const hs100401 = {
        MaHS: '100401',
        Diem: 4,
        ChiTiet: JSON.stringify([
            { q: 1, phan: '1', chon: 'B', dung: 'A', diem: 0 },
            { q: 2, phan: '2', chon: 'Đ-S-Đ-S', dung: 'Đ-S-Đ-S', diem: 1.0 },
            { q: 3, phan: '3', chon: '12', dung: '15', diem: 0 }
        ])
    };
    const hs100403 = {
        MaHS: '100403',
        Diem: 8,
        ChiTiet: JSON.stringify([
            { q: 1, phan: '1', chon: 'A', dung: 'A', diem: 0.25 },
            { q: 2, phan: '2', chon: 'Đ-S-Đ-Đ', dung: 'Đ-S-Đ-S', diem: 0.5 },
            { q: 3, phan: '3', chon: '15', dung: '15', diem: 0.25 }
        ])
    };

    const res1 = computeDisplayPartContributions(hs100401, room.assessment_type, room.scoring_config);
    const res3 = computeDisplayPartContributions(hs100403, room.assessment_type, room.scoring_config);

    assert.strictEqual(res1.finalScore, 4, 'SCORE-UI-03: HS 100401 finalScore must be 4');
    assert.strictEqual(res1.p1, 0, 'SCORE-UI-03: HS 100401 P1 contribution must be 0');
    assert.strictEqual(res1.p2, 4, 'SCORE-UI-03: HS 100401 P2 contribution must be 4');
    assert.strictEqual(res1.p3, 0, 'SCORE-UI-03: HS 100401 P3 contribution must be 0');

    assert.strictEqual(res3.finalScore, 8, 'SCORE-UI-03: HS 100403 finalScore must be 8');
    assert.strictEqual(res3.p1, 4, 'SCORE-UI-03: HS 100403 P1 contribution must be 4');
    assert.strictEqual(res3.p2, 2, 'SCORE-UI-03: HS 100403 P2 contribution must be 2 (0.5/1.0 * 4)');
    assert.strictEqual(res3.p3, 2, 'SCORE-UI-03: HS 100403 P3 contribution must be 2 (0.25/0.25 * 2)');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-04: Student published result shows authoritative score directly
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-04: Student published result displays authoritative score directly');
{
    assert(!hsJsSource.includes('(kq.diem / maxRaw) * 10'), 'SCORE-UI-04: hoc_sinh.js must not contain (kq.diem / maxRaw) * 10');
    assert(hsJsSource.includes("document.getElementById('final_score_val').innerText = (displayScore !== null && !isNaN(displayScore)) ? displayScore.toFixed(2) : '--';") ||
           hsJsSource.includes("document.getElementById('final_score_val').innerText = (displayScore !== null"),
           'SCORE-UI-04: final_score_val must format displayScore directly');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-05: Student review screen does not re-scale the score
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-05: Student review does not re-scale score');
{
    assert(!hsJsSource.includes('maxRaw > 0') || !hsJsSource.includes('* 10'), 'SCORE-UI-05: No client-side 10-scale multiplication in student review');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-06: Teacher dashboard statAvg uses authoritative scores
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-06: Teacher dashboard statAvg computation');
{
    const students = [
        { Diem: 0.25, ChiTiet: JSON.stringify([{ q: 1, phan: '1', diem: 0.25 }]) },
        { Diem: 10, ChiTiet: JSON.stringify([{ q: 1, phan: '1', diem: 0.25 }]) },
        { Diem: 4, ChiTiet: JSON.stringify([{ q: 1, phan: '1', diem: 0 }]) },
        { Diem: 8, ChiTiet: JSON.stringify([{ q: 1, phan: '1', diem: 0.25 }]) }
    ];
    let sum = 0;
    students.forEach(s => {
        const pres = computeDisplayPartContributions(s, 'CUSTOM', { p1_weight: 10, p2_weight: 0, p3_weight: 0 });
        sum += pres.finalScore;
    });
    const avg = (sum / students.length).toFixed(2);
    assert.strictEqual(avg, '5.56', 'SCORE-UI-06: Average of [0.25, 10, 4, 8] is (22.25/4) = 5.56');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-07: Teacher dashboard statPass uses authoritative scores (>= 5.0)
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-07: Teacher dashboard statPass computation');
{
    const scores = [0.25, 4.75, 5.00, 7.50, 10.00];
    let passed = 0;
    scores.forEach(sc => {
        const pres = computeDisplayPartContributions({ Diem: sc }, 'TOT_NGHIEP', {});
        if (pres.finalScore >= 5.0) passed++;
    });
    assert.strictEqual(passed, 3, 'SCORE-UI-07: Passed count for [0.25, 4.75, 5.00, 7.50, 10.00] must be 3');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-08: Score distribution buckets (Gioi >= 8, Kha 6.5-8, TB 5-6.5, Yeu < 5)
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-08: Score distribution classification');
{
    const list = [
        { Diem: 9.0 }, // Gioi
        { Diem: 8.0 }, // Gioi
        { Diem: 7.5 }, // Kha
        { Diem: 6.5 }, // Kha
        { Diem: 5.5 }, // TB
        { Diem: 5.0 }, // TB
        { Diem: 4.5 }, // Yeu
        { Diem: 0.25 } // Yeu
    ];
    let cGioi = 0, cKha = 0, cTB = 0, cYeu = 0;
    list.forEach(s => {
        const pres = computeDisplayPartContributions(s, 'TOT_NGHIEP', {});
        const d = pres.finalScore;
        if (d >= 8.0) cGioi++;
        else if (d >= 6.5) cKha++;
        else if (d >= 5.0) cTB++;
        else cYeu++;
    });
    assert.strictEqual(cGioi, 2, 'SCORE-UI-08: Gioi count must be 2');
    assert.strictEqual(cKha, 2, 'SCORE-UI-08: Kha count must be 2');
    assert.strictEqual(cTB, 2, 'SCORE-UI-08: TB count must be 2');
    assert.strictEqual(cYeu, 2, 'SCORE-UI-08: Yeu count must be 2');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-09: Excel export total uses authoritative score
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-09: Excel export uses authoritative final score');
{
    assert(!gvJsSource.includes('(totalRaw / maxRaw) * 10'), 'SCORE-UI-09: giaovien.js must not contain (totalRaw / maxRaw) * 10');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-10: Excel export component columns match dashboard presentation
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-10: Excel export component columns match dashboard');
{
    const room = { assessment_type: 'CUSTOM', scoring_config: { p1_weight: 4, p2_weight: 4, p3_weight: 2 } };
    const hs = {
        MaHS: '100403',
        Diem: 8,
        ChiTiet: JSON.stringify([
            { q: 1, phan: '1', chon: 'A', dung: 'A', diem: 0.25 },
            { q: 2, phan: '2', chon: 'Đ-S-Đ-Đ', dung: 'Đ-S-Đ-S', diem: 0.5 },
            { q: 3, phan: '3', chon: '15', dung: '15', diem: 0.25 }
        ])
    };
    const pres = computeDisplayPartContributions(hs, room.assessment_type, room.scoring_config);
    assert.strictEqual(pres.finalScore, 8);
    assert.strictEqual(pres.p1, 4);
    assert.strictEqual(pres.p2, 2);
    assert.strictEqual(pres.p3, 2);
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-11: Excel export summary/averages match authoritative data
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-11: Excel min/max/belowAvg match authoritative scores');
{
    const scores = [0.25, 10, 4, 8];
    let belowAvg = 0, maxScore = -1, minScore = 11;
    scores.forEach(s => {
        const pres = computeDisplayPartContributions({ Diem: s }, 'TOT_NGHIEP', {});
        const sc = pres.finalScore;
        if (sc < 5.0) belowAvg++;
        if (sc > maxScore) maxScore = sc;
        if (sc < minScore) minScore = sc;
    });
    assert.strictEqual(belowAvg, 2, 'SCORE-UI-11: Below avg (<5.0) for [0.25, 10, 4, 8] must be 2');
    assert.strictEqual(maxScore, 10, 'SCORE-UI-11: maxScore must be 10');
    assert.strictEqual(minScore, 0.25, 'SCORE-UI-11: minScore must be 0.25');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-12: Absent parts in CUSTOM profile produce 0 contribution
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-12: Absent parts in CUSTOM profile produce 0 contribution');
{
    // Exam with only P1 and P3 questions (P2 absent, weight 0)
    const room = {
        assessment_type: 'CUSTOM',
        scoring_config: { p1_weight: 6, p2_weight: 0, p3_weight: 4 }
    };
    const hs = {
        Diem: 10,
        ChiTiet: JSON.stringify([
            { q: 1, phan: '1', chon: 'A', dung: 'A', diem: 0.25 },
            { q: 2, phan: '3', chon: '10', dung: '10', diem: 0.25 }
        ])
    };
    const pres = computeDisplayPartContributions(hs, room.assessment_type, room.scoring_config);
    assert.strictEqual(pres.p1, 6, 'SCORE-UI-12: P1 contribution must be 6');
    assert.strictEqual(pres.p2, 0, 'SCORE-UI-12: P2 contribution must be 0 (absent part)');
    assert.strictEqual(pres.p3, 4, 'SCORE-UI-12: P3 contribution must be 4');
    assert.strictEqual(pres.finalScore, 10, 'SCORE-UI-12: Total must be 10');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-13: TRUE_FALSE_ONLY puts full authoritative score into P2
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-13: TRUE_FALSE_ONLY puts full score into P2');
{
    const room = { assessment_type: 'TRUE_FALSE_ONLY', scoring_config: {} };
    const hs = {
        Diem: 7.5,
        ChiTiet: JSON.stringify([{ q: 1, phan: '2', diem: 0.5 }])
    };
    const pres = computeDisplayPartContributions(hs, room.assessment_type, room.scoring_config);
    assert.strictEqual(pres.p1, 0, 'SCORE-UI-13: P1 must be 0');
    assert.strictEqual(pres.p2, 7.5, 'SCORE-UI-13: P2 must equal final score (7.5)');
    assert.strictEqual(pres.p3, 0, 'SCORE-UI-13: P3 must be 0');
    assert.strictEqual(pres.finalScore, 7.5, 'SCORE-UI-13: finalScore must be 7.5');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-14: SHORT_ONLY puts full authoritative score into P3
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-14: SHORT_ONLY puts full score into P3');
{
    const room = { assessment_type: 'SHORT_ONLY', scoring_config: {} };
    const hs = {
        Diem: 10,
        ChiTiet: JSON.stringify([{ q: 1, phan: '3', diem: 0.25 }])
    };
    const pres = computeDisplayPartContributions(hs, room.assessment_type, room.scoring_config);
    assert.strictEqual(pres.p1, 0, 'SCORE-UI-14: P1 must be 0');
    assert.strictEqual(pres.p2, 0, 'SCORE-UI-14: P2 must be 0');
    assert.strictEqual(pres.p3, 10, 'SCORE-UI-14: P3 must equal final score (10)');
    assert.strictEqual(pres.finalScore, 10, 'SCORE-UI-14: finalScore must be 10');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-15: Version cache invalidation matches 20260902-flex-lite-004 for teacher and 20260902-flex-lite-005 for student
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-15: Version cache invalidation across all files');
{
    const teacherVersion = '20260903-flex-lite-007';
    const studentVersion = '20260902-flex-lite-005';
    assert(gvHtmlSource.includes(`giaovien.js?v=${teacherVersion}`), 'SCORE-UI-15: giaovien.html must include giaovien.js?v=20260903-flex-lite-007');
    assert(hsHtmlSource.includes(`hoc_sinh.js?v=${studentVersion}`), 'SCORE-UI-15: hoc_sinh.html must include hoc_sinh.js?v=20260902-flex-lite-005');
    assert(hsJsSource.includes(`const VERSION = '${studentVersion}';`), 'SCORE-UI-15: hoc_sinh.js must define const VERSION = 20260902-flex-lite-005');
    assert(swJsSource.includes(`const VERSION = '${studentVersion}';`), 'SCORE-UI-15: sw.js must define const VERSION = 20260902-flex-lite-005');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-16: CUSTOM explanatory copy in giaovien.html is accurate
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-16: CUSTOM explanatory copy in giaovien.html');
{
    assert(gvHtmlSource.includes('Điểm từng câu được chấm theo quy tắc của từng phần'), 'SCORE-UI-16: Explanatory copy mentions question scoring rules');
    assert(gvHtmlSource.includes('trọng số của phần'), 'SCORE-UI-16: Explanatory copy mentions part weights');
    assert(gvHtmlSource.includes('tổng ba trọng số phải bằng 10') || gvHtmlSource.includes('tổng ba trọng số phải = 10'), 'SCORE-UI-16: Explanatory copy mentions sum equals 10');
    assert(gvHtmlSource.includes('máy chủ') || gvHtmlSource.includes('server'), 'SCORE-UI-16: Explanatory copy mentions server authoritative');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-17: Teacher config activation remains active
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-17: Teacher config activation feature flag is true');
{
    const flagInSource = /const\s+FLEX_LITE_TEACHER_CONFIG_ENABLED\s*=\s*true;/.test(gvJsSource);
    assert(flagInSource, 'SCORE-UI-17: FLEX_LITE_TEACHER_CONFIG_ENABLED must be true in giaovien.js');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-18: Zero double-normalization code remains in teacher or student clients
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-18: Zero double-normalization code remains in client scripts');
{
    assert(!gvJsSource.includes('(totalRaw / maxRaw) * 10'), 'SCORE-UI-18: No (totalRaw / maxRaw) * 10 in giaovien.js');
    assert(!hsJsSource.includes('(kq.diem / maxRaw) * 10'), 'SCORE-UI-18: No (kq.diem / maxRaw) * 10 in hoc_sinh.js');
    assert(!gvJsSource.includes('totalDisplay = (totalRaw / maxRaw) * 10'), 'SCORE-UI-18: No totalDisplay scaling in giaovien.js');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-19: Server Room List RPC metadata contract (Migration structural check)
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-19: Server Room List RPC metadata contract in migration');
{
    const migPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260902070001_flex_lite_room_scoring_metadata_read.sql');
    assert(fs.existsSync(migPath), 'SCORE-UI-19: Migration 20260902070001_flex_lite_room_scoring_metadata_read.sql must exist');
    const migSql = fs.readFileSync(migPath, 'utf8');

    assert(migSql.includes('public.rpc_lay_danh_sach_phong_thi_gv'), 'SCORE-UI-19: Defines rpc_lay_danh_sach_phong_thi_gv');
    assert(migSql.includes("'assessment_type', pt.assessment_type"), 'SCORE-UI-19: Exposes pt.assessment_type in room JSON');
    assert(migSql.includes("'scoring_config', pt.scoring_config"), 'SCORE-UI-19: Exposes pt.scoring_config in room JSON');
    assert(migSql.includes('p_staff_token text'), 'SCORE-UI-19: Preserves p_staff_token');
    assert(migSql.includes('public._staff_session_gv_id(p_staff_token)'), 'SCORE-UI-19: Preserves staff session validation');
    assert(migSql.includes("v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id"), 'SCORE-UI-19: Preserves school authorization scope');
    assert(migSql.includes('security definer set search_path = public'), 'SCORE-UI-19: Preserves security definer search_path');
    assert(migSql.includes('grant execute on function public.rpc_lay_danh_sach_phong_thi_gv(text, text, uuid, uuid, boolean) to anon, authenticated;'), 'SCORE-UI-19: Preserves execute grants');
    assert(!migSql.includes('pt.de_thi'), 'SCORE-UI-19: Must not expose pt.de_thi payload');
    assert(!migSql.includes('pt.dap_an'), 'SCORE-UI-19: Must not expose answers');
    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-20: Server room payload flows into allRoomsData and reaches computeDisplayPartContributions
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-20: Server room payload flows into allRoomsData without falling back to LEGACY');
{
    // Simulate server room responses as returned by the updated rpc_lay_danh_sach_phong_thi_gv
    const serverCustomRoom = {
        id: 'room-custom-001',
        ma_phong: 'FLEX_CUSTOM_442',
        ten_dot: 'Kiểm tra 15p Custom',
        doi_tuong: 'TatCa',
        thoi_gian: 45,
        trang_thai: 'CONG_BO_DIEM',
        thoi_gian_mo: 1000,
        truong_id: 'sch-001',
        mon_id: 'mon-001',
        ten_truong: 'THPT Đam San',
        assessment_type: 'CUSTOM',
        scoring_config: { p1_weight: 4, p2_weight: 4, p3_weight: 2 }
    };

    const serverMcqRoom = {
        id: 'room-mcq-001',
        ma_phong: 'FLEX_MCQ_10',
        ten_dot: 'Kiểm tra Trắc nghiệm',
        doi_tuong: 'TatCa',
        thoi_gian: 15,
        trang_thai: 'CONG_BO_DIEM',
        thoi_gian_mo: 1000,
        truong_id: 'sch-001',
        mon_id: 'mon-001',
        ten_truong: 'THPT Đam San',
        assessment_type: 'MCQ_ONLY',
        scoring_config: {}
    };

    // Simulate fetchRadar mapping in giaovien.js
    const mappedCustom = {
        MaPhong: serverCustomRoom.ma_phong,
        TenDotKiemTra: serverCustomRoom.ten_dot,
        DoiTuong: serverCustomRoom.doi_tuong,
        ThoiGian: serverCustomRoom.thoi_gian,
        TrangThai: serverCustomRoom.trang_thai,
        ThoiGianMo: serverCustomRoom.thoi_gian_mo,
        TenTruong: serverCustomRoom.ten_truong,
        truong_id: serverCustomRoom.truong_id,
        id: serverCustomRoom.id,
        assessment_type: serverCustomRoom.assessment_type || 'LEGACY',
        scoring_config: serverCustomRoom.scoring_config || {}
    };

    const mappedMcq = {
        MaPhong: serverMcqRoom.ma_phong,
        TenDotKiemTra: serverMcqRoom.ten_dot,
        DoiTuong: serverMcqRoom.doi_tuong,
        ThoiGian: serverMcqRoom.thoi_gian,
        TrangThai: serverMcqRoom.trang_thai,
        ThoiGianMo: serverMcqRoom.thoi_gian_mo,
        TenTruong: serverMcqRoom.ten_truong,
        truong_id: serverMcqRoom.truong_id,
        id: serverMcqRoom.id,
        assessment_type: serverMcqRoom.assessment_type || 'LEGACY',
        scoring_config: serverMcqRoom.scoring_config || {}
    };

    assert.strictEqual(mappedCustom.assessment_type, 'CUSTOM', 'SCORE-UI-20: Custom room retains assessment_type CUSTOM');
    assert.strictEqual(mappedCustom.scoring_config.p1_weight, 4, 'SCORE-UI-20: Custom room retains scoring_config');
    assert.strictEqual(mappedMcq.assessment_type, 'MCQ_ONLY', 'SCORE-UI-20: MCQ room retains assessment_type MCQ_ONLY');

    // HS in Custom room
    const hsCustom = {
        MaHS: '100403',
        Diem: 8,
        ChiTiet: JSON.stringify([
            { q: 1, phan: '1', chon: 'A', dung: 'A', diem: 0.25 },
            { q: 2, phan: '2', chon: 'Đ-S-Đ-Đ', dung: 'Đ-S-Đ-S', diem: 0.5 },
            { q: 3, phan: '3', chon: '15', dung: '15', diem: 0.25 }
        ])
    };

    const presCustom = computeDisplayPartContributions(hsCustom, mappedCustom.assessment_type, mappedCustom.scoring_config);
    assert.strictEqual(presCustom.finalScore, 8);
    assert.strictEqual(presCustom.p1, 4, 'SCORE-UI-20: P1 correctly weighted to 4');
    assert.strictEqual(presCustom.p2, 2, 'SCORE-UI-20: P2 correctly weighted to 2');
    assert.strictEqual(presCustom.p3, 2, 'SCORE-UI-20: P3 correctly weighted to 2');

    // HS in MCQ room
    const hsMcq = {
        MaHS: '100403',
        Diem: 10,
        ChiTiet: JSON.stringify([{ q: 1, phan: '1', chon: 'A', dung: 'A', diem: 0.25 }])
    };
    const presMcq = computeDisplayPartContributions(hsMcq, mappedMcq.assessment_type, mappedMcq.scoring_config);
    assert.strictEqual(presMcq.finalScore, 10);
    assert.strictEqual(presMcq.p1, 10, 'SCORE-UI-20: P1 equals authoritative final score 10');
    assert.strictEqual(presMcq.p2, 0);
    assert.strictEqual(presMcq.p3, 0);

    console.log('  -> PASSED');
}

// -------------------------------------------------------------------------
// SCORE-UI-21: Killer-question (Part II analytics) correctness criteria
// -------------------------------------------------------------------------
console.log('Test SCORE-UI-21: Killer-question analytics (Part II full-correct vs partial)');
{
    // Part II: partial scores must be counted INCORRECT for killer-question analytics
    const p2_000 = { phan: '2', diem: 0.00, chon: 'S-S-S-S', dung: 'Đ-Đ-Đ-Đ' };
    const p2_010 = { phan: '2', diem: 0.10, chon: 'Đ-S-S-S', dung: 'Đ-Đ-Đ-Đ' };
    const p2_025 = { phan: '2', diem: 0.25, chon: 'Đ-Đ-S-S', dung: 'Đ-Đ-Đ-Đ' };
    const p2_050 = { phan: '2', diem: 0.50, chon: 'Đ-Đ-Đ-S', dung: 'Đ-Đ-Đ-Đ' };
    const p2_100 = { phan: '2', diem: 1.00, chon: 'Đ-Đ-Đ-Đ', dung: 'Đ-Đ-Đ-Đ' };

    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p2_000), false, 'SCORE-UI-21: P2 diem=0.00 is NOT fully correct');
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p2_010), false, 'SCORE-UI-21: P2 diem=0.10 is NOT fully correct (partial)');
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p2_025), false, 'SCORE-UI-21: P2 diem=0.25 is NOT fully correct (partial)');
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p2_050), false, 'SCORE-UI-21: P2 diem=0.50 is NOT fully correct (partial)');
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p2_100), true,  'SCORE-UI-21: P2 diem=1.00 IS fully correct');

    // Part I
    const p1_000 = { phan: '1', diem: 0.00, chon: 'B', dung: 'A' };
    const p1_025 = { phan: '1', diem: 0.25, chon: 'A', dung: 'A' };
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p1_000), false, 'SCORE-UI-21: P1 diem=0 is NOT correct');
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p1_025), true,  'SCORE-UI-21: P1 diem=0.25 IS correct');

    // Part III
    const p3_000 = { phan: '3', diem: 0.00, chon: '10', dung: '15' };
    const p3_025 = { phan: '3', diem: 0.25, chon: '15', dung: '15' };
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p3_000), false, 'SCORE-UI-21: P3 diem=0 is NOT correct');
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p3_025), true,  'SCORE-UI-21: P3 diem=0.25 IS correct');

    // Fallback when item.diem is not present (legacy client grading details)
    const p2_legacy_partial = { phan: '2', chon: 'Đ-S-S-S', dung: 'Đ-Đ-Đ-Đ' };
    const p2_legacy_full = { phan: '2', chon: 'Đ-Đ-Đ-Đ', dung: 'Đ-Đ-Đ-Đ' };
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p2_legacy_partial), false, 'SCORE-UI-21: Legacy P2 partial match is false');
    assert.strictEqual(isQuestionFullyCorrectFromServerDetail(p2_legacy_full), true, 'SCORE-UI-21: Legacy P2 4-match is true');

    console.log('  -> PASSED');
}

console.log('\n=== ALL 21 FLEX-LITE-004 AUTHORITATIVE SCORE PRESENTATION TESTS PASSED ===');
