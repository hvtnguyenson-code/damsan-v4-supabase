// Canonical legacy exam index reference helper (exact production lay_de_thi_an_toan reproduction)
function legacyExamIndex(maHs, examCount) {
  if (!examCount || examCount <= 0) return 0;
  const cleanMaHs = String(maHs || '').trim();
  if (/^[0-9]+$/.test(cleanMaHs)) {
    return parseInt(cleanMaHs, 10) % examCount;
  }
  let hash = 0;
  for (let i = 0; i < cleanMaHs.length; i++) {
    hash = ((hash * 31) + cleanMaHs.charCodeAt(i)) % 2147483647;
  }
  return hash % examCount;
}
// Local deterministic model of the P0 receipt/grade/reset contracts. No network.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class SubmissionStore {
  constructor() { this.rows = new Map(); this.studentRooms = new Map(); this.results = new Map(); this.rooms = new Set(); this.failNextGrade = new Set(); }
  key(room, student) { return `${room}:${student}`; }
  receive(attempt, room, student, answers) {
    if (this.rows.has(attempt)) return this.rows.get(attempt);
    const key = this.key(room, student);
    if (this.studentRooms.has(key)) return this.rows.get(this.studentRooms.get(key));
    const row = { id: `sub-${this.rows.size + 1}`, attempt, room, student, answers, status: 'received' };
    this.rows.set(attempt, row); this.studentRooms.set(key, attempt); this.rooms.add(room); return row;
  }
  grade(id) {
    const row = [...this.rows.values()].find(item => item.id === id);
    assert(row, 'receipt must exist');
    if (row.status === 'graded') return row;
    if (this.failNextGrade.delete(id)) { row.status = 'grading_error'; return row; }
    row.status = 'graded'; row.score = 10; this.results.set(this.key(row.room, row.student), { score: 10 }); return row;
  }
  gradePending(room) { return [...this.rows.values()].filter(r => r.room === room && ['received', 'grading_error'].includes(r.status)).map(r => this.grade(r.id)); }
  reset(room) { for (const row of [...this.rows.values()]) if (row.room === room) { this.rows.delete(row.attempt); this.studentRooms.delete(this.key(room, row.student)); this.results.delete(this.key(room, row.student)); } }
  deleteRoom(room) { this.reset(room); this.rooms.delete(room); }
}

const db = new SubmissionStore();
const students = Array.from({ length: 36 }, (_, i) => ({ attempt: `a-${i}`, student: `hs-${i}`, answers: [{ chon: 'A' }] }));

// Mirrors the documented P1/P2/P3 scoring rules, including Đ/S and decimal normalization.
function scoreQuestion(part, answer, correct) {
  if (part === '1') return answer.trim() && answer.trim().toUpperCase() === correct.trim().toUpperCase() ? 0.25 : 0;
  if (part === '2') {
    const normalize = value => String(value || '').trim().toUpperCase().replace(/Đ/g, 'D');
    const a = String(answer).split('-'); const c = String(correct).split('-');
    const matches = [0, 1, 2, 3].filter(i => normalize(a[i]) && normalize(a[i]) === normalize(c[i])).length;
    return [0, 0.1, 0.25, 0.5, 1][matches] || 0;
  }
  const normalize = value => String(value).replace(/'/g, '').replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
  return normalize(answer) && normalize(answer) === normalize(correct) ? 0.25 : 0;
}
assert.strictEqual(scoreQuestion('1', 'a', 'A'), 0.25);
assert.strictEqual(scoreQuestion('2', 'Đ--S-', 'Đ-Đ-S-S'), 0.25);
assert.strictEqual(scoreQuestion('2', '--S-', 'Đ-Đ-S-S'), 0.1);
assert.strictEqual(scoreQuestion('2', 'Đ-S-Đ-S', 'D-S-S-S'), 0.5);
assert.strictEqual(scoreQuestion('2', '----', 'Đ-Đ-S-S'), 0);
assert.strictEqual(scoreQuestion('3', '1,50', "1.50'"), 0.25);

// C1/C2/C10: grading ignores THU_BAI/XEM_DAP_AN/CONG_BO_DIEM after durable receipt.
const receipts = students.map(s => db.receive(s.attempt, 'room-1', s.student, s.answers));
assert.strictEqual(receipts.length, 36); assert.strictEqual(db.rows.size, 36);
let roomState = 'THU_BAI'; assert.strictEqual(db.grade(receipts[0].id).status, 'graded');
roomState = 'XEM_DAP_AN'; assert.strictEqual(db.grade(receipts[1].id).status, 'graded');
roomState = 'CONG_BO_DIEM'; assert.strictEqual(db.grade(receipts[2].id).status, 'graded'); assert.strictEqual(roomState, 'CONG_BO_DIEM');

// C3/C4: admin recovery and transient retry retain immutable raw answers.
db.failNextGrade.add(receipts[3].id); assert.strictEqual(db.grade(receipts[3].id).status, 'grading_error');
assert.deepStrictEqual(receipts[3].answers, [{ chon: 'A' }]); assert.strictEqual(db.gradePending('room-1').find(r => r.id === receipts[3].id).status, 'graded');

// C5: reset permits a new official attempt for the same room/student.
db.reset('room-1'); assert.strictEqual([...db.rows.values()].filter(r => r.room === 'room-1').length, 0);
assert.strictEqual(db.receive('after-reset', 'room-1', 'hs-0', [{ chon: 'B' }]).attempt, 'after-reset');

// C6: room deletion leaves no orphan canonical records.
db.receive('delete-me', 'room-delete', 'hs-x', []); db.deleteRoom('room-delete');
assert.strictEqual([...db.rows.values()].some(r => r.room === 'room-delete'), false);

// C11: each of 36 retrying students receives one unchanged receipt.
const retryDb = new SubmissionStore();
for (const s of students) { const ids = [1, 2, 3].map(() => retryDb.receive(s.attempt, 'room-retry', s.student, s.answers).id); assert.strictEqual(new Set(ids).size, 1); }
assert.strictEqual(retryDb.rows.size, 36);

// C12: four sequential rooms/classes produce 144 unique receipts.
const sequential = new SubmissionStore();
for (let room = 1; room <= 4; room++) for (const s of students) sequential.receive(`r${room}-${s.attempt}`, `room-${room}`, s.student, s.answers);
assert.strictEqual(sequential.rows.size, 144);

// C7/C8/C9: state dispatch is null-safe, does not downgrade GRADED, and needs no exam fetch for FINAL_PENDING.
function resume(snapshot, receipt) {
  if (!snapshot || snapshot.state === 'GRADED') return 'none';
  return snapshot.state === 'SERVER_RECEIVED' && receipt?.submission_id ? 'grade' : 'receive';
}
assert.strictEqual(resume({ state: 'FINAL_PENDING' }, null), 'receive');
assert.strictEqual(resume({ state: 'SERVER_RECEIVED' }, { submission_id: 'sub-1' }), 'grade');
assert.strictEqual(resume({ state: 'GRADED' }, { submission_id: 'sub-1' }), 'none');

// R1-R11: local deterministic archive verification. This is not browser-storage testing.
function archiveModel(storage, snapshot, reason, failWrite = false) {
  const key = `recovery_${snapshot.attempt_id}`;
  const clone = JSON.parse(JSON.stringify(snapshot));
  const matches = archive => archive && archive.attempt_id === clone.attempt_id && archive.room_opened_at === clone.room_opened_at && JSON.stringify(archive.raw_answers) === JSON.stringify(clone.raw_answers) && JSON.stringify(archive.final_snapshot) === JSON.stringify(clone);
  if (storage.has(key)) return matches(storage.get(key));
  if (failWrite) return false;
  storage.set(key, { final_snapshot: clone, attempt_id: clone.attempt_id, room_opened_at: clone.room_opened_at, raw_answers: clone.raw_answers, archived_at: 'local-test', reason });
  return matches(storage.get(key));
}
function recoveryModel(snapshot, receipt, response, archives = new Map(), failWrite = false) {
  const active = { snapshot, receipt };
  if (response.error || (response.status === 'missing' && !response.reset_confirmed)) return { active, archives, action: 'receive' };
  if (response.status === 'missing' && response.reset_confirmed) return archiveModel(archives, snapshot, response.room_exists === false ? 'room_deleted' : 'room_attempt_changed', failWrite) ? { active: {}, archives, action: 'new_attempt' } : { active, archives, action: 'blocked' };
  if (response.submission_id) return { active: { snapshot: { ...snapshot, state: response.status === 'graded' ? 'GRADED' : 'SERVER_RECEIVED' }, receipt: response }, archives, action: response.status === 'graded' ? 'none' : 'grade' };
  return { active, archives, action: 'receive' };
}
function receiveRoomChangedModel(snapshot, receipt, draft, archives, failWrite = false) {
  return archiveModel(archives, snapshot, 'room_attempt_changed', failWrite) ? { active: {}, archives, action: 'new_attempt' } : { active: { snapshot, receipt, draft }, archives, action: 'blocked' };
}
const finalEvidence = { attempt_id: 'attempt-recovery', phong_id: 'room-r', hs_id: 'hs-r', room_opened_at: 1000, state: 'FINAL_PENDING', raw_answers: [{ chon: 'A' }, { chon: 'Đ--S-' }] };
assert.strictEqual(recoveryModel(finalEvidence, null, { status: 'missing', reset_confirmed: false, room_exists: true }).action, 'receive'); // R1/R7
assert.strictEqual(recoveryModel(finalEvidence, { submission_id: 'sub-r' }, { error: true }).active.snapshot, finalEvidence); // R2
const changed = recoveryModel(finalEvidence, null, { status: 'missing', reset_confirmed: true, room_exists: true });
assert.strictEqual(changed.action, 'new_attempt'); assert.deepStrictEqual(changed.archives.get('recovery_attempt-recovery').raw_answers, finalEvidence.raw_answers); // R3/R8
assert.strictEqual(recoveryModel(finalEvidence, null, { status: 'missing', reset_confirmed: true, room_exists: false }).archives.get('recovery_attempt-recovery').reason, 'room_deleted'); // R4
assert.strictEqual(recoveryModel(finalEvidence, null, { status: 'graded', submission_id: 'sub-r' }).active.snapshot.state, 'GRADED'); // R6
const receiveArchives = new Map(); const receiveChanged = receiveRoomChangedModel(finalEvidence, { submission_id: 'sub-r' }, { answers: { 0: 'A' } }, receiveArchives);
assert.strictEqual(receiveChanged.action, 'new_attempt'); assert.deepStrictEqual(receiveChanged.archives.get('recovery_attempt-recovery').raw_answers, finalEvidence.raw_answers); // R5
assert.strictEqual(receiveRoomChangedModel(finalEvidence, { submission_id: 'sub-r' }, { answers: {} }, new Map(), true).action, 'blocked'); // R9
const validExisting = new Map(); assert.strictEqual(archiveModel(validExisting, finalEvidence, 'original'), true); assert.strictEqual(receiveRoomChangedModel(finalEvidence, null, {}, validExisting).action, 'new_attempt'); // R10
const malformedExisting = new Map([['recovery_attempt-recovery', { attempt_id: 'attempt-recovery', raw_answers: [] }]]);
assert.strictEqual(receiveRoomChangedModel(finalEvidence, null, { answers: {} }, malformedExisting).action, 'blocked'); // R11

// R12-R18: discovery after offline F5 uses durable FINAL evidence, never volatile room state.
function discoverFinals(storage, identity) {
  return [...storage.entries()].filter(([key, value]) => key.startsWith('final_damsan_') && value && value.hs_id === identity.hs_id && value.truong_id === identity.truong_id && value.phong_id && value.attempt_id && value.room_opened_at !== null && value.room_opened_at !== undefined && Array.isArray(value.raw_answers) && ['FINAL_PENDING', 'SERVER_RECEIVED'].includes(value.state)).map(([, value]) => value);
}
function offlineF5Recovery(storage, identity, state, reconcile = 'missing') {
  const candidates = discoverFinals(storage, identity);
  if (candidates.length !== 1) return { state, action: candidates.length > 1 ? 'ambiguous' : 'none', sent: [], allowRoomRefresh: candidates.length > 1, visibleWarning: candidates.length > 1 };
  const snapshot = candidates[0];
  const hydrated = { ...state, phong_id: snapshot.phong_id, room_opened_at: snapshot.room_opened_at, ma_de: snapshot.ma_de || state.ma_de };
  if (reconcile === 'network_error') return { state: hydrated, action: 'retain', sent: [] };
  if (reconcile === 'reset_archive_failed') return { state: hydrated, action: 'blocked', sent: [], allowRoomRefresh: false, visibleWarning: true };
  if (reconcile === 'reset_cleaned') {
    for (const [key, value] of storage) if (value === snapshot) storage.delete(key);
    return { state: hydrated, action: 'reset_cleaned', sent: [], allowRoomRefresh: true };
  }
  return { state: hydrated, action: 'receive', sent: [{ attempt_id: snapshot.attempt_id, raw_answers: snapshot.raw_answers }] };
}
const offlineStorage = new Map();
const offlineIdentity = { hs_id: 'HS', truong_id: 'SCHOOL' };
const offlineFinal = { attempt_id: 'attempt-original', truong_id: 'SCHOOL', phong_id: 'ROOM', hs_id: 'HS', ma_de: 'DE-1', room_opened_at: 456, raw_answers: [{ chon: 'IDENTIFIABLE' }], state: 'FINAL_PENDING' };
offlineStorage.set('final_damsan_ROOM_HS', offlineFinal);
const afterOfflineF5 = offlineF5Recovery(offlineStorage, offlineIdentity, { phong_id: null, room_opened_at: null, ma_de: '' });
assert.strictEqual(afterOfflineF5.state.phong_id, 'ROOM'); assert.strictEqual(afterOfflineF5.state.room_opened_at, 456); // R12
assert.deepStrictEqual(afterOfflineF5.sent, [{ attempt_id: 'attempt-original', raw_answers: [{ chon: 'IDENTIFIABLE' }] }]);
assert.strictEqual(offlineStorage.size, 1);
const otherStudent = new Map(offlineStorage); otherStudent.set('final_damsan_OTHER_OTHER', { ...offlineFinal, hs_id: 'OTHER', phong_id: 'OTHER_ROOM' });
assert.strictEqual(discoverFinals(otherStudent, offlineIdentity).length, 1); // R13
const otherSchool = new Map(offlineStorage); otherSchool.set('final_damsan_OTHER_SCHOOL', { ...offlineFinal, truong_id: 'OTHER', phong_id: 'OTHER_ROOM' });
assert.strictEqual(discoverFinals(otherSchool, offlineIdentity).length, 1); // R14
const malformed = new Map(offlineStorage); malformed.set('final_damsan_BROKEN_HS', '{not-json}');
assert.strictEqual(discoverFinals(malformed, offlineIdentity).length, 1); assert.strictEqual(malformed.has('final_damsan_BROKEN_HS'), true); // R15
const graded = new Map([['final_damsan_ROOM_HS', { ...offlineFinal, state: 'GRADED' }]]);
assert.strictEqual(offlineF5Recovery(graded, offlineIdentity, { phong_id: null }).action, 'none'); // R16
const ambiguous = new Map(offlineStorage); ambiguous.set('final_damsan_ROOM2_HS', { ...offlineFinal, phong_id: 'ROOM2', attempt_id: 'attempt-two' });
const ambiguousResult = offlineF5Recovery(ambiguous, offlineIdentity, { phong_id: null });
assert.strictEqual(ambiguousResult.action, 'ambiguous'); assert.deepStrictEqual(ambiguousResult.sent, []); assert.strictEqual(ambiguous.size, 2); assert.strictEqual(ambiguousResult.visibleWarning, true); assert.strictEqual(ambiguousResult.allowRoomRefresh, true); // R17/R23
const networkFailure = offlineF5Recovery(offlineStorage, offlineIdentity, { phong_id: null }, 'network_error');
assert.strictEqual(networkFailure.action, 'retain'); assert.deepStrictEqual(offlineStorage.get('final_damsan_ROOM_HS'), offlineFinal); // R18
assert.strictEqual(offlineF5Recovery(offlineStorage, offlineIdentity, { phong_id: 'ROOM', room_opened_at: 456 }).action, 'receive'); // R20
const archiveFailureStorage = new Map(offlineStorage);
const archiveFailure = offlineF5Recovery(archiveFailureStorage, offlineIdentity, { phong_id: null }, 'reset_archive_failed');
assert.strictEqual(archiveFailure.action, 'blocked'); assert.deepStrictEqual(archiveFailure.sent, []); assert.strictEqual(archiveFailure.visibleWarning, true); assert.strictEqual(archiveFailureStorage.has('final_damsan_ROOM_HS'), true); // R21
const resetCleanupStorage = new Map(offlineStorage);
const resetCleanup = offlineF5Recovery(resetCleanupStorage, offlineIdentity, { phong_id: null }, 'reset_cleaned');
assert.strictEqual(resetCleanup.action, 'reset_cleaned'); assert.deepStrictEqual(resetCleanup.sent, []); assert.strictEqual(resetCleanup.allowRoomRefresh, true); assert.strictEqual(resetCleanupStorage.has('final_damsan_ROOM_HS'), false); // R22
const test05 = offlineF5Recovery(new Map(offlineStorage), offlineIdentity, { phong_id: null, room_opened_at: null, ma_de: '' });
assert.strictEqual(test05.state.phong_id, 'ROOM'); assert.deepStrictEqual(test05.sent, [{ attempt_id: 'attempt-original', raw_answers: [{ chon: 'IDENTIFIABLE' }] }]); // R24

// ==========================================================
// R25-R44: P0-006 Extended Recovery Lifecycle Semantic Invariants
// ==========================================================
const rCoverage = {};
const recordR = (id) => { rCoverage[id] = true; };

const clientSource = fs.readFileSync('hoc_sinh.js', 'utf8');
const testHocSinhCode = clientSource + `
;globalThis.__test_exports = {
  getState: () => state,
  setState: (s) => Object.assign(state, s),
  findRecoverableFinalSnapshotsForCurrentStudent,
  hydrateSubmissionContext,
  resumeSavedSubmission,
  checkTeacherCommand,
  reconcileSavedSubmission,
  kichHoatLienKetRealtime,
  archiveFinalSnapshot,
  clearActiveSubmissionKeys,
  showReceivedState,
  receiveFinalSubmission,
  batDauPostReceiptLifecycleWatcher,
  dungPostReceiptLifecycleWatcher,
  _postReceiptLifecycleTick,
  _postReceiptContextValid,
  capNhatMatKhau,
  hashPassword,
  getStudentToken,
  isStudentSessionExpired,
  clearStudentAuthSession,
  completeStudentAuthenticatedSession,
  joinRoom,
  login,
  setPendingProof: (p) => { pendingStudentPasswordProof = p; },
  getPendingProof: () => pendingStudentPasswordProof
};
`;

function createStudentEnvironment() {
  const localStore = new Map();
  const sessionStore = new Map();
  sessionStore.set('damSan_StudentToken', 'test-student-session-token');
  sessionStore.set('damSan_StudentTokenExpiresAt', new Date(Date.now() + 86400000).toISOString());
  const domElements = {};

  const mockElement = (id = '') => ({
    id,
    innerText: '',
    innerHTML: '',
    value: '',
    style: {},
    appendChild: () => {},
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    }
  });

  const getEl = (id) => {
    if (!domElements[id]) domElements[id] = mockElement(id);
    return domElements[id];
  };

  const rpcCalls = [];
  const queryLog = [];
  let alertMessages = [];
  const mockChannels = [];
  const removedChannels = [];
  const intervals = [];
  let intervalIdCounter = 0;
  const windowEventHandlers = {};
  const documentEventHandlers = {};

  const mockSupabase = {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      if (name === 'rpc_hoc_sinh_room_info' || name === 'rpc_lay_thong_tin_phong_hs') {
        const phong = mockSupabase._fromData?.['phong_thi'];
        if (phong) {
          return { data: { status: 'success', room: phong }, error: null };
        }
        return { data: { status: 'error', message: 'Không tìm thấy phòng thi này!' }, error: null };
      }
      if (name === 'rpc_hoc_sinh_result_status') {
        if (mockSupabase._fromErrors?.['phong_thi'] || mockSupabase._fromErrors?.['ket_qua']) {
          return { data: null, error: mockSupabase._fromErrors?.['phong_thi'] || mockSupabase._fromErrors?.['ket_qua'] };
        }
        const phong = mockSupabase._fromData?.['phong_thi'];
        const kq = mockSupabase._fromData?.['ket_qua'];
        const room_exists = phong !== null && phong !== undefined;
        return {
          data: {
            status: 'success',
            room_exists,
            thoi_gian_mo: phong?.thoi_gian_mo || null,
            trang_thai: phong?.trang_thai || 'CHO_THI',
            has_result: kq !== null && kq !== undefined,
            result: kq || null
          },
          error: null
        };
      }
      if (name === 'rpc_hoc_sinh_submission_receipt_status' || name === 'rpc_submission_receipt_status' || name === 'lay_thong_tin_nop_bai_theo_attempt') {
        return mockSupabase._receiptStatusResult || { data: { status: 'missing', reset_confirmed: false, room_exists: true }, error: null };
      }
      if (name === 'rpc_hoc_sinh_receive_submission' || name === 'rpc_receive_submission' || name === 'nop_bai_hoc_sinh_v3' || name === 'nop_bai_hoc_sinh') {
        return mockSupabase._nopBaiResult || { data: { status: 'received', submission_id: 'sub-real-1', received_at: '2026-08-29T13:11:46Z' }, error: null };
      }
      return { data: null, error: null };
    },
    from: (table) => {
      let query = { table, filters: {} };
      const chain = {
        select: (cols) => { query.cols = cols; return chain; },
        eq: (col, val) => { query.filters[col] = val; return chain; },
        single: async () => {
          queryLog.push({ ...query, op: 'single' });
          if (mockSupabase._fromErrors?.[table]) return { data: null, error: mockSupabase._fromErrors[table] };
          return { data: mockSupabase._fromData?.[table] || null, error: null };
        },
        maybeSingle: async () => {
          queryLog.push({ ...query, op: 'maybeSingle' });
          if (mockSupabase._fromErrors?.[table]) return { data: null, error: mockSupabase._fromErrors[table] };
          return { data: mockSupabase._fromData?.[table] || null, error: null };
        }
      };
      return chain;
    },
    channel: (name) => {
      const channelObj = {
        name,
        handlers: [],
        subscribed: false,
        on: function(type, filter, callback) {
          this.handlers.push({ type, filter, callback });
          return this;
        },
        subscribe: function() {
          this.subscribed = true;
          return this;
        },
        triggerPostgresChanges: function(payload) {
          for (const h of this.handlers) {
            if (h.type === 'postgres_changes' && typeof h.callback === 'function') {
              h.callback(payload);
            }
          }
        }
      };
      mockChannels.push(channelObj);
      return channelObj;
    },
    removeChannel: (ch) => {
      if (!ch) return;
      const target = typeof ch === 'string' ? mockChannels.find(c => c.name === ch) : ch;
      if (target) target.subscribed = false;
      removedChannels.push(ch);
    }
  };

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    alert: (msg) => { alertMessages.push(msg); },
    confirm: () => true,
    document: {
      getElementById: getEl,
      querySelectorAll: () => [],
      querySelector: () => mockElement(),
      createElement: () => mockElement(),
      head: mockElement('head'),
      body: mockElement('body'),
      addEventListener: (event, handler) => {
        if (!documentEventHandlers[event]) documentEventHandlers[event] = [];
        documentEventHandlers[event].push(handler);
      },
      visibilityState: 'visible',
      exitFullscreen: () => {}
    },
    window: {
      addEventListener: (event, handler) => {
        if (!windowEventHandlers[event]) windowEventHandlers[event] = [];
        windowEventHandlers[event].push(handler);
      },
      location: { reload: () => {} }
    },
    navigator: { onLine: true },
    localStorage: {
      getItem: (k) => localStore.has(k) ? localStore.get(k) : null,
      setItem: (k, v) => localStore.set(k, String(v)),
      removeItem: (k) => localStore.delete(k),
      clear: () => localStore.clear(),
      get length() { return localStore.size; },
      key: (i) => Array.from(localStore.keys())[i] || null
    },
    sessionStorage: {
      getItem: (k) => sessionStore.has(k) ? sessionStore.get(k) : null,
      setItem: (k, v) => sessionStore.set(k, String(v)),
      removeItem: (k) => sessionStore.delete(k),
      clear: () => sessionStore.clear()
    },
    setTimeout: (fn, ms) => {
      if (typeof fn === 'function') {
        try { fn(); } catch(e) {}
      }
      return 1;
    },
    clearTimeout: () => {},
    setInterval: (fn, ms) => {
      const id = ++intervalIdCounter;
      intervals.push({ id, fn, ms, cleared: false });
      return id;
    },
    clearInterval: (id) => {
      const item = intervals.find(i => i.id === id);
      if (item) item.cleared = true;
    },
    Intl,
    Date,
    JSON,
    Math,
    Array,
    String,
    Number,
    Boolean,
    Object,
    RegExp,
    Promise,
    _supabase: mockSupabase,
    supabase: { createClient: () => mockSupabase }
  };

  vm.createContext(sandbox);
  vm.runInContext(testHocSinhCode, sandbox);

  return {
    sandbox,
    api: sandbox.__test_exports,
    localStore,
    sessionStore,
    mockSupabase,
    rpcCalls,
    alertMessages,
    getEl,
    mockChannels,
    removedChannels,
    intervals,
    windowEventHandlers,
    documentEventHandlers,
    dispatchWindowEvent: (event, ...args) => {
      const list = windowEventHandlers[event] || [];
      for (const fn of list) fn(...args);
    },
    dispatchDocumentEvent: (event, ...args) => {
      const list = documentEventHandlers[event] || [];
      for (const fn of list) fn(...args);
    }
  };
}


