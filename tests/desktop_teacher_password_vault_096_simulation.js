const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('giaovien.html','utf8');
const js=fs.readFileSync('giaovien.js','utf8');
for(const term of [
  'id="gvLoginForm" autocomplete="on"','id="gvUser" name="username"',
  'autocomplete="username"','id="gvPass" name="password"',
  'autocomplete="current-password"','id="gvTogglePass"',
  'id="gvRememberLogin"','id="gvSavedPasswordBtn"',
  'id="btnDangNhapGV"','type="submit"'
])assert(html.includes(term),'desktop form missing: '+term);
assert(html.includes('onsubmit="event.preventDefault(); thucHienDangNhapGV();"'));
assert(html.includes('giaovien.js?v=20261103-autoheight-multiroom-094&amp;login=20261108-desktop-teacher-vault-096'));
assert(js.includes("['gvUser', 'gvPass'].forEach"),'Enter should still work');
assert(js.includes('rememberDesktopTeacherAfterLogin(user,pass)'),'normal login must save only after successful auth');
assert(js.includes('rememberDesktopTeacherAfterLogin(window.tempGvData.ma_gv,pass1)'),'forced rotation must remember the NEW password');
assert(js.includes('rememberDesktopTeacherAfterLogin(gvData.ma_gv,newPass)'),'voluntary rotation must remember the NEW password');
assert(!/localStorage\.setItem\([^)]*(?:pass|token|secret)/i.test(js),'Web Storage must not hold secrets');
const first=js.indexOf("const DESKTOP_REMEMBER_USERNAME_KEY=");
const last=js.indexOf("window.onload = function()",first);
assert(first>0&&last>first);
const helper=js.slice(first,last);
const elements=new Map();
function getElementById(id){
  if(!elements.has(id)){
    const handlers={};
    elements.set(id,{id,value:'',type:id==='gvPass'?'password':'text',
      hidden:false,disabled:false,checked:false,textContent:'',handlers,
      addEventListener:(event,fn)=>{handlers[event]=fn;},
      setAttribute(name,value){this[name]=value;}
    });
  }
  return elements.get(id);
}
const preferences=new Map(),writes=[],vaultWrites=[];
const localStorage={
  getItem:k=>preferences.get(k)??null,
  setItem:(k,v)=>{preferences.set(k,String(v));writes.push([k,String(v)]);},
  removeItem:k=>preferences.delete(k)
};
const navigator={credentials:{
  async store(credential){vaultWrites.push(credential);},
  async get(){return {type:'password',id:'GV002',password:'device-vault-secret'};}
}};
class PasswordCredential{
  constructor({id,name,password}){this.type='password';this.id=id;this.name=name;this.password=password;}
}
const ctx=vm.createContext({
  document:{getElementById},window:{PasswordCredential},navigator,localStorage,Promise,
  console:{warn(){}}
});
vm.runInContext(helper,ctx);
const actions=vm.runInContext(
  '({setupDesktopTeacherPasswordManager,rememberDesktopTeacherAfterLogin})',ctx);
(async()=>{
  actions.setupDesktopTeacherPasswordManager();
  assert.strictEqual(getElementById('gvRememberLogin').checked,false);
  const reveal=getElementById('gvTogglePass').handlers.click;
  reveal(); assert.strictEqual(getElementById('gvPass').type,'text');
  assert.strictEqual(getElementById('gvTogglePass').textContent,'Ẩn');
  reveal(); assert.strictEqual(getElementById('gvPass').type,'password');
  actions.rememberDesktopTeacherAfterLogin('GV001','wrong-before-opt-in');
  assert.strictEqual(preferences.size,0);
  assert.strictEqual(vaultWrites.length,0);
  getElementById('gvRememberLogin').checked=true;
  actions.rememberDesktopTeacherAfterLogin('GV001','verified-password');
  await Promise.resolve();
  assert.strictEqual(preferences.get('damSan_DesktopTeacherUsername_v1'),'GV001');
  assert.strictEqual(preferences.get('damSan_DesktopTeacherRemember_v1'),'1');
  assert.strictEqual(vaultWrites[0].password,'verified-password');
  assert(!writes.some(([k,v])=>/pass|token|secret/i.test(k)||v==='verified-password'));
  await getElementById('gvSavedPasswordBtn').handlers.click();
  assert.strictEqual(getElementById('gvUser').value,'GV002');
  assert.strictEqual(getElementById('gvPass').value,'device-vault-secret');
  assert.strictEqual(getElementById('gvPass').type,'password');
  getElementById('gvRememberLogin').checked=false;
  getElementById('gvRememberLogin').handlers.change();
  assert.strictEqual(preferences.size,0,'opt-out removes username and consent');
  const noVault=vm.createContext({
    document:{getElementById},window:{},navigator:{},localStorage,Promise,console
  });
  vm.runInContext(helper,noVault);
  vm.runInContext('setupDesktopTeacherPasswordManager()',noVault);
  assert.strictEqual(getElementById('gvSavedPasswordBtn').hidden,true,'native autofill fallback');
  console.log('PASS desktop_teacher_password_vault_096');
})().catch(e=>{console.error(e);process.exitCode=1});