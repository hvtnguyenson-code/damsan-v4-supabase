const assert=require('assert');
const fs=require('fs');
const js=fs.readFileSync('omr/omr-teacher-module.js','utf8');
console.log('=== OMR 019 mobile room header layout ===');
const css=js.match(/style\.textContent=\`([\s\S]*?)\`;/)?.[1];
const html=js.match(/wrap\.innerHTML=\`([\s\S]*?)\`;/)?.[1];
assert(css&&html,'teacher OMR must contain inline CSS and markup');
const start=html.indexOf('<div class="omr-room-layout">');
const end=html.indexOf('<div id="omrRoomSummary"',start);
assert(start>=0&&end>start,'room header block missing');
const top=html.slice(start,end);
assert(!top.includes('class="omr-row"'),'room header cannot share responsive flex row');
assert(top.includes('class="omr-room-picker"'),'room picker must be isolated');
assert(top.includes('<label for="omrRoomSelect">Phòng thi</label>'),'select must have bound label');
assert(top.includes('class="omr-room-info"'),'template and progress need separate rows on mobile');
assert(top.indexOf('id="omrRoomSelect"')<top.indexOf('Phiếu chuẩn'),'select must be above template');
assert(top.indexOf('Phiếu chuẩn')<top.indexOf('Tiến độ phiên này'),'progress must follow template');
for(const id of ['omrRoomSelect','omrProgress']){
 assert.strictEqual((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' ID changed or duplicated');
}
assert(css.includes('#omrTeacherOverlay #omrRoomSelect{display:block;width:100%;min-width:0;max-width:100%'),
 'room select must respect available phone width');
assert(css.includes('.omr-room-layout{display:grid;grid-template-columns:minmax(0,1fr)'),
 'top layout must use constrained full-width grid');
assert(css.includes('.omr-room-info{grid-template-columns:minmax(0,1fr)'),
 'mobile template/progress should stack to prevent overlap');
assert(css.includes('overflow-wrap:anywhere'),'long template data must not overflow');
assert(html.includes('id="omrEngineSelect"'),'V5/V6 official selection must remain untouched');
assert(html.includes('id="omrV6Lab"'),'read-only comparison switch must remain untouched');
assert(js.includes("if(state.labEnabled||state.lastScan?._labReadOnly)"),'write safety must remain');
console.log('PASS omr_mobile_room_layout_019');