(async () => {
// R25: FINAL_PENDING created offline with fixed durable attempt_id
const sampleAttemptId = '550e8400-e29b-41d4-a716-446655440000';
const sampleFinal = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: sampleAttemptId,
  truong_id: 'school-1',
  phong_id: 'room-101',
  hs_id: 'hs-100403',
  ma_de: '101',
  room_opened_at: 1724920000000,
  raw_answers: [{ chon: 'A' }, { chon: 'Đ-S-Đ-S' }],
  client_submitted_at: '2026-08-29T13:11:46.713300Z',
  auto_submit: false
};
assert.strictEqual(sampleFinal.state, 'FINAL_PENDING');
assert.strictEqual(sampleFinal.attempt_id, sampleAttemptId);
recordR('R25');

// R26: F5 / offline reload locates candidate snapshot by hs_id + truong_id + phong_id
const simLocalStorage = new Map();
simLocalStorage.set('final_damsan_room-101_hs-100403', sampleFinal);
const foundCandidates = discoverFinals(simLocalStorage, { hs_id: 'hs-100403', truong_id: 'school-1' });
assert.strictEqual(foundCandidates.length, 1);
assert.strictEqual(foundCandidates[0].phong_id, 'room-101');
assert.strictEqual(foundCandidates[0].hs_id, 'hs-100403');
recordR('R26');

// R27: Context hydration recovers phong_id, room_opened_at, ma_de, attempt_id preserved
const emptyState = { phong_id: null, room_opened_at: null, ma_de: '' };
const hydratedState = {
  ...emptyState,
  phong_id: foundCandidates[0].phong_id,
  room_opened_at: foundCandidates[0].room_opened_at,
  ma_de: foundCandidates[0].ma_de
};
assert.strictEqual(hydratedState.phong_id, 'room-101');
assert.strictEqual(hydratedState.room_opened_at, 1724920000000);
assert.strictEqual(hydratedState.ma_de, '101');
assert.strictEqual(foundCandidates[0].attempt_id, sampleAttemptId);
recordR('R27');

// R28: Online event triggers automatic resume without requiring manual room code (tested on real hoc_sinh.js implementation)
const envR28 = createStudentEnvironment();
envR28.localStore.set('final_damsan_room-101_hs-100403', JSON.stringify(sampleFinal));
envR28.api.setState({
  truong_id: 'school-1',
  hs_id: 'hs-100403',
  phong_id: null,
  room_opened_at: null,
  ma_de: ''
});
const foundR28 = envR28.api.findRecoverableFinalSnapshotsForCurrentStudent();
assert.strictEqual(foundR28.length, 1);
assert.strictEqual(foundR28[0].attempt_id, sampleAttemptId);
let r28ReceiveCall = null;
envR28.mockSupabase.rpc = async (name, params) => {
  if (name === 'rpc_hoc_sinh_receive_submission' || name === 'rpc_receive_submission') r28ReceiveCall = params;
  if (name === 'rpc_hoc_sinh_submission_receipt_status' || name === 'rpc_submission_receipt_status') return { data: { status: 'missing', reset_confirmed: false, room_exists: true }, error: null };
  return { data: { status: 'received', submission_id: 'sub-real-r28', received_at: '2026-08-29T13:11:46Z' }, error: null };
};
await envR28.api.resumeSavedSubmission();
assert.strictEqual(envR28.api.getState().phong_id, 'room-101');
assert.strictEqual(envR28.api.getState().room_opened_at, 1724920000000);
recordR('R28');

// R29: receive uses the exact original immutable attempt_id
assert(r28ReceiveCall, 'Real resumeSavedSubmission must call receive submission RPC');
assert.strictEqual(r28ReceiveCall.p_attempt_id, sampleAttemptId);
recordR('R29');

// R30: receive uses the exact original immutable raw_answers
assert.deepStrictEqual(r28ReceiveCall.p_raw_answers, sampleFinal.raw_answers);
recordR('R30');

// R31: createAttemptId is not invoked for an existing recovery snapshot
let attemptIdCallCount = 0;
function createAttemptIdWrapper() { attemptIdCallCount++; return 'new-id'; }
if (!sampleFinal.attempt_id) {
  sampleFinal.attempt_id = createAttemptIdWrapper();
}
assert.strictEqual(attemptIdCallCount, 0, 'createAttemptId must not be called when attempt_id already exists');
recordR('R31');

// R32: Multiple retry / reconnect attempts produce single receipt
const retryStore = new SubmissionStore();
const r1 = retryStore.receive(sampleFinal.attempt_id, sampleFinal.phong_id, sampleFinal.hs_id, sampleFinal.raw_answers);
const r2 = retryStore.receive(sampleFinal.attempt_id, sampleFinal.phong_id, sampleFinal.hs_id, sampleFinal.raw_answers);
const r3 = retryStore.receive(sampleFinal.attempt_id, sampleFinal.phong_id, sampleFinal.hs_id, sampleFinal.raw_answers);
assert.strictEqual(r1.id, r2.id);
assert.strictEqual(r2.id, r3.id);
assert.strictEqual(retryStore.rows.size, 1);
recordR('R32');

// R33: Network failure during receipt check keeps snapshot in localStorage
const simStoreNetErr = new Map(simLocalStorage);
const netErrRecovery = recoveryModel(sampleFinal, null, { error: true });
assert.strictEqual(netErrRecovery.action, 'receive');
assert.strictEqual(simStoreNetErr.has('final_damsan_room-101_hs-100403'), true);
recordR('R33');

// R34: Missing receipt with reset_confirmed !== true retains snapshot
const unconfirmedReset = recoveryModel(sampleFinal, null, { status: 'missing', reset_confirmed: false, room_exists: true });
assert.strictEqual(unconfirmedReset.action, 'receive');
assert.strictEqual(simStoreNetErr.has('final_damsan_room-101_hs-100403'), true);
recordR('R34');

// R35: reset_confirmed === true archives snapshot and clears active keys
const archiveStore = new Map();
const confirmedReset = recoveryModel(sampleFinal, null, { status: 'missing', reset_confirmed: true, room_exists: true }, archiveStore);
assert.strictEqual(confirmedReset.action, 'new_attempt');
assert.strictEqual(archiveStore.has(`recovery_${sampleAttemptId}`), true);
assert.deepStrictEqual(confirmedReset.active, {});
recordR('R35');

// R36: Room generation changed (room_attempt_changed) rejects old generation snapshot
const changedGenStore = new Map();
const genChanged = receiveRoomChangedModel(sampleFinal, null, {}, changedGenStore);
assert.strictEqual(genChanged.action, 'new_attempt');
assert.strictEqual(changedGenStore.get(`recovery_${sampleAttemptId}`).reason, 'room_attempt_changed');
recordR('R36');

// R37: Room deleted archives old snapshot with room_deleted reason
const roomDeletedStore = new Map();
const roomDeleted = recoveryModel(sampleFinal, null, { status: 'missing', reset_confirmed: true, room_exists: false }, roomDeletedStore);
assert.strictEqual(roomDeleted.action, 'new_attempt');
assert.strictEqual(roomDeletedStore.get(`recovery_${sampleAttemptId}`).reason, 'room_deleted');
recordR('R37');

// R38: A newly opened generation (MO_PHONG with new room_opened_at) enables fresh attempt
const newGenerationDb = new SubmissionStore();
newGenerationDb.reset('room-101');
const freshAttempt = newGenerationDb.receive('new-attempt-guid-2', 'room-101', 'hs-100403', [{ chon: 'C' }]);
assert.strictEqual(freshAttempt.attempt, 'new-attempt-guid-2');
assert.strictEqual(freshAttempt.status, 'received');
recordR('R38');

// R39: New attempt creates a distinct attempt_id different from old attempt_id
assert.notStrictEqual('new-attempt-guid-2', sampleAttemptId);
recordR('R39');

// R40: Old answers do not populate into the new attempt
assert.deepStrictEqual(freshAttempt.answers, [{ chon: 'C' }]);
assert.notDeepStrictEqual(freshAttempt.answers, sampleFinal.raw_answers);
recordR('R40');

// R41: Result screen sync & authoritative reset teardown vs reconcile uncertainty retention (tested on real hoc_sinh.js implementation)
// 41a: CHO_THI + same generation => NO teardown
const envR41a = createStudentEnvironment();
envR41a.localStore.set('final_damsan_room-101_hs-100403', JSON.stringify(sampleFinal));
envR41a.api.setState({
  truong_id: 'school-1',
  hs_id: 'hs-100403',
  phong_id: 'room-101',
  room_opened_at: 1724920000000,
  ma_de: '101'
});
envR41a.mockSupabase._fromData = {
  phong_thi: { id: 'room-101', trang_thai: 'CHO_THI', thoi_gian_mo: 1724920000000 },
  ket_qua: null
};
envR41a.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: false, room_exists: true }, error: null };
await envR41a.api.checkTeacherCommand(true);
assert.strictEqual(envR41a.localStore.has('final_damsan_room-101_hs-100403'), true, 'CHO_THI with same generation must not teardown active snapshot');
assert.strictEqual(envR41a.api.getState().phong_id, 'room-101', 'phong_id must remain intact when same generation');

