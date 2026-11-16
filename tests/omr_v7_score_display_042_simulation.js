const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const app=fs.readFileSync('teacher/app.js','utf8');
const adapter=fs.readFileSync('omr/omr-scan-adapter.js','utf8');
const bridge=fs.readFileSync('teacher/omr-v7-runtime-20261116-046.js','utf8');
const html=fs.readFileSync('teacher/index.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
assert.strictEqual(bridge,(adapter+'\n;\n'+source).replace(/\n+$/,'\n'),'PWA bridge must equal canonical OMR code');
for(const [label,script] of [['OMR',source],['Teacher scores',app]]){
 const found=script.match(/const formatScore=value=>\{[^}]*\};/);
 assert(found,label+' must define two-decimal display formatter');
 const format=vm.runInNewContext(found[0]+'\nformatScore;',Object.create(null));
 for(const [raw,expected] of [
  [1.9500000000000002,'1,95'],[1.5,'1,50'],[0.44999999999999996,'0,45'],
  [0,'0,00'],[9.999999999999998,'10,00'],['2','2,00'],[null,'—'],[undefined,'—']
 ])assert.strictEqual(format(raw),expected,label+' must format '+String(raw));
}
assert(source.includes("q('omrScore').textContent=formatScore(preview.grade.score)"));
assert(source.includes('P1: ${formatScore(preview.grade.parts.p1)}'));
assert(source.includes('P2: ${formatScore(preview.grade.parts.p2)}'));
assert(source.includes('P3: ${formatScore(preview.grade.parts.p3)}'));
assert(source.includes('Lưu điểm ${formatScore(state.lastPreview.grade.score)}'));
assert(source.includes('Đã lưu: ${st.ho_ten} — ${formatScore(data.score)} điểm.'));
assert(app.includes('const avg=numeric.length?formatScore('),'room average must have two decimals');
assert(app.includes('esc(formatScore(r.diem))'),'score table must have two decimals');
assert(source.includes("officialEngine:'v7'"),'V7 remains official');
assert(html.includes('20261116-teacher-pwa-046'));
assert(html.includes('omr-v7-runtime-20261116-046.js'));
assert(sw.includes("const VERSION='20261116-teacher-pwa-046'"));
assert(sw.includes("'./omr-v7-runtime-20261116-046.js'"));
assert(!source.includes("S.previewScan=()"),'scoring implementation unchanged');
console.log('PASS OMR 042: vi-VN two-decimal score display, all grading UI, PWA 040');
