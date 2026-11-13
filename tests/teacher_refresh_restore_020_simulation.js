const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('teacher/index.html','utf8');
const app=fs.readFileSync('teacher/app.js','utf8');
const mod=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
console.log('=== TEACHER REFRESH RESTORE 020 ===');
assert(html.includes('id="bootScreen"'));
assert(html.includes('id="loginScreen" class="login-screen" hidden'));
assert(app.includes("bootstrapApp({restoring:true})"));
assert(app.includes('const saved=restoring?readTeacherLocation():null'));
assert(app.includes('const current=teacherRoute()'));
assert(app.includes('openOmr({fromHistory:true})'));
assert(app.indexOf("  $('bootScreen').hidden=true;\n\n  // Optional workspace data")<
       app.indexOf('void loadRooms().then('),'room RPC must never block restoring screen');
assert(app.includes("sessionStorage.removeItem(TEACHER_RESTORE_KEY)"));
assert(app.includes("sessionStorage.removeItem('damSan_TeacherOmrReload_v1')"));
assert(mod.includes('if(resumeDraft&&state.roomModel?.valid1846)'),'only a real pending draft may be restored');
assert(mod.includes('restoreOmrDraft(draft)'),'valid pending draft remains recoverable');
assert(mod.includes('rememberOmr({withPhoto:true})'));
assert(mod.includes("q('omrReviewUncertain').checked=false"));
assert(mod.includes('reviewCurrent();'),'rebuild score from current room');
assert(mod.includes('state.lastScan?.recognitionEngine!==expectedEngine'),'engine write check must remain');
assert(mod.includes("if(state.labEnabled||state.lastScan?._labReadOnly)"),'comparison remains read-only');
assert(sw.includes('STATIC_PATHS'));
assert(app.includes('inFlightRoomsKey===key'),'concurrent room fetches must share one in-flight RPC');
assert(app.includes("activeWorkspaceTruongId=gvData.truong_id||'ALL'"),'Admin filters must be initialized before OMR room RPC');
assert(sw.includes("request.mode==='navigate'"));
assert(sw.includes("cache.match(request,{ignoreSearch:true})"));
assert(sw.includes("u.hostname.endsWith('.supabase.co')"));
assert(sw.includes('self.skipWaiting()'),'recovery must activate an installed waiting worker');
assert(!sw.includes('self.clients.claim()'),'must leave existing grading pages under their current controller');
assert(!sw.includes('location.reload('),'must not reload an active grading page');
// Reload route: preserve a real route and never manufacture an unsafe Back depth.
const views=new Map();
const get=id=>{
 if(!views.has(id))views.set(id,{id,value:'',hidden:false,scrollTop:0,
   style:{},textContent:'',classList:{add(){},remove(){}}});
 return views.get(id);
};
const session=new Map([['damSan_GVSession',JSON.stringify({id:'T1',ma_gv:'GV01',quyen:'GV'})]]);
const store={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)};
const route={damSanTeacherRouteV1:true,view:'omr',stage:'result',depth:3};
const history={state:route,replaceState(s){this.state=s},pushState(s){this.state=s}};
const win={DamSanOmrTeacher:{
  async open(){},isOpen(){return true},async restoreNavigationStage(){},close(){}
},addEventListener(){},matchMedia:()=>({matches:true}),navigator:{}};
const context=vm.createContext({
 window:win,document:{getElementById:get,
  querySelector:selector=>selector==='.main'?get('main'):null,
  querySelectorAll:()=>[],addEventListener(){}},
 history,sessionStorage:store,localStorage:store,
 location:{href:'https://example.org/teacher/index.html',search:''},
 navigator:{serviceWorker:null,mediaDevices:{}},supabase:{createClient:()=>({})},
 console,URLSearchParams,Date,setTimeout:()=>{},alert:()=>{}
});
vm.runInContext(app,context);
const result=vm.runInContext('({makeTeacherRoute,readTeacherLocation,rememberTeacherLocation,bootstrapApp})',context);
vm.runInContext("gvData={id:'T1',ma_gv:'GV01',ho_ten:'Test',quyen:'GV'}",context);
result.rememberTeacherLocation(route);
assert.strictEqual(result.readTeacherLocation().route.stage,'result');
assert.strictEqual(history.state.depth,3);
session.set('damSan_TeacherUiReload_v1',JSON.stringify({owner:'OTHER',at:Date.now(),route}));
assert.strictEqual(result.readTeacherLocation(),null,'never restore another teacher session');
console.log('PASS teacher_refresh_restore_020');