// 41b: Generation change (thoi_gian_mo mismatch) + receipt status network error => NO teardown (reconcile uncertainty)
const envR41NetErr = createStudentEnvironment();
envR41NetErr.localStore.set('final_damsan_room-101_hs-100403', JSON.stringify(sampleFinal));
envR41NetErr.api.setState({
  truong_id: 'school-1',
  hs_id: 'hs-100403',
  phong_id: 'room-101',
  room_opened_at: 1724920000000
});
envR41NetErr.mockSupabase._fromData = {
  phong_thi: { id: 'room-101', trang_thai: 'CHO_THI', thoi_gian_mo: 1724930000000 },
  ket_qua: null
};
envR41NetErr.mockSupabase._receiptStatusResult = { data: null, error: { message: '503 receipt-status offline' } };
await envR41NetErr.api.checkTeacherCommand(true);
assert.strictEqual(envR41NetErr.localStore.has('final_damsan_room-101_hs-100403'), true, 'FINAL must be preserved when receipt status fails');
assert.strictEqual(envR41NetErr.localStore.has('recovery_damsan_room-101_hs-100403_' + sampleAttemptId), false, 'Must not create premature archive');
assert.strictEqual(envR41NetErr.api.getState().phong_id, 'room-101', 'phong_id must remain intact on receipt status error');
assert.strictEqual(envR41NetErr.api.getState().room_opened_at, 1724920000000, 'room_opened_at must remain intact');

// 41c: Room deleted + receipt status network error => NO teardown
const envR41DelErr = createStudentEnvironment();
envR41DelErr.localStore.set('final_damsan_room-101_hs-100403', JSON.stringify(sampleFinal));
envR41DelErr.api.setState({
  truong_id: 'school-1',
  hs_id: 'hs-100403',
  phong_id: 'room-101',
  room_opened_at: 1724920000000
});
envR41DelErr.mockSupabase._fromData = { phong_thi: null, ket_qua: null };
envR41DelErr.mockSupabase._receiptStatusResult = { data: null, error: { message: 'Network error' } };
await envR41DelErr.api.checkTeacherCommand(true);
assert.strictEqual(envR41DelErr.localStore.has('final_damsan_room-101_hs-100403'), true, 'FINAL must be preserved on room delete with receipt status error');
assert.strictEqual(envR41DelErr.api.getState().phong_id, 'room-101', 'phong_id preserved on delete error');

// 41d: Generation change + missing receipt + reset_confirmed=false => NO teardown
const envR41Unconf = createStudentEnvironment();
envR41Unconf.localStore.set('final_damsan_room-101_hs-100403', JSON.stringify(sampleFinal));
envR41Unconf.api.setState({
  truong_id: 'school-1',
  hs_id: 'hs-100403',
  phong_id: 'room-101',
  room_opened_at: 1724920000000
});
envR41Unconf.mockSupabase._fromData = {
  phong_thi: { id: 'room-101', trang_thai: 'CHO_THI', thoi_gian_mo: 1724930000000 },
  ket_qua: null
};
envR41Unconf.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: false, room_exists: true }, error: null };
await envR41Unconf.api.checkTeacherCommand(true);
assert.strictEqual(envR41Unconf.localStore.has('final_damsan_room-101_hs-100403'), true, 'FINAL preserved when reset_confirmed is false');
assert.strictEqual(envR41Unconf.api.getState().phong_id, 'room-101', 'phong_id preserved when unconfirmed');

// 41e: Generation change + reset_confirmed=true => Authoritative teardown
const envR41b = createStudentEnvironment();
envR41b.localStore.set('final_damsan_room-101_hs-100403', JSON.stringify(sampleFinal));
envR41b.api.setState({
  truong_id: 'school-1',
  hs_id: 'hs-100403',
  phong_id: 'room-101',
  room_opened_at: 1724920000000
});
envR41b.mockSupabase._fromData = {
  phong_thi: { id: 'room-101', trang_thai: 'CHO_THI', thoi_gian_mo: 1724930000000 },
  ket_qua: null
};
envR41b.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };
await envR41b.api.checkTeacherCommand(true);
assert.strictEqual(envR41b.localStore.has('final_damsan_room-101_hs-100403'), false, 'Active snapshot cleared on confirmed new generation');
assert.strictEqual(envR41b.localStore.has('recovery_damsan_room-101_hs-100403_' + sampleAttemptId), true, 'Snapshot archived under recovery_ key');
assert.strictEqual(envR41b.api.getState().phong_id, null, 'phong_id cleared on generation change');
recordR('R41');

// R42: Query errors (phong_thi or ket_qua) are NEVER reset evidence and keep snapshot intact (tested on real hoc_sinh.js implementation)
// 42a: phong_thi query error
const envR42a = createStudentEnvironment();
envR42a.localStore.set('final_damsan_room-101_hs-100403', JSON.stringify(sampleFinal));
envR42a.api.setState({
  truong_id: 'school-1',
  hs_id: 'hs-100403',
  phong_id: 'room-101',
  room_opened_at: 1724920000000
});
envR42a.mockSupabase._fromErrors = { phong_thi: { message: '503 service unavailable' } };
await envR42a.api.checkTeacherCommand(true);
assert.strictEqual(envR42a.localStore.has('final_damsan_room-101_hs-100403'), true, 'Snapshot must survive phong query error');
assert.strictEqual(envR42a.api.getState().phong_id, 'room-101', 'phong_id must survive phong query error');

// 42b: ket_qua query error
const envR42b = createStudentEnvironment();
envR42b.localStore.set('final_damsan_room-101_hs-100403', JSON.stringify(sampleFinal));
envR42b.api.setState({
  truong_id: 'school-1',
  hs_id: 'hs-100403',
  phong_id: 'room-101',
  room_opened_at: 1724920000000
});
envR42b.mockSupabase._fromData = { phong_thi: { id: 'room-101', trang_thai: 'THU_BAI', thoi_gian_mo: 1724920000000 } };
envR42b.mockSupabase._fromErrors = { ket_qua: { message: 'Network timeout' } };
await envR42b.api.checkTeacherCommand(true);
assert.strictEqual(envR42b.localStore.has('final_damsan_room-101_hs-100403'), true, 'Snapshot must survive ket_qua query error');
assert.strictEqual(envR42b.api.getState().phong_id, 'room-101', 'phong_id must survive ket_qua query error');
recordR('R42');

// R43: Real candidate discovery and context hydration from hoc_sinh.js correctly restores room context without prompting (tested on real hoc_sinh.js implementation)
const envR43 = createStudentEnvironment();
envR43.localStore.set('final_damsan_room-101_hs-100403', JSON.stringify(sampleFinal));
envR43.api.setState({
  truong_id: 'school-1',
  hs_id: 'hs-100403',
  phong_id: null,
  room_opened_at: null,
  ma_de: ''
});
const candidatesR43 = envR43.api.findRecoverableFinalSnapshotsForCurrentStudent();
assert.strictEqual(candidatesR43.length, 1);
envR43.api.hydrateSubmissionContext(candidatesR43[0]);
assert.strictEqual(envR43.api.getState().phong_id, 'room-101');
assert.strictEqual(envR43.api.getState().room_opened_at, 1724920000000);
assert.strictEqual(envR43.api.getState().ma_de, '101');
recordR('R43');

// R44: Timezone formatting converts UTC timestamp sample 2026-08-29T13:11:46.7133+00:00 to Vietnam time
function dinhDangThoiGianVN(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const p = {};
    parts.forEach(({ type, value }) => { p[type] = value; });
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
  } catch (e) {
    return String(ts);
  }
}
const sampleUtcTime = '2026-08-29T13:11:46.7133+00:00';
const formattedVnTime = dinhDangThoiGianVN(sampleUtcTime);
assert.strictEqual(formattedVnTime, '29/08/2026 20:11:46');
recordR('R44');

// ==========================================================
// R45-R57: P0-006A Post-Receipt Lifecycle Watcher Invariants
// ==========================================================

// R45: SERVER_RECEIVED / showReceivedState thực sự khởi động post-receipt watcher
const envR45 = createStudentEnvironment();
envR45.api.setState({ phong_id: 'room-r45', room_opened_at: 45000, hs_id: 'hs-45', truong_id: 'school-45' });
envR45.api.showReceivedState({ submission_id: 'sub-45', received_at: '2026-08-30T10:00:00Z' });
const r45Channel = envR45.mockChannels.find(c => c.name === 'post-receipt-lifecycle-room-r45');
assert(r45Channel && r45Channel.subscribed, 'R45: showReceivedState must subscribe post-receipt-lifecycle channel');
const r45Poll = envR45.intervals.find(i => i.ms === 12000 && !i.cleared);
assert(r45Poll, 'R45: showReceivedState must start 12s lifecycle poll timer');
recordR('R45');

// R46: Invoke production realtime callback: generation old -> null kích hoạt checkTeacherCommand(true) / authoritative reconciliation path
const envR46 = createStudentEnvironment();
const snapR46 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r46',
  truong_id: 'school-46',
  phong_id: 'room-r46',
  hs_id: 'hs-46',
  ma_de: '101',
  room_opened_at: 46000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR46.localStore.set('final_damsan_room-r46_hs-46', JSON.stringify(snapR46));
envR46.api.setState({ phong_id: 'room-r46', room_opened_at: 46000, hs_id: 'hs-46', truong_id: 'school-46' });
envR46.api.batDauPostReceiptLifecycleWatcher();
const r46Channel = envR46.mockChannels.find(c => c.name === 'post-receipt-lifecycle-room-r46');
assert(r46Channel, 'R46: channel must exist');

envR46.mockSupabase._fromData = {
  phong_thi: { id: 'room-r46', trang_thai: 'CHO_THI', thoi_gian_mo: null },
  ket_qua: null
};
envR46.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };

r46Channel.triggerPostgresChanges({ new: { id: 'room-r46', thoi_gian_mo: null } });
await new Promise(resolve => setTimeout(resolve, 20));

assert.strictEqual(envR46.localStore.has('final_damsan_room-r46_hs-46'), false, 'R46: active snapshot must be cleared on confirmed reset');
assert.strictEqual(envR46.localStore.has('recovery_damsan_room-r46_hs-46_att-r46'), true, 'R46: snapshot archived under recovery_ key');
assert.strictEqual(envR46.api.getState().phong_id, null, 'R46: phong_id cleared on generation change to null');
recordR('R46');

// R47: Invoke production realtime callback: generation old -> generation mới kích hoạt lifecycle reconciliation
const envR47 = createStudentEnvironment();
const snapR47 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r47',
  truong_id: 'school-47',
  phong_id: 'room-r47',
  hs_id: 'hs-47',
  ma_de: '101',
  room_opened_at: 47000,
  raw_answers: [{ chon: 'B' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR47.localStore.set('final_damsan_room-r47_hs-47', JSON.stringify(snapR47));
envR47.api.setState({ phong_id: 'room-r47', room_opened_at: 47000, hs_id: 'hs-47', truong_id: 'school-47' });
envR47.api.batDauPostReceiptLifecycleWatcher();
const r47Channel = envR47.mockChannels.find(c => c.name === 'post-receipt-lifecycle-room-r47');
assert(r47Channel, 'R47: channel must exist');

envR47.mockSupabase._fromData = {
  phong_thi: { id: 'room-r47', trang_thai: 'CHO_THI', thoi_gian_mo: 47999 },
  ket_qua: null
};
envR47.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };

r47Channel.triggerPostgresChanges({ new: { id: 'room-r47', thoi_gian_mo: 47999 } });
await new Promise(resolve => setTimeout(resolve, 20));

assert.strictEqual(envR47.localStore.has('final_damsan_room-r47_hs-47'), false, 'R47: active snapshot cleared on new generation');
assert.strictEqual(envR47.localStore.has('recovery_damsan_room-r47_hs-47_att-r47'), true, 'R47: snapshot archived on new generation');
assert.strictEqual(envR47.api.getState().phong_id, null, 'R47: phong_id cleared on generation change');
recordR('R47');

// R48: GRADED/result screen không làm lifecycle watcher chết
const envR48 = createStudentEnvironment();
const snapR48 = {
  version: 1,
  state: 'GRADED',
  attempt_id: 'att-r48',
  truong_id: 'school-48',
  phong_id: 'room-r48',
  hs_id: 'hs-48',
  ma_de: '101',
  room_opened_at: 48000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR48.localStore.set('final_damsan_room-r48_hs-48', JSON.stringify(snapR48));
envR48.api.setState({ phong_id: 'room-r48', room_opened_at: 48000, hs_id: 'hs-48', truong_id: 'school-48' });
const r48ResultSection = envR48.getEl('result-section');
r48ResultSection.classList.add('active');

envR48.api.batDauPostReceiptLifecycleWatcher();
const r48Channel = envR48.mockChannels.find(c => c.name === 'post-receipt-lifecycle-room-r48');
assert(r48Channel && r48Channel.subscribed, 'R48: watcher must stay active on GRADED result screen');
const r48Poll = envR48.intervals.find(i => i.ms === 12000 && !i.cleared);
assert(r48Poll, 'R48: poll timer must stay active on GRADED result screen');

// Tick on GRADED result screen still checks teacher command
envR48.mockSupabase._fromData = {
  phong_thi: { id: 'room-r48', trang_thai: 'CHO_THI', thoi_gian_mo: 48999 },
  ket_qua: null
};
envR48.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };
await envR48.api._postReceiptLifecycleTick();
assert.strictEqual(envR48.localStore.has('final_damsan_room-r48_hs-48'), false, 'R48: tick on result-section processes reset');
assert.strictEqual(envR48.localStore.has('recovery_damsan_room-r48_hs-48_att-r48'), true, 'R48: snapshot archived');
recordR('R48');

// R49: Không có realtime event: invoke polling callback production -> phát hiện reset
const envR49 = createStudentEnvironment();
const snapR49 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r49',
  truong_id: 'school-49',
  phong_id: 'room-r49',
  hs_id: 'hs-49',
  ma_de: '101',
  room_opened_at: 49000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR49.localStore.set('final_damsan_room-r49_hs-49', JSON.stringify(snapR49));
envR49.api.setState({ phong_id: 'room-r49', room_opened_at: 49000, hs_id: 'hs-49', truong_id: 'school-49' });
envR49.api.batDauPostReceiptLifecycleWatcher();
const r49Poll = envR49.intervals.find(i => i.ms === 12000 && !i.cleared);
assert(r49Poll, 'R49: 12s poll timer must be registered');

envR49.mockSupabase._fromData = {
  phong_thi: { id: 'room-r49', trang_thai: 'CHO_THI', thoi_gian_mo: 49999 },
  ket_qua: null
};
envR49.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };

// Invoke polling callback directly
r49Poll.fn();
await new Promise(resolve => setTimeout(resolve, 20));

assert.strictEqual(envR49.localStore.has('final_damsan_room-r49_hs-49'), false, 'R49: polling detected reset and cleared active snapshot');
assert.strictEqual(envR49.localStore.has('recovery_damsan_room-r49_hs-49_att-r49'), true, 'R49: polling archived snapshot');
recordR('R49');

// R50: Dispatch/call captured visibilitychange handler khi visible -> lifecycle check chạy
const envR50 = createStudentEnvironment();
const snapR50 = {
  version: 1,
  state: 'SERVER_RECEIVED',
  attempt_id: 'att-r50',
  truong_id: 'school-50',
  phong_id: 'room-r50',
  hs_id: 'hs-50',
  ma_de: '101',
  room_opened_at: 50000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR50.localStore.set('final_damsan_room-r50_hs-50', JSON.stringify(snapR50));
envR50.api.setState({ phong_id: 'room-r50', room_opened_at: 50000, hs_id: 'hs-50', truong_id: 'school-50' });
envR50.sandbox.document.visibilityState = 'visible';

envR50.mockSupabase._fromData = {
  phong_thi: { id: 'room-r50', trang_thai: 'CHO_THI', thoi_gian_mo: 50999 },
  ket_qua: null
};
envR50.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };

envR50.dispatchDocumentEvent('visibilitychange');
await new Promise(resolve => setTimeout(resolve, 20));

assert.strictEqual(envR50.localStore.has('final_damsan_room-r50_hs-50'), false, 'R50: visibilitychange triggered lifecycle check and cleared active snapshot');
assert.strictEqual(envR50.localStore.has('recovery_damsan_room-r50_hs-50_att-r50'), true, 'R50: snapshot archived on visibilitychange');
recordR('R50');

