const assert=require('assert');
const fs=require('fs');
const child=require('child_process');

console.log('=== TEACHER PWA INSTALL ENTRY 007 ===');

const gv=fs.readFileSync('giaovien.html','utf8');
const html=fs.readFileSync('teacher/index.html','utf8');
const js=fs.readFileSync('teacher/app.js','utf8');

assert(gv.includes('id="teacherPwaEntry"'),'legacy teacher page must expose mobile PWA entry');
assert(gv.includes('href="./teacher/index.html"'),'PWA entry must point to isolated teacher shell');
assert(gv.includes('#teacherPwaEntry { display: inline-flex'),'PWA entry must be visible in mobile breakpoint');

assert(html.includes('id="installBtn"'),'login screen install action missing');
assert(!/id="installBtn"[^>]*hidden/.test(html),'login install action must not be hidden by default');
assert(html.includes('id="installCard"'),'logged-in app must expose install card');
assert(html.includes('id="installAppBtn"'),'logged-in app install button missing');
assert(html.includes('id="androidInstallHint"'),'Android fallback instructions missing');
assert(html.includes('Thêm vào màn hình chính'),'Android install fallback wording missing');

assert(js.includes("const isAndroid=/Android/i.test(ua)"),'Android install detection missing');
assert(js.includes("if(appBtn)appBtn.addEventListener('click',installOrGuide)"),'logged-in install action not wired');
assert(js.includes("if(loginBtn)loginBtn.addEventListener('click',installOrGuide)"),'login install action not wired');
assert(js.includes("Android/Chrome: bấm menu ⋮"),'Android fallback alert missing');
assert(js.includes("if(card)card.hidden=true"),'install card must disappear in standalone mode');

child.execFileSync(process.execPath,['--check','teacher/app.js'],{stdio:'inherit'});
console.log('PASS teacher_pwa_install_entry_007');
