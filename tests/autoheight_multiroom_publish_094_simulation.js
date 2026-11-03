const assert = require('assert');
const fs = require('fs');

const teacherJs = fs.readFileSync('giaovien.js', 'utf8');
const teacherHtml = fs.readFileSync('giaovien.html', 'utf8');
const mixer = fs.readFileSync('Tron_De_Trac_Nghiem_V8.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261103154000_bulk_room_exam_publish_094.sql', 'utf8');

function body(source, name) {
  const starts = [`async function ${name}`, `function ${name}`];
  let s = -1;
  for (const prefix of starts) {
    s = source.indexOf(prefix);
    if (s >= 0) break;
  }
  assert(s >= 0, 'Missing function ' + name);
  const open = source.indexOf('{', s);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(s, i + 1);
    }
  }
  throw new Error('Unclosed function ' + name);
}

console.log('=== AUTOHEIGHT + MULTIROOM PUBLISH 094 ===');

// Scroll: parent owns the only vertical scrollbar.
assert(teacherHtml.includes('scrolling="no"'), 'A094-01 iframe scrolling=no missing');
assert(teacherHtml.includes('Tron_De_Trac_Nghiem_V8.html?v=20261103-preview-scroll-095'), 'A094-02 iframe cache marker missing');
assert(mixer.includes("type: 'DAMSAN_FRAME_HEIGHT'"), 'A094-03 child height message missing');
assert(mixer.includes("data.type === 'DAMSAN_REQUEST_FRAME_HEIGHT'"), 'A094-04 parent height request handler missing');
assert(mixer.includes("document.documentElement.style.overflowY = 'hidden'"), 'A094-05 embedded root scrollbar must be hidden');
assert(mixer.includes("document.body.style.overflowY = 'hidden'"), 'A094-06 embedded body scrollbar must be hidden');
assert(mixer.includes('new ResizeObserver'), 'A094-07 ResizeObserver auto-height missing');
assert(mixer.includes('new MutationObserver'), 'A094-08 dynamic-content height observer missing');
const autoHeightBody = body(teacherJs, 'initMixerAutoHeight');
assert(autoHeightBody.includes("data.type !== 'DAMSAN_FRAME_HEIGHT'"), 'A094-09 parent height listener missing');
assert(autoHeightBody.includes("currentFrame.style.height = Math.ceil(height + 2) + 'px'"), 'A094-10 parent must resize iframe height');
assert(autoHeightBody.includes("frame.setAttribute('scrolling', 'no')"), 'A094-11 parent must explicitly disable iframe scroll');

// 095: measure stable natural content, never the iframe viewport, so ResizeObserver cannot ratchet height forever.
const childHeightBody = body(mixer, 'getEmbeddedContentHeight');
assert(childHeightBody.includes("document.querySelector('.container')"), 'A095-01 stable content root missing');
assert(childHeightBody.includes('getBoundingClientRect()'), 'A095-02 natural content measurement missing');
assert(!childHeightBody.includes('scrollHeight'), 'A095-03 viewport-coupled scrollHeight must not drive embedded height');
assert(mixer.includes('const height = getEmbeddedContentHeight();'), 'A095-04 height bridge must use stable content measurement');
assert(mixer.includes('max-height:min(1123px, calc(100% - 40px))'), 'A095-05 preview must be capped instead of stretching the page');
assert(mixer.includes('overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; scrollbar-gutter:stable;'), 'A095-06 preview must own its vertical scroll');
const previewBody = body(mixer, 'previewExam');
assert(previewBody.includes('previewContent.scrollTop = 0'), 'A095-07 preview scroll must reset to the top when opened');

// Multiple room codes: normalize/dedupe, same draft regardless of target order.
const parseBody = body(teacherJs, 'parseRoomCodeList');
assert(parseBody.includes("split(/[,;\\n]+/)"), 'A094-12 room list separators missing');
assert(parseBody.includes('if (seen.has(key)) continue'), 'A094-13 room list dedupe missing');
assert(parseBody.includes('result.length > 30'), 'A094-14 room list cap missing');
const ctxBody = body(teacherJs, 'roomExamDraftContext');
assert(ctxBody.includes(".sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))"), 'A094-15 stable room-set draft key missing');
assert(ctxBody.includes("join('|')"), 'A094-16 room-set key missing');

// Client: one room uses legacy canonical save; 2+ rooms use exactly one bulk RPC.
const multiSave = body(teacherJs, 'luuDeThiLenNhieuPhongSupabase');
assert(multiSave.includes("staffRpc('rpc_luu_de_thi_vao_nhieu_phong'"), 'A094-17 bulk RPC call missing');
assert.strictEqual((multiSave.match(/staffRpc\(/g) || []).length, 1, 'A094-18 browser must make one bulk RPC call only');
assert(multiSave.includes('p_ma_phong_list: roomCodes'), 'A094-19 room list payload missing');
const publish = body(teacherJs, 'dayBoDePhongLenMayChu');
assert(publish.includes('if (ctx.roomCodes.length === 1)'), 'A094-20 single-room compatibility branch missing');
assert(publish.includes('luuDeThiLenSupabase(combined, draft.assessmentConfig)'), 'A094-21 single-room canonical save must remain');
assert(publish.includes('luuDeThiLenNhieuPhongSupabase(combined, draft.assessmentConfig, ctx.roomCodes)'), 'A094-22 multi-room branch missing');
assert(publish.includes('Nếu một phòng lỗi, toàn bộ lần đẩy sẽ rollback.'), 'A094-23 atomic rollback UX text missing');

// Server: wrapper delegates to authoritative room-save function inside an exception subtransaction.
assert(migration.includes('create or replace function public.rpc_luu_de_thi_vao_nhieu_phong('), 'A094-24 bulk RPC definition missing');
assert(migration.includes('public.rpc_luu_de_thi_len_phong('), 'A094-25 bulk RPC must reuse canonical save');
assert(migration.includes('foreach v_room_code in array v_room_codes loop'), 'A094-26 server room loop missing');
assert(migration.includes("raise exception using"), 'A094-27 failure must abort subtransaction');
assert(migration.includes("exception when others then"), 'A094-28 rollback handler missing');
assert(migration.includes("toàn bộ thay đổi trong lần này đã được rollback"), 'A094-29 rollback response missing');
assert(migration.includes('grant execute on function public.rpc_luu_de_thi_vao_nhieu_phong'), 'A094-30 explicit function grant missing');

// Same payload means identical ma_de/cau_so across every room, no re-shuffle per room.
assert.strictEqual((migration.match(/p_de_thi/g) || []).length >= 2, true, 'A094-31 canonical payload not reused');
assert(!migration.includes('random()'), 'A094-32 bulk server path must never reshuffle');
assert(!publish.includes('Quét & Trộn'), 'A094-33 publish must not trigger another shuffle');

console.log('AUTOHEIGHT_MULTIROOM_PUBLISH_094_PASS');
