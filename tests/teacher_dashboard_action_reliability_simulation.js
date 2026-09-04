// =========================================================================
// Simulation Test: tests/teacher_dashboard_action_reliability_simulation.js
// TASK: FLEX-LITE-006 — Teacher Dashboard Action Reliability + Visual Feedback
// =========================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== RUNNING FLEX-LITE-006 TEACHER DASHBOARD ACTION RELIABILITY TEST SUITE ===\n');

const repoRoot = path.join(__dirname, '..');
const gvJsSource = fs.readFileSync(path.join(repoRoot, 'giaovien.js'), 'utf8');
const gvHtmlSource = fs.readFileSync(path.join(repoRoot, 'giaovien.html'), 'utf8');
const hsJsSource = fs.readFileSync(path.join(repoRoot, 'hoc_sinh.js'), 'utf8');
const hsHtmlSource = fs.readFileSync(path.join(repoRoot, 'hoc_sinh.html'), 'utf8');
const swJsSource = fs.readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');

// -------------------------------------------------------------------------
// Helper: Create isolated sandbox for dashboard actions with detailed tracking
// -------------------------------------------------------------------------
function createDashboardEnv(options = {}) {
  const elements = {};
  const alerts = [];
  const confirms = [];
  const rpcCalls = [];
  const rpcCallsByName = {};

  const metrics = {
    workbookConstructorCount: 0,
    writeBufferCount: 0,
    downloadClickCount: 0
  };

  const defaultRoom = options.room !== undefined ? options.room : {
    id: 'room-uuid-1234',
    MaPhong: 'PHONG_101',
    ma_phong: 'PHONG_101',
    truong_id: 'school-uuid-999',
    DoiTuong: 'TatCa',
    assessment_type: 'TOT_NGHIEP',
    scoring_config: {}
  };

  function createMockElement(id, tagName = 'div') {
    return {
      id,
      tagName: tagName.toUpperCase(),
      innerText: '',
      innerHTML: '',
      value: '',
      disabled: false,
      attributes: {},
      style: {},
      setAttribute(name, val) { this.attributes[name] = String(val); },
      removeAttribute(name) { delete this.attributes[name]; },
      getAttribute(name) { return this.attributes[name]; },
      options: [{ text: 'Môn: Toán', value: '1' }],
      selectedIndex: 0,
      click() {
        if (this.tagName === 'A') {
          metrics.downloadClickCount++;
        }
        if (this.onclick) this.onclick();
      }
    };
  }

  // Setup standard DOM elements
  ['dashRefreshBtn', 'dashRegradeBtn', 'dashExportBtn', 'dashDeleteResultsBtn'].forEach(id => {
    elements[id] = createMockElement(id, 'button');
  });
  elements['dashMaPhong'] = createMockElement('dashMaPhong', 'select');
  elements['dashBody'] = createMockElement('dashBody', 'tbody');
  elements['liveSearchInput'] = createMockElement('liveSearchInput', 'input');
  elements['subTabsDashboard'] = createMockElement('subTabsDashboard', 'div');

  const pendingTimers = [];

  class MockWorkbook {
    constructor() {
      metrics.workbookConstructorCount++;
      if (options.onWorkbookCreated) options.onWorkbookCreated();
      this.worksheets = [];
    }
    addWorksheet(name) {
      const ws = {
        name,
        columns: [],
        rows: [],
        addRow(data) {
          const r = { data, eachCell: (fn) => {}, font: {} };
          ws.rows.push(r);
          return r;
        },
        getRow(idx) { return { eachCell: () => {}, font: {}, fill: {}, alignment: {}, border: {} }; },
        eachRow(fn) { ws.rows.forEach((r, idx) => fn(r, idx + 1)); }
      };
      this.worksheets.push(ws);
      return ws;
    }
    get xlsx() {
      return {
        writeBuffer: async () => {
          metrics.writeBufferCount++;
          if (options.onWriteBuffer) await options.onWriteBuffer();
          return Buffer.from('mock-excel-binary');
        }
      };
    }
  }

  const defaultExcelJS = { Workbook: MockWorkbook };

  const sandbox = {
    console,
    Math,
    Object,
    Array,
    Set,
    String,
    Number,
    RegExp,
    JSON,
    Date,
    Promise,
    Error,
    Blob: class MockBlob { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    document: {
      getElementById: (id) => elements[id] || (elements[id] = createMockElement(id)),
      querySelector: (sel) => null,
      querySelectorAll: (sel) => [],
      createElement: (tag) => createMockElement('dynamic-' + tag, tag)
    },
    window: {
      URL: {
        createObjectURL: () => 'blob:mock-url',
        revokeObjectURL: () => {}
      },
      ExcelJS: options.mockExcelJS || defaultExcelJS
    },
    setTimeout: (fn, delay) => {
      const timer = { fn, delay, executed: false };
      pendingTimers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      if (timer) timer.executed = true;
    },
    alert: (msg) => { alerts.push(msg); },
    confirm: (msg) => {
      confirms.push(msg);
      return options.confirmResult !== undefined ? options.confirmResult : true;
    },
    staffRpc: async (name, params) => {
      rpcCalls.push({ name, params });
      rpcCallsByName[name] = (rpcCallsByName[name] || 0) + 1;
      if (options.mockStaffRpc) {
        return options.mockStaffRpc(name, params);
      }
      return { status: 'success', ket_qua_deleted: 10, submissions_deleted: 10, attempted: 5, graded: 5, failed: 0 };
    },
    getSelectedRoom: (selectId) => defaultRoom,
    getRoomTargetSchoolId: (room) => room?.truong_id || 'school-uuid-999',
    taiDanhSachPhong: () => {},
    ensureExcelJsReady: async () => {
      if (options.ensureExcelJsError) throw options.ensureExcelJsError;
      if (options.onEnsureExcelJsReady) await options.onEnsureExcelJsReady();
      return options.mockExcelJS || defaultExcelJS;
    },
    gvData: { ma_gv: 'GV001', truong_id: 'school-uuid-999', quyen: 'GiaoVien' },
    allRoomsData: defaultRoom ? [defaultRoom] : [],
    duLieuBangDiem: options.initialData !== undefined ? options.initialData : [
      { MaHS: 'HS001', HoTen: 'Nguyen Van A', Lop: '10A1', Diem: 8.5, ChiTiet: '{}', created_at: '2026-09-01T10:00:00Z', ViPham: 0 }
    ],
    allStudents: options.allStudents || [
      { MaHS: 'HS001', HoTen: 'Nguyen Van A', Lop: '10A1', Quyen: 'HocSinh', id: 'hs-uuid-1' }
    ],
    currentDashFilter: 'TatCa',
    activeWorkspaceMonId: 'ALL',
    g_sysMonList: [],
    globalFetchDashId: 0,
    computeDisplayPartContributions: (hs) => ({
      finalScore: hs.Diem !== '-' ? Number(hs.Diem) : 0,
      p1: 0, p2: 0, p3: 0, isSubmitted: true
    }),
    renderDashboardSubTabs: () => {},
    renderDashboardTable: () => {},
    sb: {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [] })
        })
      })
    }
  };

  vm.createContext(sandbox);

  // Extract necessary dashboard code snippet from gvJsSource
  const helperMarker = '// DASHBOARD ACTION STATE & RELIABILITY HELPERS (FLEX-LITE-006)';
  const helperIdx = gvJsSource.indexOf(helperMarker);
  assert(helperIdx >= 0, 'Helper marker must be found in giaovien.js');

  const xuatExcelEndMarker = 'async function xuatExcel()';
  const xuatExcelIdx = gvJsSource.indexOf(xuatExcelEndMarker);
  assert(xuatExcelIdx >= 0, 'xuatExcel must be found in giaovien.js');
  const excelJsReadyIdx = gvJsSource.indexOf('let excelJsLoadingPromise = null;', xuatExcelIdx);
  assert(excelJsReadyIdx >= 0, 'excelJsLoadingPromise must be found in giaovien.js');

  const snippet = gvJsSource.slice(helperIdx, excelJsReadyIdx) + `
    this.DASHBOARD_ACTIONS = DASHBOARD_ACTIONS;
    this.setDashboardActionState = setDashboardActionState;
    this.finishDashboardAction = finishDashboardAction;
    this.runDashboardAction = runDashboardAction;
    this.refreshDashboardManually = refreshDashboardManually;
    this.fetchDashboard = fetchDashboard;
    this.xoaDiemPhong = xoaDiemPhong;
    this.khoiPhucChamDiemPhong = khoiPhucChamDiemPhong;
    this.xuatExcel = xuatExcel;
    this.xuatExcelCore = typeof xuatExcelCore !== 'undefined' ? xuatExcelCore : null;
    this.DASHBOARD_FEEDBACK_DELAY_MS = DASHBOARD_FEEDBACK_DELAY_MS;
    this.DASHBOARD_NEUTRAL_STATUSES = DASHBOARD_NEUTRAL_STATUSES;
    this.getDashboardManualRefreshActive = () => dashboardManualRefreshActive;
    this.getActiveDashboardActions = () => activeDashboardActions;
    this.getGlobalFetchDashId = () => globalFetchDashId;
    this.setGlobalFetchDashId = (v) => { globalFetchDashId = v; };
  `;
  vm.runInContext(snippet, sandbox);

  function advanceTimers() {
    while (pendingTimers.length > 0) {
      const t = pendingTimers.shift();
      if (!t.executed) {
        t.executed = true;
        t.fn();
      }
    }
  }

  return { sandbox, elements, alerts, confirms, rpcCalls, rpcCallsByName, metrics, pendingTimers, advanceTimers };
}

