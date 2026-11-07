const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

async function run(){
  const src=fs.readFileSync('teacher/app.js','utf8');
  const omr=fs.readFileSync('omr/omr-teacher-module.js','utf8');
  const elements=new Map();
  function el(id){
    if(!elements.has(id)){
      const classes=new Set();
      elements.set(id,{
        id,value:'',hidden:false,style:{},textContent:'',
        classList:{
          add:x=>classes.add(x),remove:x=>classes.delete(x),
          contains:x=>classes.has(x)
        }
      });
    }
    return elements.get(id);
  }
  const navButtons=['home','scores','more'].map(n=>el('nav_'+n));
  const document={
    getElementById:el,
    querySelectorAll(selector){
      if(selector==='.view')return ['viewHome','viewScores','viewMore'].map(el);
      if(selector==='.bottom-nav button[data-view]')return navButtons;
      return [];
    },
    querySelector(selector){
      const matched=selector.match(/data-view="(home|scores|more)"/);
      return matched?el('nav_'+matched[1]):null;
    },
    addEventListener(){}
  };
  const values=new Map([
    ['damSan_StaffToken','in-memory-test-token'],
    ['damSan_StaffExpiresAt','2099-01-01T00:00:00.000Z']
  ]);
  const sessionStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key)
  };
  let popListener=null;
  const pending=[];
  const entries=[null];
  let index=0;
  const history={
    state:null,
    replaceState(state){entries[index]=state;this.state=state;},
    pushState(state){
      entries.splice(index+1);
      entries.push(state);index++;this.state=state;
    },
    go(n){
      const next=index+n;
      if(next<0||next>=entries.length)throw new Error('unexpected history escape');
      index=next;this.state=entries[index];
      if(popListener)pending.push(Promise.resolve(popListener({state:this.state})));
    },
    back(){this.go(-1);}
  };
  let omrOpen=false;
  const stages=[],opened=[];
  const window={
    navigator:{},
    addEventListener:(name,cb)=>{if(name==='popstate')popListener=cb;},
    DamSanOmrTeacher:{
      async open(){omrOpen=true;opened.push('omr');},
      close(){omrOpen=false;},
      isOpen(){return omrOpen;},
      async restoreNavigationStage(stage){stages.push(stage);}
    }
  };
  const ctx=vm.createContext({
    window,document,history,sessionStorage,
    location:{href:'https://example.org/teacher/index.html'},
    navigator:{},crypto:{},setTimeout:()=>{},
    supabase:{createClient:()=>({rpc:async()=>{throw new Error('Back must not call RPC');}})},
    console,alert:()=>{throw new Error('unexpected alert');}
  });
  vm.runInContext(src,ctx);
  vm.runInContext('gvData={ma_gv:"test",quyen:"GV",ho_ten:"Test"}',ctx);
  const flush=async()=>{while(pending.length)await Promise.all(pending.splice(0));};
  vm.runInContext("setView('home',{replace:true})",ctx);
  assert.strictEqual(history.state.view,'home');
  vm.runInContext("setView('scores')",ctx);
  vm.runInContext("setView('more')",ctx);
  history.back();await flush();
  assert.strictEqual(history.state.view,'scores');
  assert(el('viewScores').classList.contains('active'),'Back returns to prior teacher tab');
  await vm.runInContext('openOmr()',ctx);
  assert.strictEqual(history.state.stage,'main');
  const nav=window.DamSanTeacherNav;
  assert(nav,'central navigation bridge missing');
  assert(nav.enterOmrStage('camera'));
  assert(nav.enterOmrStage('result'));
  assert(nav.enterOmrStage('photo'));
  assert.strictEqual(history.state.depth,4);
  history.back();await flush();
  assert.strictEqual(history.state.stage,'result');
  history.back();await flush();
  assert.strictEqual(history.state.stage,'camera');
  history.back();await flush();
  assert.strictEqual(history.state.stage,'main');
  history.back();await flush();
  assert.strictEqual(history.state.view,'scores');
  assert(!omrOpen,'Back from OMR main closes overlay, not the app');
  assert(stages.includes('result')&&stages.includes('camera')&&stages.includes('main'));
  await vm.runInContext('openOmr()',ctx);
  nav.enterOmrStage('camera');nav.enterOmrStage('result');
  assert(nav.resumeCamera(),'quét tiếp must return to previous camera entry');
  await flush();
  assert.strictEqual(history.state.stage,'camera');
  assert(nav.backFrom('camera'));
  await flush();
  assert.strictEqual(history.state.stage,'main');
  assert(nav.closeOmr(),'closing OMR should return to its parent tab');
  await flush();
  assert.strictEqual(history.state.view,'scores');
  assert.strictEqual(sessionStorage.getItem('damSan_StaffToken'),'in-memory-test-token');
  assert.strictEqual(sessionStorage.getItem('damSan_StaffExpiresAt'),'2099-01-01T00:00:00.000Z');
  assert.strictEqual(values.size,2,'Back must not clear the login session');
  assert(omr.includes("backFrom?.('photo')"),'photo close must use Back');
  assert(omr.includes("backFrom?.('camera')"),'camera close must use Back');
  assert(omr.includes("root.DamSanTeacherNav?.enterOmrStage?.('result')"),
    'camera result must become a history entry');
  assert(omr.includes("root.DamSanTeacherNav?.enterOmrStage?.('photo')"),
    'full-screen photo must become a history entry');
  assert(omr.includes('request!==state.cameraRequestSerial'),
    'Back during camera permission prompt must cancel late stream');
  console.log('PASS teacher_navigation_011');
}
module.exports=run;
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});