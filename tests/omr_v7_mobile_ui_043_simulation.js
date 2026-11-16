const assert=require('assert'),fs=require('fs'),vm=require('vm');
const js=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const bridge=fs.readFileSync('teacher/omr-v7-runtime-20261116-043.js','utf8');
const adapter=fs.readFileSync('omr/omr-scan-adapter.js','utf8');
const html=js.match(/wrap\.innerHTML=`([\s\S]*?)`;/)?.[1]||'';
const css=js.match(/style\.textContent=`([\s\S]*?)`;/)?.[1]||'';
assert(css&&html,'OMR UI markup/style must be present');
assert.strictEqual(bridge,(adapter+'\n;\n'+js).replace(/\n+$/,'\n'),'PWA bridge must exactly match canonical OMR');
assert.strictEqual((html.match(/id="omrV7OverlayPanel"/g)||[]).length,1);
assert(html.includes('<section id="omrV7OverlayPanel"'),'Map must be a permanent result section');
assert(!html.includes('<details id="omrV7OverlayPanel"'),'Map must not require manual expansion');
assert(html.includes('id="omrV7OverlayCanvas"'));
assert(html.includes('id="omrV7OverlayStatus"'));
assert(html.includes('id="omrV7OverlayTitle"'));
assert(html.indexOf('id="omrTeacherCanvas"')<html.indexOf('id="omrV7OverlayPanel"'));
assert(html.indexOf('id="omrV7OverlayPanel"')<html.indexOf('id="omrSbd"'));
assert(js.includes("panel.style.display='block';"),'V7 official should reveal the map when rendered');
assert(js.includes("q('omrV7OverlayStatus').textContent='Không hiển thị được bản đồ V7: '"),
 'Drawing errors must be visible instead of silently hiding the map');
assert(js.includes("q('omrV7OverlayPanel').style.display='none'"),'New scans must clear prior overlay');
assert(css.includes('#omrTeacherOverlay #omrV7OverlayCanvas{display:block;width:100%;max-width:100%'));
assert(!css.includes('#omrV7OverlayPanel summary{'));
assert(html.includes('<div class="omr-identity-grid">'));
assert(!html.includes('<div class="omr-row">'),'Old flex identity row must be removed');
for(const id of ['omrSbd','omrMaDe','omrStudent']){
 assert.strictEqual((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' must be unique');
 assert(html.includes('for="'+id+'"'),id+' input needs accessible label');
}
assert(css.includes('.omr-identity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
assert(css.includes('.omr-identity-grid>.omr-field{min-width:0;max-width:100%;width:100%'));
assert(css.includes('.omr-identity-grid>.omr-field-student{grid-column:1/-1}'));
assert(css.includes('.omr-identity-grid input,#omrTeacherOverlay .omr-identity-grid select{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box'));
assert(css.includes('@media(max-width:340px){#omrTeacherOverlay .omr-identity-grid{grid-template-columns:minmax(0,1fr)}'));
assert(css.includes('#omrTeacherOverlay .omr-grid>.omr-answer{min-width:0;max-width:100%}'),
 'answer grid intrinsic widths must not produce horizontal overflow');
assert(css.includes('#omrTeacherOverlay .omr-grid>.omr-answer input{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box'),
 'P1/P2/P3 inputs must obey their mobile grid track');
assert(js.includes("officialEngine:'v7'"),'V7 official must stay unchanged');
assert(js.includes("scan=E.fromV7(v5,candidate);"),'V7 normalization must stay unchanged');
assert(js.includes("if(state.labEnabled||state.lastScan?._labReadOnly)"),'No comparison writes');
const teacher=fs.readFileSync('teacher/index.html','utf8'),
 sw=fs.readFileSync('teacher/sw.js','utf8'),desktop=fs.readFileSync('giaovien.html','utf8');
assert(teacher.includes('20261116-teacher-pwa-043'));
assert(teacher.includes('omr-v7-runtime-20261116-043.js'));
assert(sw.includes("const VERSION='20261116-teacher-pwa-043'"));
assert(sw.includes("'./omr-v7-runtime-20261116-043.js'"));
assert(desktop.includes('20261116-omr-desktop-v7-045'));
console.log('PASS OMR 043: fixed V7 overlay and bounded mobile identity fields');
