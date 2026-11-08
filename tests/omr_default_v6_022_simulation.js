const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('omr/omr-teacher-module.js','utf8');
function harness(saved=null,{v6Available=true}={}){
  const session=new Map([
    ['damSan_GVSession',JSON.stringify({id:'teacher-1'})]
  ]);
  if(saved)session.set('damSan_TeacherOmrReload_v1',JSON.stringify({
    v:1,owner:'teacher-1',at:Date.now(),roomId:'room-1',
    engine:'v5',compare:false,draft:null,...saved
  }));
  const storage={getItem:k=>session.get(k)??null,
    setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)};
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id)){
      const classes=new Set();
      const el={id,value:'',checked:false,innerHTML:'',textContent:'',style:{},
        disabled:false,hidden:false,
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),
          contains:x=>classes.has(x)},
        querySelector:()=>({disabled:false})};
      elements.set(id,el);
    }
    return elements.get(id);
  };
  // Pretend that the reusable overlay was already constructed by ensureUi.
  get('omrTeacherOverlay');
  const win={DamSanOmrTemplate:{},DamSanOmr:{},DamSanOmrRoomBinding:{},
    DamSanOmrScoring:{},DamSanOmrResultWrite:{},DamSanOmrScanAdapter:{},
    ...(v6Available?{DamSanOmrReliabilityV6:{}}:{})};
  const ctx={window:win,document:{getElementById:get,querySelectorAll:()=>[]},
    sessionStorage:storage,console,Date,
    rpcLayDanhSachPhongThi:async()=>[]};
  vm.runInNewContext(source,ctx,{filename:'omr/omr-teacher-module.js'});
  assert(win.DamSanOmrTeacher,'OMR runtime must initialize');
  return {api:win.DamSanOmrTeacher,get,session};
}
(async()=>{
  // Previous V5 setting without a draft is NOT a new-session default.
  const oldV5=harness({engine:'v5'});
  await oldV5.api.open();
  assert.strictEqual(oldV5.api._state.officialEngine,'v6');
  assert.strictEqual(oldV5.get('omrEngineSelect').value,'v6');
  assert.strictEqual(oldV5.get('omrV6Lab').checked,false);
  // A manual V5 switch still works but must not become the default next open.
  oldV5.api._state.officialEngine='v5';
  oldV5.session.set('damSan_TeacherOmrReload_v1',JSON.stringify({
    v:1,owner:'teacher-1',at:Date.now(),roomId:'room-1',
    engine:'v5',compare:false,draft:null
  }));
  assert.strictEqual(oldV5.api._state.officialEngine,'v5');
  await oldV5.api.open();
  assert.strictEqual(oldV5.api._state.officialEngine,'v6');
  assert.strictEqual(oldV5.get('omrEngineSelect').value,'v6');
  // A stale compare setting without a pending capture must never auto-enable.
  const oldCompare=harness({compare:true});
  await oldCompare.api.open();
  assert.strictEqual(oldCompare.get('omrEngineSelect').value,'v6');
  assert.strictEqual(oldCompare.get('omrV6Lab').checked,false);
  // Preserve the engine of a genuine, unsaved result across a hard reload.
  const draft={photo:'data:image/jpeg;base64,YQ==',scan:{ok:true,recognitionEngine:'V5'},
    roomId:'room-1',engine:'v5',compare:false};
  const pending=harness({draft});
  await pending.api.open();
  assert.strictEqual(pending.api._state.officialEngine,'v5');
  assert.strictEqual(pending.get('omrEngineSelect').value,'v5');
  assert.strictEqual(JSON.parse(pending.session.get('damSan_TeacherOmrReload_v1')).draft.photo,draft.photo);
  // False/partial drafts cannot keep V5 selected indefinitely.
  const partial=harness({draft:{...draft,photo:''}});
  await partial.api.open();
  assert.strictEqual(partial.get('omrEngineSelect').value,'v6');
  assert.strictEqual(JSON.parse(partial.session.get('damSan_TeacherOmrReload_v1')).draft,null);
  // V5 fallback survives if the V6 engine or its adapter is unavailable.
  const fallback=harness(null,{v6Available:false});
  await fallback.api.open();
  assert.strictEqual(fallback.get('omrEngineSelect').value,'v5');
  assert.strictEqual(fallback.api._state.officialEngine,'v5');
  // No script may silently change the V6/V5 official write guards.
  assert(source.includes("const expectedEngine=state.officialEngine==='v6'?'V6':'V5'"));
  assert(source.includes("if(state.labEnabled||state.lastScan?._labReadOnly)"));
  console.log('PASS omr_default_v6_022');
})().catch(e=>{console.error(e);process.exitCode=1});