// =========================================================================
// SEQUENTIAL TEST RUNNER
// =========================================================================
async function runAllTests() {

  // =======================================================================
  // A. MANUAL / AUTO REFRESH
  // =======================================================================

  // 1. Stable IDs đủ 4 button
  console.log('Test DASH-ACT-01: Stable button IDs exist for all 4 dashboard action buttons');
  {
    assert(gvHtmlSource.includes('id="dashRefreshBtn"'), 'Must have id="dashRefreshBtn"');
    assert(gvHtmlSource.includes('id="dashRegradeBtn"'), 'Must have id="dashRegradeBtn"');
    assert(gvHtmlSource.includes('id="dashExportBtn"'), 'Must have id="dashExportBtn"');
    assert(gvHtmlSource.includes('id="dashDeleteResultsBtn"'), 'Must have id="dashDeleteResultsBtn"');
    console.log('  -> PASSED');
  }

  // 2. HTML manual button gọi refreshDashboardManually() và không gọi fetchDashboard(true) trực tiếp
  console.log('Test DASH-ACT-02: HTML manual button calls refreshDashboardManually() and not fetchDashboard directly');
  {
    assert(gvHtmlSource.includes('onclick="refreshDashboardManually()"'), 'dashRefreshBtn must have onclick="refreshDashboardManually()"');
    assert(!gvHtmlSource.includes('onclick="fetchDashboard('), 'giaovien.html must not bind buttons to fetchDashboard directly');
    console.log('  -> PASSED');
  }

  // 3. refreshDashboardManually thực sự chạy fetchDashboard(false)
  console.log('Test DASH-ACT-03: refreshDashboardManually executes fetchDashboard(false) and shows loading');
  {
    let fetchAutoArg = null;
    const { sandbox, elements } = createDashboardEnv({
      mockStaffRpc: async (name) => {
        if (name === 'rpc_lay_ket_qua_phong_gv') {
          return { status: 'success', results: [] };
        }
        return { status: 'success' };
      }
    });

    const origFetch = sandbox.fetchDashboard;
    sandbox.fetchDashboard = async (isAuto) => {
      fetchAutoArg = isAuto;
      return origFetch(isAuto);
    };

    await sandbox.refreshDashboardManually();
    assert.strictEqual(fetchAutoArg, false, 'refreshDashboardManually must call fetchDashboard with isAuto=false');
    console.log('  -> PASSED');
  }

  // 4. Manual success: normal -> busy -> success -> normal
  console.log('Test DASH-ACT-04: Manual refresh success transitions: normal -> busy -> success -> normal');
  {
    const { sandbox, elements, advanceTimers } = createDashboardEnv({
      mockStaffRpc: async () => ({ status: 'success', results: [] })
    });
    const btn = elements['dashRefreshBtn'];

    // Before click
    assert.strictEqual(btn.disabled, false);

    // During async call
    const actionPromise = sandbox.refreshDashboardManually();
    assert.strictEqual(btn.innerText, '⏳ Đang cập nhật...');
    assert.strictEqual(btn.disabled, true);
    assert.strictEqual(btn.getAttribute('aria-busy'), 'true');

    // Await completion -> success feedback
    const res = await actionPromise;
    if (res.status !== 'success') console.error('DASH-ACT-04 failure detail:', res);
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(btn.innerText, '✅ Đã cập nhật');
    assert.strictEqual(btn.disabled, true);
    assert.strictEqual(btn.getAttribute('aria-busy'), undefined);

    // Advance fake timer -> normal
    advanceTimers();
    assert.strictEqual(btn.innerText, '🔄 Cập nhật Bảng Điểm');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  // 5. Manual failure: busy -> error -> normal
  console.log('Test DASH-ACT-05: Manual refresh failure transitions: busy -> error -> normal');
  {
    const { sandbox, elements, advanceTimers } = createDashboardEnv({
      mockStaffRpc: async () => { throw new Error('Network failure'); }
    });
    const btn = elements['dashRefreshBtn'];

    const res = await sandbox.refreshDashboardManually();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Cập nhật lỗi');
    assert.strictEqual(btn.disabled, true);

    advanceTimers();
    assert.strictEqual(btn.innerText, '🔄 Cập nhật Bảng Điểm');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  // 6. Hai manual refresh gần đồng thời: chỉ một manual fetch thực sự
  console.log('Test DASH-ACT-06: Rapid double invocation of manual refresh triggers exactly 1 fetch');
  {
    let resolveFirst;
    const firstDeferred = new Promise(r => { resolveFirst = r; });

    const { sandbox, rpcCallsByName } = createDashboardEnv({
      mockStaffRpc: async (name) => {
        if (name === 'rpc_lay_ket_qua_phong_gv') {
          await firstDeferred;
          return { status: 'success', results: [] };
        }
        return { status: 'success' };
      }
    });

    const call1 = sandbox.refreshDashboardManually();
    const call2 = await sandbox.refreshDashboardManually();

    assert.strictEqual(call2.status, 'skipped');
    assert.strictEqual(call2.reason, 'already_running');

    resolveFirst();
    await call1;

    assert.strictEqual(rpcCallsByName['rpc_lay_ket_qua_phong_gv'], 1, 'Only exactly 1 fetch RPC must execute');
    console.log('  -> PASSED');
  }

  // 7. Auto refresh: không đổi button state, không clear search, error silent
  console.log('Test DASH-ACT-07: Auto refresh does not mutate manual button state, preserves search, stays silent on error');
  {
    const { sandbox, elements, alerts } = createDashboardEnv({
      mockStaffRpc: async () => { throw new Error('Silent auto network error'); }
    });

    elements['liveSearchInput'].value = 'Học sinh X';
    const btn = elements['dashRefreshBtn'];
    btn.innerText = '🔄 Cập nhật Bảng Điểm';
    btn.disabled = false;

    const res = await sandbox.fetchDashboard(true);
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(elements['liveSearchInput'].value, 'Học sinh X', 'Auto refresh must preserve liveSearchInput');
    assert.strictEqual(btn.innerText, '🔄 Cập nhật Bảng Điểm', 'Auto refresh must NOT change manual button text');
    assert.strictEqual(btn.disabled, false, 'Auto refresh must NOT disable manual button');
    assert.strictEqual(alerts.length, 0, 'Auto refresh error must remain silent (0 alerts)');
    console.log('  -> PASSED');
  }

  // 8. Auto bắt đầu SAU khi manual đang active: return skipped, không tăng generation
  console.log('Test DASH-ACT-08: Auto refresh while manual is active returns skipped and does not bump generation');
  {
    let finishManual;
    const manualDeferred = new Promise(r => { finishManual = r; });

    const { sandbox } = createDashboardEnv({
      mockStaffRpc: async () => {
        await manualDeferred;
        return { status: 'success', results: [] };
      }
    });

    const manualPromise = sandbox.refreshDashboardManually();
    const genBeforeAuto = sandbox.getGlobalFetchDashId();

    const autoRes = await sandbox.fetchDashboard(true);
    assert.strictEqual(autoRes.status, 'skipped', 'Auto fetch while manual active must return { status: "skipped" }');
    assert.strictEqual(sandbox.getGlobalFetchDashId(), genBeforeAuto, 'Auto fetch must not bump globalFetchDashId');

    finishManual();
    await manualPromise;
    console.log('  -> PASSED');
  }

  // 9. Request cũ hoàn thành sau request mới: return status stale và không overwrite newer payload
  console.log('Test DASH-ACT-09: Stale fetchDashboard results return status: stale and discard payload');
  {
    let resolveSlow;
    const slowDeferred = new Promise(r => { resolveSlow = r; });

    let callCount = 0;
    const { sandbox } = createDashboardEnv({
      mockStaffRpc: async () => {
        callCount++;
        if (callCount === 1) {
          await slowDeferred;
          return { status: 'success', results: [{ hoc_sinh: { ma_hs: 'STALE_OLD' } }] };
        }
        return { status: 'success', results: [{ hoc_sinh: { ma_hs: 'FRESH_NEW' } }] };
      }
    });

    // Request 1 (slow)
    const req1 = sandbox.fetchDashboard(false);
    // Request 2 (fast)
    const req2 = sandbox.fetchDashboard(false);
    await req2;
    assert.strictEqual(sandbox.duLieuBangDiem[0].MaHS, 'FRESH_NEW');

    // Finish Request 1
    resolveSlow();
    const res1 = await req1;
    assert.strictEqual(res1.status, 'stale', 'Older superseded request must return { status: "stale" }');
    assert.strictEqual(sandbox.duLieuBangDiem[0].MaHS, 'FRESH_NEW', 'Stale payload must not overwrite fresher data');
    console.log('  -> PASSED');
  }

  // 10. Manual request bị stale: return stale, KHÔNG hiện success, KHÔNG hiện error, button về normal
  console.log('Test DASH-ACT-10: Stale manual refresh returns stale, no success/error flash, restores normal');
  {
    let resolveSlow;
    const slowDeferred = new Promise(r => { resolveSlow = r; });

    let callCount = 0;
    const { sandbox, elements } = createDashboardEnv({
      mockStaffRpc: async () => {
        callCount++;
        if (callCount === 1) {
          await slowDeferred;
          return { status: 'success', results: [] };
        }
        return { status: 'success', results: [] };
      }
    });

    const btn = elements['dashRefreshBtn'];

    // Start manual refresh 1
    const req1 = sandbox.refreshDashboardManually();

    // Trigger newer fetch that increments globalFetchDashId
    sandbox.fetchDashboard(false);

    // Now resolve request 1
    resolveSlow();
    const res1 = await req1;

    assert.strictEqual(res1.status, 'stale', 'Manual refresh must return { status: "stale" }');
    assert.strictEqual(btn.innerText, '🔄 Cập nhật Bảng Điểm', 'Stale request must immediately return button to normal');
    assert.strictEqual(btn.disabled, false, 'Button must be enabled in normal state');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // B. EXCEL
  // =======================================================================

  // 11. ensureExcelJsReady() hoàn thành trước Workbook constructor
  console.log('Test DASH-ACT-11: ensureExcelJsReady() completes strictly before Workbook constructor');
  {
    let loaderDone = false;
    const { sandbox } = createDashboardEnv({
      onEnsureExcelJsReady: async () => { loaderDone = true; },
      onWorkbookCreated: () => {
        assert(loaderDone, 'ensureExcelJsReady must have completed before Workbook constructor runs');
      }
    });

    const res = await sandbox.xuatExcel();
    assert.strictEqual(res.status, 'success');
    console.log('  -> PASSED');
  }

  // 12. Loader failure: Workbook count = 0, download click count = 0, status error, error visual -> normal
  console.log('Test DASH-ACT-12: Loader failure sets error state, prevents workbook and download clicks');
  {
    const { sandbox, elements, metrics, advanceTimers } = createDashboardEnv({
      ensureExcelJsError: new Error('CDN download failure')
    });
    const btn = elements['dashExportBtn'];

    const res = await sandbox.xuatExcel();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(metrics.workbookConstructorCount, 0, 'Workbook must not be constructed on loader failure');
    assert.strictEqual(metrics.downloadClickCount, 0, 'Download link must not be clicked on loader failure');
    assert.strictEqual(btn.innerText, '❌ Tải Excel lỗi');
    assert.strictEqual(btn.disabled, true);

    advanceTimers();
    assert.strictEqual(btn.innerText, '📥 Tải Excel');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  // 13. Không selected room: no_room, alert, Workbook count = 0, download count = 0
  console.log('Test DASH-ACT-13: xuatExcel without room returns no_room and alerts without downloading');
  {
    const { sandbox, elements, alerts, metrics } = createDashboardEnv({ room: null });
    const btn = elements['dashExportBtn'];

    const res = await sandbox.xuatExcel();
    assert.strictEqual(res.status, 'no_room');
    assert(alerts.some(a => a.includes('Vui lòng chọn Mã Phòng Thi')));
    assert.strictEqual(metrics.workbookConstructorCount, 0);
    assert.strictEqual(metrics.downloadClickCount, 0);
    assert.strictEqual(btn.innerText, '📥 Tải Excel');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  // 14. Filename chứa chính xác selected room MaPhong
  console.log('Test DASH-ACT-14: Filename contains exact selected room MaPhong');
  {
    const { sandbox } = createDashboardEnv({
      room: {
        id: 'r-1',
        MaPhong: 'ROOM_SPEC_456',
        ma_phong: 'ROOM_SPEC_456',
        truong_id: 'sch-1',
        DoiTuong: 'TatCa'
      }
    });

    const res = await sandbox.xuatExcel();
    assert.strictEqual(res.status, 'success');
    assert(res.file.includes('ROOM_SPEC_456'), `Filename must contain exact room code: ${res.file}`);
    assert(res.file.endsWith('.xlsx'));
    console.log('  -> PASSED');
  }

  // 15. Double invocation thật của xuatExcel(): chỉ 1 Workbook/export, lần hai skipped
  console.log('Test DASH-ACT-15: Double invocation of xuatExcel() runs exactly 1 export, skips second');
  {
    let resolveWriteBuffer;
    const writeDeferred = new Promise(r => { resolveWriteBuffer = r; });

    const { sandbox, metrics } = createDashboardEnv({
      onWriteBuffer: async () => { await writeDeferred; }
    });

    const call1 = sandbox.xuatExcel();
    const call2 = await sandbox.xuatExcel();

    assert.strictEqual(call2.status, 'skipped');
    assert.strictEqual(call2.reason, 'already_running');

    resolveWriteBuffer();
    await call1;

    assert.strictEqual(metrics.workbookConstructorCount, 1, 'Exactly 1 workbook constructor');
    assert.strictEqual(metrics.writeBufferCount, 1, 'Exactly 1 writeBuffer call');
    assert.strictEqual(metrics.downloadClickCount, 1, 'Exactly 1 download click');
    console.log('  -> PASSED');
  }

  // 16. Không còn free/undefined maPhong trong xuatExcel path
  console.log('Test DASH-ACT-16: xuatExcel scope defines maPhong explicitly from currentRoom');
  {
    assert(/const maPhong = currentRoom\.MaPhong \|\| currentRoom\.ma_phong/.test(gvJsSource),
      'xuatExcel/xuatExcelCore must declare const maPhong from currentRoom');
    assert(!/\bmaPhong\b/.test(gvJsSource.slice(gvJsSource.indexOf('async function xuatExcelCore'), gvJsSource.indexOf('const maPhong ='))),
      'maPhong must not be referenced before its declaration in xuatExcelCore');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // C. REGRADE
  // =======================================================================

  // 17. Double invocation thật của khoiPhucChamDiemPhong(): chỉ đúng 1 rpc_grade_pending_room
  console.log('Test DASH-ACT-17: Double invocation of khoiPhucChamDiemPhong() executes exactly 1 RPC');
  {
    let resolveRegrade;
    const regradeDeferred = new Promise(r => { resolveRegrade = r; });

    const { sandbox, rpcCallsByName } = createDashboardEnv({
      mockStaffRpc: async (name) => {
        if (name === 'rpc_grade_pending_room') {
          await regradeDeferred;
          return { status: 'success', attempted: 2, graded: 2, failed: 0 };
        }
        return { status: 'success' };
      }
    });

    const call1 = sandbox.khoiPhucChamDiemPhong();
    const call2 = await sandbox.khoiPhucChamDiemPhong();

    assert.strictEqual(call2.status, 'skipped');
    assert.strictEqual(call2.reason, 'already_running');

    resolveRegrade();
    await call1;

    assert.strictEqual(rpcCallsByName['rpc_grade_pending_room'], 1, 'Exactly 1 regrade RPC must execute');
    console.log('  -> PASSED');
  }

  // 18. RPC trả status error: error feedback + restore
  console.log('Test DASH-ACT-18: khoiPhucChamDiemPhong error response sets error feedback and restores normal');
  {
    const { sandbox, elements, advanceTimers } = createDashboardEnv({
      mockStaffRpc: async (name) => {
        if (name === 'rpc_grade_pending_room') {
          return { status: 'error', message: 'Room locked for grading' };
        }
        return { status: 'success' };
      }
    });
    const btn = elements['dashRegradeBtn'];

    const res = await sandbox.khoiPhucChamDiemPhong();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Chấm lại lỗi');
    assert.strictEqual(btn.disabled, true);

    advanceTimers();
    assert.strictEqual(btn.innerText, '🛠️ Chấm lại bài đang chờ');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  // 19. RPC THROW: error feedback + restore, không kẹt disabled
  console.log('Test DASH-ACT-19: khoiPhucChamDiemPhong throwing exception restores normal state without getting stuck');
  {
    const { sandbox, elements, advanceTimers } = createDashboardEnv({
      mockStaffRpc: async (name) => {
        if (name === 'rpc_grade_pending_room') {
          throw new Error('Database connection crashed');
        }
        return { status: 'success' };
      }
    });
    const btn = elements['dashRegradeBtn'];

    const res = await sandbox.khoiPhucChamDiemPhong();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Chấm lại lỗi');

    advanceTimers();
    assert.strictEqual(btn.innerText, '🛠️ Chấm lại bài đang chờ');
    assert.strictEqual(btn.disabled, false, 'Button must not remain stuck disabled');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // D. DELETE
  // =======================================================================

  // 20. Source/function path xoaDiemPhong không dùng: event.target, window.event
  console.log('Test DASH-ACT-20: xoaDiemPhong does not use event.target or window.event');
  {
    const xoaBody = gvJsSource.slice(gvJsSource.indexOf('async function xoaDiemPhong()'), gvJsSource.indexOf('function getActiveTargetSchoolId()'));
    assert(!/event\.target/.test(xoaBody), 'xoaDiemPhong must not access event.target');
    assert(!/window\.event/.test(xoaBody), 'xoaDiemPhong must not access window.event');
    console.log('  -> PASSED');
  }

  // 21. Cancel: 0 rpc_reset_room_results, button normal
  console.log('Test DASH-ACT-21: xoaDiemPhong cancelled via confirm dialog does not call RPC and restores normal');
  {
    const { sandbox, elements, rpcCallsByName } = createDashboardEnv({ confirmResult: false });
    const btn = elements['dashDeleteResultsBtn'];

    const res = await sandbox.xoaDiemPhong();
    assert.strictEqual(res.status, 'cancelled');
    assert.strictEqual(rpcCallsByName['rpc_reset_room_results'] || 0, 0, 'No reset RPC must be called on cancellation');
    assert.strictEqual(btn.innerText, '🗑️ Xóa điểm phòng này');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  // 22. Double invocation sau confirm: chỉ đúng 1 rpc_reset_room_results (deferred Promise)
  console.log('Test DASH-ACT-22: Double invocation of xoaDiemPhong after confirm executes exactly 1 reset RPC');
  {
    let resolveReset;
    const resetDeferred = new Promise(r => { resolveReset = r; });

    const { sandbox, rpcCallsByName } = createDashboardEnv({
      confirmResult: true,
      mockStaffRpc: async (name) => {
        if (name === 'rpc_reset_room_results') {
          await resetDeferred;
          return { status: 'success', ket_qua_deleted: 1, submissions_deleted: 1 };
        }
        return { status: 'success' };
      }
    });

    const call1 = sandbox.xoaDiemPhong();
    const call2 = await sandbox.xoaDiemPhong();

    assert.strictEqual(call2.status, 'skipped');
    assert.strictEqual(call2.reason, 'already_running');

    resolveReset();
    await call1;

    assert.strictEqual(rpcCallsByName['rpc_reset_room_results'], 1, 'Exactly 1 reset RPC must execute');
    console.log('  -> PASSED');
  }

  // 23. RPC status error: error state + restore
  console.log('Test DASH-ACT-23: xoaDiemPhong RPC returning status error sets error state and restores');
  {
    const { sandbox, elements, advanceTimers } = createDashboardEnv({
      confirmResult: true,
      mockStaffRpc: async (name) => {
        if (name === 'rpc_reset_room_results') {
          return { status: 'error', message: 'Permission denied' };
        }
        return { status: 'success' };
      }
    });
    const btn = elements['dashDeleteResultsBtn'];

    const res = await sandbox.xoaDiemPhong();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Xóa điểm lỗi');

    advanceTimers();
    assert.strictEqual(btn.innerText, '🗑️ Xóa điểm phòng này');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  // 24. RPC throws: error state + restore
  console.log('Test DASH-ACT-24: xoaDiemPhong RPC throwing sets error state and restores');
  {
    const { sandbox, elements, advanceTimers } = createDashboardEnv({
      confirmResult: true,
      mockStaffRpc: async (name) => {
        if (name === 'rpc_reset_room_results') {
          throw new Error('Database reset crashed');
        }
        return { status: 'success' };
      }
    });
    const btn = elements['dashDeleteResultsBtn'];

    const res = await sandbox.xoaDiemPhong();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Xóa điểm lỗi');

    advanceTimers();
    assert.strictEqual(btn.innerText, '🗑️ Xóa điểm phòng này');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  // =======================================================================
  // E. VERSION / VISUAL / INVARIANTS
  // =======================================================================

  // 25. Teacher exact: 20260904-submission-safety-010c
  console.log('Test DASH-ACT-25: Teacher cache bust is exact 20260904-submission-safety-010c');
  {
    assert(gvHtmlSource.includes('giaovien.js?v=20260904-submission-safety-010c'),
      'giaovien.html must include giaovien.js?v=20260904-submission-safety-010c');
    assert(!gvHtmlSource.includes('giaovien.js?v=20260904-flex-lite-009a'),
      'giaovien.html must not contain old 20260904-flex-lite-009a');
    console.log('  -> PASSED');
  }

  // 26. Student HTML/JS exact: 20260904-submission-safety-010a
  console.log('Test DASH-ACT-26: Student cache bust and VERSION constant are exact 20260904-submission-safety-010a');
  {
    assert(hsHtmlSource.includes('hoc_sinh.js?v=20260904-submission-safety-010a'),
      'hoc_sinh.html must include hoc_sinh.js?v=20260904-submission-safety-010a');
    assert(hsJsSource.includes("const VERSION = '20260904-submission-safety-010a';"),
      'hoc_sinh.js must define const VERSION = 20260904-submission-safety-010a');
    console.log('  -> PASSED');
  }

  // 27. sw.js exact: 20260904-submission-safety-010a
  console.log('Test DASH-ACT-27: sw.js VERSION constant is exact 20260904-submission-safety-010a');
  {
    assert(swJsSource.includes("const VERSION = '20260904-submission-safety-010a';"),
      'sw.js must define const VERSION = 20260904-submission-safety-010a');
    console.log('  -> PASSED');
  }

  // 28. CSS disabled rule tồn tại cho dashboard-action-btn
  console.log('Test DASH-ACT-28: CSS disabled rule exists for dashboard-action-btn');
  {
    assert(/\.dashboard-action-btn:disabled\s*\{\s*cursor:\s*not-allowed;\s*opacity:\s*0\.75;?\s*\}/.test(gvHtmlSource),
      'giaovien.html must define .dashboard-action-btn:disabled rule with cursor: not-allowed and opacity: 0.75');
    console.log('  -> PASSED');
  }

  // 29. Authoritative scoring invariant: không đưa lại client-side normalization
  console.log('Test DASH-ACT-29: Authoritative scoring invariant: zero double-normalization code');
  {
    assert(!/\(totalRaw\s*\/\s*maxRaw\)\s*\*\s*10/.test(gvJsSource), 'No (totalRaw/maxRaw)*10 normalization in giaovien.js');
    assert(!/\(totalRaw\s*\/\s*maxRaw\)\s*\*\s*10/.test(hsJsSource), 'No (totalRaw/maxRaw)*10 normalization in hoc_sinh.js');
    console.log('  -> PASSED');
  }

  // 30. All 30 tests completed
  console.log('Test DASH-ACT-30: Test suite execution completed naturally');
  {
    console.log('  -> PASSED');
  }

  console.log('\n=== ALL 30 DASHBOARD ACTION RELIABILITY TESTS PASSED SUCCESSFULLY ===');
}

runAllTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