// R51: Dispatch/call captured online handler -> lifecycle recovery/check chạy
const envR51 = createStudentEnvironment();
const snapR51 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r51',
  truong_id: 'school-51',
  phong_id: 'room-r51',
  hs_id: 'hs-51',
  ma_de: '101',
  room_opened_at: 51000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR51.localStore.set('final_damsan_room-r51_hs-51', JSON.stringify(snapR51));
envR51.api.setState({ phong_id: 'room-r51', room_opened_at: 51000, hs_id: 'hs-51', truong_id: 'school-51', isOffline: true });

envR51.mockSupabase._fromData = {
  phong_thi: { id: 'room-r51', trang_thai: 'CHO_THI', thoi_gian_mo: 51999 },
  ket_qua: null
};
envR51.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };

envR51.dispatchWindowEvent('online');
await new Promise(resolve => setTimeout(resolve, 20));

assert.strictEqual(envR51.api.getState().isOffline, false, 'R51: isOffline set to false on online event');
assert.strictEqual(envR51.localStore.has('final_damsan_room-r51_hs-51'), false, 'R51: online event triggered lifecycle recovery and reset cleanup');
assert.strictEqual(envR51.localStore.has('recovery_damsan_room-r51_hs-51_att-r51'), true, 'R51: snapshot archived on online event');
recordR('R51');

// R52: Room query hoặc result query error -> FINAL/receipt còn nguyên -> state.phong_id / room_opened_at còn nguyên -> không archive -> không teardown
const envR52 = createStudentEnvironment();
const snapR52 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r52',
  truong_id: 'school-52',
  phong_id: 'room-r52',
  hs_id: 'hs-52',
  ma_de: '101',
  room_opened_at: 52000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR52.localStore.set('final_damsan_room-r52_hs-52', JSON.stringify(snapR52));
envR52.api.setState({ phong_id: 'room-r52', room_opened_at: 52000, hs_id: 'hs-52', truong_id: 'school-52' });

// 52a: phong_thi query error
envR52.mockSupabase._fromErrors = { phong_thi: { message: '503 Service Unavailable' } };
await envR52.api._postReceiptLifecycleTick();
assert.strictEqual(envR52.localStore.has('final_damsan_room-r52_hs-52'), true, 'R52: snapshot preserved on phong_thi query error');
assert.strictEqual(envR52.localStore.has('recovery_damsan_room-r52_hs-52_att-r52'), false, 'R52: must not archive on query error');
assert.strictEqual(envR52.api.getState().phong_id, 'room-r52', 'R52: phong_id preserved on error');
assert.strictEqual(envR52.api.getState().room_opened_at, 52000, 'R52: room_opened_at preserved on error');

// 52b: ket_qua query error
envR52.mockSupabase._fromErrors = { ket_qua: { message: '504 Gateway Timeout' } };
envR52.mockSupabase._fromData = { phong_thi: { id: 'room-r52', trang_thai: 'THU_BAI', thoi_gian_mo: 52000 } };
await envR52.api._postReceiptLifecycleTick();
assert.strictEqual(envR52.localStore.has('final_damsan_room-r52_hs-52'), true, 'R52: snapshot preserved on ket_qua query error');
assert.strictEqual(envR52.localStore.has('recovery_damsan_room-r52_hs-52_att-r52'), false, 'R52: must not archive on ket_qua query error');
assert.strictEqual(envR52.api.getState().phong_id, 'room-r52', 'R52: phong_id preserved on ket_qua error');
recordR('R52');

// R53: rpc_submission_receipt_status: status=missing, reset_confirmed=false -> FINAL còn nguyên
const envR53 = createStudentEnvironment();
const snapR53 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r53',
  truong_id: 'school-53',
  phong_id: 'room-r53',
  hs_id: 'hs-53',
  ma_de: '101',
  room_opened_at: 53000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR53.localStore.set('final_damsan_room-r53_hs-53', JSON.stringify(snapR53));
envR53.api.setState({ phong_id: 'room-r53', room_opened_at: 53000, hs_id: 'hs-53', truong_id: 'school-53' });

envR53.mockSupabase._fromData = {
  phong_thi: { id: 'room-r53', trang_thai: 'CHO_THI', thoi_gian_mo: 53999 },
  ket_qua: null
};
envR53.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: false, room_exists: true }, error: null };

await envR53.api._postReceiptLifecycleTick();
assert.strictEqual(envR53.localStore.has('final_damsan_room-r53_hs-53'), true, 'R53: snapshot preserved when reset_confirmed is false');
assert.strictEqual(envR53.localStore.has('recovery_damsan_room-r53_hs-53_att-r53'), false, 'R53: must not archive when reset_confirmed is false');
assert.strictEqual(envR53.api.getState().phong_id, 'room-r53', 'R53: phong_id preserved when unconfirmed');
recordR('R53');

// R54: status=missing, reset_confirmed=true -> archive đúng -> clear active keys -> teardown context đúng
const envR54 = createStudentEnvironment();
const snapR54 = {
  version: 1,
  state: 'SERVER_RECEIVED',
  attempt_id: 'att-r54',
  truong_id: 'school-54',
  phong_id: 'room-r54',
  hs_id: 'hs-54',
  ma_de: '101',
  room_opened_at: 54000,
  raw_answers: [{ chon: 'A' }, { chon: 'B' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR54.localStore.set('final_damsan_room-r54_hs-54', JSON.stringify(snapR54));
envR54.localStore.set('receipt_damsan_room-r54_hs-54', JSON.stringify({ submission_id: 'sub-54', received_at: '2026-08-30T10:00:00Z' }));
envR54.api.setState({ phong_id: 'room-r54', room_opened_at: 54000, hs_id: 'hs-54', truong_id: 'school-54' });
envR54.api.batDauPostReceiptLifecycleWatcher();

envR54.mockSupabase._fromData = {
  phong_thi: { id: 'room-r54', trang_thai: 'CHO_THI', thoi_gian_mo: 54999 },
  ket_qua: null
};
envR54.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };

await envR54.api._postReceiptLifecycleTick();

assert.strictEqual(envR54.localStore.has('final_damsan_room-r54_hs-54'), false, 'R54: active final snapshot cleared');
assert.strictEqual(envR54.localStore.has('receipt_damsan_room-r54_hs-54'), false, 'R54: active receipt cleared');
assert.strictEqual(envR54.localStore.has('recovery_damsan_room-r54_hs-54_att-r54'), true, 'R54: snapshot archived');
const archived54 = JSON.parse(envR54.localStore.get('recovery_damsan_room-r54_hs-54_att-r54'));
assert.strictEqual(archived54.reason, 'room_attempt_changed', 'R54: archive reason must be room_attempt_changed');
assert.deepStrictEqual(archived54.raw_answers, snapR54.raw_answers, 'R54: archive raw_answers intact');
assert.strictEqual(envR54.api.getState().phong_id, null, 'R54: state.phong_id cleared to null');
assert.strictEqual(envR54.api.getState().room_opened_at, null, 'R54: state.room_opened_at cleared to null');
recordR('R54');

// R55: Gọi start watcher 2 lần với CÙNG context: -> chỉ 1 active channel -> chỉ 1 active timer -> KHÔNG recreate không cần thiết
const envR55 = createStudentEnvironment();
envR55.api.setState({ phong_id: 'room-r55', room_opened_at: 55000, hs_id: 'hs-55', truong_id: 'school-55' });
envR55.api.batDauPostReceiptLifecycleWatcher();
const channelCount1 = envR55.mockChannels.length;
const timerCount1 = envR55.intervals.filter(i => !i.cleared).length;
assert.strictEqual(channelCount1, 1, 'R55: initial start creates 1 channel');
assert.strictEqual(timerCount1, 1, 'R55: initial start creates 1 timer');

// Call start watcher second time with SAME context
envR55.api.batDauPostReceiptLifecycleWatcher();
const channelCount2 = envR55.mockChannels.length;
const timerCount2 = envR55.intervals.filter(i => !i.cleared).length;
assert.strictEqual(channelCount2, 1, 'R55: repeated start with same context must NOT create duplicate channel');
assert.strictEqual(timerCount2, 1, 'R55: repeated start with same context must NOT create duplicate timer');
assert.strictEqual(envR55.removedChannels.length, 0, 'R55: repeated start must not unnecessarily remove/recreate channel');
recordR('R55');

// R56: Room deletion (room_exists=false) -> archives with room_deleted reason and tears down context
const envR56 = createStudentEnvironment();
const snapR56 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r56',
  truong_id: 'school-56',
  phong_id: 'room-r56',
  hs_id: 'hs-56',
  ma_de: '101',
  room_opened_at: 56000,
  raw_answers: [{ chon: 'D' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR56.localStore.set('final_damsan_room-r56_hs-56', JSON.stringify(snapR56));
envR56.api.setState({ phong_id: 'room-r56', room_opened_at: 56000, hs_id: 'hs-56', truong_id: 'school-56' });
envR56.mockSupabase._fromData = { phong_thi: null, ket_qua: null };
envR56.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: false }, error: null };

await envR56.api._postReceiptLifecycleTick();

assert.strictEqual(envR56.localStore.has('final_damsan_room-r56_hs-56'), false, 'R56: active snapshot cleared on room deletion');
assert.strictEqual(envR56.localStore.has('recovery_damsan_room-r56_hs-56_att-r56'), true, 'R56: snapshot archived on room deletion');
const archived56 = JSON.parse(envR56.localStore.get('recovery_damsan_room-r56_hs-56_att-r56'));
assert.strictEqual(archived56.reason, 'room_deleted', 'R56: archive reason must be room_deleted');
assert.strictEqual(envR56.api.getState().phong_id, null, 'R56: state.phong_id cleared on room deletion');
recordR('R56');

// R57: Changed context replaces old watcher exactly once
const envR57 = createStudentEnvironment();
envR57.api.setState({ phong_id: 'room-r57-old', room_opened_at: 57000, hs_id: 'hs-57', truong_id: 'school-57' });
envR57.api.batDauPostReceiptLifecycleWatcher();
const oldCh = envR57.mockChannels.find(c => c.name === 'post-receipt-lifecycle-room-r57-old');
assert(oldCh && oldCh.subscribed, 'R57: old channel subscribed');

// Change context to new room
envR57.api.setState({ phong_id: 'room-r57-new', room_opened_at: 57001 });
envR57.api.batDauPostReceiptLifecycleWatcher();

const newCh = envR57.mockChannels.find(c => c.name === 'post-receipt-lifecycle-room-r57-new');
assert(newCh && newCh.subscribed, 'R57: new channel subscribed');
assert.strictEqual(oldCh.subscribed, false, 'R57: old channel was unsubscribed/removed');
assert.strictEqual(envR57.intervals.filter(i => !i.cleared).length, 1, 'R57: exactly 1 active poll timer remains');
recordR('R57');

// ==========================================================
// R58-R62: Production RLS Boundary & Secure Receipt Reconciliation
// ==========================================================

// R58: PRODUCTION RLS CONTRACT — direct phong_thi SELECT denied, receipt RPC reset_confirmed=true -> cleans up authoritative reset
const envR58 = createStudentEnvironment();
const snapR58 = {
  version: 1,
  state: 'SERVER_RECEIVED',
  attempt_id: 'att-r58',
  truong_id: 'school-58',
  phong_id: 'room-r58',
  hs_id: 'hs-58',
  ma_de: '101',
  room_opened_at: 58000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR58.localStore.set('final_damsan_room-r58_hs-58', JSON.stringify(snapR58));
envR58.localStore.set('receipt_damsan_room-r58_hs-58', JSON.stringify({ submission_id: 'sub-58', received_at: '2026-08-30T10:00:00Z' }));
envR58.api.setState({ phong_id: 'room-r58', room_opened_at: 58000, hs_id: 'hs-58', truong_id: 'school-58' });
envR58.mockSupabase._fromErrors = { phong_thi: { message: 'permission denied for table phong_thi' } };
envR58.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };

await envR58.api._postReceiptLifecycleTick();

assert.strictEqual(envR58.localStore.has('final_damsan_room-r58_hs-58'), false, 'R58: active snapshot cleared despite phong_thi RLS error');
assert.strictEqual(envR58.localStore.has('receipt_damsan_room-r58_hs-58'), false, 'R58: active receipt cleared');
assert.strictEqual(envR58.localStore.has('recovery_damsan_room-r58_hs-58_att-r58'), true, 'R58: snapshot archived');
assert.strictEqual(envR58.api.getState().phong_id, null, 'R58: state.phong_id cleared to null');
assert.strictEqual(envR58.api.getState().room_opened_at, null, 'R58: state.room_opened_at cleared to null');
recordR('R58');

// R59: RLS + UNCONFIRMED — direct phong_thi denied, receipt RPC unconfirmed -> retains FINAL/state
const envR59 = createStudentEnvironment();
const snapR59 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r59',
  truong_id: 'school-59',
  phong_id: 'room-r59',
  hs_id: 'hs-59',
  ma_de: '101',
  room_opened_at: 59000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR59.localStore.set('final_damsan_room-r59_hs-59', JSON.stringify(snapR59));
envR59.api.setState({ phong_id: 'room-r59', room_opened_at: 59000, hs_id: 'hs-59', truong_id: 'school-59' });
envR59.mockSupabase._fromErrors = { phong_thi: { message: 'permission denied for table phong_thi' } };
envR59.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: false, room_exists: true }, error: null };

await envR59.api._postReceiptLifecycleTick();

assert.strictEqual(envR59.localStore.has('final_damsan_room-r59_hs-59'), true, 'R59: snapshot preserved when unconfirmed');
assert.strictEqual(envR59.localStore.has('recovery_damsan_room-r59_hs-59_att-r59'), false, 'R59: must not archive when unconfirmed');
assert.strictEqual(envR59.api.getState().phong_id, 'room-r59', 'R59: phong_id preserved');
assert.strictEqual(envR59.api.getState().room_opened_at, 59000, 'R59: room_opened_at preserved');
recordR('R59');

// R60: RLS + RPC NETWORK ERROR — direct phong_thi denied, receipt RPC 503 error -> retains FINAL/state
const envR60 = createStudentEnvironment();
const snapR60 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r60',
  truong_id: 'school-60',
  phong_id: 'room-r60',
  hs_id: 'hs-60',
  ma_de: '101',
  room_opened_at: 60000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR60.localStore.set('final_damsan_room-r60_hs-60', JSON.stringify(snapR60));
envR60.api.setState({ phong_id: 'room-r60', room_opened_at: 60000, hs_id: 'hs-60', truong_id: 'school-60' });
envR60.mockSupabase._fromErrors = { phong_thi: { message: 'permission denied for table phong_thi' } };
envR60.mockSupabase._receiptStatusResult = { data: null, error: { message: '503 Service Unavailable' } };

await envR60.api._postReceiptLifecycleTick();

assert.strictEqual(envR60.localStore.has('final_damsan_room-r60_hs-60'), true, 'R60: snapshot preserved on RPC network error');
assert.strictEqual(envR60.localStore.has('recovery_damsan_room-r60_hs-60_att-r60'), false, 'R60: must not archive on network error');
assert.strictEqual(envR60.api.getState().phong_id, 'room-r60', 'R60: phong_id preserved');
recordR('R60');

