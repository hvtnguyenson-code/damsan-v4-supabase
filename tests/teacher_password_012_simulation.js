const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

async function run(){
  const js=fs.readFileSync('teacher/app.js','utf8');
  const html=fs.readFileSync('teacher/index.html','utf8');
  const css=fs.readFileSync('teacher/app.css','utf8');
  assert(html.includes('id="toggleLoginPass"')&&html.includes('id="toggleNewPass1"')&&html.includes('id="toggleNewPass2"'));
  assert(html.includes('autocomplete="username"')&&html.includes('autocomplete="current-password"'));
  assert(html.includes('id="rememberLogin"')&&html.includes('id="savedPasswordBtn"'));
  assert(css.includes('.password-entry')&&css.includes('.remember-row'));
  assert(!/localStorage\.setItem\(\s*['"][^'"]*(?:pass|token)/i.test(js),'PWA must not persist a secret');
  const elements=new Map();
  const getElementById=id=>{
    if(!elements.has(id)){
      const handlers={};
      elements.set(id,{
        id,value:'',type:id.includes('Pass')||id.includes('Password')?'password':'text',
        hidden:false,checked:false,disabled:false,textContent:'',
        handlers,addEventListener:(event,callback)=>{handlers[event]=callback;},
        setAttribute(name,value){this[name]=value;}
      });
    }
    return elements.get(id);
  };
  const store=new Map(),writes=[];
  const localStorage={
    getItem:key=>store.get(key)??null,
    setItem(key,value){store.set(key,String(value));writes.push([key,String(value)]);},
    removeItem:key=>store.delete(key)
  };
  const session=new Map();
  const sessionStorage={
    getItem:key=>session.get(key)||null,
    setItem:(key,value)=>session.set(key,String(value)),
    removeItem:key=>session.delete(key)
  };
  let authFails=true;
  const credentialWrites=[];
  const manager={
    async store(credential){credentialWrites.push(credential);},
    async get(){return {type:'password',id:'GV002',password:'device-vault-password'};}
  };
  class PasswordCredential{
    constructor(data){this.type='password';this.id=data.id;this.name=data.name;this.password=data.password;}
  }
  const ctx=vm.createContext({
    document:{getElementById,addEventListener(){}},
    window:{PasswordCredential,addEventListener(){},DamSanOmrTeacher:null},
    navigator:{credentials:manager},
    localStorage,sessionStorage,
    supabase:{createClient:()=>({rpc:async(name)=>{
      if(name!=='rpc_login_giao_vien')throw new Error('unexpected RPC');
      if(authFails)return {data:{status:'invalid'},error:null};
      return {data:{status:'success',staff_token:'ephemeral-staff-token',
        staff_expires_at:'2099-01-01T00:00:00Z',
        user:{id:'test',ma_gv:'GV001',ho_ten:'Test Teacher',quyen:'GV',truong_id:'school'}},error:null};
    }})},
    crypto:{subtle:{digest:async()=>new Uint8Array([1,2,3,4]).buffer}},
    TextEncoder,console:{warn(){}},
    location:{href:'https://example.test/teacher/index.html'},
    history:{replaceState(){}}
  });
  vm.runInContext(js,ctx);
  const actions=vm.runInContext('({setupRememberLogin,login,rememberAfterSuccessfulLogin})',ctx);
  actions.setupRememberLogin();
  assert.strictEqual(getElementById('rememberLogin').checked,false,'credential persistence opt-in must be false initially');
  assert.strictEqual(getElementById('savedPasswordBtn').hidden,false);
  const reveal=getElementById('toggleLoginPass').handlers.click;
  reveal();
  assert.strictEqual(getElementById('loginPass').type,'text');
  assert.strictEqual(getElementById('toggleLoginPass').textContent,'Ẩn');
  reveal();
  assert.strictEqual(getElementById('loginPass').type,'password');
  getElementById('toggleNewPass1').handlers.click();
  assert.strictEqual(getElementById('newPass1').type,'text');
  getElementById('toggleNewPass2').handlers.click();
  assert.strictEqual(getElementById('newPass2').type,'text');
  getElementById('rememberLogin').checked=true;
  await assert.rejects(actions.login('GV001','wrong-password'),/Sai tài khoản/);
  assert.strictEqual(store.size,0,'failed login must not save username or preference');
  assert.strictEqual(credentialWrites.length,0,'failed login must not save password');
  authFails=false;
  assert.strictEqual(await actions.login('GV001','correct-password'),true);
  actions.rememberAfterSuccessfulLogin('GV001','correct-password');
  await Promise.resolve();
  assert.strictEqual(store.get('damSan_TeacherRememberedUsername_v1'),'GV001');
  assert.strictEqual(store.get('damSan_TeacherRememberCredentials_v1'),'1');
  assert.strictEqual(credentialWrites.length,1);
  assert.strictEqual(credentialWrites[0].password,'correct-password');
  assert.strictEqual(credentialWrites[0].id,'GV001');
  assert(!writes.some(([k,v])=>/password|token/i.test(k)||v==='correct-password'),'persistent browser storage must contain no secrets');
  assert.strictEqual(session.get('damSan_StaffToken'),'ephemeral-staff-token');
  await getElementById('savedPasswordBtn').handlers.click();
  assert.strictEqual(getElementById('loginUser').value,'GV002');
  assert.strictEqual(getElementById('loginPass').value,'device-vault-password');
  assert.strictEqual(getElementById('loginPass').type,'password');
  // This chooser only fills fields; successful server authentication still needs a login.
  assert.strictEqual(credentialWrites.length,1);
  getElementById('rememberLogin').checked=false;
  getElementById('rememberLogin').handlers.change();
  assert.strictEqual(store.size,0,'opt out immediately clears PWA username and consent');
  actions.rememberAfterSuccessfulLogin('GV001','another-password');
  assert.strictEqual(credentialWrites.length,1,'opt out must not save passwords');
  assert.strictEqual(session.get('damSan_StaffToken'),'ephemeral-staff-token','remember preference does not revoke active login');
  assert(js.includes("rememberAfterSuccessfulLogin($('loginUser').value.trim()||gvData?.ma_gv,p1)"),'password rotation must store only the NEW password');
  // Browsers without PasswordCredential use native autocomplete and never cache plaintext in PWA.
  const unsupported=vm.createContext({
    document:{getElementById,addEventListener(){}},window:{addEventListener(){}},navigator:{},
    localStorage,sessionStorage,
    supabase:{createClient:()=>({})},console,TextEncoder
  });
  vm.runInContext(js,unsupported);
  vm.runInContext('setupRememberLogin()',unsupported);
  assert.strictEqual(getElementById('savedPasswordBtn').hidden,true);
  console.log('PASS teacher_password_012 — show/hide, opt-in, vault save/retrieve, no plaintext storage');
}
module.exports=run;
if(require.main===module)run().catch(err=>{console.error(err);process.exitCode=1;});