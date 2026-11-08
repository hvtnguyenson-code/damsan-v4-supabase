const assert=require('assert');
const fs=require('fs');
const child=require('child_process');

console.log('=== TEACHER PWA 006 ===');

const teacherManifest=JSON.parse(fs.readFileSync('teacher/manifest.json','utf8'));
const studentManifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
const teacherHtml=fs.readFileSync('teacher/index.html','utf8');
const teacherCss=fs.readFileSync('teacher/app.css','utf8');
const teacherJs=fs.readFileSync('teacher/app.js','utf8');
const teacherSw=fs.readFileSync('teacher/sw.js','utf8');
const studentSw=fs.readFileSync('sw.js','utf8');

assert.strictEqual(teacherManifest.start_url,'./index.html');
assert.strictEqual(teacherManifest.scope,'./');
assert.strictEqual(teacherManifest.display,'standalone');
assert.strictEqual(teacherManifest.orientation,'portrait-primary');
assert(teacherManifest.name.includes('Giáo viên'));
assert(teacherManifest.icons.some(i=>i.src==='./icons/teacher-gv-installable.svg'&&i.sizes==='any'&&i.purpose==='any'),'teacher PWA must provide teacher-specific scalable install icon');
assert(teacherManifest.icons.some(i=>i.src==='./icons/teacher-gv-installable.svg'&&i.purpose==='maskable'),'teacher PWA must provide maskable teacher icon');
assert(!teacherManifest.icons.some(i=>/exam-(192|512|installable)/.test(i.src)),'teacher PWA must not reuse student launcher icons');

assert.strictEqual(studentManifest.start_url,'./hoc_sinh.html','student PWA start_url must remain unchanged');
assert.strictEqual(studentManifest.id,'./hoc_sinh.html','student PWA id must remain unchanged');
assert(studentSw.includes("'./hoc_sinh.html'"),'student service worker core remains student-only');
assert(!studentSw.includes("teacher/index.html"),'teacher shell must not be added to student SW');

assert(teacherHtml.includes('href="./manifest.json?v=20261108-teacher-pwa-027"'));
assert(teacherHtml.includes('../omr/omr-teacher-module.js'));
assert(teacherHtml.includes('../omr/omr-reliability-v6.js'),'V6 diagnostic is available to teacher PWA');
assert(teacherHtml.includes('../omr/omr-scan-adapter.js'),'teacher must load V6-to-canonical data adapter');
assert(teacherSw.includes('../omr/omr-reliability-v6.js'),'V6 lab is cached by existing teacher service worker');
assert(teacherSw.includes('../omr/omr-scan-adapter.js'),'PWA must cache canonical V6 adapter');
assert(teacherHtml.includes('../vendor/student/supabase-js-2.118.0.min.js'));
assert(teacherHtml.includes('id="homeOmrBtn"'));
assert(teacherHtml.includes('id="scoreRoomSelect"'));
assert(teacherHtml.includes('viewport-fit=cover'));
assert(!teacherHtml.includes('giaovien.js'),'mobile PWA must not load the desktop teacher runtime');

assert(teacherCss.includes('100dvh'));
assert(teacherCss.includes('env(safe-area-inset-top)'));
assert(teacherCss.includes('env(safe-area-inset-bottom)'));
assert(teacherCss.includes('@media(display-mode:standalone)'));
assert(!teacherCss.includes('width:300px'),'teacher PWA must not reuse desktop fixed sidebar');

assert(teacherJs.includes("rpc_login_giao_vien"));
assert(teacherJs.includes("rpc_change_giao_vien_password"));
assert(teacherJs.includes("rpc_lay_danh_sach_phong_thi_gv"));
assert(teacherJs.includes("rpc_lay_ket_qua_phong_gv"));
assert(teacherJs.includes('DamSanOmrTeacher.open()'));
assert(teacherJs.includes("sessionStorage.setItem('damSan_StaffToken'"));
assert(teacherJs.includes("navigator.mediaDevices")||teacherJs.includes('mediaDevices'));
assert(teacherJs.includes("serviceWorker.register('./sw.js"));
assert(!teacherJs.includes("localStorage.setItem('damSan_StaffToken'"),'staff bearer token must not move to localStorage');
assert(teacherHtml.includes('id="toggleLoginPass"'),'show/hide password toggle missing');
assert(teacherHtml.includes('id="rememberLogin"'),'opt-in remember-login checkbox missing');
assert(teacherJs.includes('navigator.credentials.store(cred)'),'browser-managed password saving missing');
assert(teacherJs.includes('REMEMBER_USERNAME_KEY'),'remembered account key missing');
assert(!teacherJs.includes('localStorage.setItem(REMEMBER_USERNAME_KEY,')||teacherJs.includes('rememberAfterSuccessfulLogin'),'remembered username must be guarded');

assert(teacherSw.includes("const CACHE='damsan-teacher-'"));
assert(teacherSw.includes("../omr/omr-core.js"));
assert(teacherSw.includes("./icons/teacher-gv-installable.svg"));
assert(!teacherSw.includes("./icons/exam-installable.svg"));
assert(teacherSw.includes("u.hostname.endsWith('.supabase.co')"));
assert(teacherSw.includes("fetch(request,{cache:'no-store'})"),'Supabase and HTML must stay network-first');
assert(teacherSw.includes("cache.match(request,{ignoreSearch:true})"),'static assets should use installed PWA cache');
assert(teacherSw.includes("request.mode==='navigate'"),'navigation must preserve a network-first policy');
assert(!teacherSw.includes("self.skipWaiting()"),'teacher SW must not force reload during an active scan');
assert(!teacherSw.includes("'../hoc_sinh.html'"),'teacher SW must not own the student runtime');

child.execFileSync(process.execPath,['--check','teacher/app.js'],{stdio:'inherit'});
child.execFileSync(process.execPath,['--check','teacher/sw.js'],{stdio:'inherit'});

console.log('PASS teacher_pwa_006');
