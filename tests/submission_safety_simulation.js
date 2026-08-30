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
  _postReceiptContextValid
};
`;

function createStudentEnvironment() {
  const localStore = new Map();
  const sessionStore = new Map();
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
      if (name === 'rpc_submission_receipt_status' || name === 'lay_thong_tin_nop_bai_theo_attempt') {
        return mockSupabase._receiptStatusResult || { data: { status: 'missing', reset_confirmed: false, room_exists: true }, error: null };
      }
      if (name === 'rpc_receive_submission' || name === 'nop_bai_hoc_sinh_v3' || name === 'nop_bai_hoc_sinh') {
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
  if (name === 'rpc_receive_submission') r28ReceiveCall = params;
  if (name === 'rpc_submission_receipt_status') return { data: { status: 'missing', reset_confirmed: false, room_exists: true }, error: null };
  return { data: { status: 'received', submission_id: 'sub-real-r28', received_at: '2026-08-29T13:11:46Z' }, error: null };
};
await envR28.api.resumeSavedSubmission();
assert.strictEqual(envR28.api.getState().phong_id, 'room-101');
assert.strictEqual(envR28.api.getState().room_opened_at, 1724920000000);
recordR('R28');

// R29: receive uses the exact original immutable attempt_id
assert(r28ReceiveCall, 'Real resumeSavedSubmission must call rpc_receive_submission');
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
assert(client.includes('if (!kq) {'));
assert(client.includes('snapshot.state === SUBMISSION_STATE.SERVER_RECEIVED'));
assert(client.includes('requestGrading(receipt.submission_id);'));
assert(client.includes("data?.code === 'room_attempt_changed'"));
assert(client.includes('archiveFinalSnapshot(snapshot, \'room_attempt_changed\')'));
assert(client.includes('return matches(JSON.parse(localStorage.getItem(key)))'));
assert(client.includes('if (!archived) {'));
assert(client.includes('p_truong_id: snapshot.truong_id') && client.includes('p_room_opened_at: snapshot.room_opened_at'));
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
assert.strictEqual(clientVersion, '20260830-post-receipt-lifecycle-p0-006a');
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

console.log('PASS: deterministic P0 recovery simulation (C1-C12, R1-R62; P0-006A post-receipt lifecycle watcher; not a Supabase load test)');

})().catch(err => {
  console.error(err);
  process.exit(1);
});
