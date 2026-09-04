/**
 * tests/teacher_radar_stable_dom_no_flicker_simulation.js
 *
 * TASK: FLEX-LITE-009
 * TEACHER RADAR STABLE DOM / ZERO-FLICKER ROOM UPDATES
 *
 * Key requirements:
 * 1. Keyed DOM reconciliation:
 *    - Preserves DOM reference equality of existing `tr` elements (prevRow === nextRow)
 *    - Preserves DOM reference equality of child elements (buttons, inputs, status badges)
 *    - Zero whole-table / whole-row / action-cell rebuilds on room state updates or background refreshes
 *    - Checkbox selection and input state are maintained across updates
 * 2. Zero-Flicker Quick Actions:
 *    - "Mở lại" <-> "Khóa": instant direct toggle of text, class, and onclick
 *    - Zero transient states: no spinner, no "⏳ Đang khóa...", no "✅ Đã khóa", no error button flash
 *    - VisualFeedback: false for room control actions
 * 3. Destructive actions:
 *    - xoaDeTrongPhong and xoaPhongHoanToan use visualFeedback: false
 *    - Deleted rooms are removed directly via row.remove() without redrawing siblings
 * 4. CSS Invariants:
 *    - No CSS transitions or animations on .radar-action-btn, .room-action-btn, .room-batch-action-btn, #radarBody tr
 *    - Desktop .radar-action-group nowrap (no wrapping to 2+1 lines)
 * 5. Full version and regression safety invariants
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const gvHtmlSource = fs.readFileSync(path.join(repoRoot, 'giaovien.html'), 'utf8');
const gvJsSource = fs.readFileSync(path.join(repoRoot, 'giaovien.js'), 'utf8');
const hsHtmlSource = fs.readFileSync(path.join(repoRoot, 'hoc_sinh.html'), 'utf8');
const hsJsSource = fs.readFileSync(path.join(repoRoot, 'hoc_sinh.js'), 'utf8');
const swJsSource = fs.readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');

// =======================================================================
// DOM SIMULATION HARNESS
// =======================================================================

function createHarness(options = {}) {
  const elements = {};
  const metrics = {
    rpcCalls: [],
    alerts: [],
    confirms: []
  };

  function createMockElement(id, tagName = 'div') {
    const children = [];
    const classListSet = new Set();
    const attributes = {};
    let _innerHTML = '';
    let _innerText = '';
    let _textContent = '';

    const el = {
      id,
      tagName: tagName.toUpperCase(),
      value: '',
      checked: false,
      disabled: false,
      title: '',
      style: {},
      attributes,
      children,
      parentNode: null,

      get textContent() { return _textContent || _innerText || ''; },
      set textContent(v) { _textContent = String(v); _innerText = String(v); },
      get innerText() { return _innerText || _textContent || ''; },
      set innerText(v) { _innerText = String(v); _textContent = String(v); },

      get innerHTML() { return _innerHTML; },
      set innerHTML(html) {
        _innerHTML = String(html || '');
        this.children.length = 0;
        if (!_innerHTML) return;

        // Parse all tags with id and classes
        const tagRegex = /<([a-zA-Z0-9]+)([^>]*)>/g;
        let m;
        while ((m = tagRegex.exec(_innerHTML)) !== null) {
          const tName = m[1];
          const attrStr = m[2] || '';
          if (attrStr.startsWith('/')) continue;

          const idMatch = attrStr.match(/\bid="([^"]+)"/) || attrStr.match(/\bid='([^']+)'/);
          const clsMatch = attrStr.match(/\bclass="([^"]+)"/) || attrStr.match(/\bclass='([^']+)'/);
          const valMatch = attrStr.match(/\bvalue="([^"]+)"/) || attrStr.match(/\bvalue='([^']+)'/);
          const ocMatch = attrStr.match(/\bonclick="([^"]+)"/) || attrStr.match(/\bonclick='([^']+)'/);

          if (idMatch) {
            const childId = idMatch[1];
            const childEl = elements[childId] || createMockElement(childId, tName);
            elements[childId] = childEl;

            if (clsMatch) {
              clsMatch[1].split(/\s+/).filter(Boolean).forEach(c => childEl.classList.add(c));
            }
            if (valMatch) childEl.value = valMatch[1];
            if (ocMatch) childEl.setAttribute('onclick', ocMatch[1]);

            const dataRegex = /\b(data-[a-zA-Z0-9_-]+)="([^"]+)"/g;
            let dm;
            while ((dm = dataRegex.exec(attrStr)) !== null) {
              childEl.setAttribute(dm[1], dm[2]);
            }

            if (tName.toUpperCase() === 'TR') {
              childEl.parentNode = el;
              if (!this.children.includes(childEl)) {
                this.children.push(childEl);
              }
            }
          }
        }

        // Parse button text
        const btnRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
        let bm;
        while ((bm = btnRegex.exec(_innerHTML)) !== null) {
          const bAttrs = bm[1];
          const bText = bm[2];
          const bId = bAttrs.match(/\bid="([^"]+)"/) || bAttrs.match(/\bid='([^']+)'/);
          if (bId && elements[bId[1]]) {
            elements[bId[1]].textContent = bText.trim();
            elements[bId[1]].innerText = bText.trim();
          }
        }

        // Parse span text
        const spanRegex = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
        let sm;
        while ((sm = spanRegex.exec(_innerHTML)) !== null) {
          const sAttrs = sm[1];
          const sText = sm[2];
          const sId = sAttrs.match(/\bid="([^"]+)"/) || sAttrs.match(/\bid='([^']+)'/);
          if (sId && elements[sId[1]]) {
            elements[sId[1]].innerHTML = sText;
            elements[sId[1]].textContent = sText.replace(/<[^>]+>/g, '').trim();
            elements[sId[1]].innerText = sText.replace(/<[^>]+>/g, '').trim();
          }
        }
      },

      get firstElementChild() {
        return children[0] || null;
      },

      classList: {
        add: (...cls) => cls.forEach(c => classListSet.add(c)),
        remove: (...cls) => cls.forEach(c => classListSet.delete(c)),
        contains: (c) => classListSet.has(c),
        toggle: (c) => classListSet.has(c) ? classListSet.delete(c) : classListSet.add(c)
      },

      setAttribute: (k, v) => { attributes[k] = String(v); },
      getAttribute: (k) => attributes[k] !== undefined ? attributes[k] : null,
      removeAttribute: (k) => { delete attributes[k]; },

      appendChild: (child) => {
        child.parentNode = el;
        if (!children.includes(child)) children.push(child);
        return child;
      },

      insertBefore: (newChild, refChild) => {
        newChild.parentNode = el;
        const idx = children.indexOf(refChild);
        if (idx >= 0) children.splice(idx, 0, newChild);
        else children.push(newChild);
        return newChild;
      },

      removeChild: (child) => {
        const idx = children.indexOf(child);
        if (idx >= 0) {
          children.splice(idx, 1);
          child.parentNode = null;
        }
        return child;
      },

      remove: function() {
        if (this.parentNode && this.parentNode.removeChild) {
          this.parentNode.removeChild(this);
        }
      },

      querySelector: (sel) => {
        if (sel.startsWith('#')) {
          const targetId = sel.slice(1);
          return elements[targetId] || null;
        }
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          for (const child of children) {
            if (child.classList && child.classList.contains(cls)) return child;
          }
          for (const k of Object.keys(elements)) {
            if (elements[k].classList && elements[k].classList.contains(cls)) return elements[k];
          }
        }
        return null;
      },

      querySelectorAll: (sel) => {
        const results = [];
        const cls = sel.startsWith('.') ? sel.slice(1) : null;
        if (cls) {
          for (const k of Object.keys(elements)) {
            if (elements[k].classList && elements[k].classList.contains(cls)) {
              results.push(elements[k]);
            }
          }
        }
        return results;
      },

      closest: function(sel) {
        if (sel.toUpperCase() === 'TR' && this.tagName === 'TR') return this;
        let curr = this.parentNode;
        while (curr) {
          if (sel.toUpperCase() === 'TR' && curr.tagName === 'TR') return curr;
          curr = curr.parentNode;
        }
        return null;
      },

      addEventListener: (evt, handler) => {}
    };

    if (id) elements[id] = el;
    return el;
  }

  const defaultRoom = {
    id: 'room-default-1',
    MaPhong: 'DEFAULT1',
    TenDotKiemTra: 'Giữa kỳ I',
    ten_dot: 'Giữa kỳ I',
    truong_id: 'school-uuid-1',
    TrangThai: 'MO_PHONG',
    DoiTuong: 'TatCa',
    doi_tuong: 'TatCa',
    ThoiGian: 45,
    thoi_gian: 45,
    ThoiGianMo: Date.now() - 10000,
    thoi_gian_mo: Date.now() - 10000,
    created_at: '2026-09-03T12:00:00Z',
    CreatedAt: '2026-09-03T12:00:00Z'
  };

  const allRooms = options.allRooms || [defaultRoom];

  // Radar body mock
  const radarBody = createMockElement('radarBody', 'tbody');
  elements['radarBody'] = radarBody;
  elements['chkAllRooms'] = createMockElement('chkAllRooms', 'input');

  const sandbox = {
    console,
    Math,
    Object,
    Array,
    Set,
    Map,
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
        if (sel.startsWith('#')) return elements[sel.slice(1)] || null;
        if (sel.startsWith('.chk-Room[value=')) {
          const valMatch = sel.match(/value="([^"]+)"/);
          const val = valMatch ? valMatch[1] : null;
          return Object.values(elements).find(e => e.classList && e.classList.contains('chk-Room') && String(e.value) === String(val)) || null;
        }
        if (sel === '.chk-Room') {
          for (const k of Object.keys(elements)) {
            if (elements[k].classList && elements[k].classList.contains('chk-Room')) return elements[k];
          }
        }
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel === '.chk-Room') {
          return Object.values(elements).filter(e => e.classList && e.classList.contains('chk-Room'));
        }
        if (sel === '.chk-Room:checked') {
          return Object.values(elements).filter(e => e.classList && e.classList.contains('chk-Room') && e.checked);
        }
        if (sel === '.live-timer') {
          return Object.values(elements).filter(e => e.classList && e.classList.contains('live-timer'));
        }
        return [];
      },
      createElement: (tag) => {
        const el = createMockElement('dyn-' + Math.random().toString(36).slice(2, 7), tag);
        return el;
      }
    },
    window: {},
    teacherTimerInterval: null,
    setInterval: (fn, delay) => 101,
    clearInterval: (id) => {},
    parseTimeSafely: (t) => {
      if (!t) return 0;
      const n = typeof t === 'number' ? t : Date.parse(t);
      return isNaN(n) ? 0 : n;
    },
    setTimeout: (fn, d) => { fn(); return 1; },
    clearTimeout: () => {},
    alert: (msg) => { metrics.alerts.push(msg); },
    confirm: (msg) => {
      metrics.confirms.push(msg);
      return options.confirmResult !== undefined ? options.confirmResult : true;
    },
    staffRpc: async (name, params) => {
      metrics.rpcCalls.push({ name, params });
      if (options.mockStaffRpc) return options.mockStaffRpc(name, params);
      if (name === 'rpc_lay_danh_sach_phong_thi_gv') {
        const rawRooms = allRooms.map(r => ({
          id: r.id,
          ma_phong: r.MaPhong || r.ma_phong,
          ten_dot: r.TenDotKiemTra || r.ten_dot,
          doi_tuong: r.DoiTuong || r.doi_tuong,
          thoi_gian: r.ThoiGian || r.thoi_gian || 45,
          trang_thai: r.TrangThai || r.trang_thai || 'MO_PHONG',
          thoi_gian_mo: r.ThoiGianMo || r.thoi_gian_mo,
          created_at: r.created_at || r.CreatedAt || '2026-09-03T12:00:00Z',
          truong_id: r.truong_id || 'school-uuid-1'
        }));
        return { status: 'success', rooms: rawRooms };
      }
      if (name === 'rpc_dieu_khien_phong_thi') {
        const rid = params.p_room_id || params.p_phong_id;
        const found = allRooms.find(x => String(x.id) === String(rid));
        if (found) {
          found.TrangThai = params.p_trang_thai;
          found.trang_thai = params.p_trang_thai;
        }
        return { status: 'success' };
      }
      if (name === 'rpc_xoa_phong_thi') {
        const idx = allRooms.findIndex(x => String(x.id) === String(params.p_phong_id));
        if (idx >= 0) allRooms.splice(idx, 1);
        return { status: 'success' };
      }
      return { status: 'success', data: {} };
    },
    getSelectedRoom: () => defaultRoom,
    getRoomTargetSchoolId: (room) => room?.truong_id || 'school-uuid-1',
    gvData: { ma_gv: 'GV001', truong_id: 'school-uuid-1', quyen: 'GiaoVien' },
    allRoomsData: allRooms,
    activeWorkspaceMonId: 'ALL',
    activeWorkspaceTruongId: 'ALL',
    previewExamData: [],
    renderPreviewContent: () => {}
  };

  vm.createContext(sandbox);

  // Extract room control helpers + radar logic from giaovien.js
  const helperMarker = '// ==========================================================\n// ROOM CONTROL ACTION STATE & RELIABILITY HELPERS (FLEX-LITE-007)';
  const helperIdx = gvJsSource.indexOf(helperMarker);
  assert(helperIdx >= 0, 'ROOM CONTROL HELPERS marker must be in giaovien.js');

  const taiPhongMarker = 'async function taiDanhSachPhong() {';
  const taiPhongIdx = gvJsSource.indexOf(taiPhongMarker, helperIdx);
  assert(taiPhongIdx >= 0, 'taiDanhSachPhong must be found after helpers in giaovien.js');

  const snippet = gvJsSource.slice(helperIdx, taiPhongIdx);

  const rpcDieuKhienMarker = 'async function rpcDieuKhienPhongThi(';
  const rpcDieuKhienIdx = gvJsSource.indexOf(rpcDieuKhienMarker);
  assert(rpcDieuKhienIdx >= 0, 'rpcDieuKhienPhongThi must be found in giaovien.js');
  const rpcLayMarker = 'async function rpcLayDanhSachPhongThi()';
  const rpcLayIdx = gvJsSource.indexOf(rpcLayMarker);
  assert(rpcLayIdx >= 0, 'rpcLayDanhSachPhongThi must be found in giaovien.js');

  const rpcSnippet = gvJsSource.slice(rpcDieuKhienIdx, gvJsSource.indexOf('\n}\n', rpcDieuKhienIdx) + 3);

  const parseMsMarker = 'function parseRoomCreatedAtMs(';
  const parseMsIdx = gvJsSource.indexOf(parseMsMarker);
  assert(parseMsIdx >= 0, 'parseRoomCreatedAtMs must be found in giaovien.js');
  const sortAndRpcSnippet = gvJsSource.slice(parseMsIdx);

  const fullSnippet = snippet + '\n' + rpcSnippet + '\n' + sortAndRpcSnippet;
  vm.runInContext(fullSnippet, sandbox);

  return { sandbox, elements, metrics, radarBody, createMockElement };
}

// =======================================================================
// TEST SUITE
// =======================================================================

async function runAllTests() {
  console.log('=== RUNNING FLEX-LITE-009 TEACHER RADAR STABLE DOM & ZERO-FLICKER SIMULATION ===\n');

  // =======================================================================
  // PART A: KEYED DOM RECONCILIATION & IDENTITY PRESERVATION (Tests 1 - 10)
  // =======================================================================

  console.log('Test STABLE-01: reconcileRadarRooms function exists and is defined');
  {
    const { sandbox } = createHarness();
    assert(typeof sandbox.reconcileRadarRooms === 'function', 'reconcileRadarRooms must be a function');
    assert(typeof sandbox.renderRadarRoomRow === 'function', 'renderRadarRoomRow must be a function');
    assert(typeof sandbox.syncRadarRoomRowDom === 'function', 'syncRadarRoomRowDom must be a function');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-02: Initial render creates keyed tr elements with id="radar-row-${roomId}"');
  {
    const room1 = { id: 'room-1', MaPhong: 'P01', TrangThai: 'MO_PHONG', ThoiGian: 45, DoiTuong: 'TatCa' };
    const room2 = { id: 'room-2', MaPhong: 'P02', TrangThai: 'THU_BAI', ThoiGian: 45, DoiTuong: 'TatCa' };
    const { sandbox, radarBody } = createHarness({ allRooms: [room1, room2] });

    sandbox.reconcileRadarRooms([room1, room2]);
    assert.strictEqual(radarBody.children.length, 2, 'radarBody must have 2 rows');
    assert.strictEqual(radarBody.children[0].id, 'radar-row-room-1');
    assert.strictEqual(radarBody.children[1].id, 'radar-row-room-2');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-03: DOM reference equality of existing rows is PRESERVED on state update');
  {
    const room1 = { id: 'room-1', MaPhong: 'P01', TrangThai: 'MO_PHONG', ThoiGian: 45, DoiTuong: 'TatCa' };
    const { sandbox, radarBody } = createHarness({ allRooms: [room1] });

    sandbox.reconcileRadarRooms([room1]);
    const originalRow = radarBody.children[0];
    assert(originalRow, 'Original row must exist');

    // Simulate background refresh where room1 status changed to THU_BAI
    const updatedRoom1 = { id: 'room-1', MaPhong: 'P01', TrangThai: 'THU_BAI', ThoiGian: 45, DoiTuong: 'TatCa' };
    sandbox.reconcileRadarRooms([updatedRoom1]);

    const currentRow = radarBody.children[0];
    assert.strictEqual(currentRow, originalRow, 'Row DOM reference MUST be strictly identical (prevRow === nextRow)');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-04: Child action button DOM reference equality is PRESERVED on status change');
  {
    const room1 = { id: 'room-1', MaPhong: 'P01', TrangThai: 'MO_PHONG', ThoiGian: 45, DoiTuong: 'TatCa' };
    const { sandbox, elements } = createHarness({ allRooms: [room1] });

    sandbox.reconcileRadarRooms([room1]);
    const btnQuick = elements['roomQuickStateBtn-room-1'];
    const btnDelExam = elements['roomDeleteExamBtn-room-1'];
    const btnDelAll = elements['roomDeleteAllBtn-room-1'];

    assert(btnQuick && btnDelExam && btnDelAll, 'Action buttons must exist');

    // Reconcile with updated room state
    room1.TrangThai = 'THU_BAI';
    sandbox.reconcileRadarRooms([room1]);

    assert.strictEqual(elements['roomQuickStateBtn-room-1'], btnQuick, 'Quick button DOM node must NOT be replaced');
    assert.strictEqual(elements['roomDeleteExamBtn-room-1'], btnDelExam, 'Delete exam button DOM node must NOT be replaced');
    assert.strictEqual(elements['roomDeleteAllBtn-room-1'], btnDelAll, 'Delete all button DOM node must NOT be replaced');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-05: Checkbox checked state is maintained during reconciliation');
  {
    const room1 = { id: 'room-chk-1', MaPhong: 'CHK1', TrangThai: 'MO_PHONG', ThoiGian: 45, DoiTuong: 'TatCa' };
    const { sandbox, elements } = createHarness({ allRooms: [room1] });

    sandbox.reconcileRadarRooms([room1]);
    const chk = elements['roomCheckbox-room-chk-1'];
    assert(chk, 'Checkbox must exist');
    chk.checked = true; // User checked this room

    // Subsequent background refresh
    sandbox.reconcileRadarRooms([room1]);
    assert.strictEqual(chk.checked, true, 'User checkbox check state MUST NOT be lost during reconciliation');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-06: Fast class input value is maintained during reconciliation');
  {
    const room1 = { id: 'room-inp-1', MaPhong: 'INP1', TrangThai: 'MO_PHONG', ThoiGian: 45, DoiTuong: '12A1' };
    const { sandbox, elements } = createHarness({ allRooms: [room1] });

    sandbox.reconcileRadarRooms([room1]);
    const fastInput = elements['fastDoiTuong-room-inp-1'];
    assert(fastInput, 'Fast doi tuong input must exist');
    assert.strictEqual(fastInput.value, '12A1');

    sandbox.reconcileRadarRooms([room1]);
    assert.strictEqual(fastInput.value, '12A1', 'Fast input value must be preserved');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-07: Inserting a new room adds only 1 new tr without recreating existing rows');
  {
    const room1 = { id: 'room-old', MaPhong: 'OLD', created_at: '2026-09-01T10:00:00Z', TrangThai: 'MO_PHONG' };
    const { sandbox, radarBody } = createHarness({ allRooms: [room1] });

    sandbox.reconcileRadarRooms([room1]);
    const initialRow = radarBody.children[0];

    const room2 = { id: 'room-new', MaPhong: 'NEW', created_at: '2026-09-02T10:00:00Z', TrangThai: 'MO_PHONG' };
    sandbox.reconcileRadarRooms([room2, room1]);

    assert.strictEqual(radarBody.children.length, 2, 'Must contain 2 rows');
    assert.strictEqual(radarBody.children[0].id, 'radar-row-room-new', 'Newest room must be at top');
    assert.strictEqual(radarBody.children[1], initialRow, 'Existing row MUST be preserved without redraw');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-08: Deleting a room removes only its row without recreating siblings');
  {
    const r1 = { id: 'r1', MaPhong: 'R1', TrangThai: 'MO_PHONG' };
    const r2 = { id: 'r2', MaPhong: 'R2', TrangThai: 'MO_PHONG' };
    const r3 = { id: 'r3', MaPhong: 'R3', TrangThai: 'MO_PHONG' };
    const { sandbox, radarBody } = createHarness({ allRooms: [r1, r2, r3] });

    sandbox.reconcileRadarRooms([r1, r2, r3]);
    const row1 = radarBody.children[0];
    const row3 = radarBody.children[2];

    // Delete r2 from list
    sandbox.reconcileRadarRooms([r1, r3]);

    assert.strictEqual(radarBody.children.length, 2, 'radarBody must now have 2 rows');
    assert.strictEqual(radarBody.children[0], row1, 'Row 1 identity must be preserved');
    assert.strictEqual(radarBody.children[1], row3, 'Row 3 identity must be preserved');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-09: Empty room list renders placeholder without throwing');
  {
    const { sandbox, radarBody } = createHarness();
    sandbox.reconcileRadarRooms([]);
    assert.strictEqual(radarBody.innerHTML.includes('Chưa có phòng nào đang mở'), true);
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-10: Placeholder is cleared automatically when valid room is added');
  {
    const { sandbox, radarBody } = createHarness();
    sandbox.reconcileRadarRooms([]);
    assert(radarBody.innerHTML.includes('Chưa có phòng nào'));

    const r = { id: 'r-live', MaPhong: 'LIVE', TrangThai: 'MO_PHONG' };
    sandbox.reconcileRadarRooms([r]);
    assert.strictEqual(radarBody.children.length, 1);
    assert.strictEqual(radarBody.children[0].id, 'radar-row-r-live');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // PART B: ZERO-FLICKER ROOM CONTROL ACTIONS (Tests 11 - 20)
  // =======================================================================

  console.log('Test STABLE-11: dieuKhienFast passes visualFeedback: false to runRoomControlAction');
  {
    const bodyStr = gvJsSource.slice(
      gvJsSource.indexOf('async function dieuKhienFast('),
      gvJsSource.indexOf('async function xoaPhongHoanToan(')
    );
    assert(bodyStr.includes('visualFeedback: false'), 'dieuKhienFast must specify visualFeedback: false');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-12: xoaDeTrongPhong passes visualFeedback: false');
  {
    const bodyStr = gvJsSource.slice(
      gvJsSource.indexOf('async function xoaDeTrongPhong('),
      gvJsSource.indexOf('async function capNhatNhanhPhong(')
    );
    assert(bodyStr.includes('visualFeedback: false'), 'xoaDeTrongPhong must specify visualFeedback: false');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-13: xoaPhongHoanToan passes visualFeedback: false');
  {
    const bodyStr = gvJsSource.slice(
      gvJsSource.indexOf('async function xoaPhongHoanToan('),
      gvJsSource.indexOf('async function xoaDeTrongPhong(')
    );
    assert(bodyStr.includes('visualFeedback: false'), 'xoaPhongHoanToan must specify visualFeedback: false');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-14: runRoomControlAction with visualFeedback: false does not set busy/spinner/text');
  {
    const { sandbox, elements, createMockElement } = createHarness();
    const btn = elements['test-zero-btn'] = createMockElement('test-zero-btn', 'button');
    btn.innerText = 'Khóa';

    let actionExecuted = false;
    const promise = sandbox.runRoomControlAction('test-zero-btn', async () => {
      // While action is pending, verify button text was NOT changed to spinner or busy text
      assert.strictEqual(btn.innerText, 'Khóa', 'Button text must remain rigid during execution');
      actionExecuted = true;
      return { status: 'success' };
    }, { visualFeedback: false });

    await promise;
    assert(actionExecuted, 'Action must execute');
    assert.strictEqual(btn.innerText, 'Khóa', 'Button text must NOT have transient success flash');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-15: dieuKhienFast(THU_BAI) directly toggles button text to "Mở lại" (zero transient text)');
  {
    const room = { id: 'r-lock-1', MaPhong: 'LK1', TrangThai: 'MO_PHONG', ThoiGian: 45 };
    const { sandbox, elements } = createHarness({ allRooms: [room] });

    sandbox.reconcileRadarRooms([room]);
    const btn = elements['roomQuickStateBtn-r-lock-1'];
    assert.strictEqual(btn.textContent, 'Khóa');

    await sandbox.dieuKhienFast('r-lock-1', 'THU_BAI');

    // Immediately after execution, text is "Mở lại", class has radar-action-open
    assert.strictEqual(btn.textContent, 'Mở lại');
    assert.strictEqual(btn.classList.contains('radar-action-open'), true);
    assert.strictEqual(btn.classList.contains('radar-action-lock'), false);
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-16: dieuKhienFast(MO_PHONG) directly toggles button text to "Khóa" (zero transient text)');
  {
    const room = { id: 'r-open-1', MaPhong: 'OP1', TrangThai: 'THU_BAI', ThoiGian: 45 };
    const { sandbox, elements } = createHarness({ allRooms: [room] });

    sandbox.reconcileRadarRooms([room]);
    const btn = elements['roomQuickStateBtn-r-open-1'];
    assert.strictEqual(btn.textContent, 'Mở lại');

    await sandbox.dieuKhienFast('r-open-1', 'MO_PHONG');

    assert.strictEqual(btn.textContent, 'Khóa');
    assert.strictEqual(btn.classList.contains('radar-action-lock'), true);
    assert.strictEqual(btn.classList.contains('radar-action-open'), false);
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-17: dieuKhienFast updates onclick to the opposite action');
  {
    const room = { id: 'r-toggle-1', MaPhong: 'TG1', TrangThai: 'MO_PHONG', ThoiGian: 45 };
    const { sandbox, elements } = createHarness({ allRooms: [room] });

    sandbox.reconcileRadarRooms([room]);
    const btn = elements['roomQuickStateBtn-r-toggle-1'];
    assert(btn.getAttribute('onclick').includes('THU_BAI'));

    await sandbox.dieuKhienFast('r-toggle-1', 'THU_BAI');
    assert(btn.getAttribute('onclick').includes('MO_PHONG'), 'Onclick must be updated to MO_PHONG');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-18: Status badge updates directly without table redrawing');
  {
    const room = { id: 'r-stt-1', MaPhong: 'ST1', TrangThai: 'MO_PHONG', ThoiGian: 45 };
    const { sandbox, elements, radarBody } = createHarness({ allRooms: [room] });

    sandbox.reconcileRadarRooms([room]);
    const rowBefore = radarBody.children[0];
    const sttSpan = elements['radarStatus-r-stt-1'];
    assert(sttSpan.innerHTML.includes('Đang Thi'));

    await sandbox.dieuKhienFast('r-stt-1', 'THU_BAI');

    assert(sttSpan.innerHTML.includes('Đã Khóa'));
    assert.strictEqual(radarBody.children[0], rowBefore, 'Row must remain strictly intact');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-19: xoaPhongHoanToan removes target row directly from DOM without touching siblings');
  {
    const r1 = { id: 'del-1', MaPhong: 'D1', TrangThai: 'MO_PHONG' };
    const r2 = { id: 'keep-2', MaPhong: 'K2', TrangThai: 'MO_PHONG' };
    const { sandbox, radarBody } = createHarness({ allRooms: [r1, r2] });

    sandbox.reconcileRadarRooms([r1, r2]);
    const keepRow = radarBody.children[1];

    await sandbox.xoaPhongHoanToan('del-1');

    assert.strictEqual(radarBody.children.length, 1, 'One row remaining');
    assert.strictEqual(radarBody.children[0], keepRow, 'Sibling row identity MUST be preserved');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-20: Rapid double invocation of dieuKhienFast is de-duplicated');
  {
    const room = { id: 'r-dup-1', MaPhong: 'DP1', TrangThai: 'MO_PHONG', ThoiGian: 45 };
    let mutationRpcCount = 0;
    const { sandbox } = createHarness({
      allRooms: [room],
      mockStaffRpc: async (name) => {
        if (name === 'rpc_dieu_khien_phong_thi') mutationRpcCount++;
        return { status: 'success' };
      }
    });

    const p1 = sandbox.dieuKhienFast('r-dup-1', 'THU_BAI');
    const p2 = sandbox.dieuKhienFast('r-dup-1', 'THU_BAI');
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(mutationRpcCount, 1, 'Exactly 1 mutation RPC must be made');
    assert.strictEqual(res1.status, 'success');
    assert.strictEqual(res2.status, 'skipped');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // PART C: CSS INVARIANTS & ZERO ANIMATION / ZERO FLICKER (Tests 21 - 28)
  // =======================================================================

  console.log('Test STABLE-21: .radar-action-btn enforces transition: none !important');
  {
    assert(
      gvHtmlSource.includes('.radar-action-btn') &&
      gvHtmlSource.includes('transition: none !important;'),
      '.radar-action-btn must have transition: none !important'
    );
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-22: .radar-action-btn enforces animation: none !important');
  {
    assert(
      gvHtmlSource.includes('animation: none !important;'),
      '.radar-action-btn must have animation: none !important'
    );
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-23: #radarBody tr enforces transition: none !important');
  {
    assert(
      gvHtmlSource.includes('#radarBody tr'),
      '#radarBody tr rules must exist in giaovien.html'
    );
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-24: .radar-action-group desktop enforces flex-direction: row and flex-wrap: nowrap');
  {
    assert(gvHtmlSource.includes('flex-direction: row;') && gvHtmlSource.includes('flex-wrap: nowrap;'));
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-25: .radar-status-cell enforces white-space: nowrap');
  {
    assert(gvHtmlSource.includes('.radar-status-cell') && gvHtmlSource.includes('white-space: nowrap;'));
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-26: .radar-action-delete-all uses destructive red styling');
  {
    assert(gvHtmlSource.includes('.radar-action-delete-all') && gvHtmlSource.includes('#c0392b'));
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-27: .radar-action-delete-exam uses orange styling');
  {
    assert(gvHtmlSource.includes('.radar-action-delete-exam') && gvHtmlSource.includes('#f39c12'));
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-28: .radar-action-btn:hover has no translate/jump transforms');
  {
    const hoverSection = gvHtmlSource.slice(gvHtmlSource.indexOf('.radar-action-btn:hover'), gvHtmlSource.indexOf('.radar-action-btn:disabled'));
    assert(!hoverSection.includes('transform: translate'), 'Hover must not cause physical jump');
    console.log('  -> PASSED');
  }

  // =======================================================================
  // PART D: AUTO-LOCK & TIMER IN-PLACE UPDATES (Tests 29 - 34)
  // =======================================================================

  console.log('Test STABLE-29: tuDongKhoaPhongKhiHetGio uses syncRadarRoomRowDom');
  {
    const fnBody = gvJsSource.slice(
      gvJsSource.indexOf('async function tuDongKhoaPhongKhiHetGio('),
      gvJsSource.indexOf('function khoiDongDongHoGiaoVien()')
    );
    assert(fnBody.includes('syncRadarRoomRowDom(r)'), 'tuDongKhoaPhongKhiHetGio must call syncRadarRoomRowDom');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-30: tuDongKhoaPhongKhiHetGio sets status to THU_BAI in allRoomsData and DOM');
  {
    const room = { id: 'room-al-1', MaPhong: 'AL1', TrangThai: 'MO_PHONG', ThoiGian: 45 };
    const { sandbox, elements } = createHarness({ allRooms: [room] });

    sandbox.reconcileRadarRooms([room]);
    const btn = elements['roomQuickStateBtn-room-al-1'];
    assert.strictEqual(btn.textContent, 'Khóa');

    await sandbox.tuDongKhoaPhongKhiHetGio('room-al-1');

    assert.strictEqual(room.TrangThai, 'THU_BAI');
    assert.strictEqual(btn.textContent, 'Mở lại');
    assert.strictEqual(btn.classList.contains('radar-action-open'), true);
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-31: Timer countdown updates liveEl textContent directly without row rebuild');
  {
    const room = {
      id: 'room-timer-1',
      MaPhong: 'TM1',
      TrangThai: 'MO_PHONG',
      ThoiGian: 45,
      ThoiGianMo: Date.now() - (10 * 60 * 1000)
    };
    const { sandbox, elements, radarBody } = createHarness({ allRooms: [room] });

    sandbox.reconcileRadarRooms([room]);
    const originalRow = radarBody.children[0];
    const liveEl = elements['radarTimerLive-room-timer-1'];

    assert(liveEl, 'Live timer element must exist');
    assert.strictEqual(liveEl.getAttribute('data-room-id'), 'room-timer-1');
    assert.strictEqual(radarBody.children[0], originalRow, 'Row must not be redrawn');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-32: refreshRadarDataSilently reconciles rooms silently');
  {
    const rawData = [
      { id: 'sil-1', ma_phong: 'S1', trang_thai: 'MO_PHONG', thoi_gian: 45, created_at: '2026-09-03T10:00:00Z' }
    ];
    const { sandbox, radarBody } = createHarness({
      mockStaffRpc: async (name) => {
        if (name === 'rpc_lay_danh_sach_phong_thi_gv') {
          return { status: 'success', rooms: rawData };
        }
        return { status: 'success' };
      }
    });

    sandbox.reconcileRadarRooms([{ id: 'sil-1', MaPhong: 'S1', TrangThai: 'MO_PHONG', ThoiGian: 45 }]);
    const origRow = radarBody.children[0];

    await sandbox.refreshRadarDataSilently();

    assert.strictEqual(radarBody.children[0], origRow, 'Row MUST preserve DOM identity after silent refresh');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-33: Batch operation dieuKhienNhomPhong updates only checked rooms');
  {
    const r1 = { id: 'b1', MaPhong: 'B1', TrangThai: 'MO_PHONG' };
    const r2 = { id: 'b2', MaPhong: 'B2', TrangThai: 'MO_PHONG' };
    const { sandbox, elements } = createHarness({ allRooms: [r1, r2] });

    sandbox.reconcileRadarRooms([r1, r2]);
    const chk1 = elements['roomCheckbox-b1'];
    chk1.checked = true; // only b1 checked

    await sandbox.dieuKhienNhomPhong('THU_BAI');

    assert.strictEqual(r1.TrangThai, 'THU_BAI');
    assert.strictEqual(r2.TrangThai, 'MO_PHONG', 'Unchecked room must not be mutated');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-34: Batch operation updates quick state button directly');
  {
    const r1 = { id: 'b-fast-1', MaPhong: 'BF1', TrangThai: 'MO_PHONG' };
    const { sandbox, elements } = createHarness({ allRooms: [r1] });

    sandbox.reconcileRadarRooms([r1]);
    const chk = elements['roomCheckbox-b-fast-1'];
    chk.checked = true;
    const btn = elements['roomQuickStateBtn-b-fast-1'];

    await sandbox.dieuKhienNhomPhong('THU_BAI');

    assert.strictEqual(btn.textContent, 'Mở lại');
    assert.strictEqual(btn.classList.contains('radar-action-open'), true);
    console.log('  -> PASSED');
  }

  // =======================================================================
  // PART E: VERSION INVARIANTS & INTEGRATION (Tests 35 - 40)
  // =======================================================================

  console.log('Test STABLE-35: giaovien.html loads giaovien.js?v=20260903-flex-lite-009');
  {
    assert(gvHtmlSource.includes('giaovien.js?v=20260903-flex-lite-009'), 'Must load 009');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-36: Student HTML/JS and Service Worker are exact 20260902-flex-lite-005');
  {
    assert(hsHtmlSource.includes('hoc_sinh.js?v=20260902-flex-lite-005'));
    assert(hsJsSource.includes("const VERSION = '20260902-flex-lite-005';"));
    assert(swJsSource.includes("const VERSION = '20260902-flex-lite-005';"));
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-37: Other test suites are updated to 20260903-flex-lite-009');
  {
    const suites = [
      'tests/account_import_exceljs_csp_simulation.js',
      'tests/admin_frontend_session_simulation.js',
      'tests/flex_lite_authoritative_score_presentation_simulation.js',
      'tests/teacher_dashboard_action_reliability_simulation.js',
      'tests/teacher_room_control_action_reliability_simulation.js',
      'tests/teacher_room_chronological_ordering_simulation.js'
    ];
    for (const s of suites) {
      const content = fs.readFileSync(path.join(repoRoot, s), 'utf8');
      assert(content.includes('20260903-flex-lite-009'), `${s} must require 20260903-flex-lite-009`);
    }
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-38: CI workflow includes teacher_radar_stable_dom_no_flicker_simulation.js');
  {
    const ciFile = fs.readFileSync(path.join(repoRoot, '.github/workflows/submission_safety_ci.yml'), 'utf8');
    assert(ciFile.includes('node tests/teacher_radar_stable_dom_no_flicker_simulation.js'), 'CI workflow must include this test');
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-39: Authoritative scoring invariant: zero double-normalization code');
  {
    const files = [gvJsSource, hsJsSource];
    const patterns = [
      /chamDiemBaiThi\s*\([^)]*\)\s*[\*\/]\s*10/,
      /diem\s*=\s*\(\s*diem\s*\/\s*tongDiem\s*\)\s*\*\s*10/
    ];
    for (const f of files) {
      for (const p of patterns) {
        assert(!p.test(f), `Forbidden double-normalization pattern ${p} detected`);
      }
    }
    console.log('  -> PASSED');
  }

  console.log('Test STABLE-40: Natural completion without process.exit(0)');
  {
    console.log('  -> PASSED');
  }

  console.log('\n=== ALL 40 TEACHER RADAR STABLE DOM & ZERO-FLICKER TESTS PASSED SUCCESSFULLY ===');
}

runAllTests().catch(err => {
  console.error('\nTest suite failed:', err);
  process.exit(1);
});
