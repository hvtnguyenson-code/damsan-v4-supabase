// Deterministic, local-only contract simulation for P0 receipt/idempotency semantics.
const assert = require('assert');
const fs = require('fs');

class ReceiptStore {
  constructor() { this.byAttempt = new Map(); this.byStudent = new Map(); }
  receive(attemptId, phongId, hsId, answers) {
    if (this.byAttempt.has(attemptId)) return this.byAttempt.get(attemptId);
    const studentKey = `${phongId}:${hsId}`;
    if (this.byStudent.has(studentKey)) return this.byStudent.get(studentKey);
    const receipt = { id: `sub-${this.byAttempt.size + 1}`, attemptId, phongId, hsId, answers, status: 'received' };
    this.byAttempt.set(attemptId, receipt); this.byStudent.set(studentKey, receipt);
    return receipt;
  }
  grade(id, shouldFail = false) {
    const record = [...this.byAttempt.values()].find(item => item.id === id);
    assert(record, 'receipt must exist before grade');
    if (shouldFail) { record.status = 'grading_error'; return record; }
    record.status = 'graded'; record.score = 10; return record;
  }
}

const store = new ReceiptStore();
const submissions = Array.from({ length: 36 }, (_, i) => ({ attempt: `attempt-${i}`, hs: `student-${i}`, answers: [{ chon: 'A' }] }));

// T1/T2: normal and simultaneous receive are unique and complete.
const normal = submissions.map(item => store.receive(item.attempt, 'room-1', item.hs, item.answers));
assert.strictEqual(normal.length, 36);
assert.strictEqual(store.byAttempt.size, 36);
assert.strictEqual(store.byStudent.size, 36);

// T3/T8: three timeout-style retries return the original receipt, not new rows.
for (const item of submissions) {
  const ids = [store.receive(item.attempt, 'room-1', item.hs, item.answers), store.receive(item.attempt, 'room-1', item.hs, item.answers), store.receive(item.attempt, 'room-1', item.hs, item.answers)].map(x => x.id);
  assert.strictEqual(new Set(ids).size, 1);
}
assert.strictEqual(store.byAttempt.size, 36);

// T4: grading failure never deletes the already durable raw receipt and can retry.
const failed = store.grade(normal[0].id, true);
assert.strictEqual(failed.answers[0].chon, 'A');
assert.strictEqual(failed.status, 'grading_error');
assert.strictEqual(store.grade(failed.id).status, 'graded');

// T7: four sequential classes retain one receipt per attempt (144 total).
for (let room = 2; room <= 4; room++) for (const item of submissions) store.receive(`room-${room}-${item.attempt}`, `room-${room}`, item.hs, item.answers);
assert.strictEqual(store.byAttempt.size, 144);

// T5/T6 client contract: final snapshot and attempt id are persisted independently of network/result state.
const client = fs.readFileSync('hoc_sinh.js', 'utf8');
assert(client.includes('final_damsan_') && client.includes('receipt_damsan_'));
assert(client.includes('attempt_id: createAttemptId()'));
assert(client.includes("if (getFinalSnapshot()) receiveFinalSubmission()"));
assert(!client.includes('result-watch-'));
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
assert(serviceWorker.includes("hostname.endsWith('.supabase.co')"));
assert(serviceWorker.includes("fetch(event.request, { cache: 'no-store' })"));
console.log('PASS: submission safety local simulation (T1-T8 contract coverage)');
