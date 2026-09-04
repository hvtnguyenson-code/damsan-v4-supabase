/**
 * tests/teacher_receipt_check_simulation.js
 *
 * SUBMISSION-SAFETY-010C (Correction 01):
 * TEACHER RECEIPT CHECK — LOW-LOAD CLASSROOM CONFIRMATION
 *
 * Behavioral tests verifying:
 * C010C-01: Selecting one room calls rpc_submission_room_counts exactly once.
 * C010C-02: Real overlapping race test:
 *           Start A -> switch to B -> B resolves first -> A resolves later
 *           A must not overwrite B state or DOM; returns { status: 'stale' }.
 * C010C-03: Surface separation:
 *           ctrlMaPhong = Room A, dashMaPhong = Room B.
 *           Control card shows A, dashboard card shows B.
 *           refreshReceiptCountsManually('dashboard') queries B only (no ctrl fallback).
 *           refreshReceiptCountsManually('control') queries A only.
 * C010C-04: Actual dashboard integration:
 *           fetchDashboard(true) (5s polling & Realtime path) produces 0 count RPCs.
 *           fetchDashboard(false) produces 1 count RPC.
 *           Receipt feature creates zero new setInterval or Realtime subscriptions.
 * C010C-05: received == Y renders "đã nhận đủ" state.
 * C010C-06: received < Y renders missing count accurately without blaming student.
 * C010C-07: graded < received displays safely without implying lost submissions.
 * C010C-08: grading_error > 0 is displayed correctly.
 * C010C-09: RPC failure preserves last valid counts, and stale failure protection
 *           ensures obsolete A failure cannot mark current B as failed.
 * C010C-10: room reset/delete clears stale receipt state per surface or globally.
 * C010C-11: Real khoiPhucChamDiemPhong() flow produces strictly and exactly 1 count RPC
 *           (since internal fetchDashboard(true) contributes 0).
 * C010C-12: School-safe denominator proof:
 *           Cached School A students are not used for School B room.
 *           School B roster is loaded once and cached (0 extra SELECT on subsequent room).
 *           Never hard-coded 35.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== RUNNING SUBMISSION-SAFETY-010C TEACHER RECEIPT CHECK SIMULATION SUITE ===\n');

const repoRoot = path.join(__dirname, '..');
const gvJsSource = fs.readFileSync(path.join(repoRoot, 'giaovien.js'), 'utf8');
const gvHtmlSource = fs.readFileSync(path.join(repoRoot, 'giaovien.html'), 'utf8');

// Verify static HTML insertion points and onclick bindings
assert.ok(gvHtmlSource.includes('id="roomReceiptStatusCard"'), 'giaovien.html must contain #roomReceiptStatusCard');
assert.ok(gvHtmlSource.includes('id="receiptStatusContent"'), 'giaovien.html must contain #receiptStatusContent');
assert.ok(gvHtmlSource.includes('id="btnRefreshReceiptCounts"'), 'giaovien.html must contain #btnRefreshReceiptCounts');
assert.ok(gvHtmlSource.includes("refreshReceiptCountsManually('control')"), 'Control button must pass "control" surface');

assert.ok(gvHtmlSource.includes('id="dashReceiptStatusCard"'), 'giaovien.html must contain #dashReceiptStatusCard');
assert.ok(gvHtmlSource.includes('id="dashReceiptStatusContent"'), 'giaovien.html must contain #dashReceiptStatusContent');
assert.ok(gvHtmlSource.includes('id="btnRefreshDashReceiptCounts"'), 'giaovien.html must contain #btnRefreshDashReceiptCounts');
assert.ok(gvHtmlSource.includes("refreshReceiptCountsManually('dashboard')"), 'Dashboard button must pass "dashboard" surface');

function createTeacherReceiptEnv(options = {}) {
  const elements = {};
  const alerts = [];
  const confirms = [];
  const rpcCalls = [];
  const selectQueries = [];
  const intervalCalls = [];
  const realtimeSubscriptions = [];

  function createMockElement(id, tagName = 'div') {
    return {
      id,
      tagName: tagName.toUpperCase(),
      innerText: '',
      innerHTML: '',
      value: '',
      disabled: false,
      attributes: {},
      style: { display: 'none' },
      setAttribute(name, val) { this.attributes[name] = String(val); },
      removeAttribute(name) { delete this.attributes[name]; },
      getAttribute(name) { return this.attributes[name]; },
      options: [],
      selectedIndex: 0,
      click() {
        if (this.onclick) this.onclick();
      }
    };
  }

  // Setup DOM elements needed for receipt check and teacher tabs
  const elementIds = [
    'roomReceiptStatusCard', 'receiptStatusContent', 'btnRefreshReceiptCounts',
    'dashReceiptStatusCard', 'dashReceiptStatusContent', 'btnRefreshDashReceiptCounts',
    'ctrlMaPhong', 'dashMaPhong', 'ctrlLog', 'ctrlTenDot', 'ctrlThoiGian', 'ctrlDoiTuong',
    'dashRefreshBtn', 'dashRegradeBtn', 'dashExportBtn', 'dashDeleteResultsBtn',
    'dashBody', 'liveSearchInput', 'subTabsDashboard', 'radarBody', 'tblRooms',
    'adminDoiTuongList', 'danhSachCauHoi', 'previewQList'
  ];

  elementIds.forEach(id => {
    elements[id] = createMockElement(id);
  });

  const allRoomsData = options.allRoomsData || [];

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
    document: {
      getElementById: (id) => elements[id] || (elements[id] = createMockElement(id)),
      querySelector: (sel) => {
        if (sel && sel.startsWith('#')) return elements[sel.slice(1)] || null;
        return null;
      },
      querySelectorAll: () => [],
      createElement: (tag) => createMockElement('dyn_' + Math.random(), tag),
      addEventListener: () => {}
    },
    window: {
      location: { href: 'http://localhost/giaovien.html', search: '' },
      addEventListener: () => {},
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      }
    },
    navigator: { onLine: true },
    alert: (msg) => alerts.push(msg),
    confirm: (msg) => {
      confirms.push(msg);
      return options.confirmAnswer !== undefined ? options.confirmAnswer : true;
    },
    prompt: () => 'CONFIRM',
    setTimeout: (fn, ms) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout: () => {},
    setInterval: (fn, ms) => {
      intervalCalls.push({ fn, ms });
      return 999;
    },
    clearInterval: () => {},
    sb: {
      from: (table) => {
        return {
          select: (cols) => ({
            eq: (col, val) => {
              selectQueries.push({ table, col, val });
              let res = options.tableData?.[table];
              if (typeof res === 'function') {
                const out = res(val);
                return {
                  order: () => Promise.resolve(out),
                  then: (resolve) => Promise.resolve(out).then(resolve)
                };
              }
              const resultData = options.tableData?.[table]?.[val] || options.tableData?.[table] || [];
              const resObj = { data: resultData, error: null };
              return {
                order: () => Promise.resolve(resObj),
                then: (resolve) => Promise.resolve(resObj).then(resolve)
              };
            },
            order: () => Promise.resolve({ data: options.tableData?.[table] || [], error: null }),
            then: (resolve) => Promise.resolve({ data: options.tableData?.[table] || [], error: null }).then(resolve)
          }),
          insert: () => Promise.resolve({ data: null, error: null }),
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
        };
      },
      rpc: (name, params) => {
        rpcCalls.push({ name, params });
        if (options.rpcHandler) {
          return Promise.resolve(options.rpcHandler(name, params));
        }
        if (name === 'rpc_submission_room_counts') {
          return Promise.resolve({
            data: options.receiptCounts || { received: 35, graded: 35, grading_error: 0 },
            error: options.rpcError || null
          });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      },
      channel: (name) => {
        realtimeSubscriptions.push(name);
        return {
          on: function() { return this; },
          subscribe: function() { return this; },
          unsubscribe: function() { return this; }
        };
      }
    },
    staffRpc: async (name, params) => {
      rpcCalls.push({ name, params });
      if (options.staffRpcHandler) {
        return options.staffRpcHandler(name, params);
      }
      return { status: 'success', attempted: 1, graded: 1, failed: 0 };
    },
    allRoomsData: allRoomsData,
    allStudents: options.allStudents || [],
    getSelectedRoom: (selId) => {
      const val = typeof selId === 'string' ? elements[selId]?.value : selId?.value;
      if (!val) return null;
      return (allRoomsData || []).find(r => r.MaPhong === val || r.ma_phong === val || String(r.id) === String(val)) || null;
    },
    getActiveTargetSchoolId: () => 'school-1',
    getRoomTargetSchoolId: (room) => room?.truong_id || 'school-1',
    gvData: { ma_gv: 'GV001', truong_id: 'school-1', quyen: 'GiaoVien' },
    staffToken: 'staff-token-123',
    currentTeacher: { id: 'teacher-1', truong_id: 'school-1', quyen: 'ADMIN' },
    dashboardManualRefreshActive: false,
    activeDashboardActions: new Set(),
    globalFetchDashId: 0,
    currentDashFilter: 'TatCa',
    activeWorkspaceMonId: 'ALL',
    g_sysMonList: [],
    duLieuBangDiem: [],
    renderDashboardSubTabs: () => {},
    renderDashboardTable: () => {},
    computeDisplayPartContributions: () => ({ finalScore: 10, isSubmitted: true }),
    taiDanhSachPhong: () => {},
    setDashboardActionState: () => {},
    finishDashboardAction: () => {},
    runDashboardAction: async (action, fn) => {
      return fn();
    },
    metrics: { rpcCalls, selectQueries, intervalCalls, realtimeSubscriptions, alerts, confirms, elements }
  };

  sandbox.window.document = sandbox.document;
  sandbox.window.sb = sandbox.sb;

  // Extract receipt check code + fetchDashboard + khoiPhucChamDiemPhong from giaovien.js
  const startMarker = '// SUBMISSION-SAFETY-010C: TEACHER AUTHORITATIVE RECEIPT CHECK';
  const startIdx = gvJsSource.indexOf(startMarker);
  assert(startIdx >= 0, '010C marker must exist in giaovien.js');
  const endMarker = 'async function taiDanhSachPhong()';
  const endIdx = gvJsSource.indexOf(endMarker, startIdx);
  assert(endIdx >= 0, 'taiDanhSachPhong marker must exist in giaovien.js');

  // Also extract fetchDashboard and khoiPhucChamDiemPhong from gvJsSource
  const fetchDashStart = gvJsSource.indexOf('async function fetchDashboard(isAuto = false) {');
  assert(fetchDashStart >= 0, 'fetchDashboard must exist in giaovien.js');
  const fetchDashEnd = gvJsSource.indexOf('async function xoaDiemPhong() {', fetchDashStart);
  assert(fetchDashEnd >= 0, 'xoaDiemPhong must exist in giaovien.js');

  const khoiPhucStart = gvJsSource.indexOf('async function khoiPhucChamDiemPhong() {');
  assert(khoiPhucStart >= 0, 'khoiPhucChamDiemPhong must exist in giaovien.js');
  const khoiPhucEnd = gvJsSource.indexOf('async function xuatExcel()', khoiPhucStart);
  assert(khoiPhucEnd >= 0, 'xuatExcel must exist in giaovien.js');

  const runnerCode = gvJsSource.slice(startIdx, endIdx) + '\n' +
    gvJsSource.slice(fetchDashStart, fetchDashEnd) + '\n' +
    gvJsSource.slice(khoiPhucStart, khoiPhucEnd) + `
    this.lastReceiptState = lastReceiptState;
    this.surfaceReqToken = surfaceReqToken;
    this.receiptStudentsBySchool = receiptStudentsBySchool;
    this.getRoomEligibleStudentCount = getRoomEligibleStudentCount;
    this.ensureStudentsLoadedForRoom = ensureStudentsLoadedForRoom;
    this.clearReceiptStatusDisplay = clearReceiptStatusDisplay;
    this.renderReceiptStatusContent = renderReceiptStatusContent;
    this.fetchReceiptRoomCounts = fetchReceiptRoomCounts;
    this.refreshReceiptCountsManually = refreshReceiptCountsManually;
    this.fetchDashboard = fetchDashboard;
    this.khoiPhucChamDiemPhong = khoiPhucChamDiemPhong;
  `;

  vm.createContext(sandbox);
  vm.runInContext(runnerCode, sandbox);

  return sandbox;
}

async function runTests() {
  // -------------------------------------------------------------
  // Test C010C-01: Selecting one room calls rpc_submission_room_counts exactly once
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: 'TatCa' };
    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA],
      allStudents: [{ MaHS: 'HS01', Lop: '10A1', truong_id: 'school-1' }],
      receiptCounts: { received: 1, graded: 1, grading_error: 0 }
    });

    const res = await env.fetchReceiptRoomCounts(roomA, 'control');
    assert.strictEqual(res.status, 'success');

    const countsCalls = env.metrics.rpcCalls.filter(c => c.name === 'rpc_submission_room_counts');
    assert.strictEqual(countsCalls.length, 1, 'Selecting one room must call rpc_submission_room_counts exactly once');
    assert.strictEqual(countsCalls[0].params.p_phong_id, 'room-uuid-001');

    console.log('PASS: C010C-01 - Selecting one room calls rpc_submission_room_counts exactly once.');
  }

  // -------------------------------------------------------------
  // Test C010C-02: Real overlapping race test
  // Start A deferred -> switch to B -> B resolves first -> A resolves later
  // Final UI/state on that surface must be B; A must return { status: 'stale' }
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const roomB = { id: 'room-uuid-002', MaPhong: 'PHONG_B', truong_id: 'school-1', DoiTuong: '10A2' };

    let resolveRpcA, resolveRpcB;
    const pA = new Promise(res => { resolveRpcA = res; });
    const pB = new Promise(res => { resolveRpcB = res; });

    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA, roomB],
      allStudents: [
        { MaHS: 'HS01', Lop: '10A1', truong_id: 'school-1' },
        { MaHS: 'HS02', Lop: '10A2', truong_id: 'school-1' }
      ],
      rpcHandler: (name, params) => {
        if (name === 'rpc_submission_room_counts') {
          if (params.p_phong_id === 'room-uuid-001') {
            return pA;
          }
          if (params.p_phong_id === 'room-uuid-002') {
            return pB;
          }
        }
        return { data: {}, error: null };
      }
    });

    // 1. User selects room A on control surface
    env.metrics.elements.ctrlMaPhong.value = 'PHONG_A';
    const reqAPromise = env.fetchReceiptRoomCounts(roomA, 'control');

    // 2. User immediately switches to room B on control surface
    env.metrics.elements.ctrlMaPhong.value = 'PHONG_B';
    const reqBPromise = env.fetchReceiptRoomCounts(roomB, 'control');

    // 3. Room B resolves first
    resolveRpcB({ data: { received: 25, graded: 25, grading_error: 0 }, error: null });
    const resB = await reqBPromise;
    assert.strictEqual(resB.status, 'success');
    assert.strictEqual(env.lastReceiptState.control.roomId, 'room-uuid-002');
    assert.strictEqual(env.lastReceiptState.control.received, 25);
    assert.ok(env.metrics.elements.receiptStatusContent.innerHTML.includes('25'));

    // 4. Room A resolves later with obsolete data (received: 10)
    resolveRpcA({ data: { received: 10, graded: 10, grading_error: 0 }, error: null });
    const resA = await reqAPromise;

    // Assert: obsolete request A must return status 'stale'
    assert.strictEqual(resA.status, 'stale', 'Obsolete request A must return { status: "stale" }');

    // Assert: final state and DOM must remain Room B!
    assert.strictEqual(env.lastReceiptState.control.roomId, 'room-uuid-002', 'State must remain Room B');
    assert.strictEqual(env.lastReceiptState.control.received, 25, 'Received count must remain Room B (25)');
    assert.ok(env.metrics.elements.receiptStatusContent.innerHTML.includes('25'), 'DOM must still show 25');
    assert.ok(!env.metrics.elements.receiptStatusContent.innerHTML.includes('10'), 'DOM must NOT be overwritten with 10');

    console.log('PASS: C010C-02 - Real overlapping race test: B resolved first, stale A discarded.');
  }

  // -------------------------------------------------------------
  // Test C010C-03: Surface separation:
  // ctrlMaPhong = Room A, dashMaPhong = Room B
  // Control card shows A, dashboard card shows B
  // refreshReceiptCountsManually('dashboard') queries B only
  // refreshReceiptCountsManually('control') queries A only
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const roomB = { id: 'room-uuid-002', MaPhong: 'PHONG_B', truong_id: 'school-1', DoiTuong: '10A2' };
    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA, roomB],
      allStudents: [
        { MaHS: 'HS01', Lop: '10A1', truong_id: 'school-1' },
        { MaHS: 'HS02', Lop: '10A2', truong_id: 'school-1' }
      ],
      rpcHandler: (name, params) => {
        if (params.p_phong_id === 'room-uuid-001') {
          return { data: { received: 11, graded: 11, grading_error: 0 }, error: null };
        }
        if (params.p_phong_id === 'room-uuid-002') {
          return { data: { received: 22, graded: 22, grading_error: 0 }, error: null };
        }
        return { data: {}, error: null };
      }
    });

    env.metrics.elements.ctrlMaPhong.value = 'PHONG_A';
    env.metrics.elements.dashMaPhong.value = 'PHONG_B';

    // Populate control card with room A
    await env.fetchReceiptRoomCounts(roomA, 'control');
    // Populate dashboard card with room B
    await env.fetchReceiptRoomCounts(roomB, 'dashboard');

    assert.ok(env.metrics.elements.receiptStatusContent.innerHTML.includes('11'), 'Control card must show Room A (11)');
    assert.ok(env.metrics.elements.dashReceiptStatusContent.innerHTML.includes('22'), 'Dashboard card must show Room B (22)');

    // Now call manual refresh on dashboard only
    const rpcCountBefore = env.metrics.rpcCalls.length;
    await env.refreshReceiptCountsManually('dashboard');
    const rpcCountAfter = env.metrics.rpcCalls.length;

    assert.strictEqual(rpcCountAfter, rpcCountBefore + 1, 'Exactly 1 RPC triggered');
    const lastRpc = env.metrics.rpcCalls[env.metrics.rpcCalls.length - 1];
    assert.strictEqual(lastRpc.params.p_phong_id, 'room-uuid-002', 'Must query Room B, never Room A');

    // Now call manual refresh on control only
    await env.refreshReceiptCountsManually('control');
    const ctrlLastRpc = env.metrics.rpcCalls[env.metrics.rpcCalls.length - 1];
    assert.strictEqual(ctrlLastRpc.params.p_phong_id, 'room-uuid-001', 'Must query Room A');

    console.log('PASS: C010C-03 - Control and dashboard surfaces are completely isolated.');
  }

  // -------------------------------------------------------------
  // Test C010C-04: Actual dashboard integration:
  // fetchDashboard(true) (5s polling & Realtime path) produces 0 count RPCs.
  // fetchDashboard(false) produces 1 count RPC.
  // Receipt feature creates zero new setInterval or Realtime subscriptions.
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA],
      allStudents: [{ MaHS: 'HS01', Lop: '10A1', truong_id: 'school-1' }],
      receiptCounts: { received: 1, graded: 1, grading_error: 0 }
    });

    env.metrics.elements.dashMaPhong.value = 'PHONG_A';

    const intervalsBefore = env.metrics.intervalCalls.length;
    const realtimeBefore = env.metrics.realtimeSubscriptions.length;

    // Test 1: fetchDashboard(true) (as triggered by 5s auto-refresh or Realtime ket_qua event)
    const rpcBeforeAuto = env.metrics.rpcCalls.filter(c => c.name === 'rpc_submission_room_counts').length;
    await env.fetchDashboard(true);
    const rpcAfterAuto = env.metrics.rpcCalls.filter(c => c.name === 'rpc_submission_room_counts').length;

    assert.strictEqual(rpcAfterAuto, rpcBeforeAuto, 'fetchDashboard(true) MUST generate ZERO rpc_submission_room_counts calls!');

    // Test 2: fetchDashboard(false) (as triggered by manual room selection or manual refresh)
    await env.fetchDashboard(false);
    const rpcAfterManual = env.metrics.rpcCalls.filter(c => c.name === 'rpc_submission_room_counts').length;

    assert.strictEqual(rpcAfterManual, rpcBeforeAuto + 1, 'fetchDashboard(false) must generate exactly 1 rpc_submission_room_counts call');

    // Test 3: zero timers or Realtime created
    assert.strictEqual(env.metrics.intervalCalls.length, intervalsBefore, 'Must not create any setInterval');
    assert.strictEqual(env.metrics.realtimeSubscriptions.length, realtimeBefore, 'Must not create any Realtime subscription');

    console.log('PASS: C010C-04 - fetchDashboard(true) creates 0 receipt RPCs; no polling or Realtime created.');
  }

  // -------------------------------------------------------------
  // Test C010C-05: received == Y renders "đã nhận đủ" state
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const students = [];
    for (let i = 1; i <= 30; i++) {
      students.push({ MaHS: 'HS' + i, Lop: '10A1', truong_id: 'school-1' });
    }

    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA],
      allStudents: students,
      receiptCounts: { received: 30, graded: 30, grading_error: 0 }
    });

    await env.fetchReceiptRoomCounts(roomA, 'control');
    const html = env.metrics.elements.receiptStatusContent.innerHTML;

    assert.ok(html.includes('30 / 30'), 'Should show 30 / 30');
    assert.ok(html.includes('Đã nhận đủ bài của lớp'), 'Should display "Đã nhận đủ bài của lớp."');

    console.log('PASS: C010C-05 - received == Y renders "đã nhận đủ" state.');
  }

  // -------------------------------------------------------------
  // Test C010C-06: received < Y renders missing count accurately
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const students = [];
    for (let i = 1; i <= 35; i++) {
      students.push({ MaHS: 'HS' + i, Lop: '10A1', truong_id: 'school-1' });
    }

    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA],
      allStudents: students,
      receiptCounts: { received: 32, graded: 30, grading_error: 0 }
    });

    await env.fetchReceiptRoomCounts(roomA, 'control');
    const html = env.metrics.elements.receiptStatusContent.innerHTML;

    assert.ok(html.includes('32 / 35'), 'Should show 32 / 35');
    assert.ok(html.includes('Còn thiếu 3 bài chưa được máy chủ xác nhận'), 'Should display missing count without blaming student');
    assert.ok(!html.toLowerCase().includes('chưa nộp bài'), 'Should NOT accuse student of not submitting');

    console.log('PASS: C010C-06 - received < Y renders missing count accurately.');
  }

  // -------------------------------------------------------------
  // Test C010C-07: graded < received displays safely without implying lost submissions
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const students = [];
    for (let i = 1; i <= 35; i++) {
      students.push({ MaHS: 'HS' + i, Lop: '10A1', truong_id: 'school-1' });
    }

    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA],
      allStudents: students,
      receiptCounts: { received: 35, graded: 30, grading_error: 0 }
    });

    await env.fetchReceiptRoomCounts(roomA, 'control');
    const html = env.metrics.elements.receiptStatusContent.innerHTML;

    assert.ok(html.includes('Máy chủ đã nhận:'), 'Should display server received count');
    assert.ok(html.includes('Đã chấm:'), 'Should display graded count');
    assert.ok(html.includes('35 / 35'), 'Received count should be 35 / 35');
    assert.ok(html.includes('30 / 35'), 'Graded count should be 30 / 35');
    assert.ok(html.includes('đang chờ hoàn tất chấm') || html.includes('an toàn'), 'Should state submissions are safely received pending grading');

    console.log('PASS: C010C-07 - graded < received displays safely without implying lost submissions.');
  }

  // -------------------------------------------------------------
  // Test C010C-08: grading_error > 0 is displayed correctly
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA],
      allStudents: [{ MaHS: 'HS01', Lop: '10A1', truong_id: 'school-1' }],
      receiptCounts: { received: 1, graded: 0, grading_error: 2 }
    });

    await env.fetchReceiptRoomCounts(roomA, 'control');
    const html = env.metrics.elements.receiptStatusContent.innerHTML;

    assert.ok(html.includes('Lỗi chấm: 2'), 'Should display grading error count: 2');

    console.log('PASS: C010C-08 - grading_error > 0 is displayed correctly.');
  }

  // -------------------------------------------------------------
  // Test C010C-09: RPC failure preserves last valid counts, and stale failure protection
  // Obsolete A failure after B success must not mark B as failed!
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const roomB = { id: 'room-uuid-002', MaPhong: 'PHONG_B', truong_id: 'school-1', DoiTuong: '10A2' };

    let rejectRpcA, resolveRpcB;
    const pA = new Promise((_, rej) => { rejectRpcA = rej; });
    const pB = new Promise(res => { resolveRpcB = res; });

    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA, roomB],
      allStudents: [
        { MaHS: 'HS01', Lop: '10A1', truong_id: 'school-1' },
        { MaHS: 'HS02', Lop: '10A2', truong_id: 'school-1' }
      ],
      rpcHandler: (name, params) => {
        if (params.p_phong_id === 'room-uuid-001') return pA;
        if (params.p_phong_id === 'room-uuid-002') return pB;
        return { data: {}, error: null };
      }
    });

    // 1. Request A starts
    env.metrics.elements.ctrlMaPhong.value = 'PHONG_A';
    const reqAPromise = env.fetchReceiptRoomCounts(roomA, 'control');

    // 2. Switch to B
    env.metrics.elements.ctrlMaPhong.value = 'PHONG_B';
    const reqBPromise = env.fetchReceiptRoomCounts(roomB, 'control');

    // 3. B succeeds
    resolveRpcB({ data: { received: 25, graded: 25, grading_error: 0 }, error: null });
    await reqBPromise;
    assert.strictEqual(env.lastReceiptState.control.checkError, false);
    assert.ok(env.metrics.elements.receiptStatusContent.innerHTML.includes('25'));

    // 4. A fails with error
    rejectRpcA(new Error('Network Crash on Room A'));
    const resA = await reqAPromise;
    assert.strictEqual(resA.status, 'stale', 'Obsolete failing request A must be marked stale');

    // 5. Assert: B must NOT be marked as failed!
    assert.strictEqual(env.lastReceiptState.control.checkError, false, 'Obsolete failure must NOT contaminate Room B');
    assert.ok(!env.metrics.elements.receiptStatusContent.innerHTML.includes('Chưa kiểm tra được trạng thái máy chủ'), 'Failure message must NOT appear on Room B');
    assert.ok(env.metrics.elements.receiptStatusContent.innerHTML.includes('25'), 'Room B counts must remain intact');

    console.log('PASS: C010C-09 - RPC failure handling & obsolete failure protection verified.');
  }

  // -------------------------------------------------------------
  // Test C010C-10: room reset/delete clears stale receipt state
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const roomB = { id: 'room-uuid-002', MaPhong: 'PHONG_B', truong_id: 'school-1', DoiTuong: '10A2' };
    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA, roomB],
      allStudents: [{ MaHS: 'HS01', Lop: '10A1', truong_id: 'school-1' }],
      receiptCounts: { received: 1, graded: 1, grading_error: 0 }
    });

    await env.fetchReceiptRoomCounts(roomA, 'control');
    await env.fetchReceiptRoomCounts(roomB, 'dashboard');

    assert.strictEqual(env.metrics.elements.roomReceiptStatusCard.style.display, 'block');
    assert.strictEqual(env.metrics.elements.dashReceiptStatusCard.style.display, 'block');

    // Clear dashboard only
    env.clearReceiptStatusDisplay('dashboard');
    assert.strictEqual(env.metrics.elements.dashReceiptStatusCard.style.display, 'none');
    assert.strictEqual(env.metrics.elements.roomReceiptStatusCard.style.display, 'block', 'Control card should still remain visible');

    // Clear control
    env.clearReceiptStatusDisplay('control');
    assert.strictEqual(env.metrics.elements.roomReceiptStatusCard.style.display, 'none');

    console.log('PASS: C010C-10 - Surface-aware clearReceiptStatusDisplay clears stale receipt state.');
  }

  // -------------------------------------------------------------
  // Test C010C-11: Real khoiPhucChamDiemPhong() flow produces strictly and exactly 1 count RPC
  // -------------------------------------------------------------
  {
    const roomA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-1', DoiTuong: '10A1' };
    const env = createTeacherReceiptEnv({
      allRoomsData: [roomA],
      allStudents: [{ MaHS: 'HS01', Lop: '10A1', truong_id: 'school-1' }],
      receiptCounts: { received: 35, graded: 35, grading_error: 0 },
      staffRpcHandler: async (name, params) => {
        if (name === 'rpc_grade_pending_room' || name === 'rpc_grade_pending_submissions') {
          return { status: 'success', attempted: 2, graded: 2, failed: 0 };
        }
        return { status: 'success' };
      }
    });

    env.metrics.elements.dashMaPhong.value = 'PHONG_A';

    const countRpcsBefore = env.metrics.rpcCalls.filter(c => c.name === 'rpc_submission_room_counts').length;
    assert.strictEqual(countRpcsBefore, 0);

    // Call the actual khoiPhucChamDiemPhong function
    const res = await env.khoiPhucChamDiemPhong();
    assert.strictEqual(res.status, 'success');

    const countRpcsAfter = env.metrics.rpcCalls.filter(c => c.name === 'rpc_submission_room_counts').length;
    assert.strictEqual(countRpcsAfter, 1, 'khoiPhucChamDiemPhong() flow must trigger strictly and exactly ONE rpc_submission_room_counts call!');

    console.log('PASS: C010C-11 - Real khoiPhucChamDiemPhong() triggers strictly and exactly 1 count RPC.');
  }

  // -------------------------------------------------------------
  // Test C010C-12: School-safe denominator proof:
  // Cached School A students are not used for School B room.
  // School B roster is loaded once and cached (0 extra SELECT on subsequent room).
  // -------------------------------------------------------------
  {
    const roomSchoolA = { id: 'room-uuid-001', MaPhong: 'PHONG_A', truong_id: 'school-AAA', DoiTuong: 'TatCa' };
    const roomSchoolB1 = { id: 'room-uuid-002', MaPhong: 'PHONG_B1', truong_id: 'school-BBB', DoiTuong: '10B1' };
    const roomSchoolB2 = { id: 'room-uuid-003', MaPhong: 'PHONG_B2', truong_id: 'school-BBB', DoiTuong: 'TatCa' };

    const studentsSchoolA = [
      { id: 'hs-a1', truong_id: 'school-AAA', ma_hs: 'A1', ho_ten: 'HS A1', lop: '10A1', quyen: 'HOC_SINH' },
      { id: 'hs-a2', truong_id: 'school-AAA', ma_hs: 'A2', ho_ten: 'HS A2', lop: '10A1', quyen: 'HOC_SINH' }
    ];

    const studentsSchoolB = [
      { id: 'hs-b1', truong_id: 'school-BBB', ma_hs: 'B1', ho_ten: 'HS B1', lop: '10B1', quyen: 'HOC_SINH' },
      { id: 'hs-b2', truong_id: 'school-BBB', ma_hs: 'B2', ho_ten: 'HS B2', lop: '10B1', quyen: 'HOC_SINH' },
      { id: 'hs-b3', truong_id: 'school-BBB', ma_hs: 'B3', ho_ten: 'HS B3', lop: '10B2', quyen: 'HOC_SINH' }
    ];

    const env = createTeacherReceiptEnv({
      allRoomsData: [roomSchoolA, roomSchoolB1, roomSchoolB2],
      // In-memory allStudents holds stale School A students
      allStudents: studentsSchoolA.map(s => ({ MaHS: s.ma_hs, HoTen: s.ho_ten, Lop: s.lop, truong_id: s.truong_id })),
      tableData: {
        hoc_sinh: {
          'school-BBB': studentsSchoolB
        }
      },
      receiptCounts: { received: 2, graded: 2, grading_error: 0 }
    });

    // 1. Initial check on Room B1 (school-BBB):
    // Since in-memory allStudents belongs to school-AAA, ensureStudentsLoadedForRoom MUST fetch school-BBB from DB!
    const selectQueriesBefore = env.metrics.selectQueries.length;
    await env.fetchReceiptRoomCounts(roomSchoolB1, 'control');
    const selectQueriesAfter = env.metrics.selectQueries.length;

    assert.strictEqual(selectQueriesAfter, selectQueriesBefore + 1, 'Must query DB for School B roster');
    assert.strictEqual(env.metrics.selectQueries[0].val, 'school-BBB');

    // Check that denominator is 2 (2 students in 10B1 of school-BBB) and NOT using school-AAA
    assert.strictEqual(env.lastReceiptState.control.denominator, 2, 'Denominator must be 2 (from school-BBB, 10B1)');
    assert.notStrictEqual(env.lastReceiptState.control.denominator, 35, 'Must not be hardcoded 35');

    // 2. Subsequent check on Room B2 (also school-BBB):
    // Must reuse cached School B roster -> 0 additional DB queries!
    await env.fetchReceiptRoomCounts(roomSchoolB2, 'control');
    const selectQueriesFinal = env.metrics.selectQueries.length;

    assert.strictEqual(selectQueriesFinal, selectQueriesAfter, 'Subsequent check in same school must use roster cache (0 new DB queries)');
    assert.strictEqual(env.lastReceiptState.control.denominator, 3, 'Denominator for TatCa in school-BBB must be 3');

    console.log('PASS: C010C-12 - School-safe denominator & roster cache isolation proven.');
  }

  // -------------------------------------------------------------
  // Test C010C-13: Roster load failure keeps denominator unknown (never renders as /0)
  // -------------------------------------------------------------
  {
    const roomSchoolB = { id: 'room-uuid-002', MaPhong: 'PHONG_B', truong_id: 'school-BBB', DoiTuong: '10B1' };
    let selectAttemptCount = 0;

    const env = createTeacherReceiptEnv({
      allRoomsData: [roomSchoolB],
      allStudents: [],
      tableData: {
        hoc_sinh: (val) => {
          selectAttemptCount++;
          return { data: null, error: { message: 'Database connection failed for roster' } };
        }
      },
      receiptCounts: { received: 32, graded: 30, grading_error: 0 }
    });

    const rpcCountBefore = env.metrics.rpcCalls.filter(c => c.name === 'rpc_submission_room_counts').length;

    // Call fetchReceiptRoomCounts on roomSchoolB
    const res = await env.fetchReceiptRoomCounts(roomSchoolB, 'control');

    // 1. Receipt result still succeeds or otherwise preserves authoritative counts
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(env.lastReceiptState.control.received, 32);
    assert.strictEqual(env.lastReceiptState.control.graded, 30);
    assert.strictEqual(env.lastReceiptState.control.gradingError, 0);

    // 2. Denominator state must be null (unknown)
    assert.strictEqual(env.lastReceiptState.control.denominator, null, 'Denominator must be null/unknown on roster failure');

    // 3. UI checks:
    const html = env.metrics.elements.receiptStatusContent.innerHTML;
    assert.ok(html.includes('32'), 'Must show received count 32');
    assert.ok(html.includes('30'), 'Must show graded count 30');
    assert.ok(!html.includes('/ 0') && !html.includes('/0'), 'UI must NOT contain "/ 0" or "/0"');
    assert.ok(!html.includes('32 / 0'), 'UI must NOT contain "32 / 0"');
    assert.ok(!html.includes('30 / 0'), 'UI must NOT contain "30 / 0"');
    assert.ok(!html.includes('Đã nhận đủ bài'), 'UI must NOT say "Đã nhận đủ bài" when Y is unknown');
    assert.ok(!html.includes('Còn thiếu'), 'UI must NOT calculate "Còn thiếu ..." when Y is unknown');

    // 4. Exactly one receipt-count RPC and no automatic roster retry loop
    const rpcCountAfter = env.metrics.rpcCalls.filter(c => c.name === 'rpc_submission_room_counts').length;
    assert.strictEqual(rpcCountAfter, rpcCountBefore + 1, 'Exactly one receipt-count RPC must be called');
    assert.strictEqual(selectAttemptCount, 1, 'No automatic roster retry loop');

    console.log('PASS: C010C-13 - Roster load failure keeps denominator unknown, never renders /0.');
  }

  console.log('\nALL 13 SUBMISSION-SAFETY-010C TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