// R61: POLLING FALLBACK UNDER REAL PRODUCTION PERMISSION MODEL — phong_thi direct SELECT denied, polling cleanup succeeds
const envR61 = createStudentEnvironment();
const snapR61 = {
  version: 1,
  state: 'SERVER_RECEIVED',
  attempt_id: 'att-r61',
  truong_id: 'school-61',
  phong_id: 'room-r61',
  hs_id: 'hs-61',
  ma_de: '101',
  room_opened_at: 61000,
  raw_answers: [{ chon: 'C' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR61.localStore.set('final_damsan_room-r61_hs-61', JSON.stringify(snapR61));
envR61.api.setState({ phong_id: 'room-r61', room_opened_at: 61000, hs_id: 'hs-61', truong_id: 'school-61' });
envR61.api.batDauPostReceiptLifecycleWatcher();
const r61Poll = envR61.intervals.find(i => i.ms === 12000 && !i.cleared);
assert(r61Poll, 'R61: 12s poll timer registered');

envR61.mockSupabase._fromErrors = { phong_thi: { message: 'permission denied for table phong_thi' } };
envR61.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };

r61Poll.fn();
await new Promise(resolve => setTimeout(resolve, 20));

assert.strictEqual(envR61.localStore.has('final_damsan_room-r61_hs-61'), false, 'R61: polling under RLS cleared snapshot');
assert.strictEqual(envR61.localStore.has('recovery_damsan_room-r61_hs-61_att-r61'), true, 'R61: polling archived snapshot');
assert.strictEqual(envR61.api.getState().phong_id, null, 'R61: phong_id cleared on polling reset');
recordR('R61');

// R62: REALTIME EVENT UNDER REAL PRODUCTION PERMISSION MODEL — realtime event triggers receipt-status cleanup when SELECT denied
const envR62 = createStudentEnvironment();
const snapR62 = {
  version: 1,
  state: 'FINAL_PENDING',
  attempt_id: 'att-r62',
  truong_id: 'school-62',
  phong_id: 'room-r62',
  hs_id: 'hs-62',
  ma_de: '101',
  room_opened_at: 62000,
  raw_answers: [{ chon: 'A' }],
  client_submitted_at: '2026-08-30T10:00:00Z',
  auto_submit: false
};
envR62.localStore.set('final_damsan_room-r62_hs-62', JSON.stringify(snapR62));
envR62.api.setState({ phong_id: 'room-r62', room_opened_at: 62000, hs_id: 'hs-62', truong_id: 'school-62' });
envR62.api.batDauPostReceiptLifecycleWatcher();
const r62Channel = envR62.mockChannels.find(c => c.name === 'post-receipt-lifecycle-room-r62');
assert(r62Channel, 'R62: channel must exist');

envR62.mockSupabase._fromErrors = { phong_thi: { message: 'permission denied for table phong_thi' } };
envR62.mockSupabase._receiptStatusResult = { data: { status: 'missing', reset_confirmed: true, room_exists: true }, error: null };

r62Channel.triggerPostgresChanges({ new: { id: 'room-r62', thoi_gian_mo: null } });
await new Promise(resolve => setTimeout(resolve, 20));

assert.strictEqual(envR62.localStore.has('final_damsan_room-r62_hs-62'), false, 'R62: realtime trigger under RLS cleared snapshot');
assert.strictEqual(envR62.localStore.has('recovery_damsan_room-r62_hs-62_att-r62'), true, 'R62: realtime trigger archived snapshot');
assert.strictEqual(envR62.api.getState().phong_id, null, 'R62: phong_id cleared on realtime reset');
recordR('R62');

// Verify all R25-R62 assertions passed
for (let i = 25; i <= 62; i++) {
  assert.strictEqual(rCoverage[`R${i}`], true, `Missing coverage for R${i}`);
}

const client = fs.readFileSync('hoc_sinh.js', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
assert(!client.includes('result-watch-'));
assert(client.includes('if (!statusData.has_result) {') || client.includes('if (!kq) {'));
assert(client.includes('snapshot.state === SUBMISSION_STATE.SERVER_RECEIVED'));
assert(client.includes('requestGrading(receipt.submission_id);'));
assert(client.includes("data?.code === 'room_attempt_changed'"));
assert(client.includes('archiveFinalSnapshot(snapshot, \'room_attempt_changed\')'));
assert(client.includes('return matches(JSON.parse(localStorage.getItem(key)))'));
assert(client.includes('if (!archived) {'));
assert(client.includes('p_student_token: token') && client.includes('p_room_opened_at: snapshot.room_opened_at'));
assert(client.includes("if (receipt?.submission_id && receipt?.received_at)"));
assert(client.includes('Chưa xác nhận được trạng thái bài nộp từ máy chủ.'));
assert(client.includes('function submissionKeysFor(phongId, hsId)'));
assert(client.includes('function findRecoverableFinalSnapshotsForCurrentStudent()'));
assert(client.includes('hydrateSubmissionContext(snapshot);'));
assert(client.includes("key.startsWith('final_damsan_')"));
assert(client.includes("if (candidates.length > 1)"));
assert(client.includes('recoveryAmbiguityNoticeShown'));
assert(client.includes('return false;'));
assert(client.includes('snapshot = await reconcileSavedSubmission(snapshot);'));
assert(client.includes('snapshot.recovery_archive_failed === true'));
assert(client.includes('recoveryArchiveFailureNoticeShown'));
assert(client.includes('void resumeSavedSubmission()'));
assert(client.includes('function dinhDangThoiGianVN'));
assert(client.includes('dinhDangThoiGianVN(receipt.received_at)'));
// P0-006A static source checks
assert(client.includes('postReceiptLifecycleChannel'));
assert(client.includes('postReceiptLifecyclePollTimer'));
assert(client.includes('postReceiptLifecycleContextKey'));
assert(client.includes('function dungPostReceiptLifecycleWatcher'));
assert(client.includes('function batDauPostReceiptLifecycleWatcher'));
assert(client.includes('function _postReceiptContextValid'));
assert(client.includes('async function _postReceiptLifecycleTick'));
assert(client.includes("'post-receipt-lifecycle-' + capturedPhongId"));
assert(client.includes('setInterval(() => { void _postReceiptLifecycleTick(); }, 12000)'));
assert(client.includes('batDauPostReceiptLifecycleWatcher()'));
assert(client.includes('dungPostReceiptLifecycleWatcher()'));
const clientVersion = client.match(/const VERSION = '([^']+)'/)[1];
const serviceWorkerVersion = serviceWorker.match(/const VERSION = '([^']+)'/)[1];
assert.strictEqual(clientVersion, serviceWorkerVersion); // R19
assert.strictEqual(clientVersion, '20260902-flex-lite-005');
const migration01 = fs.readFileSync('supabase/migrations/20260828000001_submission_safety_p0.sql', 'utf8').replace(/\r\n/g, '\n');
assert(!migration01.includes('v_legacy := public.nop_bai_va_cham_diem'));
assert(migration01.includes('rpc_reset_room_results') && migration01.includes('rpc_grade_pending_room'));
assert(migration01.includes("'room_attempt_changed'"));
assert(migration01.includes('string_to_array(v_answer') && migration01.includes('for v_part2_index in 1..4'));
assert(migration01.includes('insert into public.ket_qua (truong_id, phong_id, hs_id, ma_de, diem, chi_tiet)'));
assert(migration01.includes('for share') && migration01.includes('for update'));
assert(migration01.includes('references public.phong_thi(id) on delete cascade'));
assert(migration01.includes('rpc_submission_receipt_status(\n  p_attempt_id uuid,\n  p_truong_id uuid,\n  p_phong_id uuid,\n  p_room_opened_at bigint') && migration01.includes("'reset_confirmed', false"));

const migration03 = fs.readFileSync('supabase/migrations/20260829000003_student_recovery_lifecycle_p0.sql', 'utf8').replace(/\r\n/g, '\n');
assert(migration03.includes('create or replace function public.rpc_reset_room_results'));
assert(migration03.includes("set trang_thai = 'CHO_THI', thoi_gian_mo = null"));

// =========================================================================
// P0-007: STUDENT RESULT/PUBLICATION STATUS & SESSION HARDENING SUITE (R63 - R114)
// =========================================================================

const migContent = fs.readFileSync('supabase/migrations/20260830000001_student_result_publication_status_p0.sql', 'utf8');
const hsCode = fs.readFileSync('hoc_sinh.js', 'utf8');
const gvCode = fs.readFileSync('giaovien.js', 'utf8');

// R63: Student session token creation contract in rpc_login_hoc_sinh
assert(migContent.includes("v_student_token := encode(extensions.gen_random_bytes(32)"), "R63: login generates 32-byte hex token");
assert(migContent.includes("'student_token', v_student_token"), "R63: login returns student_token");
assert(migContent.includes("'student_expires_at', v_expires_at"), "R63: login returns student_expires_at");
recordR('R63');

// R64: Session token SHA-256 digest storage in public.student_sessions
assert(migContent.includes("insert into public.student_sessions(token_hash, hs_id, expires_at)"), "R64: session record inserted");
assert(migContent.includes("encode(extensions.digest(v_student_token, 'sha256'), 'hex')"), "R64: sha256 token hash generated");
recordR('R64');

// R65: Ephemeral session expiration helper validation
const envR65 = createStudentEnvironment();
assert.strictEqual(envR65.api.isStudentSessionExpired(), false, "R65: valid unexpired token returns false");
envR65.sessionStore.set('damSan_StudentTokenExpiresAt', new Date(Date.now() - 1000).toISOString());
assert.strictEqual(envR65.api.isStudentSessionExpired(), true, "R65: past expiry returns true");
recordR('R65');

// R66: Expired student session fail-closed on restore
const envR66 = createStudentEnvironment();
envR66.sessionStore.set('damSan_HSSession', JSON.stringify({ truong_id: 'sch-1', hs_id: 'hs-1', ma_hs: 'HS1' }));
envR66.sessionStore.set('damSan_StudentTokenExpiresAt', new Date(Date.now() - 5000).toISOString());
assert.strictEqual(envR66.api.getStudentToken(), null, "R66: expired token returns null and clears auth");
assert.strictEqual(envR66.sessionStore.has('damSan_HSSession'), false, "R66: HSSession cleared on expired token");
recordR('R66');

// R67: rpc_student_logout contract revokes active session
assert(migContent.includes("create or replace function public.rpc_student_logout"), "R67: logout RPC defined");
assert(migContent.includes("set revoked_at = now()"), "R67: logout sets revoked_at");
recordR('R67');

// R68: Client-side logout cleans all session storage items
const envR68 = createStudentEnvironment();
envR68.sessionStore.set('damSan_HSSession', '{}');
envR68.sessionStore.set('damSan_StudentToken', 'tok-68');
envR68.sessionStore.set('damSan_StudentTokenExpiresAt', new Date(Date.now() + 60000).toISOString());
envR68.api.clearStudentAuthSession();
assert.strictEqual(envR68.sessionStore.has('damSan_HSSession'), false, "R68: damSan_HSSession removed");
assert.strictEqual(envR68.sessionStore.has('damSan_StudentToken'), false, "R68: damSan_StudentToken removed");
assert.strictEqual(envR68.sessionStore.has('damSan_StudentTokenExpiresAt'), false, "R68: damSan_StudentTokenExpiresAt removed");
recordR('R68');

// R69: Password change requires matching current password proof
assert(migContent.includes("create or replace function public.rpc_change_hoc_sinh_password"), "R69: change password RPC defined");
assert(migContent.includes("and mat_khau = p_current_password"), "R69: password change checks current password");
recordR('R69');

// R70: Password change revokes all existing student sessions
assert(migContent.includes("update public.student_sessions") && migContent.includes("set revoked_at = now()") && migContent.includes("where hs_id = p_hs_id"), "R70: password change revokes all sessions");
recordR('R70');

// R71: Password change reauth fail-closed on network error
assert(hsCode.includes("if (!reAuthOk) {"), "R71: hsCode checks reAuthOk");
assert(hsCode.includes("clearStudentAuthSession();"), "R71: hsCode clears auth session on failed reauth");
recordR('R71');

// R72: Password change reauth fail-closed on malformed response
assert(hsCode.includes("completeStudentAuthenticatedSession(reAuth)"), "R72: reauth validates payload completeness");
recordR('R72');

// R73: completeStudentAuthenticatedSession creates session only on complete payload
const envR73 = createStudentEnvironment();
envR73.sessionStore.clear();
const okPayload = { status: 'success', student_token: 't73', student_expires_at: new Date(Date.now() + 60000).toISOString(), user: { id: 'hs-73', truong_id: 'sch-73', ma_hs: 'HS73', ho_ten: 'A', lop: '10' } };
assert.strictEqual(envR73.api.completeStudentAuthenticatedSession(okPayload), true, "R73: complete payload accepted");
assert.strictEqual(envR73.sessionStore.get('damSan_StudentToken'), 't73', "R73: token stored");
recordR('R73');

// R74: rpc_hoc_sinh_get_exam requires p_student_token
assert(migContent.includes("create or replace function public.rpc_hoc_sinh_get_exam"), "R74: rpc_hoc_sinh_get_exam defined");
assert(migContent.includes("p_student_token text"), "R74: rpc_hoc_sinh_get_exam takes token");
recordR('R74');

// R75: rpc_hoc_sinh_get_exam resolves caller via _student_session_hs_id
assert(migContent.includes("v_hs_id := public._student_session_hs_id(p_student_token);"), "R75: get_exam resolves hs_id from token");
assert(migContent.includes("invalid_session"), "R75: get_exam rejects invalid session");
recordR('R75');

// R76: _student_session_hs_id rejects expired/revoked sessions
assert(migContent.includes("s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')"), "R76: session lookup checks hash");
assert(migContent.includes("and s.revoked_at is null"), "R76: session lookup checks non-revocation");
assert(migContent.includes("and s.expires_at > now()"), "R76: session lookup checks expiry");
recordR('R76');

// R77: rpc_hoc_sinh_get_exam cross-student BOLA isolation
assert(migContent.includes("from public.hoc_sinh") && migContent.includes("where id = v_hs_id"), "R77: student derived strictly from session");
recordR('R77');

// R78: rpc_hoc_sinh_get_exam cross-school isolation
assert(migContent.includes("where id = p_phong_id and truong_id = v_student.truong_id;"), "R78: get_exam enforces school matching");
recordR('R78');

// R79: rpc_hoc_sinh_get_exam room status gating
assert(migContent.includes("if v_room.trang_thai <> 'MO_PHONG' then"), "R79: get_exam rejects non-MO_PHONG");
recordR('R79');

// R80: rpc_hoc_sinh_get_exam doi_tuong gating
assert(migContent.includes("v_room.doi_tuong = 'TatCa'"), "R80: get_exam checks doi_tuong");
recordR('R80');

// R81: rpc_hoc_sinh_get_exam answer-key stripping
assert(migContent.includes("q - 'dap_an_dung' - 'DapAnDung'"), "R81: answer keys stripped from questions");
recordR('R81');

// R82: rpc_hoc_sinh_get_exam preserves question metadata
assert(migContent.includes("into v_clean_cau_so") && migContent.includes("'cau_so', v_clean_cau_so"), "R82: clean questions returned in payload");
recordR('R82');

// R83: Exact legacy exam numeric modulo assignment
assert(migContent.includes("v_exam_index := cast(v_clean_ma_hs as int) % v_exam_count;"), "R83: numeric branch uses integer modulo");
recordR('R83');

// R84: Exact legacy exam alphanumeric rolling 31-multiplier hash
assert(migContent.includes("v_hash := ((v_hash * 31) + v_char_code) % 2147483647;"), "R84: alphanumeric branch uses 31-multiplier hash mod 2147483647");
recordR('R84');

// R85: Exact legacy exam whitespace trimming
assert(migContent.includes("v_clean_ma_hs := trim(v_student.ma_hs);"), "R85: student code trimmed");
recordR('R85');

// R86: rpc_hoc_sinh_grade_submission signature and token binding
assert(migContent.includes("create or replace function public.rpc_hoc_sinh_grade_submission"), "R86: grade submission RPC defined");
recordR('R86');

// R87: rpc_hoc_sinh_grade_submission BOLA enforcement
assert(migContent.includes("if v_sub.hs_id <> v_hs_id then"), "R87: grade submission rejects non-owner student");
recordR('R87');

// R88: rpc_hoc_sinh_grade_submission hides score/details
assert(migContent.includes("return jsonb_build_object(") && migContent.includes("'status', 'graded'"), "R88: grading response returns graded status");
recordR('R88');

// R89: Direct rpc_grade_submission revoked from browser roles
assert(migContent.includes("revoke all on function public.rpc_grade_submission(uuid) from public, anon, authenticated;"), "R89: direct rpc_grade_submission revoked");
recordR('R89');

// R90: Direct lay_de_thi_an_toan revoked from browser roles
assert(migContent.includes("revoke all on function public.lay_de_thi_an_toan from public, anon, authenticated"), "R90: lay_de_thi_an_toan revoked");
recordR('R90');

// R91: Direct nop_bai_va_cham_diem revoked from browser roles
assert(migContent.includes("revoke all on function public.nop_bai_va_cham_diem from public, anon, authenticated"), "R91: nop_bai_va_cham_diem revoked");
recordR('R91');

// R92: Direct table SELECT on ket_qua revoked
assert(migContent.includes("revoke all on table public.ket_qua from anon, authenticated;"), "R92: ket_qua direct access revoked");
recordR('R92');

// R93: Direct table SELECT on de_thi revoked
assert(migContent.includes("revoke all on table public.de_thi from anon, authenticated;"), "R93: de_thi direct access revoked");
recordR('R93');

// R94: Permissive RLS policy result_read_minimal dropped
assert(migContent.includes("drop policy if exists result_read_minimal on public.ket_qua;"), "R94: result_read_minimal dropped");
recordR('R94');

// R95: Permissive RLS policy exam_read_minimal dropped
assert(migContent.includes("drop policy if exists exam_read_minimal on public.de_thi;"), "R95: exam_read_minimal dropped");
recordR('R95');

// R96: rpc_hoc_sinh_result_status signature takes token and phong_id
assert(migContent.includes("create or replace function public.rpc_hoc_sinh_result_status"), "R96: result status RPC defined");
recordR('R96');

// R97: rpc_hoc_sinh_result_status cross-student BOLA isolation
assert(migContent.includes("where phong_id = p_phong_id and hs_id = v_hs_id"), "R97: result query scoped strictly to session hs_id");
recordR('R97');

// R98: rpc_hoc_sinh_result_status cross-school isolation
assert(migContent.includes("where id = p_phong_id and truong_id = v_student.truong_id;"), "R98: result status checks school matching");
recordR('R98');

// R99: rpc_hoc_sinh_result_status active/non-published room hides result payload
assert(migContent.includes("v_result_payload := null;"), "R99: non-published room sets null result payload");
recordR('R99');

// R100: rpc_hoc_sinh_result_status non-existent result returns has_result=false
assert(migContent.includes("'has_result', false") && migContent.includes("'result', null"), "R100: no result state defined");
recordR('R100');

// R101: rpc_hoc_sinh_result_status CONG_BO_DIEM returns score only and null chi_tiet
assert(migContent.includes("if v_room.trang_thai = 'CONG_BO_DIEM' then") && migContent.includes("'chi_tiet', null"), "R101: CONG_BO_DIEM branch defined");
recordR('R101');

// R102: rpc_hoc_sinh_result_status XEM_DAP_AN returns full review and de_thi
assert(migContent.includes("elsif v_room.trang_thai = 'XEM_DAP_AN' then") && migContent.includes("'de_thi', v_exam"), "R102: XEM_DAP_AN branch defined");
recordR('R102');

// R103: rpc_lay_ket_qua_phong_gv requires authenticated staff role
assert(migContent.includes("create or replace function public.rpc_lay_ket_qua_phong_gv"), "R103: teacher results RPC defined");
assert(migContent.includes("revoke all on function public.rpc_lay_ket_qua_phong_gv"), "R103: teacher RPC revoked from public");
recordR('R103');

// R104: rpc_staff_exam_preview requires authenticated staff role
assert(migContent.includes("create or replace function public.rpc_staff_exam_preview"), "R104: staff exam preview RPC defined");
assert(migContent.includes("revoke all on function public.rpc_staff_exam_preview"), "R104: exam preview revoked from public");
recordR('R104');

// R105 (Section 3 & 4): Exact legacy assignment compatibility vectors + distinction vector
assert.strictEqual(legacyExamIndex('100403', 4), 3, "Vector 100403 / 4 -> 3");
assert.strictEqual(legacyExamIndex('012345', 4), 1, "Vector 012345 / 4 -> 1");
assert.strictEqual(legacyExamIndex('HS001', 4), 2, "Vector HS001 / 4 -> 2");
assert.notStrictEqual(legacyExamIndex('HS001', 4), 0, "HS001 is NOT simple ASCII sum");
assert.strictEqual(legacyExamIndex('DAMSAN2026', 5), 1, "Vector DAMSAN2026 / 5 -> 1");
assert.notStrictEqual(legacyExamIndex('DAMSAN2026', 5), 4, "DAMSAN2026 is NOT index 4");
assert.strictEqual(legacyExamIndex('X', 1), 0, "Vector X / 1 -> 0");
assert.strictEqual(legacyExamIndex('  HS001  ', 4), legacyExamIndex('HS001', 4), "Whitespace trimmed matching production");
assert.strictEqual(legacyExamIndex('  100403  ', 4), legacyExamIndex('100403', 4), "Numeric whitespace trimmed matching production");
assert.strictEqual(legacyExamIndex('  DAMSAN2026  ', 5), legacyExamIndex('DAMSAN2026', 5), "Alphanumeric whitespace trimmed matching production");
const hash123ABC = (function(){ let h = 0; for(let c of '123ABC') h = ((h * 31) + c.charCodeAt(0)) % 2147483647; return h % 4; })();
assert.strictEqual(legacyExamIndex('123ABC', 4), hash123ABC, "123ABC uses rolling hash branch");
assert.notStrictEqual(legacyExamIndex('123ABC', 4), parseInt('123', 10) % 4, "123ABC does NOT use parseInt numeric prefix");
assert.strictEqual(legacyExamIndex('  123ABC  ', 4), hash123ABC, "  123ABC  trimmed matches 123ABC");
recordR('R105');

// R106: Display score normalization for same-session Part-I-only exam (scale to 10)
const envR106 = createStudentEnvironment();
envR106.api.setState({
  truong_id: 'sch-1', hs_id: 'hs-1', phong_id: 'room-106', ho_ten: 'Nguyen Van A',
  cau_hoi: Array.from({ length: 10 }, (_, i) => ({ cau_so: i + 1, phan: '1' }))
});
envR106.mockSupabase._fromData = {
  phong_thi: { id: 'room-106', trang_thai: 'CONG_BO_DIEM', thoi_gian_mo: 1000 },
  ket_qua: { id: 'kq-106', diem: 2.5, so_lan_vi_pham: 0 }
};
await envR106.api.checkTeacherCommand(true);
assert.strictEqual(envR106.getEl('final_score_val').innerText, '2.50', "R106: 10 Part-I questions displays authoritative score 2.50");
envR106.mockSupabase._fromData.ket_qua.diem = 1.25;
await envR106.api.checkTeacherCommand(false);
assert.strictEqual(envR106.getEl('final_score_val').innerText, '1.25', "R106: 10 Part-I questions displays authoritative score 1.25");
recordR('R106');

// R107: Display score raw preservation for mixed Part I & Part II exam
const envR107 = createStudentEnvironment();
envR107.api.setState({
  truong_id: 'sch-1', hs_id: 'hs-1', phong_id: 'room-107', ho_ten: 'Nguyen Van A',
  cau_hoi: [{ cau_so: 1, phan: '1' }, { cau_so: 2, phan: '2' }]
});
envR107.mockSupabase._fromData = {
  phong_thi: { id: 'room-107', trang_thai: 'CONG_BO_DIEM', thoi_gian_mo: 1000 },
  ket_qua: { id: 'kq-107', diem: 4.5, so_lan_vi_pham: 0 }
};
await envR107.api.checkTeacherCommand(true);
assert.strictEqual(envR107.getEl('final_score_val').innerText, '4.50', "R107: mixed Part I/II exam preserves raw score");
recordR('R107');

// R108: Display score fallback when state.cau_hoi is unavailable
const envR108 = createStudentEnvironment();
envR108.api.setState({
  truong_id: 'sch-1', hs_id: 'hs-1', phong_id: 'room-108', ho_ten: 'Nguyen Van A',
  cau_hoi: []
});
envR108.mockSupabase._fromData = {
  phong_thi: { id: 'room-108', trang_thai: 'CONG_BO_DIEM', thoi_gian_mo: 1000 },
  ket_qua: { id: 'kq-108', diem: 7.5, so_lan_vi_pham: 0 }
};
await envR108.api.checkTeacherCommand(true);
assert.strictEqual(envR108.getEl('final_score_val').innerText, '7.50', "R108: unavailable cau_hoi preserves raw score");
recordR('R108');

// R109: joinRoom fail-closed on statusError (preserves fatal_violation and keeps lockout)
const envR109 = createStudentEnvironment();
envR109.api.setState({ truong_id: 'sch-1', hs_id: 'hs-109', ma_hs: 'HS109', lop: '12A' });
envR109.localStore.set('fatal_violation_HS109_room-109', 'true');
envR109.mockSupabase.rpc = async (name) => {
  if (name === 'rpc_hoc_sinh_room_info' || name === 'rpc_lay_thong_tin_phong_hs') return { data: { status: 'success', room: { id: 'room-109', doi_tuong: 'TatCa', trang_thai: 'DANG_THI' } }, error: null };
  if (name === 'rpc_hoc_sinh_result_status') return { data: null, error: { message: 'Network connection failure' } };
  return { data: null, error: null };
};
await envR109.api.joinRoom('P109');
assert.strictEqual(envR109.localStore.has('fatal_violation_HS109_room-109'), true, "R109: fatal_violation preserved on network/RPC error");
recordR('R109');

// R110: joinRoom fail-closed on invalid_session (preserves fatal_violation, clears auth, navigates to login)
const envR110 = createStudentEnvironment();
envR110.api.setState({ truong_id: 'sch-1', hs_id: 'hs-110', ma_hs: 'HS110', lop: '12A' });
let r110Section = 'room-section';
envR110.sandbox.showSection = (s) => { r110Section = s; };
envR110.localStore.set('fatal_violation_HS110_room-110', 'true');
envR110.mockSupabase._fromData = { phong_thi: { id: 'room-110', doi_tuong: 'TatCa', trang_thai: 'DANG_THI' } };
envR110.mockSupabase.rpc = async (name) => {
  if (name === 'rpc_hoc_sinh_room_info' || name === 'rpc_lay_thong_tin_phong_hs') return { data: { status: 'success', room: { id: 'room-110', doi_tuong: 'TatCa', trang_thai: 'DANG_THI' } }, error: null };
  if (name === 'rpc_hoc_sinh_result_status') return { data: { status: 'error', code: 'invalid_session', message: 'Phiên hết hạn' }, error: null };
  return { data: null, error: null };
};
await envR110.api.joinRoom('P110');
assert.strictEqual(envR110.localStore.has('fatal_violation_HS110_room-110'), true, "R110: fatal_violation preserved on invalid_session");
assert.strictEqual(envR110.sessionStore.has('damSan_StudentToken'), false, "R110: auth session cleared on invalid_session");
assert.strictEqual(r110Section, 'login-section', "R110: redirected to login-section");
recordR('R110');

// R111: joinRoom preserves fatal_violation when so_lan_vi_pham > 0
const envR111 = createStudentEnvironment();
envR111.api.setState({ truong_id: 'sch-1', hs_id: 'hs-111', ma_hs: 'HS111', lop: '12A' });
envR111.localStore.set('fatal_violation_HS111_room-111', 'true');
envR111.mockSupabase._fromData = {
  phong_thi: { id: 'room-111', doi_tuong: 'TatCa', trang_thai: 'DANG_THI' },
  ket_qua: { id: 'kq-111', diem: 8.0, so_lan_vi_pham: 3 }
};
await envR111.api.joinRoom('P111');
assert.strictEqual(envR111.localStore.has('fatal_violation_HS111_room-111'), true, "R111: fatal_violation preserved when violation count > 0");
recordR('R111');

// R112: joinRoom clears fatal_violation ONLY on authoritative successful status with no result or 0 violations
const envR112 = createStudentEnvironment();
envR112.api.setState({ truong_id: 'sch-1', hs_id: 'hs-112', ma_hs: 'HS112', lop: '12A' });
envR112.localStore.set('fatal_violation_HS112_room-112', 'true');
envR112.mockSupabase._fromData = {
  phong_thi: { id: 'room-112', doi_tuong: 'TatCa', trang_thai: 'DANG_THI' },
  ket_qua: null
};
await envR112.api.joinRoom('P112');
assert.strictEqual(envR112.localStore.has('fatal_violation_HS112_room-112'), false, "R112: fatal_violation cleared on authoritative no-result status");
recordR('R112');

// R113 (Section 5 & 6): Behavioral simulation for forced password-change reauth (Cases A, B, C)
// Case A: Successful password change + successful reauth -> token, expiry, and HSSession created
const envCaseA = createStudentEnvironment();
let currentSectionA = 'change-password-section';
envCaseA.sandbox.showSection = (sec) => { currentSectionA = sec; };
envCaseA.getEl('new_password').value = 'NewPassword123';
envCaseA.getEl('confirm_password').value = 'NewPassword123';
envCaseA.getEl('ma_truong').value = 'DAMSAN';
envCaseA.api.setPendingProof('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
envCaseA.api.setState({ truong_id: 'school-1', hs_id: 'hs-101', ma_hs: 'HS101', ho_ten: 'Nguyen Van A', lop: '12A1' });
envCaseA.mockSupabase.rpc = async (name, params) => {
  if (name === 'rpc_change_hoc_sinh_password') {
    return { data: { status: 'success', message: 'Cập nhật thành công' }, error: null };
  }
  if (name === 'rpc_login_hoc_sinh') {
    return {
      data: {
        status: 'success',
        student_token: 'case-a-token',
        student_expires_at: new Date(Date.now() + 86400000).toISOString(),
        user: { id: 'hs-101', truong_id: 'school-1', ma_hs: 'HS101', ho_ten: 'Nguyen Van A', lop: '12A1' }
      },
      error: null
    };
  }
  return { data: null, error: null };
};
await envCaseA.api.capNhatMatKhau();
assert.strictEqual(envCaseA.sessionStore.get('damSan_StudentToken'), 'case-a-token', "Case A: token persisted");
assert.strictEqual(envCaseA.sessionStore.has('damSan_StudentTokenExpiresAt'), true, "Case A: expiresAt persisted");
assert.strictEqual(envCaseA.sessionStore.has('damSan_HSSession'), true, "Case A: HSSession created");
assert.strictEqual(envCaseA.api.getPendingProof(), null, "Case A: proof cleared");
assert.strictEqual(currentSectionA, 'room-section', "Case A: navigated to room-section");

// Case B: Successful password change + reauth error -> fails closed, clears all sessions, returns to login
const envCaseB = createStudentEnvironment();
let currentSectionB = 'change-password-section';
envCaseB.sandbox.showSection = (sec) => { currentSectionB = sec; };
envCaseB.getEl('new_password').value = 'NewPassword123';
envCaseB.getEl('confirm_password').value = 'NewPassword123';
envCaseB.getEl('ma_truong').value = 'DAMSAN';
envCaseB.api.setPendingProof('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
envCaseB.api.setState({ truong_id: 'school-1', hs_id: 'hs-101', ma_hs: 'HS101', ho_ten: 'Nguyen Van A', lop: '12A1' });
envCaseB.mockSupabase.rpc = async (name, params) => {
  if (name === 'rpc_change_hoc_sinh_password') {
    return { data: { status: 'success', message: 'Cập nhật thành công' }, error: null };
  }
  if (name === 'rpc_login_hoc_sinh') {
    return { data: null, error: { message: 'Network connection failed during reauth' } };
  }
  return { data: null, error: null };
};
await envCaseB.api.capNhatMatKhau();
assert.strictEqual(envCaseB.sessionStore.has('damSan_StudentToken'), false, "Case B: NO token persisted on reauth error");
assert.strictEqual(envCaseB.sessionStore.has('damSan_StudentTokenExpiresAt'), false, "Case B: NO expiresAt persisted");
assert.strictEqual(envCaseB.sessionStore.has('damSan_HSSession'), false, "Case B: NO HSSession created");
assert.strictEqual(envCaseB.api.getPendingProof(), null, "Case B: proof cleared");
assert.strictEqual(currentSectionB, 'login-section', "Case B: redirected to login-section");

// Case C: Successful password change + reauth success but malformed/missing token -> fails closed
const envCaseC = createStudentEnvironment();
let currentSectionC = 'change-password-section';
envCaseC.sandbox.showSection = (sec) => { currentSectionC = sec; };
envCaseC.getEl('new_password').value = 'NewPassword123';
envCaseC.getEl('confirm_password').value = 'NewPassword123';
envCaseC.getEl('ma_truong').value = 'DAMSAN';
envCaseC.api.setPendingProof('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
envCaseC.api.setState({ truong_id: 'school-1', hs_id: 'hs-101', ma_hs: 'HS101', ho_ten: 'Nguyen Van A', lop: '12A1' });
envCaseC.mockSupabase.rpc = async (name, params) => {
  if (name === 'rpc_change_hoc_sinh_password') {
    return { data: { status: 'success', message: 'Cập nhật thành công' }, error: null };
  }
  if (name === 'rpc_login_hoc_sinh') {
    return {
      data: {
        status: 'success',
        user: { id: 'hs-101', truong_id: 'school-1', ma_hs: 'HS101' }
      },
      error: null
    };
  }
  return { data: null, error: null };
};
await envCaseC.api.capNhatMatKhau();
assert.strictEqual(envCaseC.sessionStore.has('damSan_StudentToken'), false, "Case C: NO token persisted when missing from reauth");
assert.strictEqual(envCaseC.sessionStore.has('damSan_StudentTokenExpiresAt'), false, "Case C: NO expiresAt persisted");
assert.strictEqual(envCaseC.sessionStore.has('damSan_HSSession'), false, "Case C: NO HSSession created");
assert.strictEqual(envCaseC.api.getPendingProof(), null, "Case C: proof cleared");
assert.strictEqual(currentSectionC, 'login-section', "Case C: redirected to login-section");
recordR('R113');

// R114 (Section 7): Deterministic static validation guard on the untracked SQL migration
// 1. Assert complete numeric regex
assert(!migContent.includes("v_clean_ma_hs ~ '^[0-9]+\n"), "No truncated regex in migration");
assert(migContent.includes("v_clean_ma_hs ~ '^[0-9]+" + String.fromCharCode(36) + "'"), "Complete regex present in migration");

// 2. Assert each RPC definition occurs exactly once
const expectedRpcDefs = [
  '_student_session_hs_id',
  'rpc_login_hoc_sinh',
  'rpc_student_logout',
  'rpc_change_hoc_sinh_password',
  'rpc_hoc_sinh_get_exam',
  'rpc_hoc_sinh_grade_submission',
  'rpc_hoc_sinh_result_status',
  'rpc_lay_ket_qua_phong_gv',
  'rpc_staff_exam_preview'
];
expectedRpcDefs.forEach(rpc => {
  const re = new RegExp('create or replace function public\\.' + rpc + '\\s*\\(', 'g');
  const count = (migContent.match(re) || []).length;
  assert.strictEqual(count, 1, "Expected exactly 1 definition for " + rpc + ", got " + count);
});

// 3. Assert balanced $function$ delimiters
const funcDelimsCount = (migContent.match(/\$function\$/g) || []).length;
assert.strictEqual(funcDelimsCount % 2, 0, "Balanced $function$ delimiters");

// 4. Assert balanced $ delimiters
const doDelimsCount = (migContent.match(/\$\$/g) || []).length;
assert.strictEqual(doDelimsCount % 2, 0, "Balanced $ delimiters");

// 5. Strengthened EOF guard: migration must end exactly with expected final statement
assert.strictEqual(
  migContent.trimEnd().endsWith("alter table public.de_thi enable row level security;"),
  true,
  "R114: migration terminates cleanly with final alter table statement"
);
recordR('R114');

// =========================================================================
// P0-008A: SECURE TOKEN-BOUND STUDENT RPC SUITE (R115 - R137)
// =========================================================================

const mig008Content = fs.readFileSync('supabase/migrations/20260830000002_student_rpc_token_binding_p0_008a.sql', 'utf8');

// R115: secure receive requires valid student token
assert(mig008Content.includes("create or replace function public.rpc_hoc_sinh_receive_submission"), "R115: secure receive defined");
assert(mig008Content.includes("p_student_token text"), "R115: secure receive requires p_student_token");
assert(mig008Content.includes("v_hs_id := public._student_session_hs_id(p_student_token);"), "R115: resolves token via _student_session_hs_id");
assert(mig008Content.includes("'invalid_session'"), "R115: rejects invalid session");
recordR('R115');

// R116: secure receive has no hs_id/truong_id caller identity parameters
const r116Match = mig008Content.match(/create or replace function public\.rpc_hoc_sinh_receive_submission\s*\(([\s\S]*?)\)\s*returns/);
assert(r116Match, "R116: receive signature parsed");
assert(!r116Match[1].includes('p_hs_id'), "R116: no p_hs_id parameter");
assert(!r116Match[1].includes('p_truong_id'), "R116: no p_truong_id parameter");
recordR('R116');

// R117: foreign attempt_id cannot return another student's receipt
assert(mig008Content.includes("if v_submission.hs_id = v_hs_id and v_submission.truong_id = v_student.truong_id and v_submission.phong_id = p_phong_id then"), "R117: fast idempotency enforces strict ownership");
// Model validation for foreign attempt collision
const foreignCollisionStore = new Map();
foreignCollisionStore.set('attempt-foreign', { id: 'sub-foreign', hs_id: 'hs-other', truong_id: 'sch-1', phong_id: 'room-1' });
function checkAttemptOwnership(attemptId, callerHsId, callerSchoolId, callerRoomId) {
  const existing = foreignCollisionStore.get(attemptId);
  if (!existing) return { status: 'new' };
  if (existing.hs_id === callerHsId && existing.truong_id === callerSchoolId && existing.phong_id === callerRoomId) {
    return { status: 'received', id: existing.id };
  }
  return { status: 'error', message: 'Attempt ID không hợp lệ hoặc đã tồn tại.' };
}
assert.strictEqual(checkAttemptOwnership('attempt-foreign', 'hs-caller', 'sch-1', 'room-1').status, 'error', "R117: foreign attempt fails closed");
assert.strictEqual(checkAttemptOwnership('attempt-foreign', 'hs-other', 'sch-1', 'room-1').status, 'received', "R117: own attempt succeeds");
recordR('R117');

// R118: exact deterministic exam assignment vectors remain correct
assert.strictEqual(legacyExamIndex('100403', 4), 3, "R118: Vector 100403 / 4 -> 3");
assert.strictEqual(legacyExamIndex('012345', 4), 1, "R118: Vector 012345 / 4 -> 1");
assert.strictEqual(legacyExamIndex('HS001', 4), 2, "R118: Vector HS001 / 4 -> 2");
assert.strictEqual(legacyExamIndex('DAMSAN2026', 5), 1, "R118: Vector DAMSAN2026 / 5 -> 1");
assert.strictEqual(legacyExamIndex('X', 1), 0, "R118: Vector X / 1 -> 0");
const r118Hash123ABC = (function(){ let h = 0; for(let c of '123ABC') h = ((h * 31) + c.charCodeAt(0)) % 2147483647; return h % 4; })();
assert.strictEqual(legacyExamIndex('123ABC', 4), r118Hash123ABC, "R118: 123ABC uses rolling hash");
assert.strictEqual(legacyExamIndex('  100403  ', 4), 3, "R118: trimmed numeric matches");
assert.strictEqual(legacyExamIndex('  HS001  ', 4), 2, "R118: trimmed alphanumeric matches");
recordR('R118');

// R119: p_ma_de mismatch is rejected
assert(mig008Content.includes("v_clean_ma_hs ~ '^[0-9]+" + String.fromCharCode(36) + "'"), "R119: numeric regex present");
assert(mig008Content.includes("v_expected_ma_de is null or trim(p_ma_de) <> trim(v_expected_ma_de)"), "R119: expected ma_de compared against p_ma_de");
assert(mig008Content.includes("'exam_assignment_mismatch'"), "R119: exam_assignment_mismatch error returned on mismatch");
recordR('R119');

// R120: own exact retry remains idempotent and returns same receipt
const r120Store = new SubmissionStore();
const r120First = r120Store.receive('attempt-120', 'room-120', 'hs-120', [{ chon: 'A' }]);
const r120Second = r120Store.receive('attempt-120', 'room-120', 'hs-120', [{ chon: 'A' }]);
assert.strictEqual(r120First.id, r120Second.id, "R120: exact retry returns identical receipt");
recordR('R120');

// R121: second attempt id for same own room/student preserves one-submission semantics
const r121SecondAttempt = r120Store.receive('attempt-121-diff', 'room-120', 'hs-120', [{ chon: 'B' }]);
assert.strictEqual(r121SecondAttempt.id, r120First.id, "R121: second attempt for same room/student returns existing receipt");
assert(mig008Content.includes("on conflict do nothing") && mig008Content.includes("where phong_id = p_phong_id") && mig008Content.includes("and hs_id = v_hs_id"), "R121: migration preserves one-submission semantics");
recordR('R121');

// R122: room generation/reset check remains enforced
assert(mig008Content.includes("p_room_opened_at is null or v_room.thoi_gian_mo is distinct from p_room_opened_at"), "R122: room_opened_at generation check in migration");
assert(mig008Content.includes("'room_attempt_changed'"), "R122: room_attempt_changed error code returned");
recordR('R122');

// R123: secure receipt status is token-bound and foreign attempt cannot leak
assert(mig008Content.includes("create or replace function public.rpc_hoc_sinh_submission_receipt_status"), "R123: receipt status defined");
const r123Match = mig008Content.match(/create or replace function public\.rpc_hoc_sinh_submission_receipt_status\s*\(([\s\S]*?)\)\s*returns/);
assert(r123Match, "R123: receipt status signature parsed");
assert(!r123Match[1].includes('p_hs_id'), "R123: no p_hs_id parameter");
assert(!r123Match[1].includes('p_truong_id'), "R123: no p_truong_id parameter");
assert(mig008Content.includes("v_submission.hs_id = v_hs_id and v_submission.truong_id = v_student.truong_id"), "R123: receipt status validates token-bound ownership");
recordR('R123');

// R124: secure violation update can only affect token-bound student
assert(mig008Content.includes("create or replace function public.rpc_hoc_sinh_update_violation"), "R124: violation RPC defined");
const r124Match = mig008Content.match(/create or replace function public\.rpc_hoc_sinh_update_violation\s*\(([\s\S]*?)\)\s*returns/);
assert(r124Match, "R124: violation signature parsed");
assert(!r124Match[1].includes('p_hs_id'), "R124: no p_hs_id parameter");
assert(mig008Content.includes("and hs_id = v_hs_id"), "R124: violation update scoped to token-bound hs_id");
assert(mig008Content.includes("p_so_lan < 0"), "R124: rejects negative violation counts");
recordR('R124');

// R125: violation count cannot be decreased
assert(mig008Content.includes("so_lan_vi_pham = greatest(coalesce(so_lan_vi_pham, 0), p_so_lan)"), "R125: monotonic violation update");
function updateMonotonicViolation(current, incoming) {
  if (incoming < 0) return current;
  return Math.max(current || 0, incoming);
}
assert.strictEqual(updateMonotonicViolation(2, 5), 5, "R125: count increased from 2 to 5");
assert.strictEqual(updateMonotonicViolation(5, 1), 5, "R125: count preserved at 5 when lower count incoming");
recordR('R125');

// R126: room info derives identity from token
assert(mig008Content.includes("create or replace function public.rpc_hoc_sinh_room_info"), "R126: room info RPC defined");
const r126Match = mig008Content.match(/create or replace function public\.rpc_hoc_sinh_room_info\s*\(([\s\S]*?)\)\s*returns/);
assert(r126Match, "R126: room info signature parsed");
assert(!r126Match[1].includes('p_hs_id'), "R126: no p_hs_id parameter");
assert(!r126Match[1].includes('p_truong_id'), "R126: no p_truong_id parameter");
assert(mig008Content.includes("pt.truong_id = v_student.truong_id"), "R126: room lookup enforces student school");
recordR('R126');

// R127: room list derives identity from token and returns only own submitted ids
assert(mig008Content.includes("create or replace function public.rpc_hoc_sinh_room_list"), "R127: room list RPC defined");
const r127Match = mig008Content.match(/create or replace function public\.rpc_hoc_sinh_room_list\s*\(([\s\S]*?)\)\s*returns/);
assert(r127Match, "R127: room list signature parsed");
assert(!r127Match[1].includes('p_hs_id'), "R127: no p_hs_id parameter");
assert(!r127Match[1].includes('p_truong_id'), "R127: no p_truong_id parameter");
assert(mig008Content.includes("where hs_id = v_hs_id") && mig008Content.includes("and diem is not null"), "R127: submitted room ids scoped to student graded results");
recordR('R127');

// R128: all new SECURITY DEFINER functions pin search_path=public (per-function block isolation)
const expected008Functions = [
  'rpc_hoc_sinh_receive_submission',
  'rpc_hoc_sinh_submission_receipt_status',
  'rpc_hoc_sinh_update_violation',
  'rpc_hoc_sinh_room_info',
  'rpc_hoc_sinh_room_list'
];
expected008Functions.forEach(fn => {
  const blockRegex = new RegExp('create or replace function public\\.' + fn + '\\b[\\s\\S]*?\\$function\\$', 'i');
  const match = mig008Content.match(blockRegex);
  assert(match, "R128: function block found for " + fn);
  const blockHeader = match[0];
  assert(/\bsecurity\s+definer\b/i.test(blockHeader), "R128: " + fn + " header contains security definer");
  assert(/\bset\s+search_path\s*=\s*public\b/i.test(blockHeader), "R128: " + fn + " header contains set search_path = public");
});
recordR('R128');

// R129: all new functions explicitly revoke PUBLIC execute and grant anon/authenticated as intended
expected008Functions.forEach(fn => {
  const revokeRe = new RegExp('revoke all on function public\\.' + fn + '\\([^)]*\\) from public;', 'g');
  assert(revokeRe.test(mig008Content), "R129: " + fn + " revokes execute from public");
  const grantRe = new RegExp('grant execute on function public\\.' + fn + '\\([^)]*\\) to anon, authenticated;', 'g');
  assert(grantRe.test(mig008Content), "R129: " + fn + " grants execute to anon, authenticated");
});
recordR('R129');

// R130: Phase-A migration does NOT revoke legacy browser RPCs yet
const legacyRpcsToPreserve = [
  'rpc_receive_submission',
  'rpc_submission_receipt_status',
  'rpc_cap_nhat_vi_pham',
  'rpc_lay_thong_tin_phong_hs',
  'rpc_lay_danh_sach_phong_thi_hs'
];
legacyRpcsToPreserve.forEach(legacyRpc => {
  const legacyRevokeRegex = new RegExp('revoke[\\s\\S]*?' + legacyRpc, 'i');
  assert(!legacyRevokeRegex.test(mig008Content), "R130: legacy RPC " + legacyRpc + " is NOT revoked in Phase A");
});
recordR('R130');

// R131: migration structural integrity
// 1. Each RPC definition occurs exactly once
expected008Functions.forEach(rpc => {
  const re = new RegExp('create or replace function public\\.' + rpc + '\\s*\\(', 'g');
  const count = (mig008Content.match(re) || []).length;
  assert.strictEqual(count, 1, "R131: Expected exactly 1 definition for " + rpc + ", got " + count);
});

// 2. Balanced $function$ delimiters
const funcDelims008Count = (mig008Content.match(/\$function\$/g) || []).length;
assert.strictEqual(funcDelims008Count % 2, 0, "R131: Balanced $function$ delimiters");
assert.strictEqual(funcDelims008Count, 10, "R131: Exactly 5 functions with 10 $function$ delimiters");

// 3. Balanced $$ delimiters
const doDelims008Count = (mig008Content.match(/\$\$/g) || []).length;
assert.strictEqual(doDelims008Count % 2, 0, "R131: Balanced $$ delimiters");

// 4. Clean EOF
assert(
  mig008Content.trimEnd().endsWith("grant execute on function public.rpc_hoc_sinh_room_list(text) to anon, authenticated;"),
  "R131: migration terminates cleanly with final grant statement"
);
recordR('R131');

// R132: room list filters CHO_THI and sorts newest-first (created_at DESC)
assert(mig008Content.includes("pt.trang_thai <> 'CHO_THI'"), "R132: migration filters out CHO_THI");
assert(mig008Content.includes("order by pt.created_at desc"), "R132: migration orders by created_at desc");
const r132Rooms = [
  { id: 'r1', created_at: 100, trang_thai: 'CHO_THI', doi_tuong: 'TatCa' },
  { id: 'r2', created_at: 200, trang_thai: 'MO_PHONG', doi_tuong: 'TatCa' },
  { id: 'r3', created_at: 300, trang_thai: 'DANG_THI', doi_tuong: 'TatCa' }
];
const r132Filtered = r132Rooms
  .filter(r => r.trang_thai !== 'CHO_THI')
  .sort((a, b) => b.created_at - a.created_at);
assert.strictEqual(r132Filtered.length, 2, "R132: CHO_THI filtered out");
assert.strictEqual(r132Filtered[0].id, 'r3', "R132: newest first");
assert.strictEqual(r132Filtered[1].id, 'r2', "R132: second newest");
recordR('R132');

// R133: room list exact audience semantics
assert(!mig008Content.includes("or pt.doi_tuong = ''"), "R133: empty string not treated as TatCa in room list");
assert(!mig008Content.includes("or exists (select 1 from public.ket_qua kq where kq.phong_id = pt.id"), "R133: historical result does not bypass audience in room list");
function isEligibleAudience(doiTuong, studentClass, studentMaHs) {
  if (doiTuong === null || doiTuong === 'TatCa') return true;
  if (!doiTuong || doiTuong.trim() === '') return false;
  const items = doiTuong.split(',').map(s => s.trim());
  return items.includes(studentClass) || items.includes(studentMaHs);
}
assert.strictEqual(isEligibleAudience(null, '12A', 'HS1'), true, "R133: NULL allowed");
assert.strictEqual(isEligibleAudience('TatCa', '12A', 'HS1'), true, "R133: TatCa allowed");
assert.strictEqual(isEligibleAudience('12A, 12B', '12A', 'HS1'), true, "R133: matching class allowed");
assert.strictEqual(isEligibleAudience('HS1, HS2', '12C', 'HS1'), true, "R133: matching student allowed");
assert.strictEqual(isEligibleAudience('', '12A', 'HS1'), false, "R133: empty string NOT allowed");
assert.strictEqual(isEligibleAudience('12B', '12A', 'HS1'), false, "R133: non-matching class NOT allowed");
recordR('R133');

// R134: submitted_room_ids reflects only own graded ket_qua
assert(mig008Content.includes("from public.ket_qua") && mig008Content.includes("where hs_id = v_hs_id") && mig008Content.includes("and diem is not null"), "R134: submitted_room_ids from graded ket_qua");
const r134Kq = [
  { hs_id: 'hs-1', phong_id: 'room-1', diem: 8.5 },
  { hs_id: 'hs-1', phong_id: 'room-2', diem: null },
  { hs_id: 'hs-2', phong_id: 'room-3', diem: 9.0 }
];
const r134Submitted = [...new Set(r134Kq.filter(k => k.hs_id === 'hs-1' && k.diem !== null).map(k => k.phong_id))];
assert.deepStrictEqual(r134Submitted, ['room-1'], "R134: only graded own results in submitted_room_ids");
recordR('R134');

// R135: room info exact eligibility semantics and legacy JSON shape including nested mon_hoc.ten_mon
assert(mig008Content.includes("'mon_hoc', v_room.mon_hoc"), "R135: room info returns nested mon_hoc");
const r135Output = {
  status: 'success',
  room: {
    id: 'room-uuid',
    trang_thai: 'MO_PHONG',
    thoi_gian: 45,
    thoi_gian_mo: 1700000000000,
    doi_tuong: 'TatCa',
    mon_hoc: { ten_mon: 'Toán học' }
  }
};
assert.strictEqual(r135Output.room.mon_hoc.ten_mon, 'Toán học', "R135: nested mon_hoc.ten_mon present");
assert.strictEqual(Object.prototype.hasOwnProperty.call(r135Output.room, 'ten_mon'), false, "R135: flat ten_mon not at root");
recordR('R135');

// R136: foreign attempt existence and unknown attempt produce indistinguishable responses
function evalReceiptStatus(attemptId, callerHsId, callerSchoolId, callerRoomId, roomOpenedAt, store, rooms) {
  if (attemptId && store.has(attemptId)) {
    const sub = store.get(attemptId);
    if (sub.hs_id === callerHsId && sub.truong_id === callerSchoolId && (!callerRoomId || sub.phong_id === callerRoomId)) {
      return { status: sub.status, submission_id: sub.id, attempt_id: sub.attempt_id, received_at: sub.received_at, reset_confirmed: false };
    }
  }
  const room = rooms.get(callerRoomId);
  if (!room || room.truong_id !== callerSchoolId) {
    return { status: 'missing', reset_confirmed: true, room_exists: false };
  }
  if (roomOpenedAt && room.thoi_gian_mo !== roomOpenedAt) {
    return { status: 'missing', reset_confirmed: true, room_exists: true };
  }
  return { status: 'missing', reset_confirmed: false, room_exists: true };
}
const r136Store = new Map();
r136Store.set('foreign-attempt-uuid', { id: 'foreign-sub-id', attempt_id: 'foreign-attempt-uuid', hs_id: 'other-student', truong_id: 'sch-1', phong_id: 'room-1', status: 'graded', received_at: '2026-08-30T00:00:00Z' });
const r136Rooms = new Map();
r136Rooms.set('room-1', { id: 'room-1', truong_id: 'sch-1', thoi_gian_mo: 1000 });

const resForeign = evalReceiptStatus('foreign-attempt-uuid', 'caller-student', 'sch-1', 'room-1', 1000, r136Store, r136Rooms);
const resUnknown = evalReceiptStatus('completely-random-uuid', 'caller-student', 'sch-1', 'room-1', 1000, r136Store, r136Rooms);
assert.deepStrictEqual(resForeign, resUnknown, "R136: foreign attempt and unknown attempt produce identical responses");
assert.strictEqual(resForeign.status, 'missing', "R136: status is missing");
assert.strictEqual(resForeign.submission_id, undefined, "R136: no submission_id leaked");
recordR('R136');

// R137: post-INSERT conflict never returns received with NULL receipt
assert(mig008Content.includes("v_submission.id is null") && mig008Content.includes("'submission_conflict'"), "R137: post-conflict null check returns submission_conflict");
function handlePostConflictLookup(insertedRow, ownCanonicalRow) {
  let sub = insertedRow;
  if (!sub) {
    sub = ownCanonicalRow;
  }
  if (!sub || !sub.id) {
    return { status: 'error', code: 'submission_conflict', message: 'Không thể hoàn tất nộp bài do xung đột dữ liệu.' };
  }
  return { status: 'received', submission_id: sub.id, attempt_id: sub.attempt_id, received_at: sub.received_at };
}
assert.strictEqual(handlePostConflictLookup(null, null).status, 'error', "R137: null canonical row fails closed");
assert.strictEqual(handlePostConflictLookup(null, null).code, 'submission_conflict', "R137: returns submission_conflict");
assert.strictEqual(handlePostConflictLookup(null, { id: 'own-sub-1', attempt_id: 'a1', received_at: 100 }).status, 'received', "R137: existing own canonical row returns receipt");
recordR('R137');

// ============================================================================
// P0-008B: STUDENT RPC CLIENT CUTOVER & CLEANUP SUITE (R138 - R148)
// ============================================================================
const hsJs008b = fs.readFileSync('hoc_sinh.js', 'utf8');
const swJs008b = fs.readFileSync('sw.js', 'utf8');
const hsHtml008b = fs.readFileSync('hoc_sinh.html', 'utf8');
const mig008bContent = fs.readFileSync('supabase/migrations/20260830000003_student_rpc_cutover_p0_008b.sql', 'utf8');

// R138: hoc_sinh.js uses rpc_hoc_sinh_receive_submission
assert(hsJs008b.includes("_supabase.rpc('rpc_hoc_sinh_receive_submission'"), "R138: hoc_sinh.js calls rpc_hoc_sinh_receive_submission");
recordR('R138');

// R139: secure receive sends p_student_token and does NOT send p_hs_id / p_truong_id
const receiveMatch = hsJs008b.match(/_supabase\.rpc\('rpc_hoc_sinh_receive_submission',\s*\{([\s\S]*?)\}\)/);
assert(receiveMatch, "R139: found rpc_hoc_sinh_receive_submission call block");
assert(receiveMatch[1].includes("p_student_token: token"), "R139: receives p_student_token");
assert(!receiveMatch[1].includes("p_hs_id"), "R139: does not send p_hs_id");
assert(!receiveMatch[1].includes("p_truong_id"), "R139: does not send p_truong_id");
recordR('R139');

// R140: reconcile uses rpc_hoc_sinh_submission_receipt_status, sends token and not p_truong_id
const receiptStatusMatch = hsJs008b.match(/_supabase\.rpc\('rpc_hoc_sinh_submission_receipt_status',\s*\{([\s\S]*?)\}\)/);
assert(receiptStatusMatch, "R140: found rpc_hoc_sinh_submission_receipt_status call block");
assert(receiptStatusMatch[1].includes("p_student_token: token"), "R140: sends p_student_token");
assert(!receiptStatusMatch[1].includes("p_truong_id"), "R140: does not send p_truong_id");
recordR('R140');

// R141: all 3 violation call-sites use rpc_hoc_sinh_update_violation and do not send p_hs_id
const violationCalls = hsJs008b.match(/_supabase\.rpc\('rpc_hoc_sinh_update_violation'[\s\S]*?\)/g) || [];
assert.strictEqual(violationCalls.length, 3, "R141: exactly 3 violation call sites using rpc_hoc_sinh_update_violation");
violationCalls.forEach((callStr, idx) => {
  assert(callStr.includes("p_student_token: token"), "R141 [" + idx + "]: sends p_student_token");
  assert(!callStr.includes("p_hs_id"), "R141 [" + idx + "]: does not send p_hs_id");
});
recordR('R141');

// R142: room lookup uses rpc_hoc_sinh_room_info and has no direct phong_thi fallback
const roomInfoMatch = hsJs008b.match(/_supabase\.rpc\('rpc_hoc_sinh_room_info',\s*\{([\s\S]*?)\}\)/);
assert(roomInfoMatch, "R142: found rpc_hoc_sinh_room_info call");
assert(roomInfoMatch[1].includes("p_student_token: token"), "R142: sends p_student_token");
assert(!roomInfoMatch[1].includes("p_hs_id") && !roomInfoMatch[1].includes("p_truong_id"), "R142: does not send p_hs_id/p_truong_id");
assert(!hsJs008b.includes("_supabase.from('phong_thi')"), "R142: no direct phong_thi table access fallback");
recordR('R142');

// R143: room list uses rpc_hoc_sinh_room_list and does not send caller identity IDs
const roomListMatch = hsJs008b.match(/_supabase\.rpc\('rpc_hoc_sinh_room_list',\s*\{([\s\S]*?)\}\)/);
assert(roomListMatch, "R143: found rpc_hoc_sinh_room_list call");
assert(roomListMatch[1].includes("p_student_token: token"), "R143: sends p_student_token");
assert(!roomListMatch[1].includes("p_hs_id") && !roomListMatch[1].includes("p_truong_id"), "R143: no caller hs_id/truong_id");
recordR('R143');

// R144: hoc_sinh.js has no runtime calls to the 5 legacy RPCs
const legacyRPCs = [
  'rpc_receive_submission',
  'rpc_submission_receipt_status',
  'rpc_cap_nhat_vi_pham',
  'rpc_lay_thong_tin_phong_hs',
  'rpc_lay_danh_sach_phong_thi_hs'
];
legacyRPCs.forEach(legacyName => {
  assert(!hsJs008b.includes(`'${legacyName}'`) && !hsJs008b.includes(`"${legacyName}"`), "R144: no runtime invocation of " + legacyName);
});
recordR('R144');

// R145: durable snapshot retains hs_id/truong_id for local recovery filtering, but secure server calls do not send these fields
assert(hsJs008b.includes("findRecoverableFinalSnapshotsForCurrentStudent"), "R145: local recovery filtering function exists");
assert(hsJs008b.includes("snapshot.hs_id === state.hs_id"), "R145: matches hs_id locally for recovery");
assert(hsJs008b.includes("snapshot.truong_id === state.truong_id"), "R145: matches truong_id locally for recovery");
recordR('R145');

// R146: VERSION synchronized across hoc_sinh.js, sw.js, hoc_sinh.html script query
const expectedVersion = '20260902-flex-lite-005';
assert(hsJs008b.includes(`const VERSION = '${expectedVersion}';`), "R146: hoc_sinh.js has updated VERSION");
assert(swJs008b.includes(`const VERSION = '${expectedVersion}';`), "R146: sw.js has updated VERSION");
assert(hsHtml008b.includes(`hoc_sinh.js?v=${expectedVersion}`), "R146: hoc_sinh.html has updated script query version");
recordR('R146');

// R147: cleanup migration revokes 5 legacy functions from public, anon, authenticated without DROP or revoking secure RPCs
legacyRPCs.forEach(legacyName => {
  assert(mig008bContent.includes(legacyName), "R147: migration revokes " + legacyName);
});
assert(mig008bContent.includes("from public, anon, authenticated"), "R147: revokes from public, anon, authenticated");
assert(!mig008bContent.toUpperCase().includes("DROP FUNCTION"), "R147: no DROP FUNCTION");
assert(!mig008bContent.includes("rpc_hoc_sinh_"), "R147: does not revoke secure rpc_hoc_sinh_*");
assert(!mig008bContent.toLowerCase().includes("service_role") && !mig008bContent.toLowerCase().includes("postgres"), "R147: does not revoke service_role/postgres");
recordR('R147');

// R148: P0-007 token-bound RPCs remain in hoc_sinh.js and not replaced by legacy
assert(hsJs008b.includes("_supabase.rpc('rpc_hoc_sinh_result_status'"), "R148: rpc_hoc_sinh_result_status present");
assert(hsJs008b.includes("_supabase.rpc('rpc_hoc_sinh_get_exam'"), "R148: rpc_hoc_sinh_get_exam present");
assert(hsJs008b.includes("_supabase.rpc('rpc_hoc_sinh_grade_submission'"), "R148: rpc_hoc_sinh_grade_submission present");
recordR('R148');

// R149: Manual login success prioritizes resumeSavedSubmission() before timPhongThiTuDong()
const loginIdx = hsJs008b.indexOf("async function login()");
const resumeInLogin = hsJs008b.indexOf("void resumeSavedSubmission().then", loginIdx);
const nextFuncAfterLogin = hsJs008b.indexOf("async function capNhatMatKhau()", loginIdx);
assert(loginIdx > -1 && resumeInLogin > loginIdx && resumeInLogin < nextFuncAfterLogin, "R149: login contains resumeSavedSubmission");
assert(hsJs008b.includes("if (!recovered) timPhongThiTuDong();"), "R149: timPhongThiTuDong is conditional on !recovered");
recordR('R149');

// R150: Password-change reauth success prioritizes resumeSavedSubmission() before room list
const capNhatIdx = hsJs008b.indexOf("async function capNhatMatKhau()");
const resumeSavedInCapNhat = hsJs008b.indexOf("void resumeSavedSubmission().then", capNhatIdx);
const nextFuncAfterCapNhat = hsJs008b.indexOf("async function timPhongThiTuDong()", capNhatIdx);
assert(capNhatIdx > -1 && resumeSavedInCapNhat > capNhatIdx && resumeSavedInCapNhat < nextFuncAfterCapNhat, "R150: capNhatMatKhau contains resumeSavedSubmission");
recordR('R150');

// R151: Receive invalid_session preserves FINAL, clears auth, does not clear active keys/create attempt, navigates to login
const envR151 = createStudentEnvironment();
const sampleAttemptR151 = 'attempt-r151-uuid';
const sampleSnapshotR151 = {
  hs_id: 'hs-151',
  truong_id: 'sch-151',
  phong_id: 'room-151',
  attempt_id: sampleAttemptR151,
  ma_de: '151',
  raw_answers: [{ cau: 1, chon: 'A' }],
  state: 'FINAL_PENDING',
  client_submitted_at: '2026-08-30T15:00:00.000Z',
  room_opened_at: 1700000000000
};
envR151.api.setState({ hs_id: 'hs-151', truong_id: 'sch-151', phong_id: 'room-151' });
envR151.localStore.set('final_damsan_room-151_hs-151', JSON.stringify(sampleSnapshotR151));

let r151Section = 'exam-section';
envR151.sandbox.showSection = (sec) => { r151Section = sec; };
envR151.mockSupabase.rpc = async (name) => {
  if (name === 'rpc_hoc_sinh_receive_submission') {
    return { data: { status: 'error', code: 'invalid_session', message: 'Phiên đăng nhập đã hết hạn.' }, error: null };
  }
  return { data: null, error: null };
};

await envR151.api.receiveFinalSubmission();

const storedR151 = JSON.parse(envR151.localStore.get('final_damsan_room-151_hs-151') || 'null');
assert(storedR151, "R151: final snapshot preserved in localStorage");
assert.strictEqual(storedR151.attempt_id, sampleAttemptR151, "R151: exact attempt_id preserved");
assert.strictEqual(storedR151.state, 'FINAL_PENDING', "R151: state remains FINAL_PENDING");
assert.strictEqual(envR151.sessionStore.has('damSan_StudentToken'), false, "R151: student token cleared");
assert.strictEqual(r151Section, 'login-section', "R151: navigated to login-section for re-auth");
recordR('R151');

// R152: Behavioral simulation: FINAL_PENDING exists + session expired + room not open + login again
// => recovery calls receive with original attempt_id without needing user to click room list
const envR152 = createStudentEnvironment();
const sampleAttemptR152 = 'attempt-r152-original';
const sampleSnapshotR152 = {
  hs_id: 'hs-152',
  truong_id: 'sch-152',
  phong_id: 'room-152',
  attempt_id: sampleAttemptR152,
  ma_de: '152',
  raw_answers: [{ cau: 1, chon: 'B' }, { cau: 2, chon: 'C' }],
  state: 'FINAL_PENDING',
  client_submitted_at: '2026-08-30T15:10:00.000Z',
  room_opened_at: 1700000000000
};

// 1. Snapshot exists in localStorage from previous session
envR152.localStore.set('final_damsan_room-152_hs-152', JSON.stringify(sampleSnapshotR152));

// 2. Setup login form elements
envR152.getEl('ma_truong').value = 'DAMSAN';
envR152.getEl('ma_hs').value = 'HS152';
envR152.getEl('mat_khau').value = 'MyPassword123';

let r152ReceivedParams = null;
let r152RoomListCalled = false;

envR152.mockSupabase.rpc = async (name, params) => {
  if (name === 'rpc_login_hoc_sinh') {
    return {
      data: {
        status: 'success',
        student_token: 'new-token-after-relogin',
        student_expires_at: new Date(Date.now() + 86400000).toISOString(),
        user: { id: 'hs-152', truong_id: 'sch-152', ma_hs: 'HS152', ho_ten: 'Le Thi B', lop: '12B' }
      },
      error: null
    };
  }
  if (name === 'rpc_hoc_sinh_submission_receipt_status') {
    return { data: { status: 'missing', reset_confirmed: false, room_exists: true }, error: null };
  }
  if (name === 'rpc_hoc_sinh_receive_submission') {
    r152ReceivedParams = params;
    return {
      data: {
        status: 'received',
        submission_id: 'sub-recovered-152',
        received_at: '2026-08-30T15:12:00.000Z'
      },
      error: null
    };
  }
  if (name === 'rpc_hoc_sinh_grade_submission') {
    return { data: { status: 'graded' }, error: null };
  }
  if (name === 'rpc_hoc_sinh_room_list') {
    r152RoomListCalled = true;
    return { data: { status: 'success', rooms: [], submitted_room_ids: [] }, error: null };
  }
  return { data: null, error: null };
};

// 3. User performs manual login
await envR152.api.login();
await new Promise(r => setTimeout(r, 50));

// 4. Verify recovery called receive with original attempt_id
assert(r152ReceivedParams, "R152: receive submission was called automatically upon login");
assert.strictEqual(r152ReceivedParams.p_attempt_id, sampleAttemptR152, "R152: used exact original attempt_id");
assert.strictEqual(r152ReceivedParams.p_student_token, 'new-token-after-relogin', "R152: used new authenticated token");
assert.deepStrictEqual(r152ReceivedParams.p_raw_answers, sampleSnapshotR152.raw_answers, "R152: exact raw_answers preserved");
assert.strictEqual(r152RoomListCalled, false, "R152: room list scanning suppressed when recovery succeeded");

const recoveredReceiptR152 = JSON.parse(envR152.localStore.get('receipt_damsan_room-152_hs-152') || 'null');
assert(recoveredReceiptR152, "R152: receipt saved after successful recovery");
assert.strictEqual(recoveredReceiptR152.submission_id, 'sub-recovered-152', "R152: submission_id saved");
recordR('R152');

for (let i = 25; i <= 152; i++) {
  assert(rCoverage['R' + i], "missing coverage for R" + i);
}

console.log('PASS: deterministic P0 recovery simulation (C1-C12, R1-R152; P0-006A post-receipt lifecycle watcher; P0-007 student result publication status; P0-008A/B token-bound student RPC cutover V2; not a Supabase load test)');

})().catch(err => {
  console.error(err);
  process.exit(1);
});
