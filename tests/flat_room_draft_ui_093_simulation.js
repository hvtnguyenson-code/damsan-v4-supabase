const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('giaovien.html', 'utf8');
const js = fs.readFileSync('giaovien.js', 'utf8');

console.log('=== FLAT ROOM DRAFT UI 093 ===');

const offlineStart = html.indexOf('id="subTabOffline"');
const iframeStart = html.indexOf('id="frameV8"', offlineStart);
assert(offlineStart >= 0 && iframeStart > offlineStart, 'UI093-01 offline workspace and iframe missing');
const offlineHead = html.slice(offlineStart, Math.min(iframeStart, offlineStart + 8000));

assert(offlineHead.includes('class="sub-tab-content room-exam-workspace"'), 'UI093-02 flat workspace class missing');
assert(!offlineHead.includes('border: 2px solid #27ae60'), 'UI093-03 old green wrapper border must be removed');
assert(!offlineHead.includes('overflow: hidden'), 'UI093-04 old wrapper overflow hidden must be removed');
assert(html.includes('class="room-exam-toolbar"'), 'UI093-05 standalone toolbar missing');
assert(html.includes('class="room-exam-draft-panel"'), 'UI093-06 standalone draft panel missing');
assert(html.includes('class="room-exam-frame"'), 'UI093-07 standalone mixer frame missing');
assert(!html.includes('id="roomExamSourceLabel"'), 'UI093-08 optional source-name field must be removed from visible UI');
assert(html.includes('➕ Lưu đề đang trộn'), 'UI093-09 simple add action label missing');
assert(html.includes('🚀 Đẩy toàn bộ vào phòng'), 'UI093-10 simple publish action label missing');

const addPos = html.indexOf('id="btnAddMixerBatchToDraft"');
const panelPos = html.indexOf('id="roomExamDraftPanel"');
assert(addPos >= 0 && panelPos > addPos, 'UI093-11 add action must stay in toolbar, outside draft detail panel');

assert(js.includes("addBtn.style.display = supported ? 'inline-block' : 'none';"), 'UI093-12 add button must hide when new feature is unavailable');
assert(js.includes("legacyBtn.style.display = supported ? 'none' : 'inline-block';"), 'UI093-13 legacy button must reappear on rollback');
assert(js.includes('class="room-exam-draft-item"'), 'UI093-14 flat draft row renderer missing');
assert(!js.includes('background:#f0fdf4'), 'UI093-15 nested green draft cards must be removed');
assert(html.includes('Tron_De_Trac_Nghiem_V8.html?v=20261103-preview-scroll-095'), 'UI093-16 print/mixer 091 must remain untouched');
assert(js.includes('const MULTI_SOURCE_ROOM_DRAFT_ENABLED = true;'), 'UI093-17 092 feature logic must remain enabled');

console.log('FLAT_ROOM_DRAFT_UI_093_PASS');
