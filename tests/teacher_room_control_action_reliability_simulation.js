/**
 * tests/teacher_room_control_action_reliability_simulation.js
 *
 * FLEX-LITE-007: Teacher Room Control Action Reliability + Visual Feedback + Radar Action Layout
 *
 * Deterministic VM/mock simulation suite testing:
 * A. Static HTML / Visual structure (IDs, classes, CSS disabled, responsive nowrap layout, colors)
 * B. Manual Room List Reload (reloadRoomListManually transitions, double-click, silent internal)
 * C. Manual Radar Refresh (refreshRadarManually transitions, double-click, silent internal)
 * D. Selected-Room Commands (no_room, MO_PHONG, THU_BAI, CONG_BO_DIEM, XEM_DAP_AN, cross-button race, error recovery)
 * E. Preview Button Reliability (xemTruocDeThi no room, double-click, RPC error, thrown error, no fragile selector)
 * F. Batch Radar Actions (no_selection, batch open, batch lock, double-click, partial lock block, lock release)
 * G. Radar Row Quick Actions (canonical renderer, stable IDs, state toggle, delete cancellations, delete double-click, conflict, independent rooms)
 * H. Forbidden Event Dependency (zero event.target / window.event across room control functions)
 * I. Canonical Renderer Single Source (used in fetchRadar and tuDongKhoaPhongKhiHetGio)
 * J. Invariants (teacher 007, student 005, sw 005, authoritative score preservation, natural exit)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const gvHtmlSource = fs.readFileSync(path.join(repoRoot, 'giaovien.html'), 'utf8');
const gvJsSource = fs.readFileSync(path.join(repoRoot, 'giaovien.js'), 'utf8');
const hsHtmlSource = fs.readFileSync(path.join(repoRoot, 'hoc_sinh.html'), 'utf8');
const hsJsSource = fs.readFileSync(path.join(repoRoot, 'hoc_sinh.js'), 'utf8');
const swJsSource = fs.readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');

function createHarness(options = {}) {
  const elements = {};
  const metrics = {
    rpcCalls: [],
    rpcCallsByName: {},
    alerts: [],
    confirms: [],
    timerCount: 0,
    radarFetchCount: 0,
    taiPhongCount: 0
  };

  function createMockElement(id, tagName = 'div') {
    const el = {
      id,
      tagName: tagName.toUpperCase(),
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); }
      },
      innerText: '',
      innerHTML: '',
      value: '',
      checked: false,
      disabled: false,
      attributes: {},
      style: {},
      setAttribute(name, val) { this.attributes[name] = String(val); },
      removeAttribute(name) { delete this.attributes[name]; },
      getAttribute(name) { return this.attributes[name]; },
      closest(sel) {
        if (sel === 'tr') {
          return {
            querySelector: (s) => {
              if (s === '.fast-doituong') return { value: '10A1' };
              return null;
            }
          };
        }
        return null;
      },
      querySelector: (s) => null,
      querySelectorAll: (s) => []
    };
    const grandParent = {
      parentNode: null,
      parentElement: null,
      insertBefore: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    };
    const parent = {
      parentNode: grandParent,
      parentElement: grandParent,
      insertBefore: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    };
    el.parentNode = parent;
    el.parentElement = parent;
    return el;
  }

  // Setup standard static buttons
  const staticBtnIds = [
    'roomReloadBtn',
    'roomOpenBtn',
    'roomLockBtn',
    'roomPublishScoreBtn',
    'roomPublishAnswerBtn',
    'roomPreviewBtn',
    'roomRadarRefreshBtn',
    'roomBatchOpenBtn',
    'roomBatchLockBtn'
  ];
  staticBtnIds.forEach(id => {
    elements[id] = createMockElement(id, 'button');
  });

  elements['ctrlMaPhong'] = createMockElement('ctrlMaPhong', 'select');
  elements['ctrlTenDot'] = createMockElement('ctrlTenDot', 'input');
  elements['ctrlThoiGian'] = createMockElement('ctrlThoiGian', 'input');
  elements['ctrlThoiGian'].value = '45';
  elements['ctrlDoiTuong'] = createMockElement('ctrlDoiTuong', 'select');
  elements['ctrlDoiTuong'].value = 'TatCa';
  elements['ctrlLog'] = createMockElement('ctrlLog', 'p');
  elements['radarBody'] = createMockElement('radarBody', 'tbody');
  elements['previewMaDeSelect'] = createMockElement('previewMaDeSelect', 'select');
  elements['previewModal'] = createMockElement('previewModal', 'div');
  elements['batchActionLog'] = createMockElement('batchActionLog', 'span');

  const pendingTimers = [];

  const defaultRoom = options.defaultRoom !== undefined ? options.defaultRoom : {
    id: 'room-uuid-101',
    MaPhong: 'ROOM101',
    ma_phong: 'ROOM101',
    truong_id: 'school-uuid-999',
    ten_truong: 'THPT Test',
    TrangThai: 'CHỜ THI',
    DoiTuong: 'TatCa',
    ThoiGian: 45
  };

  const allRooms = options.allRooms || [defaultRoom];

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
        if (sel.startsWith('.chk-Room[value="')) {
          const m = sel.match(/value="([^"]+)"/);
          if (m && elements['chk-' + m[1]]) return elements['chk-' + m[1]];
        }
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel === '.chk-Room:checked') {
          return options.checkedRooms ? options.checkedRooms.map(r => {
            const el = createMockElement('chk-' + r.id, 'input');
            el.value = r.id;
            el.checked = true;
            return el;
          }) : [];
        }
        return [];
      },
      createElement: (tag) => createMockElement('dynamic-' + tag, tag)
    },
    window: {},
    teacherTimerInterval: null,
    setInterval: (fn, delay) => 123,
    clearInterval: (id) => {},
    parseTimeSafely: (t) => 0,
    setTimeout: (fn, delay) => {
      const timer = { fn, delay, executed: false };
      pendingTimers.push(timer);
      metrics.timerCount++;
      return timer;
    },
    clearTimeout: (timer) => {
      if (timer) timer.executed = true;
    },
    alert: (msg) => { metrics.alerts.push(msg); },
    confirm: (msg) => {
      metrics.confirms.push(msg);
      return options.confirmResult !== undefined ? options.confirmResult : true;
    },
    staffRpc: async (name, params) => {
      metrics.rpcCalls.push({ name, params });
      metrics.rpcCallsByName[name] = (metrics.rpcCallsByName[name] || 0) + 1;
      if (options.mockStaffRpc) {
        return options.mockStaffRpc(name, params);
      }
      return { status: 'success', data: {} };
    },
    getSelectedRoom: (selectId) => defaultRoom,
    getRoomTargetSchoolId: (room) => room?.truong_id || 'school-uuid-999',
    gvData: { ma_gv: 'GV001', truong_id: 'school-uuid-999', quyen: 'GiaoVien' },
    allRoomsData: allRooms,
    activeWorkspaceMonId: 'ALL',
    activeWorkspaceTruongId: 'ALL',
    previewExamData: [],
    renderPreviewContent: () => {}
  };

  vm.createContext(sandbox);

  // Extract necessary room control code snippet from gvJsSource
  const helperMarker = '// ==========================================================\n// ROOM CONTROL ACTION STATE & RELIABILITY HELPERS (FLEX-LITE-007)';
  const helperIdx = gvJsSource.indexOf(helperMarker);
  assert(helperIdx >= 0, 'ROOM CONTROL HELPERS marker must be found in giaovien.js');

  const taiPhongMarker = 'async function taiDanhSachPhong() {';
  const taiPhongIdx = gvJsSource.indexOf(taiPhongMarker, helperIdx);
  assert(taiPhongIdx >= 0, 'taiDanhSachPhong must be found after helpers in giaovien.js');

  // Extract helpers + dieuKhien + dieuKhienFast + xoaPhongHoanToan + xoaDeTrongPhong + tuDongKhoaPhong + fetchRadar + dieuKhienNhomPhong
  const snippet = gvJsSource.slice(helperIdx, taiPhongIdx);

  // Also extract rpcDieuKhienPhongThi and xemTruocDeThi
  const rpcDieuKhienMarker = 'async function rpcDieuKhienPhongThi(';
  const rpcDieuKhienIdx = gvJsSource.indexOf(rpcDieuKhienMarker);
  assert(rpcDieuKhienIdx >= 0, 'rpcDieuKhienPhongThi must be found in giaovien.js');
  const rpcLayMarker = 'async function rpcLayDanhSachPhongThi()';
  const rpcLayIdx = gvJsSource.indexOf(rpcLayMarker, rpcDieuKhienIdx);
  const rpcSnippet = gvJsSource.slice(rpcDieuKhienIdx, rpcLayIdx);

  const xemTruocMarker = 'async function xemTruocDeThi() {';
  const xemTruocIdx = gvJsSource.indexOf(xemTruocMarker);
  assert(xemTruocIdx >= 0, 'xemTruocDeThi must be found in giaovien.js');
  const renderPreviewMarker = 'function renderPreviewContent() {';
  const renderPreviewIdx = gvJsSource.indexOf(renderPreviewMarker, xemTruocIdx);
  const xemTruocSnippet = gvJsSource.slice(xemTruocIdx, renderPreviewIdx);

  const fullSnippet = snippet + '\n' + rpcSnippet + '\n' + xemTruocSnippet;

  vm.runInContext(fullSnippet, sandbox);

  const origTaiPhong = sandbox.taiDanhSachPhong;
  sandbox.taiDanhSachPhong = async () => {
    metrics.taiPhongCount++;
    if (options.taiPhongError) throw options.taiPhongError;
    if (origTaiPhong) return origTaiPhong();
    return { status: 'success' };
  };

  const origFetchRadar = sandbox.fetchRadar;
  sandbox.fetchRadar = async () => {
    metrics.radarFetchCount++;
    if (options.fetchRadarError) throw options.fetchRadarError;
    if (origFetchRadar) return origFetchRadar();
    return { status: 'success' };
  };

  sandbox.rpcLayDanhSachPhongThi = async () => {
    if (options.fetchRadarError) throw options.fetchRadarError;
    if (options.taiPhongError) throw options.taiPhongError;
    return options.allRooms || [defaultRoom];
  };

  function advanceTimers(ms = 800) {
    const toRun = pendingTimers.filter(t => !t.executed && t.delay <= ms);
    toRun.forEach(t => {
      t.executed = true;
      t.fn();
    });
  }

  return { sandbox, elements, metrics, advanceTimers, pendingTimers };
}

async function runAllTests() {
  console.log('=== RUNNING FLEX-LITE-007 TEACHER ROOM CONTROL RELIABILITY TEST SUITE ===\n');

  // =======================================================================
  // A. STATIC HTML / VISUAL (Tests 1 - 12)
  // =======================================================================

  console.log('Test ROOM-ACT-01: Stable button IDs exist for all 7 static room control buttons');
  {
    const expectedIds = [
      'roomReloadBtn',
      'roomOpenBtn',
      'roomLockBtn',
      'roomPublishScoreBtn',
      'roomPublishAnswerBtn',
      'roomPreviewBtn',
      'roomRadarRefreshBtn'
    ];
    expectedIds.forEach(id => {
      assert(gvHtmlSource.includes(`id="${id}"`), `HTML must contain button with id="${id}"`);
    });
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-02: All 7 static buttons have common class room-action-btn');
  {
    const expectedIds = [
      'roomReloadBtn',
      'roomOpenBtn',
      'roomLockBtn',
      'roomPublishScoreBtn',
      'roomPublishAnswerBtn',
      'roomPreviewBtn',
      'roomRadarRefreshBtn'
    ];
    expectedIds.forEach(id => {
      const match = gvHtmlSource.match(new RegExp(`id="${id}"[^>]*class="([^"]*)"`)) ||
                    gvHtmlSource.match(new RegExp(`class="([^"]*)"[^>]*id="${id}"`));
      assert(match, `Button ${id} must have class attribute`);
      assert(match[1].includes('room-action-btn'), `Button ${id} class must include room-action-btn`);
    });
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-03: HTML manual reload button calls reloadRoomListManually() and not taiDanhSachPhong() directly');
  {
    const m = gvHtmlSource.match(/id="roomReloadBtn"[^>]*onclick="([^"]*)"/) ||
              gvHtmlSource.match(/onclick="([^"]*)"[^>]*id="roomReloadBtn"/);
    assert(m, 'roomReloadBtn must have onclick attribute');
    assert(m[1].includes('reloadRoomListManually()'), 'roomReloadBtn must call reloadRoomListManually()');
    assert(!m[1].includes('taiDanhSachPhong()'), 'roomReloadBtn must not call taiDanhSachPhong() directly');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-04: HTML manual Radar button calls refreshRadarManually() and not fetchRadar() directly');
  {
    const m = gvHtmlSource.match(/id="roomRadarRefreshBtn"[^>]*onclick="([^"]*)"/) ||
              gvHtmlSource.match(/onclick="([^"]*)"[^>]*id="roomRadarRefreshBtn"/);
    assert(m, 'roomRadarRefreshBtn must have onclick attribute');
    assert(m[1].includes('refreshRadarManually()'), 'roomRadarRefreshBtn must call refreshRadarManually()');
    assert(!m[1].includes('fetchRadar()'), 'roomRadarRefreshBtn must not call fetchRadar() directly');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-05: Teacher cache bust is exact 20260903-flex-lite-007 in giaovien.html');
  {
    assert(gvHtmlSource.includes('giaovien.js?v=20260903-flex-lite-007'),
      'giaovien.html must include giaovien.js?v=20260903-flex-lite-007');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-06: CSS disabled rule exists for room-action-btn, room-batch-action-btn, radar-action-btn');
  {
    assert(gvHtmlSource.includes('.room-action-btn:disabled') &&
           gvHtmlSource.includes('.room-batch-action-btn:disabled') &&
           gvHtmlSource.includes('.radar-action-btn:disabled'),
      'giaovien.html must define disabled CSS for room, batch, and radar buttons');
    assert(gvHtmlSource.includes('cursor: not-allowed;') && gvHtmlSource.includes('opacity: 0.75;'),
      'Disabled rule must set cursor: not-allowed and opacity: 0.75');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-07: .radar-action-group desktop CSS uses flex-direction: row and flex-wrap: nowrap');
  {
    assert(gvHtmlSource.includes('.radar-action-group'), 'CSS must define .radar-action-group');
    assert(/flex-direction:\s*row/.test(gvHtmlSource), '.radar-action-group must define flex-direction: row');
    assert(/flex-wrap:\s*nowrap/.test(gvHtmlSource), '.radar-action-group must define flex-wrap: nowrap');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-08: .radar-action-group media query switches to flex-direction: column for narrow screens');
  {
    assert(gvHtmlSource.includes('@media (max-width: 720px)'), 'Media query for max-width: 720px must exist');
    assert(gvHtmlSource.includes('flex-direction: column;'), 'Media query must set flex-direction: column');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-09: No flex-wrap: wrap on .radar-action-group (prevents 2+1 layout)');
  {
    assert(!/\.radar-action-group[^{]*{[^}]*flex-wrap:\s*wrap[;\s]/.test(gvHtmlSource),
      '.radar-action-group must NOT use flex-wrap: wrap');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-10: .radar-status-cell CSS enforces white-space: nowrap');
  {
    assert(gvHtmlSource.includes('.radar-status-cell'), 'CSS must define .radar-status-cell');
    const match = gvHtmlSource.match(/\.radar-status-cell\s*{([^}]+)}/);
    assert(match && match[1].includes('white-space: nowrap'), '.radar-status-cell must have white-space: nowrap');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-11: .radar-action-delete-all CSS uses destructive red color');
  {
    const m = gvHtmlSource.match(/\.radar-action-delete-all\s*{([^}]+)}/);
    assert(m && m[1].includes('#c0392b'), '.radar-action-delete-all must have destructive red background #c0392b');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-12: .radar-action-delete-exam CSS uses orange color');
  {
    const m = gvHtmlSource.match(/\.radar-action-delete-exam\s*{([^}]+)}/);
    assert(m && m[1].includes('#f39c12'), '.radar-action-delete-exam must have orange background #f39c12');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // B. MANUAL ROOM LIST RELOAD (Tests 13 - 16)
  // =======================================================================

  console.log('Test ROOM-ACT-13: reloadRoomListManually success transitions: normal -> busy -> success -> normal');
  {
    const { sandbox, elements, advanceTimers } = createHarness();
    const btn = elements['roomReloadBtn'];
    btn.innerText = '🔄 Tải lại';

    const p = sandbox.reloadRoomListManually();
    assert.strictEqual(btn.innerText, '⏳ Đang tải...');
    assert.strictEqual(btn.disabled, true);
    assert.strictEqual(btn.getAttribute('aria-busy'), 'true');

    await p;
    assert.strictEqual(btn.innerText, '✅ Đã tải');
    assert.strictEqual(btn.disabled, true);

    advanceTimers(800);
    assert.strictEqual(btn.innerText, '🔄 Tải lại');
    assert.strictEqual(btn.disabled, false);
    assert.strictEqual(btn.getAttribute('aria-busy'), undefined);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-14: reloadRoomListManually failure transitions: busy -> error -> normal');
  {
    const { sandbox, elements, advanceTimers } = createHarness({
      taiPhongError: new Error('Network failure')
    });
    const btn = elements['roomReloadBtn'];
    btn.innerText = '🔄 Tải lại';

    const res = await sandbox.reloadRoomListManually();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Tải lỗi');
    assert.strictEqual(btn.disabled, true);

    advanceTimers(800);
    assert.strictEqual(btn.innerText, '🔄 Tải lại');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-15: Rapid double invocation of reloadRoomListManually executes exactly 1 reload');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness();
    sandbox.taiDanhSachPhong = () => new Promise(res => {
      delayResolve = res;
      metrics.taiPhongCount++;
    });

    const p1 = sandbox.reloadRoomListManually();
    const p2 = sandbox.reloadRoomListManually();

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.taiPhongCount, 1, 'Only 1 underlying taiDanhSachPhong call allowed');
    assert.strictEqual(res2.status, 'skipped', 'Second call must be skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-16: Internal direct taiDanhSachPhong() does not mutate manual button state');
  {
    const { sandbox, elements } = createHarness();
    const btn = elements['roomReloadBtn'];
    btn.innerText = '🔄 Tải lại';
    btn.disabled = false;

    await sandbox.taiDanhSachPhong();
    assert.strictEqual(btn.innerText, '🔄 Tải lại', 'Button label must remain unchanged');
    assert.strictEqual(btn.disabled, false, 'Button must remain enabled');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // C. MANUAL RADAR REFRESH (Tests 17 - 20)
  // =======================================================================

  console.log('Test ROOM-ACT-17: refreshRadarManually success transitions: normal -> busy -> success -> normal');
  {
    const { sandbox, elements, advanceTimers } = createHarness();
    const btn = elements['roomRadarRefreshBtn'];
    btn.innerText = '🔄 Quét lại Radar';

    const p = sandbox.refreshRadarManually();
    assert.strictEqual(btn.innerText, '⏳ Đang quét...');
    assert.strictEqual(btn.disabled, true);

    await p;
    assert.strictEqual(btn.innerText, '✅ Radar đã cập nhật');
    assert.strictEqual(btn.disabled, true);

    advanceTimers(800);
    assert.strictEqual(btn.innerText, '🔄 Quét lại Radar');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-18: refreshRadarManually failure transitions: busy -> error -> normal');
  {
    const { sandbox, elements, advanceTimers } = createHarness({
      fetchRadarError: new Error('Radar network timeout')
    });
    const btn = elements['roomRadarRefreshBtn'];
    btn.innerText = '🔄 Quét lại Radar';

    const res = await sandbox.refreshRadarManually();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Quét Radar lỗi');
    assert.strictEqual(btn.disabled, true);

    advanceTimers(800);
    assert.strictEqual(btn.innerText, '🔄 Quét lại Radar');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-19: Rapid double invocation of refreshRadarManually executes exactly 1 fetchRadar');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness();
    sandbox.fetchRadar = () => new Promise(res => {
      delayResolve = res;
      metrics.radarFetchCount++;
    });

    const p1 = sandbox.refreshRadarManually();
    const p2 = sandbox.refreshRadarManually();

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.radarFetchCount, 1, 'Only 1 underlying fetchRadar call allowed');
    assert.strictEqual(res2.status, 'skipped', 'Second call must be skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-20: Internal direct fetchRadar() does not mutate manual button state');
  {
    const { sandbox, elements } = createHarness();
    const btn = elements['roomRadarRefreshBtn'];
    btn.innerText = '🔄 Quét lại Radar';
    btn.disabled = false;

    await sandbox.fetchRadar();
    assert.strictEqual(btn.innerText, '🔄 Quét lại Radar', 'Button text must remain intact');
    assert.strictEqual(btn.disabled, false, 'Button must remain enabled');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // D. SELECTED-ROOM COMMANDS (Tests 21 - 29)
  // =======================================================================

  console.log('Test ROOM-ACT-21: dieuKhien without selected room returns no_room and issues 0 RPCs');
  {
    const { sandbox, elements, metrics } = createHarness();
    sandbox.getSelectedRoom = () => null;

    const res = await sandbox.dieuKhien('MO_PHONG');
    assert.strictEqual(res.status, 'no_room');
    assert.strictEqual(metrics.rpcCalls.length, 0, 'Must issue 0 RPC calls when no room is selected');
    assert(metrics.alerts.length > 0, 'Must alert user to select room');
    assert.strictEqual(elements['roomOpenBtn'].disabled, false, 'Button must remain enabled');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-22: dieuKhien(MO_PHONG) success transitions: normal -> busy -> success -> normal');
  {
    const { sandbox, elements, advanceTimers } = createHarness();
    const btn = elements['roomOpenBtn'];
    btn.innerText = '🟢 Mở Phòng (Đếm giờ)';

    const p = sandbox.dieuKhien('MO_PHONG');
    assert.strictEqual(btn.innerText, '⏳ Đang mở phòng...');
    assert.strictEqual(btn.disabled, true);

    const res = await p;
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(btn.innerText, '✅ Đã mở phòng');

    advanceTimers(800);
    assert.strictEqual(btn.innerText, '🟢 Mở Phòng (Đếm giờ)');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-23: dieuKhien(MO_PHONG) rapid double invocation executes exactly 1 mutation');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      mockStaffRpc: async (name, params) => {
        if (name === 'rpc_dieu_khien_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const p1 = sandbox.dieuKhien('MO_PHONG');
    const p2 = sandbox.dieuKhien('MO_PHONG');

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 1, 'Only 1 RPC execution');
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-24: dieuKhien(THU_BAI) rapid double invocation executes exactly 1 mutation');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      mockStaffRpc: async (name, params) => {
        if (name === 'rpc_dieu_khien_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const p1 = sandbox.dieuKhien('THU_BAI');
    const p2 = sandbox.dieuKhien('THU_BAI');

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 1);
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-25: dieuKhien(CONG_BO_DIEM) rapid double invocation executes exactly 1 mutation');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      mockStaffRpc: async (name, params) => {
        if (name === 'rpc_dieu_khien_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const p1 = sandbox.dieuKhien('CONG_BO_DIEM');
    const p2 = sandbox.dieuKhien('CONG_BO_DIEM');

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 1);
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-26: dieuKhien(XEM_DAP_AN) rapid double invocation executes exactly 1 mutation');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      mockStaffRpc: async (name, params) => {
        if (name === 'rpc_dieu_khien_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const p1 = sandbox.dieuKhien('XEM_DAP_AN');
    const p2 = sandbox.dieuKhien('XEM_DAP_AN');

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 1);
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-27: Cross-button same-room race: while MO_PHONG is pending, THU_BAI is skipped (room_busy)');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      mockStaffRpc: async (name, params) => {
        if (name === 'rpc_dieu_khien_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const pOpen = sandbox.dieuKhien('MO_PHONG');
    const pLock = sandbox.dieuKhien('THU_BAI');

    if (delayResolve) delayResolve();
    const [resOpen, resLock] = await Promise.all([pOpen, pLock]);

    assert.strictEqual(resOpen.status, 'success');
    assert.strictEqual(resLock.status, 'skipped');
    assert.strictEqual(resLock.reason, 'room_busy');
    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 1, 'Zero second mutation RPC allowed');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-28: dieuKhien RPC status error sets error feedback and restores UI/lock');
  {
    const { sandbox, elements, advanceTimers } = createHarness({
      mockStaffRpc: async () => ({ status: 'error', message: 'Room locked by admin' })
    });
    const btn = elements['roomOpenBtn'];
    btn.innerText = '🟢 Mở Phòng (Đếm giờ)';

    const res = await sandbox.dieuKhien('MO_PHONG');
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Mở phòng lỗi');

    advanceTimers(800);
    assert.strictEqual(btn.innerText, '🟢 Mở Phòng (Đếm giờ)');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-29: dieuKhien thrown exception restores UI and releases room lock');
  {
    const { sandbox, elements, advanceTimers } = createHarness({
      mockStaffRpc: async () => { throw new Error('Database connection reset'); }
    });
    const btn = elements['roomOpenBtn'];

    const res = await sandbox.dieuKhien('MO_PHONG');
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Mở phòng lỗi');

    advanceTimers(800);
    assert.strictEqual(btn.disabled, false);
    assert.strictEqual(btn.innerText, '🟢 Mở Phòng (Đếm giờ)');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // E. PREVIEW BUTTON RELIABILITY (Tests 30 - 35)
  // =======================================================================

  console.log('Test ROOM-ACT-30: xemTruocDeThi without selected room returns no_room and issues 0 RPCs');
  {
    const { sandbox, metrics, elements } = createHarness();
    sandbox.getSelectedRoom = () => null;

    const res = await sandbox.xemTruocDeThi();
    assert.strictEqual(res.status, 'no_room');
    assert.strictEqual(metrics.rpcCalls.length, 0);
    assert.strictEqual(elements['roomPreviewBtn'].disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-31: xemTruocDeThi rapid double invocation executes exactly 1 preview RPC');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      mockStaffRpc: async (name) => {
        if (name === 'rpc_staff_exam_preview') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success', exams: [{ ma_de: '101', cau_so: '[]' }] };
      }
    });

    const p1 = sandbox.xemTruocDeThi();
    const p2 = sandbox.xemTruocDeThi();

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.rpcCallsByName['rpc_staff_exam_preview'], 1);
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-32: xemTruocDeThi success transitions: normal -> busy -> success -> normal');
  {
    const { sandbox, elements, advanceTimers } = createHarness({
      mockStaffRpc: async () => ({ status: 'success', exams: [{ ma_de: '101', cau_so: '[]' }] })
    });
    const btn = elements['roomPreviewBtn'];
    btn.innerText = '🔍 Xem trước Đề trong phòng';

    const p = sandbox.xemTruocDeThi();
    assert.strictEqual(btn.innerText, '⏳ Đang tải đề...');
    assert.strictEqual(btn.disabled, true);

    const res = await p;
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(btn.innerText, '✅ Đã mở xem trước');

    advanceTimers(800);
    assert.strictEqual(btn.innerText, '🔍 Xem trước Đề trong phòng');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-33: xemTruocDeThi RPC status error sets error feedback and restores normal');
  {
    const { sandbox, elements, advanceTimers } = createHarness({
      mockStaffRpc: async () => ({ status: 'error', message: 'Exam preview forbidden' })
    });
    const btn = elements['roomPreviewBtn'];

    const res = await sandbox.xemTruocDeThi();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Xem trước lỗi');

    advanceTimers(800);
    assert.strictEqual(btn.innerText, '🔍 Xem trước Đề trong phòng');
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-34: xemTruocDeThi thrown exception sets error feedback and restores normal');
  {
    const { sandbox, elements, advanceTimers } = createHarness({
      mockStaffRpc: async () => { throw new Error('Preview server crash'); }
    });
    const btn = elements['roomPreviewBtn'];

    const res = await sandbox.xemTruocDeThi();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(btn.innerText, '❌ Xem trước lỗi');

    advanceTimers(800);
    assert.strictEqual(btn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-35: giaovien.js contains zero fragile button[onclick="xemTruocDeThi()"] querySelector');
  {
    assert(!gvJsSource.includes('button[onclick="xemTruocDeThi()"]'),
      'giaovien.js must not query button by onclick="xemTruocDeThi()"');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // F. BATCH RADAR ACTIONS (Tests 36 - 42)
  // =======================================================================

  console.log('Test ROOM-ACT-36: dieuKhienNhomPhong with 0 checked rooms returns no_selection and issues 0 RPCs');
  {
    const { sandbox, metrics } = createHarness({ checkedRooms: [] });

    const res = await sandbox.dieuKhienNhomPhong('MO_PHONG');
    assert.strictEqual(res.status, 'no_selection');
    assert.strictEqual(metrics.rpcCalls.length, 0);
    assert(metrics.alerts.length > 0);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-37: dieuKhienNhomPhong(MO_PHONG) executes mutation RPCs only for checked rooms');
  {
    const rooms = [
      { id: 'room-1', MaPhong: 'P1', truong_id: 'sch-1' },
      { id: 'room-2', MaPhong: 'P2', truong_id: 'sch-1' }
    ];
    const { sandbox, metrics, elements } = createHarness({
      allRooms: rooms,
      checkedRooms: rooms
    });

    const res = await sandbox.dieuKhienNhomPhong('MO_PHONG');
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 2);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-38: dieuKhienNhomPhong(THU_BAI) executes mutation RPCs only for checked rooms');
  {
    const rooms = [
      { id: 'room-1', MaPhong: 'P1', truong_id: 'sch-1' },
      { id: 'room-2', MaPhong: 'P2', truong_id: 'sch-1' },
      { id: 'room-3', MaPhong: 'P3', truong_id: 'sch-1' }
    ];
    const { sandbox, metrics } = createHarness({
      allRooms: rooms,
      checkedRooms: [rooms[0], rooms[2]]
    });

    const res = await sandbox.dieuKhienNhomPhong('THU_BAI');
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 2);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-39: Rapid double invocation of dieuKhienNhomPhong executes exactly 1 batch');
  {
    let delayResolve;
    const rooms = [{ id: 'room-1', MaPhong: 'P1' }];
    const { sandbox, metrics } = createHarness({
      allRooms: rooms,
      checkedRooms: rooms,
      mockStaffRpc: async (name) => {
        if (name === 'rpc_dieu_khien_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const p1 = sandbox.dieuKhienNhomPhong('MO_PHONG');
    const p2 = sandbox.dieuKhienNhomPhong('MO_PHONG');

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 1);
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-40: If any selected room is already mutation-locked, batch returns skipped (zero RPCs)');
  {
    let delayResolve;
    const rooms = [
      { id: 'room-101', MaPhong: 'P101', truong_id: 'sch-1' },
      { id: 'room-102', MaPhong: 'P102', truong_id: 'sch-1' }
    ];
    const { sandbox, metrics } = createHarness({
      allRooms: rooms,
      defaultRoom: rooms[0],
      checkedRooms: rooms,
      mockStaffRpc: async (name) => {
        if (name === 'rpc_dieu_khien_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    // Start single room mutation on room-101
    const pSingle = sandbox.dieuKhien('MO_PHONG');

    // Attempt batch including room-101 and room-102
    const pBatch = sandbox.dieuKhienNhomPhong('THU_BAI');

    delayResolve();
    const [resSingle, resBatch] = await Promise.all([pSingle, pBatch]);

    assert.strictEqual(resSingle.status, 'success');
    assert.strictEqual(resBatch.status, 'skipped');
    assert.strictEqual(resBatch.reason, 'room_busy');
    // Only 1 mutation RPC (the single room one)
    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 1);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-41: All acquired room locks are released after batch success');
  {
    const rooms = [{ id: 'room-201', MaPhong: 'P201', truong_id: 'sch-1' }];
    const { sandbox } = createHarness({ allRooms: rooms, defaultRoom: rooms[0], checkedRooms: rooms });

    const resBatch = await sandbox.dieuKhienNhomPhong('MO_PHONG');
    assert.strictEqual(resBatch.status, 'success');

    // Now single room mutation should succeed immediately
    const resSingle = await sandbox.dieuKhien('THU_BAI');
    assert.strictEqual(resSingle.status, 'success');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-42: All acquired room locks are released after batch thrown failure');
  {
    const rooms = [{ id: 'room-202', MaPhong: 'P202', truong_id: 'sch-1' }];
    const { sandbox } = createHarness({
      allRooms: rooms,
      defaultRoom: rooms[0],
      checkedRooms: rooms,
      mockStaffRpc: async () => { throw new Error('Batch network drop'); }
    });

    const resBatch = await sandbox.dieuKhienNhomPhong('MO_PHONG');
    assert.strictEqual(resBatch.status, 'error');

    // Room lock must not leak: single room mutation can now be attempted
    let rpcRecovered = false;
    sandbox.staffRpc = async () => { rpcRecovered = true; return { status: 'success' }; };
    const resSingle = await sandbox.dieuKhien('THU_BAI');
    assert.strictEqual(resSingle.status, 'success');
    assert.strictEqual(rpcRecovered, true);
    console.log('  -> PASSED');
  }

  // =======================================================================
  // G. RADAR ROW QUICK ACTIONS (Tests 43 - 53)
  // =======================================================================

  console.log('Test ROOM-ACT-43: Canonical action renderer produces all three buttons');
  {
    const { sandbox } = createHarness();
    const html = sandbox.renderRadarActionCell({ id: 'room-99', TrangThai: 'CHỜ THI' });

    assert(html.includes('id="roomQuickStateBtn-room-99"'), 'Must contain quick state button');
    assert(html.includes('id="roomDeleteExamBtn-room-99"'), 'Must contain delete exam button');
    assert(html.includes('id="roomDeleteAllBtn-room-99"'), 'Must contain delete all button');
    assert(html.includes('class="radar-action-group"'), 'Must be wrapped in radar-action-group');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-44: Exact stable room-based IDs produced for quick buttons');
  {
    const { sandbox } = createHarness();
    const html = sandbox.renderRadarActionCell({ id: 'abc-xyz', TrangThai: 'MO_PHONG' });

    assert(html.includes('roomQuickStateBtn-abc-xyz'));
    assert(html.includes('roomDeleteExamBtn-abc-xyz'));
    assert(html.includes('roomDeleteAllBtn-abc-xyz'));
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-45: Quick state button toggles label/color between MO_PHONG and closed');
  {
    const { sandbox } = createHarness();
    const openHtml = sandbox.renderRadarActionCell({ id: 'r1', TrangThai: 'MO_PHONG' });
    assert(openHtml.includes('Khóa') && openHtml.includes('radar-action-lock') && openHtml.includes('THU_BAI'),
      'When MO_PHONG, button must offer Khóa with radar-action-lock');

    const closedHtml = sandbox.renderRadarActionCell({ id: 'r1', TrangThai: 'THU_BAI' });
    assert(closedHtml.includes('Mở lại') && closedHtml.includes('radar-action-open') && closedHtml.includes('MO_PHONG'),
      'When closed, button must offer Mở lại with radar-action-open');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-46: dieuKhienFast rapid double invocation executes exactly 1 mutation');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      mockStaffRpc: async (name) => {
        if (name === 'rpc_dieu_khien_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const p1 = sandbox.dieuKhienFast('room-uuid-101', 'MO_PHONG');
    const p2 = sandbox.dieuKhienFast('room-uuid-101', 'MO_PHONG');

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 1);
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-47: xoaDeTrongPhong cancelled via confirm dialog issues 0 delete RPCs');
  {
    const { sandbox, metrics } = createHarness({ confirmResult: false });

    const res = await sandbox.xoaDeTrongPhong('room-uuid-101');
    assert.strictEqual(res.status, 'cancelled');
    assert.strictEqual(metrics.rpcCallsByName['rpc_xoa_de_trong_phong'] || 0, 0);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-48: xoaDeTrongPhong double invocation after confirm executes exactly 1 delete RPC');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      confirmResult: true,
      mockStaffRpc: async (name) => {
        if (name === 'rpc_xoa_de_trong_phong') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const p1 = sandbox.xoaDeTrongPhong('room-uuid-101');
    const p2 = sandbox.xoaDeTrongPhong('room-uuid-101');

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.rpcCallsByName['rpc_xoa_de_trong_phong'], 1);
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-49: xoaPhongHoanToan cancelled via confirm dialog issues 0 delete RPCs');
  {
    const { sandbox, metrics } = createHarness({ confirmResult: false });

    const res = await sandbox.xoaPhongHoanToan('room-uuid-101');
    assert.strictEqual(res.status, 'cancelled');
    assert.strictEqual(metrics.rpcCallsByName['rpc_xoa_phong_thi'] || 0, 0);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-50: xoaPhongHoanToan double invocation after confirm executes exactly 1 delete RPC');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      confirmResult: true,
      mockStaffRpc: async (name) => {
        if (name === 'rpc_xoa_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const p1 = sandbox.xoaPhongHoanToan('room-uuid-101');
    const p2 = sandbox.xoaPhongHoanToan('room-uuid-101');

    delayResolve();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(metrics.rpcCallsByName['rpc_xoa_phong_thi'], 1);
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-51: Same-room conflict: while quick state action is pending, xoaDeTrongPhong is skipped');
  {
    let delayResolve;
    const { sandbox, metrics } = createHarness({
      mockStaffRpc: async (name) => {
        if (name === 'rpc_dieu_khien_phong_thi') {
          await new Promise(r => delayResolve = r);
        }
        return { status: 'success' };
      }
    });

    const pState = sandbox.dieuKhienFast('room-uuid-101', 'MO_PHONG');
    const pDelete = sandbox.xoaDeTrongPhong('room-uuid-101');

    delayResolve();
    const [resState, resDelete] = await Promise.all([pState, pDelete]);

    assert.strictEqual(resState.status, 'success');
    assert.strictEqual(resDelete.status, 'skipped');
    assert.strictEqual(resDelete.reason, 'room_busy');
    assert.strictEqual(metrics.rpcCallsByName['rpc_xoa_de_trong_phong'] || 0, 0);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-52: Different rooms can execute quick actions independently');
  {
    let resolveRoom1, resolveRoom2;
    const rooms = [
      { id: 'room-1', MaPhong: 'P1', truong_id: 'sch-1' },
      { id: 'room-2', MaPhong: 'P2', truong_id: 'sch-1' }
    ];
    const { sandbox, metrics } = createHarness({
      allRooms: rooms,
      mockStaffRpc: async (name, params) => {
        if (params.p_room_id === 'room-1') await new Promise(r => resolveRoom1 = r);
        if (params.p_room_id === 'room-2') await new Promise(r => resolveRoom2 = r);
        return { status: 'success' };
      }
    });

    const p1 = sandbox.dieuKhienFast('room-1', 'MO_PHONG');
    const p2 = sandbox.dieuKhienFast('room-2', 'MO_PHONG');

    if (resolveRoom1) resolveRoom1();
    if (resolveRoom2) resolveRoom2();
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(res1.status, 'success');
    assert.strictEqual(res2.status, 'success');
    assert.strictEqual(metrics.rpcCallsByName['rpc_dieu_khien_phong_thi'], 2);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-53: Successful destructive actions trigger expected fetchRadar refresh path');
  {
    const { sandbox, metrics } = createHarness({ confirmResult: true });

    await sandbox.xoaDeTrongPhong('room-uuid-101');
    assert.strictEqual(metrics.radarFetchCount, 1, 'fetchRadar must be called after xoaDe');

    await sandbox.xoaPhongHoanToan('room-uuid-101');
    assert.strictEqual(metrics.radarFetchCount, 2, 'fetchRadar must be called after xoaPhong');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // H. FORBIDDEN EVENT DEPENDENCY (Tests 54 - 56)
  // =======================================================================

  console.log('Test ROOM-ACT-54: xoaDeTrongPhong source contains zero event.target / window.event');
  {
    const body = gvJsSource.slice(
      gvJsSource.indexOf('async function xoaDeTrongPhong('),
      gvJsSource.indexOf('async function capNhatNhanhPhong(')
    );
    assert(!body.includes('event.target'), 'xoaDeTrongPhong must not access event.target');
    assert(!body.includes('window.event'), 'xoaDeTrongPhong must not access window.event');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-55: xoaPhongHoanToan source contains zero event.target / window.event');
  {
    const body = gvJsSource.slice(
      gvJsSource.indexOf('async function xoaPhongHoanToan('),
      gvJsSource.indexOf('async function xoaDeTrongPhong(')
    );
    assert(!body.includes('event.target'), 'xoaPhongHoanToan must not access event.target');
    assert(!body.includes('window.event'), 'xoaPhongHoanToan must not access window.event');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-56: dieuKhien, dieuKhienFast, dieuKhienNhomPhong, xemTruocDeThi contain zero event.target');
  {
    const roomControlSection = gvJsSource.slice(
      gvJsSource.indexOf('// ==========================================================\n// ROOM CONTROL ACTION STATE & RELIABILITY HELPERS'),
      gvJsSource.indexOf('async function taiDanhSachPhong()')
    );
    assert(!roomControlSection.includes('event.target'), 'Room control section must not contain event.target');
    assert(!roomControlSection.includes('window.event'), 'Room control section must not contain window.event');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // I. RENDERER SINGLE SOURCE OF TRUTH (Tests 57 - 58)
  // =======================================================================

  console.log('Test ROOM-ACT-57: fetchRadar uses canonical renderRadarActionCell');
  {
    const fetchRadarBody = gvJsSource.slice(
      gvJsSource.indexOf('async function fetchRadar()'),
      gvJsSource.indexOf('async function dieuKhienNhomPhong(')
    );
    assert(fetchRadarBody.includes('renderRadarActionCell(r)'),
      'fetchRadar must use renderRadarActionCell(r)');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-58: tuDongKhoaPhongKhiHetGio uses renderRadarActionCell (no duplicated markup)');
  {
    const timerBody = gvJsSource.slice(
      gvJsSource.indexOf('async function tuDongKhoaPhongKhiHetGio'),
      gvJsSource.indexOf('async function fetchRadar()')
    );
    assert(timerBody.includes('renderRadarActionCell(r)'),
      'Timer path must use renderRadarActionCell(r)');
    assert(!timerBody.includes("onclick=\"dieuKhienFast('${roomId}', 'MO_PHONG')\">Mở lại</button>"),
      'Timer path must not leave duplicated button markup');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // J. INVARIANTS (Tests 59 - 63)
  // =======================================================================

  console.log('Test ROOM-ACT-59: Teacher exact version is 20260903-flex-lite-007 across all test suites');
  {
    assert(gvHtmlSource.includes('giaovien.js?v=20260903-flex-lite-007'));
    const adminTest = fs.readFileSync(path.join(repoRoot, 'tests/admin_frontend_session_simulation.js'), 'utf8');
    assert(adminTest.includes('giaovien.js?v=20260903-flex-lite-007'));
    const cspTest = fs.readFileSync(path.join(repoRoot, 'tests/account_import_exceljs_csp_simulation.js'), 'utf8');
    assert(cspTest.includes('giaovien.js?v=20260903-flex-lite-007'));
    const scoreTest = fs.readFileSync(path.join(repoRoot, 'tests/flex_lite_authoritative_score_presentation_simulation.js'), 'utf8');
    assert(scoreTest.includes('giaovien.js?v=20260903-flex-lite-007'));
    const dashTest = fs.readFileSync(path.join(repoRoot, 'tests/teacher_dashboard_action_reliability_simulation.js'), 'utf8');
    assert(dashTest.includes('giaovien.js?v=20260903-flex-lite-007'));
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-60: Student HTML/JS exact version is 20260902-flex-lite-005');
  {
    assert(hsHtmlSource.includes('hoc_sinh.js?v=20260902-flex-lite-005'));
    assert(hsJsSource.includes("const VERSION = '20260902-flex-lite-005';"));
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-61: sw.js exact version is 20260902-flex-lite-005');
  {
    assert(swJsSource.includes("const VERSION = '20260902-flex-lite-005';"));
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-62: Authoritative scoring invariant: zero double-normalization code');
  {
    assert(!gvJsSource.includes('diem = (diem / 10) * tongDiem'), 'No double normalization');
    assert(!hsJsSource.includes('diem = (diem / 10) * tongDiem'), 'No double normalization');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-63: renderPreviewContent preserves original void return contract (no unrelated return)');
  {
    const startIdx = gvJsSource.indexOf('function renderPreviewContent()');
    const endIdx = gvJsSource.indexOf('async function layDeTuIframe', startIdx);
    const previewContentBody = gvJsSource.slice(startIdx, endIdx);
    assert(!previewContentBody.includes("return { status: 'success' }"),
      'renderPreviewContent must not contain unrelated return { status: "success" }');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // K. CONSOLIDATED CORRECTION 01 TESTS (Tests 64 - 70)
  // =======================================================================

  console.log('Test ROOM-ACT-64: Quick THU_BAI DOM replacement race: new button remains "Mở lại" after old 800ms timer');
  {
    const room = { id: 'room-race-1', TrangThai: 'MO_PHONG' };
    const { sandbox, elements, advanceTimers } = createHarness({
      allRooms: [room],
      defaultRoom: room
    });

    const btnId = 'roomQuickStateBtn-room-race-1';
    const oldBtn = elements[btnId] = {
      id: btnId,
      tagName: 'BUTTON',
      innerText: 'Khóa',
      disabled: false,
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      removeAttribute(k) { delete this.attributes[k]; }
    };

    const pAction = sandbox.dieuKhienFast('room-race-1', 'THU_BAI');
    await pAction;
    assert.strictEqual(oldBtn.innerText, '✅ Đã khóa', 'Old button showed success feedback');

    // Radar replaces button with new post-lock state
    const newBtn = {
      id: btnId,
      tagName: 'BUTTON',
      innerText: 'Mở lại',
      disabled: false,
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      removeAttribute(k) { delete this.attributes[k]; }
    };
    elements[btnId] = newBtn;

    // Advance old timer
    advanceTimers(800);

    // NEW button must not be corrupted
    assert.strictEqual(newBtn.innerText, 'Mở lại', 'NEW button must remain "Mở lại"');
    assert.strictEqual(newBtn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-65: Quick MO_PHONG DOM replacement race: new button remains "Khóa" after old 800ms timer');
  {
    const room = { id: 'room-race-2', TrangThai: 'THU_BAI' };
    const { sandbox, elements, advanceTimers } = createHarness({
      allRooms: [room],
      defaultRoom: room
    });

    const btnId = 'roomQuickStateBtn-room-race-2';
    const oldBtn = elements[btnId] = {
      id: btnId,
      tagName: 'BUTTON',
      innerText: 'Mở lại',
      disabled: false,
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      removeAttribute(k) { delete this.attributes[k]; }
    };

    const pAction = sandbox.dieuKhienFast('room-race-2', 'MO_PHONG');
    await pAction;
    assert.strictEqual(oldBtn.innerText, '✅ Đã mở', 'Old button showed success feedback');

    // Radar replaces button with new post-open state
    const newBtn = {
      id: btnId,
      tagName: 'BUTTON',
      innerText: 'Khóa',
      disabled: false,
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      removeAttribute(k) { delete this.attributes[k]; }
    };
    elements[btnId] = newBtn;

    advanceTimers(800);

    assert.strictEqual(newBtn.innerText, 'Khóa', 'NEW button must remain "Khóa"');
    assert.strictEqual(newBtn.disabled, false);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-66: Auto-lock timer post-state semantics ("Mở lại", radar-action-open, MO_PHONG)');
  {
    const room = {
      id: 'room-autolock-99',
      MaPhong: 'AL99',
      TrangThai: 'MO_PHONG',
      ThoiGianMo: Date.now() - (60 * 60 * 1000),
      ThoiGian: 45
    };
    const { sandbox, elements } = createHarness({
      allRooms: [room],
      defaultRoom: room
    });

    elements['td-stt-room-autolock-99'] = { id: 'td-stt-room-autolock-99', innerHTML: '' };
    const actTd = elements['td-act-room-autolock-99'] = { id: 'td-act-room-autolock-99', innerHTML: '' };

    const res = await sandbox.tuDongKhoaPhongKhiHetGio('room-autolock-99');
    assert.strictEqual(res.status, 'success', 'tuDongKhoaPhongKhiHetGio must return success');
    assert.strictEqual(room.TrangThai, 'THU_BAI', 'allRoomsData room state must be updated to THU_BAI');
    assert(actTd.innerHTML.includes('Mở lại'), 'Action cell must display "Mở lại"');
    assert(actTd.innerHTML.includes('radar-action-open'), 'Action button must have radar-action-open class');
    assert(actTd.innerHTML.includes("dieuKhienFast('room-autolock-99', 'MO_PHONG')"), 'Action onclick must be MO_PHONG');
    assert(!actTd.innerHTML.includes("dieuKhienFast('room-autolock-99', 'THU_BAI')"), 'Must NOT offer stale THU_BAI');
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-67: Preview detailed error preservation (status error & thrown exception)');
  {
    // Part A: RPC status error
    {
      const { sandbox, metrics, elements, advanceTimers } = createHarness({
        mockStaffRpc: async () => ({ status: 'error', message: 'Exam preview forbidden' })
      });
      const btn = elements['roomPreviewBtn'];
      btn.innerText = '🔍 Xem trước Đề trong phòng';

      const res = await sandbox.xemTruocDeThi();
      assert.strictEqual(res.status, 'error');
      assert(metrics.alerts.some(a => a.includes('Exam preview forbidden')),
        'Alert must include server error detail "Exam preview forbidden"');
      assert.strictEqual(btn.innerText, '❌ Xem trước lỗi');

      advanceTimers(800);
      assert.strictEqual(btn.innerText, '🔍 Xem trước Đề trong phòng');
      assert.strictEqual(btn.disabled, false);
    }

    // Part B: Thrown RPC exception
    {
      const { sandbox, metrics, elements, advanceTimers } = createHarness({
        mockStaffRpc: async () => { throw new Error('Preview server crash'); }
      });
      const btn = elements['roomPreviewBtn'];
      btn.innerText = '🔍 Xem trước Đề trong phòng';

      const res = await sandbox.xemTruocDeThi();
      assert.strictEqual(res.status, 'error');
      assert(metrics.alerts.some(a => a.includes('Preview server crash')),
        'Alert must include exception reason "Preview server crash"');
      assert.strictEqual(btn.innerText, '❌ Xem trước lỗi');

      advanceTimers(800);
      assert.strictEqual(btn.innerText, '🔍 Xem trước Đề trong phòng');
      assert.strictEqual(btn.disabled, false);
    }
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-68: xoaPhongHoanToan rejects undefined RPC response (no false success)');
  {
    const room = { id: 'room-del-undef', MaPhong: 'DEL_UNDEF', truong_id: 'sch-1' };
    const { sandbox, metrics, elements, advanceTimers } = createHarness({
      allRooms: [room],
      defaultRoom: room,
      mockStaffRpc: async () => undefined
    });

    const res = await sandbox.xoaPhongHoanToan('room-del-undef');
    assert.strictEqual(res.status, 'error', 'Must return error on undefined RPC response');
    assert(!metrics.alerts.some(a => a.includes('Đã xóa sạch')), 'Must NOT show success alert on undefined');
    assert(metrics.alerts.some(a => a.includes('Lỗi khi xóa')), 'Must show error alert');

    advanceTimers(800);
    let nextSuccess = false;
    sandbox.staffRpc = async () => { nextSuccess = true; return { status: 'success' }; };
    const nextRes = await sandbox.dieuKhien('MO_PHONG');
    assert.strictEqual(nextRes.status, 'success', 'Room lock must have been released');
    assert.strictEqual(nextSuccess, true);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-69: xoaPhongHoanToan rejects null RPC response (no false success)');
  {
    const room = { id: 'room-del-null', MaPhong: 'DEL_NULL', truong_id: 'sch-1' };
    const { sandbox, metrics, elements, advanceTimers } = createHarness({
      allRooms: [room],
      defaultRoom: room,
      mockStaffRpc: async () => null
    });

    const res = await sandbox.xoaPhongHoanToan('room-del-null');
    assert.strictEqual(res.status, 'error', 'Must return error on null RPC response');
    assert(!metrics.alerts.some(a => a.includes('Đã xóa sạch')), 'Must NOT show success alert on null');
    assert(metrics.alerts.some(a => a.includes('Lỗi khi xóa')), 'Must show error alert');

    advanceTimers(800);
    let nextSuccess = false;
    sandbox.staffRpc = async () => { nextSuccess = true; return { status: 'success' }; };
    const nextRes = await sandbox.dieuKhien('MO_PHONG');
    assert.strictEqual(nextRes.status, 'success', 'Room lock must have been released');
    assert.strictEqual(nextSuccess, true);
    console.log('  -> PASSED');
  }

  console.log('Test ROOM-ACT-70: Test suite execution completed naturally without process.exit(0)');
  {
    // Natural completion assertion
    console.log('  -> PASSED');
  }

  console.log('\n=== ALL 70 TEACHER ROOM CONTROL RELIABILITY TESTS PASSED SUCCESSFULLY ===');
}

runAllTests().catch(err => {
  console.error('\nTest suite failed:', err);
  process.exit(1);
});
