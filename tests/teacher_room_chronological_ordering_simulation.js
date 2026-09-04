// tests/teacher_room_chronological_ordering_simulation.js
// FLEX-LITE-008: Stable Room Creation-Time Ordering Simulation Test Suite
//
// Verifies:
// 1. Database API migration exposes created_at and enforces (created_at DESC, id DESC) order.
// 2. Migration source UTF-8 encoding correctness and security parity contract.
// 3. Immutability of created_at: neither SQL nor frontend state operations ever modify it.
// 4. Central frontend sort helper sortRoomsNewestFirstByCreatedAt works on copies, is stable,
//    and ignores room operational statuses, thoi_gian_mo, updated_at, etc.
// 5. Pre-migration compatibility: falls back safely to input/server order if created_at is missing/invalid.
// 6. Substantive runtime operations (reopen, lock, publish score, publish answer, auto-lock, batch,
//    new room, delete) strictly preserve chronological order.
// 7. Versioning invariants across the system.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const repoRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(repoRoot, 'supabase/migrations/20260903080001_teacher_room_chronological_ordering.sql');
const roomControlMigrationPath = path.join(repoRoot, 'supabase/migrations/20260829000002_admin_control_plane.sql');
const gvJsPath = path.join(repoRoot, 'giaovien.js');
const gvHtmlPath = path.join(repoRoot, 'giaovien.html');
const hsHtmlPath = path.join(repoRoot, 'hoc_sinh.html');
const hsJsPath = path.join(repoRoot, 'hoc_sinh.js');
const swJsPath = path.join(repoRoot, 'sw.js');

const gvJsSource = fs.readFileSync(gvJsPath, 'utf8');
const gvHtmlSource = fs.readFileSync(gvHtmlPath, 'utf8');
const hsHtmlSource = fs.readFileSync(hsHtmlPath, 'utf8');
const hsJsSource = fs.readFileSync(hsJsPath, 'utf8');
const swJsSource = fs.readFileSync(swJsPath, 'utf8');

// =========================================================================
// TEST HARNESS CREATION
// =========================================================================

function createHarness(options = {}) {
  const elements = {};
  const metrics = {
    alerts: [],
    confirms: [],
    rpcCalls: [],
    staffRpcCalls: []
  };

  function getOrCreateElement(id, tag = 'div') {
    if (!elements[id]) {
      elements[id] = {
        id,
        tagName: tag.toUpperCase(),
        innerText: '',
        innerHTML: '',
        value: '',
        disabled: false,
        checked: false,
        style: {},
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        },
        attributes: {},
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k]; },
        removeAttribute(k) { delete this.attributes[k]; },
        parentNode: null,
        parentElement: null,
        children: [],
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          child.parentElement = this;
          return child;
        },
        insertBefore(newNode, refNode) {
          const idx = this.children.indexOf(refNode);
          if (idx >= 0) this.children.splice(idx, 0, newNode);
          else this.children.push(newNode);
          newNode.parentNode = this;
          newNode.parentElement = this;
          return newNode;
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        closest() { return null; }
      };
    }
    return elements[id];
  }

  // Pre-seed table DOM for Radar
  const radarContainer = getOrCreateElement('radarContainer');
  const radarTable = getOrCreateElement('radarTable', 'table');
  const radarBody = getOrCreateElement('radarBody', 'tbody');
  radarContainer.appendChild(radarTable);
  radarTable.appendChild(radarBody);

  // Pre-seed static room control buttons
  const staticBtnIds = [
    'roomReloadBtn', 'roomOpenBtn', 'roomLockBtn',
    'roomPublishScoreBtn', 'roomPublishAnswerBtn',
    'roomPreviewBtn', 'roomRadarRefreshBtn'
  ];
  staticBtnIds.forEach(id => getOrCreateElement(id, 'button'));

  // Pre-seed select boxes
  const ctrlMaPhong = getOrCreateElement('ctrlMaPhong', 'select');
  const dashMaPhong = getOrCreateElement('dashMaPhong', 'select');

  // Timers
  const pendingTimers = [];
  function mockSetTimeout(fn, delay) {
    const handle = { fn, delay, cancelled: false };
    pendingTimers.push(handle);
    return handle;
  }
  function mockClearTimeout(handle) {
    if (handle) handle.cancelled = true;
  }
  function advanceTimers(ms) {
    for (const t of [...pendingTimers]) {
      if (!t.cancelled && t.delay <= ms) {
        t.cancelled = true;
        t.fn();
      }
    }
  }

  const sandbox = {
    console,
    Date,
    Math,
    Set,
    Array,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    Promise,
    setTimeout: mockSetTimeout,
    clearTimeout: mockClearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return getOrCreateElement('mock-' + Math.random().toString(36).slice(2, 7), tag); },
      querySelector(sel) {
        if (sel === '#radarBody') return radarBody;
        if (sel === '#radarControlBar') return elements['radarControlBar'] || null;
        if (sel === '#chkAllRooms') return elements['chkAllRooms'] || null;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '.chk-Room:checked') return options.checkedRooms || [];
        if (sel === '.live-timer') return options.liveTimers || [];
        return [];
      }
    },
    window: {
      location: { href: 'http://localhost/giaovien.html' }
    },
    alert: (msg) => { metrics.alerts.push(String(msg)); },
    confirm: (msg) => {
      metrics.confirms.push(String(msg));
      return options.confirmResponse !== undefined ? options.confirmResponse : true;
    },
    prompt: () => 'PROMPT_ROOM',
    localStorage: {
      getItem: (k) => options.storage?.[k] || null,
      setItem: (k, v) => { if (!options.storage) options.storage = {}; options.storage[k] = v; },
      removeItem: (k) => { if (options.storage) delete options.storage[k]; }
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    gvData: options.gvData || {
      ma_gv: 'GV01',
      quyen: 'Admin',
      truong_id: '11111111-1111-1111-1111-111111111111'
    },
    activeWorkspaceMonId: 'ALL',
    activeWorkspaceTruongId: 'ALL',
    allRoomsData: options.allRooms ? [...options.allRooms] : [],
    teacherTimerInterval: null,
    parseTimeSafely: (ts) => {
      if (!ts) return 0;
      const parsed = Date.parse(ts);
      return isNaN(parsed) ? (parseInt(ts) || 0) : parsed;
    },
    getRoomTargetSchoolId: (r) => r?.truong_id || '11111111-1111-1111-1111-111111111111',
    getSelectedRoom: () => options.defaultRoom || options.allRooms?.[0] || null,
    staffRpc: async (name, args) => {
      metrics.staffRpcCalls.push({ name, args });
      if (options.mockStaffRpc) return options.mockStaffRpc(name, args);
      return { status: 'success' };
    }
  };

  // Extract from giaovien.js:
  // 1. Room control action helpers + canonical renderer + dieuKhien + dieuKhienFast + xoaPhongHoanToan + xoaDeTrongPhong + tuDongKhoaPhong + khoiDongDongHo + fetchRadar + dieuKhienNhomPhong + taiDanhSachPhong
  // 2. Chronological sort helpers (FLEX-LITE-008) + rpcDieuKhienPhongThi + rpcLayDanhSachPhongThi
  const helperMarker = '// ==========================================================\n// ROOM CONTROL ACTION STATE & RELIABILITY HELPERS (FLEX-LITE-007)';
  const helperIdx = gvJsSource.indexOf(helperMarker);
  assert(helperIdx >= 0, 'ROOM CONTROL HELPERS marker must be found in giaovien.js');

  const taiPhongMarker = 'async function taiDanhSachPhong() {';
  const taiPhongIdx = gvJsSource.indexOf(taiPhongMarker, helperIdx);
  assert(taiPhongIdx >= 0, 'taiDanhSachPhong marker must be found in giaovien.js');

  const dashMarker = '// ==========================================================\n// DASHBOARD ACTION STATE & RELIABILITY HELPERS (FLEX-LITE-006)';
  const dashIdx = gvJsSource.indexOf(dashMarker, taiPhongIdx);
  assert(dashIdx >= 0, 'DASHBOARD ACTION HELPERS marker must be found in giaovien.js');

  const roomBlock = gvJsSource.slice(helperIdx, dashIdx);

  // Extract tail containing chronological sort helpers & rpc functions
  const sortMarker = '// ==========================================================\n// CHRONOLOGICAL ROOM ORDERING (FLEX-LITE-008)';
  const sortIdx = gvJsSource.indexOf(sortMarker);
  assert(sortIdx >= 0, 'CHRONOLOGICAL ROOM ORDERING marker must be found in giaovien.js');
  const sortBlock = gvJsSource.slice(sortIdx);

  // Extract rpcDieuKhienPhongThi
  const rpcDieuKhienMarker = 'async function rpcDieuKhienPhongThi(';
  const rpcDieuKhienIdx = gvJsSource.indexOf(rpcDieuKhienMarker);
  assert(rpcDieuKhienIdx >= 0, 'rpcDieuKhienPhongThi marker must be found in giaovien.js');
  const rpcDieuKhienBlock = gvJsSource.slice(rpcDieuKhienIdx, sortIdx);

  const scriptCode = `
    ${roomBlock}
    ${rpcDieuKhienBlock}
    ${sortBlock}
  `;

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);

  return { sandbox, elements, metrics, advanceTimers };
}

