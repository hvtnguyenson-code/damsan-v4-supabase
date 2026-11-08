const assert=require('assert'),fs=require('fs'),vm=require('vm');
const desktop=fs.readFileSync('giaovien.js','utf8');
const pwa=fs.readFileSync('teacher/app.js','utf8');
const h=fs.readFileSync('giaovien.html','utf8');
const ph=fs.readFileSync('teacher/index.html','utf8');
assert(h.includes('id="gvCredentialStatus"'));
assert(ph.includes('id="passwordVaultStatus"'));
for(const [src,n] of [[desktop,'desktop'],[pwa,'PWA']]){
 assert(src.includes("navigator.credentials.get({password:true,mediation:'required'})"),n+' explicit chooser');
 assert(src.includes('await navigator.credentials.store('),n+' awaits store result');
 assert(src.includes("return 'failed';"),n+' rejected browser save must be reported');
 assert(src.includes("return 'unsupported';"),n+' unavailable browser vault must be reported');
 assert(src.includes("return 'requested'"),n+' success must not claim actual password persistence');
 assert(!src.includes("mediation:'optional'"),n+' explicit saved-password request should not silently return');
 assert(!/localStorage\.setItem\(\s*['"][^'"]*(?:Password|Pass|Token)/i.test(src),n+' never store password in localStorage');
}
const code=desktop.slice(desktop.indexOf('const DESKTOP_REMEMBER_USERNAME_KEY='),desktop.indexOf('window.onload = function()'));
function runVaultSimulation({deny=false,unsupported=false}={}){
 const ids=new Map();
 const el=id=>{
  if(!ids.has(id)){
   const handlers={};
   ids.set(id,{value:'',type:id==='gvPass'?'password':'text',checked:false,hidden:false,disabled:false,
    textContent:'',handlers,addEventListener:(e,fn)=>handlers[e]=fn,setAttribute(){}});
  }
  return ids.get(id);
 };
 const store=new Map(),calls={write:0,read:0};
 const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const vault=unsupported?{}:{credentials:{
   async store(credential){calls.write++;if(deny)throw Object.assign(new Error('Blocked'),{name:'NotAllowedError'});},
   async get(){calls.read++;return {type:'password',id:'GV22',password:'from-vault'};}
 }};
 const PasswordCredential=class{constructor(data){Object.assign(this,data);}};
 const context=vm.createContext({document:{getElementById:el},window:unsupported?{}:{PasswordCredential},navigator:vault,
  localStorage:storage,console:{warn(){}},Promise});
 vm.runInContext(code,context);
 const api=vm.runInContext('({setupDesktopTeacherPasswordManager,rememberDesktopTeacherAfterLogin})',context);
 api.setupDesktopTeacherPasswordManager();
 return {api,el,store,calls};
}
(async()=>{
 const ok=runVaultSimulation();
 ok.el('gvRememberLogin').checked=true;
 assert.strictEqual(await ok.api.rememberDesktopTeacherAfterLogin('GV01','secret'),'requested');
 await ok.el('gvSavedPasswordBtn').handlers.click();
 assert.strictEqual(ok.calls.read,1);
 assert.strictEqual(ok.el('gvPass').value,'from-vault');
 assert(![...ok.store.values()].includes('secret'));
 const denied=runVaultSimulation({deny:true});
 denied.el('gvRememberLogin').checked=true;
 assert.strictEqual(await denied.api.rememberDesktopTeacherAfterLogin('GV01','secret'),'failed');
 const missing=runVaultSimulation({unsupported:true});
 missing.el('gvRememberLogin').checked=true;
 assert.strictEqual(await missing.api.rememberDesktopTeacherAfterLogin('GV01','secret'),'unsupported');
 assert.strictEqual(missing.el('gvSavedPasswordBtn').hidden,true);
 console.log('PASS teacher_password_vault_097_regression');
})().catch(err=>{console.error(err);process.exitCode=1});