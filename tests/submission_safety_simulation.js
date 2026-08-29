// Local deterministic model of the P0 receipt/grade/reset contracts. No network.
const assert = require('assert');
const fs = require('fs');

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

const client = fs.readFileSync('hoc_sinh.js', 'utf8');
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
const migration = fs.readFileSync('supabase/migrations/20260828000001_submission_safety_p0.sql', 'utf8').replace(/\r\n/g, '\n');
assert(!migration.includes('v_legacy := public.nop_bai_va_cham_diem'));
assert(migration.includes('rpc_reset_room_results') && migration.includes('rpc_grade_pending_room'));
assert(migration.includes("'room_attempt_changed'"));
assert(migration.includes('string_to_array(v_answer') && migration.includes('for v_part2_index in 1..4'));
assert(migration.includes('insert into public.ket_qua (truong_id, phong_id, hs_id, ma_de, diem, chi_tiet)'));
assert(migration.includes('for share') && migration.includes('for update'));
assert(migration.includes('references public.phong_thi(id) on delete cascade'));
assert(migration.includes('rpc_submission_receipt_status(\n  p_attempt_id uuid,\n  p_truong_id uuid,\n  p_phong_id uuid,\n  p_room_opened_at bigint') && migration.includes("'reset_confirmed', false"));
console.log('PASS: deterministic P0 recovery simulation (C1-C12; not a Supabase load test)');