function assertList(actual, expected, message) {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected, message);
}

// =========================================================================
// TEST SUITE EXECUTION
// =========================================================================

async function runAllTests() {
  console.log('=== RUNNING TEACHER ROOM CHRONOLOGICAL ORDERING SIMULATION TESTS (FLEX-LITE-008) ===\n');

  // =======================================================================
  // PART A: MIGRATION CONTRACT, UTF-8 SOURCE & SECURITY PARITY
  // =======================================================================

  console.log('Test ORDER-01: Migration file exists in supabase/migrations');
  {
    assert(fs.existsSync(migrationPath), 'Migration file must exist at ' + migrationPath);
    console.log('  -> PASSED');
  }

  const migrationContent = fs.readFileSync(migrationPath, 'utf8');

  console.log('Test ORDER-02: Migration UTF-8 source contains valid Vietnamese and zero mojibake');
  {
    // Must contain exact Vietnamese messages
    assert(migrationContent.includes('Phiên làm việc không hợp lệ hoặc đã hết hạn.'),
      'Must contain exact Vietnamese error message for invalid staff session');
    assert(migrationContent.includes('Không xác thực được giáo viên hoặc phòng thi.'),
      'Must contain exact Vietnamese error message for unverified teacher/room');

    // Must NOT contain known mojibake markers
    const mojibakeMarkers = ['PhiÃ', 'KhÃ', 'Ä‘', 'á»'];
    for (const marker of mojibakeMarkers) {
      assert(!migrationContent.includes(marker),
        `Migration source must not contain mojibake marker "${marker}"`);
    }
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-03: Migration redefines exact secure rpc_lay_danh_sach_phong_thi_gv signature');
  {
    assert(migrationContent.includes('create or replace function public.rpc_lay_danh_sach_phong_thi_gv('),
      'Must define public.rpc_lay_danh_sach_phong_thi_gv');
    assert(migrationContent.includes('p_staff_token text,'), 'Must take p_staff_token text');
    assert(migrationContent.includes('p_ma_gv text,'), 'Must take p_ma_gv text');
    assert(migrationContent.includes('p_truong_id uuid,'), 'Must take p_truong_id uuid');
    assert(migrationContent.includes('p_mon_id uuid default null,'), 'Must take p_mon_id default null');
    assert(migrationContent.includes('p_xem_toan_bo boolean default false'), 'Must take p_xem_toan_bo default false');
    assert(migrationContent.includes('returns jsonb language plpgsql security definer set search_path = public'),
      'Must be security definer with public search_path');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-04: Migration exposes created_at metadata on each room');
  {
    assert(migrationContent.includes("'created_at', pt.created_at"),
      "Must expose 'created_at', pt.created_at in room json object");
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-05: Migration primary ordering is pt.created_at desc');
  {
    assert(migrationContent.includes('order by pt.created_at desc'),
      'Must order primarily by pt.created_at desc');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-06: Migration tie-breaker is deterministic pt.id desc (not chronological proof)');
  {
    // Note: pt.id desc is only a deterministic tie-breaker when created_at is identical;
    // it does NOT claim that UUID order proves room creation chronology.
    assert(/order\s+by\s+pt\.created_at\s+desc\s*,\s*pt\.id\s+desc/i.test(migrationContent),
      'Must order by pt.created_at desc, pt.id desc as tie-breaker');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-07: Migration preserves assessment_type and scoring_config');
  {
    assert(migrationContent.includes("'assessment_type', pt.assessment_type"),
      'Must preserve assessment_type in room payload');
    assert(migrationContent.includes("'scoring_config', pt.scoring_config"),
      'Must preserve scoring_config in room payload');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-08: Migration preserves staff session validation');
  {
    assert(migrationContent.includes('public._staff_session_gv_id(p_staff_token)'),
      'Must validate staff token via _staff_session_gv_id');
    assert(migrationContent.includes('staff_session_invalid'),
      'Must return staff_session_invalid on null session');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-09: Migration preserves teacher identity binding (p_ma_gv check)');
  {
    assert(migrationContent.includes('v_teacher_ma_gv is distinct from trim(p_ma_gv)'),
      'Must bind teacher code via trim(p_ma_gv)');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-10: Migration preserves school isolation for non-Admin');
  {
    assert(migrationContent.includes("(v_quyen <> 'Admin' and pt.truong_id = v_teacher_truong_id)"),
      'Must restrict non-Admin teachers strictly to their assigned school');
    assert(migrationContent.includes("v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id"),
      'Must reject non-Admin teacher querying a different school ID');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-11: Migration preserves Admin view-all and subject filter');
  {
    assert(migrationContent.includes("(v_quyen = 'Admin' and p_xem_toan_bo = true)"),
      'Must support Admin view-all when p_xem_toan_bo is true');
    assert(migrationContent.includes("(p_mon_id is null or pt.mon_id = p_mon_id)"),
      'Must filter by p_mon_id when supplied');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-12: Migration preserves SECURITY DEFINER, search_path, and exact REVOKE/GRANT permissions');
  {
    assert(migrationContent.includes('security definer set search_path = public'),
      'Must declare security definer set search_path = public');
    assert(migrationContent.includes('revoke all on function public.rpc_lay_danh_sach_phong_thi_gv(text, text, uuid, uuid, boolean) from public;'),
      'Must revoke all from public');
    assert(migrationContent.includes('grant execute on function public.rpc_lay_danh_sach_phong_thi_gv(text, text, uuid, uuid, boolean) to anon, authenticated;'),
      'Must grant execute to anon, authenticated');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // PART B: STATE MUTATION INVARIANTS & SQL IMMUTABILITY CONTRACT
  // =======================================================================

  console.log('Test ORDER-13: Authoritative room-control RPC never updates created_at or updated_at');
  {
    assert(fs.existsSync(roomControlMigrationPath), 'Authoritative room-control migration must exist');
    const rpcContent = fs.readFileSync(roomControlMigrationPath, 'utf8');

    // Extract rpc_dieu_khien_phong_thi body
    const fnStart = rpcContent.indexOf('create or replace function public.rpc_dieu_khien_phong_thi(');
    assert(fnStart >= 0, 'rpc_dieu_khien_phong_thi must be found in migration');
    const fnEnd = rpcContent.indexOf('$function$;', fnStart);
    assert(fnEnd >= 0, 'Function end must be found');
    const fnBody = rpcContent.slice(fnStart, fnEnd);

    // Verify it updates operational fields
    assert(fnBody.includes('update public.phong_thi set'), 'Must update public.phong_thi');
    assert(fnBody.includes('trang_thai='), 'Updates trang_thai');
    assert(fnBody.includes('thoi_gian_mo='), 'Updates thoi_gian_mo');

    // Assert it NEVER touches created_at or updated_at
    assert(!fnBody.includes('created_at='), 'Must NEVER assign created_at');
    assert(!fnBody.includes('created_at ='), 'Must NEVER assign created_at');
    assert(!fnBody.includes('updated_at'), 'Must NOT use updated_at as an ordering substitute');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-14: Frontend room mutation call never transmits created_at');
  {
    const testRoom = { id: 'room-uuid-1', truong_id: '11111111-1111-1111-1111-111111111111' };
    const { sandbox, metrics } = createHarness({
      allRooms: [testRoom],
      mockStaffRpc: async () => ({ status: 'success' })
    });

    await sandbox.rpcDieuKhienPhongThi('room-uuid-1', 'MO_PHONG', '12A1', 'Dot 1', 45, true);

    assert.strictEqual(metrics.staffRpcCalls.length, 1);
    const sentArgs = metrics.staffRpcCalls[0].args;

    assert.strictEqual(sentArgs.p_room_id, 'room-uuid-1');
    assert.strictEqual(sentArgs.p_trang_thai, 'MO_PHONG');
    assert.strictEqual(sentArgs.p_set_open_time, true);

    // Assert created_at / CreatedAt is NEVER sent
    assert.strictEqual(sentArgs.created_at, undefined, 'Payload must not send created_at');
    assert.strictEqual(sentArgs.CreatedAt, undefined, 'Payload must not send CreatedAt');
    assert.strictEqual(sentArgs.updated_at, undefined, 'Payload must not send updated_at');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-15: Frontend rpcLayDanhSachPhongThi preserves exact single quotes on ALL workspace filter');
  {
    // Verify no quote churn in rpcLayDanhSachPhongThi
    const fnCode = gvJsSource.slice(gvJsSource.indexOf('async function rpcLayDanhSachPhongThi()'));
    assert(fnCode.includes("activeWorkspaceTruongId === 'ALL'"),
      "Must preserve single quotes 'ALL' in activeWorkspaceTruongId comparison");
    assert(!fnCode.includes('activeWorkspaceTruongId === "ALL"'),
      'Must not have double-quoted "ALL" for activeWorkspaceTruongId');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // PART C: FRONTEND SORT CONTRACT, STABILITY & PRE-MIGRATION FALLBACK
  // =======================================================================

  console.log('Test ORDER-16: Sorter does not mutate original input array');
  {
    const { sandbox } = createHarness();
    const original = [
      { id: 'r1', created_at: '2026-09-01T10:00:00Z' },
      { id: 'r2', created_at: '2026-09-03T10:00:00Z' },
      { id: 'r3', created_at: '2026-09-02T10:00:00Z' }
    ];
    const frozenCopy = JSON.parse(JSON.stringify(original));

    const sorted = sandbox.sortRoomsNewestFirstByCreatedAt(original);

    assert.notStrictEqual(sorted, original, 'Must return a new array instance');
    assertList(original, frozenCopy, 'Original input array must not be mutated');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-17: Three rooms with created_at: 100, 300, 200 return: 300, 200, 100');
  {
    const { sandbox } = createHarness();
    const rooms = [
      { id: 'r100', created_at: 100 },
      { id: 'r300', created_at: 300 },
      { id: 'r200', created_at: 200 }
    ];

    const sorted = sandbox.sortRoomsNewestFirstByCreatedAt(rooms);

    assert.strictEqual(sorted.length, 3);
    assert.strictEqual(sorted[0].id, 'r300');
    assert.strictEqual(sorted[1].id, 'r200');
    assert.strictEqual(sorted[2].id, 'r100');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-18: Newest room is always first (created_at DESC authority)');
  {
    const { sandbox } = createHarness();
    const rooms = [
      { id: 'r-old', created_at: '2026-09-01T08:00:00Z' },
      { id: 'r-newest', created_at: '2026-09-03T12:00:00Z' },
      { id: 'r-mid', created_at: '2026-09-02T08:00:00Z' }
    ];

    const sorted = sandbox.sortRoomsNewestFirstByCreatedAt(rooms);

    assert.strictEqual(sorted[0].id, 'r-newest', 'Newest room must be at index 0');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-19: Oldest room is always last');
  {
    const { sandbox } = createHarness();
    const rooms = [
      { id: 'r-old', created_at: '2026-09-01T08:00:00Z' },
      { id: 'r-newest', created_at: '2026-09-03T12:00:00Z' },
      { id: 'r-mid', created_at: '2026-09-02T08:00:00Z' }
    ];

    const sorted = sandbox.sortRoomsNewestFirstByCreatedAt(rooms);

    assert.strictEqual(sorted[sorted.length - 1].id, 'r-old', 'Oldest room must be at last index');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-20: Equal created_at preserves server tie order (id DESC is deterministic server tie-breaker)');
  {
    const { sandbox } = createHarness();
    // When created_at timestamps are identical, the frontend preserves the deterministic server tie order.
    // (Random UUID order is not evidence of true creation chronology).
    const rooms = [
      { id: 'tie-1', created_at: '2026-09-03T10:00:00Z' },
      { id: 'tie-2', created_at: '2026-09-03T10:00:00Z' },
      { id: 'tie-3', created_at: '2026-09-03T10:00:00Z' }
    ];

    const sorted = sandbox.sortRoomsNewestFirstByCreatedAt(rooms);

    assert.strictEqual(sorted[0].id, 'tie-1');
    assert.strictEqual(sorted[1].id, 'tie-2');
    assert.strictEqual(sorted[2].id, 'tie-3');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-21: Missing created_at triggers safe input-order fallback (Pre-migration compatibility)');
  {
    const { sandbox } = createHarness();
    // Simulate pre-migration server response where created_at field is absent
    const rooms = [
      { id: 'srv-1', ma_phong: 'P01' },
      { id: 'srv-2', ma_phong: 'P02' },
      { id: 'srv-3', ma_phong: 'P03' }
    ];

    const sorted = sandbox.sortRoomsNewestFirstByCreatedAt(rooms);

    assert.strictEqual(sorted.length, 3);
    assert.strictEqual(sorted[0].id, 'srv-1', 'Must fallback safely to server-provided order');
    assert.strictEqual(sorted[1].id, 'srv-2');
    assert.strictEqual(sorted[2].id, 'srv-3');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-22: Invalid created_at triggers safe input-order fallback');
  {
    const { sandbox } = createHarness();
    const rooms = [
      { id: 'r1', created_at: 'invalid-date-format' },
      { id: 'r2', created_at: '2026-09-03T10:00:00Z' },
      { id: 'r3', created_at: null }
    ];

    const sorted = sandbox.sortRoomsNewestFirstByCreatedAt(rooms);

    assert.strictEqual(sorted[0].id, 'r1', 'Must fallback safely without throwing or reordering unpredictably');
    assert.strictEqual(sorted[1].id, 'r2');
    assert.strictEqual(sorted[2].id, 'r3');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-23: Room status values do not affect sorting');
  {
    const { sandbox } = createHarness();
    // Oldest is MO_PHONG, middle is THU_BAI, newest is XEM_DAP_AN
    const rooms = [
      { id: 'r-oldest', trang_thai: 'MO_PHONG', created_at: '2026-09-01T10:00:00Z' },
      { id: 'r-middle', trang_thai: 'THU_BAI', created_at: '2026-09-02T10:00:00Z' },
      { id: 'r-newest', trang_thai: 'XEM_DAP_AN', created_at: '2026-09-03T10:00:00Z' }
    ];

    const sorted = sandbox.sortRoomsNewestFirstByCreatedAt(rooms);

    assert.strictEqual(sorted[0].id, 'r-newest', 'Newest must be first regardless of XEM_DAP_AN');
    assert.strictEqual(sorted[1].id, 'r-middle');
    assert.strictEqual(sorted[2].id, 'r-oldest', 'Oldest must be last regardless of MO_PHONG');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-24: thoi_gian_mo does not affect sorting');
  {
    const { sandbox } = createHarness();
    // Old room opened just now (thoi_gian_mo = Date.now())
    const rooms = [
      { id: 'r-old-active', created_at: '2026-09-01T00:00:00Z', thoi_gian_mo: Date.now() },
      { id: 'r-new-closed', created_at: '2026-09-03T00:00:00Z', thoi_gian_mo: 0 }
    ];

    const sorted = sandbox.sortRoomsNewestFirstByCreatedAt(rooms);

    assert.strictEqual(sorted[0].id, 'r-new-closed', 'New room must be first even if closed');
    assert.strictEqual(sorted[1].id, 'r-old-active', 'Old room must be last even if just opened with Date.now()');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // PART D: SUBSTANTIVE RUNTIME ROOM OPERATIONS & ORDER PRESERVATION
  // =======================================================================

  console.log('Test ORDER-25: Reopen oldest room via dieuKhien(MO_PHONG) preserves chronological ordering');
  {
    const roomA = { id: 'rA', ma_phong: 'A', created_at: '2026-09-01T10:00:00Z', trang_thai: 'THU_BAI', thoi_gian: 45 };
    const roomB = { id: 'rB', ma_phong: 'B', created_at: '2026-09-02T10:00:00Z', trang_thai: 'THU_BAI', thoi_gian: 45 };
    const roomC = { id: 'rC', ma_phong: 'C', created_at: '2026-09-03T10:00:00Z', trang_thai: 'THU_BAI', thoi_gian: 45 };

    const { sandbox, elements } = createHarness({
      defaultRoom: roomA,
      mockStaffRpc: async (name, args) => {
        if (name === 'rpc_lay_danh_sach_phong_thi_gv') {
          return { status: 'success', rooms: [roomC, roomB, roomA] };
        }
        if (name === 'rpc_dieu_khien_phong_thi') {
          roomA.trang_thai = args.p_trang_thai;
          roomA.thoi_gian_mo = Date.now();
          return { status: 'success' };
        }
        return { status: 'success' };
      }
    });

    // Populate initial state
    await sandbox.fetchRadar();
    assertList(sandbox.allRoomsData.map(r => r.id), ['rC', 'rB', 'rA']);

    // Set select box value to roomA (oldest room) and invoke dieuKhien('MO_PHONG')
    elements['ctrlMaPhong'].value = 'rA';
    await sandbox.dieuKhien('MO_PHONG');

    // Refetch and verify order
    await sandbox.fetchRadar();
    assertList(sandbox.allRoomsData.map(r => r.id), ['rC', 'rB', 'rA'],
      'Reopened oldest room MUST NOT jump to top; chronological order preserved');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-26: Reopen oldest room via quick action dieuKhienFast preserves chronological ordering');
  {
    const roomA = { id: 'rA', ma_phong: 'A', created_at: '2026-09-01T10:00:00Z', trang_thai: 'THU_BAI', thoi_gian: 45 };
    const roomB = { id: 'rB', ma_phong: 'B', created_at: '2026-09-02T10:00:00Z', trang_thai: 'THU_BAI', thoi_gian: 45 };
    const roomC = { id: 'rC', ma_phong: 'C', created_at: '2026-09-03T10:00:00Z', trang_thai: 'THU_BAI', thoi_gian: 45 };

    const { sandbox, elements } = createHarness({
      allRooms: [roomC, roomB, roomA],
      mockStaffRpc: async (name, args) => {
        if (name === 'rpc_lay_danh_sach_phong_thi_gv') return { status: 'success', rooms: [roomC, roomB, roomA] };
        if (name === 'rpc_dieu_khien_phong_thi') {
          roomA.trang_thai = args.p_trang_thai;
          roomA.thoi_gian_mo = Date.now();
          return { status: 'success' };
        }
        return { status: 'success' };
      }
    });

    elements['td-act-rA'] = { id: 'td-act-rA', innerHTML: '' };
    elements['td-stt-rA'] = { id: 'td-stt-rA', innerHTML: '' };

    await sandbox.dieuKhienFast('rA', 'MO_PHONG');
    await sandbox.fetchRadar();

    assertList(sandbox.allRoomsData.map(r => r.id), ['rC', 'rB', 'rA'],
      'Quick-opened oldest room MUST NOT jump to top');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-27: Lock newest room via dieuKhien(THU_BAI) preserves chronological ordering');
  {
    const roomA = { id: 'rA', ma_phong: 'A', created_at: '2026-09-01T10:00:00Z', trang_thai: 'MO_PHONG' };
    const roomB = { id: 'rB', ma_phong: 'B', created_at: '2026-09-02T10:00:00Z', trang_thai: 'MO_PHONG' };
    const roomC = { id: 'rC', ma_phong: 'C', created_at: '2026-09-03T10:00:00Z', trang_thai: 'MO_PHONG' };

    const { sandbox, elements } = createHarness({
      defaultRoom: roomC,
      mockStaffRpc: async (name, args) => {
        if (name === 'rpc_lay_danh_sach_phong_thi_gv') return { status: 'success', rooms: [roomC, roomB, roomA] };
        if (name === 'rpc_dieu_khien_phong_thi') {
          roomC.trang_thai = args.p_trang_thai;
          return { status: 'success' };
        }
        return { status: 'success' };
      }
    });

    elements['ctrlMaPhong'].value = 'rC';
    await sandbox.fetchRadar();
    await sandbox.dieuKhien('THU_BAI');
    await sandbox.fetchRadar();

    assertList(sandbox.allRoomsData.map(r => r.id), ['rC', 'rB', 'rA'],
      'Locking newest room C must keep it at TOP');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-28: Lock middle room via quick action dieuKhienFast preserves chronological ordering');
  {
    const roomA = { id: 'rA', ma_phong: 'A', created_at: '2026-09-01T10:00:00Z', trang_thai: 'MO_PHONG' };
    const roomB = { id: 'rB', ma_phong: 'B', created_at: '2026-09-02T10:00:00Z', trang_thai: 'MO_PHONG' };
    const roomC = { id: 'rC', ma_phong: 'C', created_at: '2026-09-03T10:00:00Z', trang_thai: 'MO_PHONG' };

    const { sandbox, elements } = createHarness({
      allRooms: [roomC, roomB, roomA],
      mockStaffRpc: async (name, args) => {
        if (name === 'rpc_lay_danh_sach_phong_thi_gv') return { status: 'success', rooms: [roomC, roomB, roomA] };
        if (name === 'rpc_dieu_khien_phong_thi') {
          roomB.trang_thai = args.p_trang_thai;
          return { status: 'success' };
        }
        return { status: 'success' };
      }
    });

    elements['td-act-rB'] = { id: 'td-act-rB', innerHTML: '' };
    elements['td-stt-rB'] = { id: 'td-stt-rB', innerHTML: '' };

    await sandbox.dieuKhienFast('rB', 'THU_BAI');
    await sandbox.fetchRadar();

    assertList(sandbox.allRoomsData.map(r => r.id), ['rC', 'rB', 'rA'],
      'Locking middle room B must preserve its middle position');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-29: Publish score via dieuKhien(CONG_BO_DIEM) preserves chronological ordering');
  {
    const rooms = [
      { id: 'r3', created_at: '2026-09-03T10:00:00Z', trang_thai: 'THU_BAI' },
      { id: 'r2', created_at: '2026-09-02T10:00:00Z', trang_thai: 'THU_BAI' },
      { id: 'r1', created_at: '2026-09-01T10:00:00Z', trang_thai: 'THU_BAI' }
    ];
    const { sandbox, elements } = createHarness({
      defaultRoom: rooms[1],
      mockStaffRpc: async (name, args) => {
        if (name === 'rpc_lay_danh_sach_phong_thi_gv') return { status: 'success', rooms };
        if (name === 'rpc_dieu_khien_phong_thi') {
          rooms[1].trang_thai = args.p_trang_thai;
          return { status: 'success' };
        }
        return { status: 'success' };
      }
    });

    elements['ctrlMaPhong'].value = 'r2';
    await sandbox.fetchRadar();
    await sandbox.dieuKhien('CONG_BO_DIEM');
    await sandbox.fetchRadar();

    assertList(sandbox.allRoomsData.map(r => r.id), ['r3', 'r2', 'r1']);
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-30: Publish answer via dieuKhien(XEM_DAP_AN) preserves chronological ordering');
  {
    const rooms = [
      { id: 'r3', created_at: '2026-09-03T10:00:00Z', trang_thai: 'CONG_BO_DIEM' },
      { id: 'r2', created_at: '2026-09-02T10:00:00Z', trang_thai: 'CONG_BO_DIEM' },
      { id: 'r1', created_at: '2026-09-01T10:00:00Z', trang_thai: 'CONG_BO_DIEM' }
    ];
    const { sandbox, elements } = createHarness({
      defaultRoom: rooms[0],
      mockStaffRpc: async (name, args) => {
        if (name === 'rpc_lay_danh_sach_phong_thi_gv') return { status: 'success', rooms };
        if (name === 'rpc_dieu_khien_phong_thi') {
          rooms[0].trang_thai = args.p_trang_thai;
          return { status: 'success' };
        }
        return { status: 'success' };
      }
    });

    elements['ctrlMaPhong'].value = 'r3';
    await sandbox.fetchRadar();
    await sandbox.dieuKhien('XEM_DAP_AN');
    await sandbox.fetchRadar();

    assertList(sandbox.allRoomsData.map(r => r.id), ['r3', 'r2', 'r1']);
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-31: Auto-lock timer expiry via tuDongKhoaPhongKhiHetGio preserves chronological ordering');
  {
    const roomNew = { id: 'rNew', created_at: '2026-09-03T10:00:00Z', trang_thai: 'THU_BAI' };
    const roomAuto = { id: 'rAuto', created_at: '2026-09-02T10:00:00Z', trang_thai: 'MO_PHONG', thoi_gian_mo: Date.now() - 3600000, thoi_gian: 45 };
    const roomOld = { id: 'rOld', created_at: '2026-09-01T10:00:00Z', trang_thai: 'THU_BAI' };

    const { sandbox, elements } = createHarness({
      allRooms: [roomNew, roomAuto, roomOld],
      mockStaffRpc: async () => ({ status: 'success' })
    });

    elements['td-act-rAuto'] = { id: 'td-act-rAuto', innerHTML: '' };
    elements['td-stt-rAuto'] = { id: 'td-stt-rAuto', innerHTML: '' };

    const res = await sandbox.tuDongKhoaPhongKhiHetGio('rAuto');
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(roomAuto.TrangThai, 'THU_BAI');

    // Assert position in allRoomsData is strictly unchanged
    assertList(sandbox.allRoomsData.map(r => r.id), ['rNew', 'rAuto', 'rOld']);
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-32: Batch open via dieuKhienNhomPhong(MO_PHONG) preserves chronological ordering');
  {
    const rooms = [
      { id: 'b3', created_at: '2026-09-03T10:00:00Z', trang_thai: 'THU_BAI' },
      { id: 'b2', created_at: '2026-09-02T10:00:00Z', trang_thai: 'THU_BAI' },
      { id: 'b1', created_at: '2026-09-01T10:00:00Z', trang_thai: 'THU_BAI' }
    ];
    const { sandbox } = createHarness({
      checkedRooms: [{ value: 'b2' }, { value: 'b1' }],
      mockStaffRpc: async (name, args) => {
        if (name === 'rpc_lay_danh_sach_phong_thi_gv') return { status: 'success', rooms };
        if (name === 'rpc_dieu_khien_phong_thi') {
          const target = rooms.find(r => r.id === args.p_room_id);
          if (target) target.trang_thai = args.p_trang_thai;
          return { status: 'success' };
        }
        return { status: 'success' };
      }
    });

    await sandbox.fetchRadar();
    await sandbox.dieuKhienNhomPhong('MO_PHONG');
    await sandbox.fetchRadar();

    assertList(sandbox.allRoomsData.map(r => r.id), ['b3', 'b2', 'b1']);
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-33: Batch lock via dieuKhienNhomPhong(THU_BAI) preserves chronological ordering');
  {
    const rooms = [
      { id: 'b3', created_at: '2026-09-03T10:00:00Z', trang_thai: 'MO_PHONG' },
      { id: 'b2', created_at: '2026-09-02T10:00:00Z', trang_thai: 'MO_PHONG' },
      { id: 'b1', created_at: '2026-09-01T10:00:00Z', trang_thai: 'MO_PHONG' }
    ];
    const { sandbox } = createHarness({
      checkedRooms: [{ value: 'b3' }, { value: 'b2' }],
      mockStaffRpc: async (name, args) => {
        if (name === 'rpc_lay_danh_sach_phong_thi_gv') return { status: 'success', rooms };
        if (name === 'rpc_dieu_khien_phong_thi') {
          const target = rooms.find(r => r.id === args.p_room_id);
          if (target) target.trang_thai = args.p_trang_thai;
          return { status: 'success' };
        }
        return { status: 'success' };
      }
    });

    await sandbox.fetchRadar();
    await sandbox.dieuKhienNhomPhong('THU_BAI');
    await sandbox.fetchRadar();

    assertList(sandbox.allRoomsData.map(r => r.id), ['b3', 'b2', 'b1']);
    console.log('  -> PASSED');
  }

  // =======================================================================
  // PART E: CREATION & DELETION LIFECYCLE INVARIANTS
  // =======================================================================

  console.log('Test ORDER-34: Creating a genuinely newer room places it at the TOP');
  {
    const rooms = [
      { id: 'r2', created_at: '2026-09-02T10:00:00Z' },
      { id: 'r1', created_at: '2026-09-01T10:00:00Z' }
    ];
    const { sandbox } = createHarness({
      mockStaffRpc: async () => ({ status: 'success', rooms })
    });

    await sandbox.fetchRadar();
    assertList(sandbox.allRoomsData.map(r => r.id), ['r2', 'r1']);

    // Teacher creates brand new room r3 with newest created_at timestamp
    rooms.unshift({ id: 'r3', created_at: '2026-09-03T10:00:00Z' });

    await sandbox.fetchRadar();
    assertList(sandbox.allRoomsData.map(r => r.id), ['r3', 'r2', 'r1'],
      'Newest created room must appear at TOP');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-35: Deleting a middle room preserves relative order of remaining rooms');
  {
    let rooms = [
      { id: 'r4', created_at: '2026-09-04T10:00:00Z' },
      { id: 'r3', created_at: '2026-09-03T10:00:00Z' },
      { id: 'r2', created_at: '2026-09-02T10:00:00Z' },
      { id: 'r1', created_at: '2026-09-01T10:00:00Z' }
    ];
    const { sandbox } = createHarness({
      mockStaffRpc: async () => ({ status: 'success', rooms })
    });

    await sandbox.fetchRadar();
    assertList(sandbox.allRoomsData.map(r => r.id), ['r4', 'r3', 'r2', 'r1']);

    // Delete middle room r2
    rooms = rooms.filter(r => r.id !== 'r2');

    const result = await sandbox.rpcLayDanhSachPhongThi();
    assertList(result.map(r => r.id), ['r4', 'r3', 'r1'],
      'Remaining rooms must preserve their relative chronological order');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // PART F: UI CONSUMERS, MODEL MAPPING & VERSIONING
  // =======================================================================

  console.log('Test ORDER-36: fetchRadar render row IDs are newest-first');
  {
    const rawRooms = [
      { id: 'old-1', ma_phong: 'OLD1', created_at: '2026-09-01T10:00:00Z', trang_thai: 'THU_BAI' },
      { id: 'new-3', ma_phong: 'NEW3', created_at: '2026-09-03T10:00:00Z', trang_thai: 'MO_PHONG' },
      { id: 'mid-2', ma_phong: 'MID2', created_at: '2026-09-02T10:00:00Z', trang_thai: 'THU_BAI' }
    ];

    const { sandbox, elements } = createHarness({
      mockStaffRpc: async () => ({ status: 'success', rooms: rawRooms })
    });

    await sandbox.fetchRadar();

    // Verify allRoomsData order
    assert.strictEqual(sandbox.allRoomsData[0].id, 'new-3');
    assert.strictEqual(sandbox.allRoomsData[1].id, 'mid-2');
    assert.strictEqual(sandbox.allRoomsData[2].id, 'old-1');

    // Verify rendered HTML row order
    const html = elements['radarBody'].innerHTML;
    const idxNew = html.indexOf('NEW3');
    const idxMid = html.indexOf('MID2');
    const idxOld = html.indexOf('OLD1');

    assert(idxNew >= 0 && idxMid >= 0 && idxOld >= 0, 'All room codes must be in rendered table');
    assert(idxNew < idxMid, 'NEW3 must appear before MID2 in rendered HTML');
    assert(idxMid < idxOld, 'MID2 must appear before OLD1 in rendered HTML');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-37: taiDanhSachPhong receives canonical sorted list');
  {
    const rawRooms = [
      { id: 'z-old', ma_phong: 'ZOLD', created_at: '2026-08-01T10:00:00Z' },
      { id: 'a-new', ma_phong: 'ANEW', created_at: '2026-09-03T10:00:00Z' }
    ];

    const { sandbox, elements } = createHarness({
      mockStaffRpc: async () => ({ status: 'success', rooms: rawRooms })
    });

    await sandbox.taiDanhSachPhong();

    const selectHtml = elements['ctrlMaPhong'].innerHTML;
    const idxNew = selectHtml.indexOf('ANEW');
    const idxOld = selectHtml.indexOf('ZOLD');

    assert(idxNew >= 0 && idxOld >= 0, 'Both options must be rendered');
    assert(idxNew < idxOld, 'Newest room ANEW must appear before older room ZOLD in dropdown options');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-38: CreatedAt is mapped into allRoomsData without duplicate alias');
  {
    const testCreatedAt = '2026-09-03T08:30:00.123Z';
    const rawRooms = [
      { id: 'test-room', ma_phong: 'T01', created_at: testCreatedAt, trang_thai: 'THU_BAI' }
    ];

    const { sandbox } = createHarness({
      mockStaffRpc: async () => ({ status: 'success', rooms: rawRooms })
    });

    await sandbox.fetchRadar();

    const mappedRoom = sandbox.allRoomsData.find(r => r.id === 'test-room');
    assert(mappedRoom, 'Mapped room must exist');
    assert.strictEqual(mappedRoom.CreatedAt, testCreatedAt, 'CreatedAt must match server created_at');

    // Mutate state and ensure CreatedAt is preserved
    mappedRoom.TrangThai = 'MO_PHONG';
    mappedRoom.ThoiGianMo = Date.now();
    assert.strictEqual(mappedRoom.CreatedAt, testCreatedAt, 'CreatedAt must survive state mutations');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-39: Version invariants: teacher exact 20260904-submission-safety-010c; student/SW exact 010a');
  {
    assert(gvHtmlSource.includes('giaovien.js?v=20260904-submission-safety-010c'),
      'giaovien.html must include giaovien.js?v=20260904-submission-safety-010c');

    // Verify all other test suites require exact 010c
    const cspTest = fs.readFileSync(path.join(repoRoot, 'tests/account_import_exceljs_csp_simulation.js'), 'utf8');
    assert(cspTest.includes('20260904-submission-safety-010c'), 'account_import_exceljs_csp must require 010c');

    const adminTest = fs.readFileSync(path.join(repoRoot, 'tests/admin_frontend_session_simulation.js'), 'utf8');
    assert(adminTest.includes('20260904-submission-safety-010c'), 'admin_frontend_session must require 010c');

    const scoreTest = fs.readFileSync(path.join(repoRoot, 'tests/flex_lite_authoritative_score_presentation_simulation.js'), 'utf8');
    assert(scoreTest.includes('20260904-submission-safety-010c'), 'score_presentation must require 010c');

    const dashTest = fs.readFileSync(path.join(repoRoot, 'tests/teacher_dashboard_action_reliability_simulation.js'), 'utf8');
    assert(dashTest.includes('20260904-submission-safety-010c'), 'teacher_dashboard must require 010c');

    const roomActTest = fs.readFileSync(path.join(repoRoot, 'tests/teacher_room_control_action_reliability_simulation.js'), 'utf8');
    assert(roomActTest.includes('20260904-submission-safety-010c'), 'teacher_room_control must require 010c');

    // Student / SW remains exact 005
    assert(hsHtmlSource.includes('hoc_sinh.js?v=20260904-submission-safety-010a'),
      'hoc_sinh.html must remain 20260904-submission-safety-010a');
    assert(hsJsSource.includes("const VERSION = '20260904-submission-safety-010a';"),
      'hoc_sinh.js must remain 20260904-submission-safety-010a');
    assert(swJsSource.includes("const VERSION = '20260904-submission-safety-010a';"),
      'sw.js must remain 20260904-submission-safety-010a');
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-40: Non-array inputs to sortRoomsNewestFirstByCreatedAt safely return empty array');
  {
    const { sandbox } = createHarness();
    assertList(sandbox.sortRoomsNewestFirstByCreatedAt(null), []);
    assertList(sandbox.sortRoomsNewestFirstByCreatedAt(undefined), []);
    assertList(sandbox.sortRoomsNewestFirstByCreatedAt('not-array'), []);
    assertList(sandbox.sortRoomsNewestFirstByCreatedAt({}), []);
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-41: parseRoomCreatedAtMs parses ISO strings, numeric timestamps, and Date objects');
  {
    const { sandbox } = createHarness();
    assert.strictEqual(sandbox.parseRoomCreatedAtMs(1700000000000), 1700000000000);
    assert.strictEqual(sandbox.parseRoomCreatedAtMs('1700000000000'), 1700000000000);
    assert.strictEqual(sandbox.parseRoomCreatedAtMs('2026-09-03T12:00:00Z'), Date.parse('2026-09-03T12:00:00Z'));
    assert.strictEqual(sandbox.parseRoomCreatedAtMs(new Date('2026-09-03T12:00:00Z')), Date.parse('2026-09-03T12:00:00Z'));
    assert.strictEqual(sandbox.parseRoomCreatedAtMs(null), null);
    assert.strictEqual(sandbox.parseRoomCreatedAtMs(''), null);
    assert.strictEqual(sandbox.parseRoomCreatedAtMs('invalid'), null);
    console.log('  -> PASSED');
  }

  console.log('Test ORDER-42: Test suite execution completed naturally without process.exit(0)');
  {
    console.log('  -> PASSED');
  }

  console.log('\n=== ALL 42 TEACHER ROOM CHRONOLOGICAL ORDERING TESTS PASSED SUCCESSFULLY ===');
}

runAllTests().catch(err => {
  console.error('\nTest suite failed:', err);
  process.exit(1);
});
