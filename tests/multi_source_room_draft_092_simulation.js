const assert = require('assert');
const fs = require('fs');

const js = fs.readFileSync('giaovien.js', 'utf8');
const html = fs.readFileSync('giaovien.html', 'utf8');

function functionBody(name) {
  const patterns = [`async function ${name}`, `function ${name}`];
  let start = -1;
  for (const p of patterns) {
    start = js.indexOf(p);
    if (start >= 0) break;
  }
  assert(start >= 0, `Missing function ${name}`);
  const open = js.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}') {
      depth--;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  throw new Error('Unclosed function ' + name);
}

console.log('=== MULTI-SOURCE ROOM DRAFT 092 ===');

// 01-05: feature boundary and rollback.
assert(js.includes('const MULTI_SOURCE_ROOM_DRAFT_ENABLED = true;'), 'MS092-01 feature flag missing');
assert(html.includes('id="legacyRoomExamDirectPushBtn"') && html.includes('onclick="layDeTuIframe(this)"'), 'MS092-02 legacy direct push must remain in DOM');
assert(html.includes('id="roomExamDraftPanel"') && html.includes('id="btnAddMixerBatchToDraft"') && html.includes('id="btnPublishRoomExamDraft"'), 'MS092-03 draft UI missing');
assert(html.indexOf('id="roomExamDraftPanel"') < html.indexOf('id="frameV8"'), 'MS092-04 draft UI must stay outside mixer iframe');
assert(html.includes('Tron_De_Trac_Nghiem_V8.html?v=20261103-preview-scroll-095'), 'MS092-05 print/mixer 091 must remain unchanged');

// 06-09: local-only draft storage.
assert(js.includes("ROOM_EXAM_DRAFT_DB_NAME = 'damsan_room_exam_drafts_v1'"), 'MS092-06 IndexedDB draft store missing');
assert(js.includes("db.createObjectStore(ROOM_EXAM_DRAFT_STORE, { keyPath: 'key' })"), 'MS092-07 IndexedDB object store missing');
assert(js.includes("[ROOM_EXAM_DRAFT_SCHEMA, teacherKey, schoolId, monId, roomSetKey].join('::')"), 'MS092-08 draft key must bind teacher/school/subject/room-set');
assert(functionBody('initMultiSourceRoomDraftUi').includes("legacyBtn.style.display = supported ? 'none' : 'inline-block'"), 'MS092-09 unsupported/disabled feature must reveal legacy flow');

// 10-14: add-to-draft must never write server and must validate aggregate safety.
const addBody = functionBody('themDeHienTaiVaoBoDePhong');
assert(!addBody.includes('luuDeThiLenSupabase('), 'MS092-10 add batch must not write server');
assert(addBody.includes('roomExamDraftPut(draft)'), 'MS092-11 add batch must persist draft locally');
assert(addBody.includes('duplicated.length'), 'MS092-12 duplicate codes must be rejected');
assert(addBody.includes('roomExamDraftConfigSignature(draft.assessmentConfig)'), 'MS092-13 assessment config mismatch guard missing');
assert(addBody.includes('validateFlexLiteAssessmentForSave(prospective, draft.assessmentConfig)'), 'MS092-14 combined structure validation missing');

// 15-19: publish is exactly one atomic call; delete draft only after success.
const publishBody = functionBody('dayBoDePhongLenMayChu');
assert.strictEqual((publishBody.match(/luuDeThiLenSupabase\(/g) || []).length, 1, 'MS092-15 publish must call canonical save exactly once');
assert(publishBody.includes('roomExamDraftCombinedExams(draft)'), 'MS092-16 publish must combine all source batches');
assert(publishBody.includes('validateFlexLiteAssessmentForSave(combined, draft.assessmentConfig)'), 'MS092-17 publish validates combined payload');
const savePos = publishBody.indexOf('await luuDeThiLenSupabase(combined, draft.assessmentConfig)');
const deletePos = publishBody.indexOf('await roomExamDraftDelete(ctx.key)');
assert(savePos >= 0 && deletePos > savePos, 'MS092-18 draft may be deleted only after successful canonical save');
assert(publishBody.includes('Bộ đề tạm vẫn còn nguyên để thử lại.'), 'MS092-19 failure path must explicitly retain draft');

// 20-22: explicit rollback to old implementation remains possible without DB migration.
assert(addBody.includes('if (!MULTI_SOURCE_ROOM_DRAFT_ENABLED) return layDeTuIframe(btnElement);'), 'MS092-20 add path rollback guard missing');
assert(publishBody.includes('if (!MULTI_SOURCE_ROOM_DRAFT_ENABLED) return layDeTuIframe(btnElement);'), 'MS092-21 publish path rollback guard missing');
const legacyBody = functionBody('layDeTuIframe');
assert(legacyBody.includes('luuDeThiLenSupabase(danhSachDeIframe, assessmentConfig)'), 'MS092-22 legacy direct-push implementation must remain intact');

// 23-26: model 2 originals x 4 codes => 8 unique variants in one final payload.
function codes(exams) {
  return Array.from(new Set(exams.map(q => String(q.MaDe)))).sort((a,b) => a.localeCompare(b, 'vi', {numeric:true}));
}
const source1 = ['101','102','103','104'].flatMap(md => [
  { MaDe: md, Phan: '1', CauSo: 'P1_1' },
  { MaDe: md, Phan: '1', CauSo: 'P1_2' }
]);
const source2 = ['201','202','203','204'].flatMap(md => [
  { MaDe: md, Phan: '1', CauSo: 'P1_1' },
  { MaDe: md, Phan: '1', CauSo: 'P1_2' }
]);
const combined = source1.concat(source2);
assert.deepStrictEqual(codes(combined), ['101','102','103','104','201','202','203','204'], 'MS092-23 two source batches must yield 8 unique codes');
assert.strictEqual(combined.length, 16, 'MS092-24 final payload retains all questions of all 8 variants');
const dup = codes(source1).filter(code => codes(source2).includes(code));
assert.deepStrictEqual(dup, [], 'MS092-25 normal two-source case has no duplicate codes');
const badSource2 = source2.map(q => ({...q, MaDe: q.MaDe === '201' ? '101' : q.MaDe}));
assert(codes(source1).some(code => codes(badSource2).includes(code)), 'MS092-26 duplicate-code model must be detectable');

assert(html.includes('giaovien.js?v=20261103-autoheight-multiroom-094'), 'MS092-27 teacher cache bust missing');

console.log('MULTI_SOURCE_ROOM_DRAFT_092_PASS');
