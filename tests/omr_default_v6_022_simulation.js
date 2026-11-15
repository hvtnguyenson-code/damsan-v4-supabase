const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('omr/omr-teacher-module.js','utf8');
function harness(saved=null,{v7Available=true}={}){
 const memory=new Map([['damSan_GVSession',JSON.stringify({id:'teacher-1'})]]);
 if(saved)memory.set('damSan_TeacherOmrReload_v1',JSON.stringify({
  v:1,owner:'teacher-1',at:Date.now(),roomId:'room-1',
  engine:'v5',compare:false,draft:null,...saved}));
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),
  removeItem:k=>memory.delete(k)};
 const elements=new Map(),get=id=>{
  if(!elements.has(id)){
   const classes=new Set();
   elements.set(id,{id,value:'',checked:false,innerHTML:'',textContent:'',style:{},
    disabled:false,hidden:false,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),
     contains:x=>classes.has(x)}});
  }
  return elements.get(id);
 };
 get('omrTeacherOverlay');
 const root={DamSanOmrTemplate:{},DamSanOmr:{},DamSanOmrRoomBinding:{},
  DamSanOmrScoring:{},DamSanOmrResultWrite:{},DamSanOmrScanAdapter:{fromV7(){}},
  ...(v7Available?{DamSanOmrV7Candidate:{analyzeValidatedRectified(){}}}:{})};
 vm.runInNewContext(source,{window:root,document:{getElementById:get,querySelectorAll:()=>[]},
  sessionStorage:storage,console,Date,rpcLayDanhSachPhongThi:async()=>[]});
 return {api:root.DamSanOmrTeacher,get,memory};
}
(async()=>{
 const old=harness({engine:'v5'});await old.api.open();
 assert.strictEqual(old.api._state.officialEngine,'v7');
 assert.strictEqual(JSON.parse(old.memory.get('damSan_TeacherOmrReload_v1')).draft,null);
 assert.strictEqual(old.get('omrOpenCamera').disabled,false);
 const oldCompare=harness({engine:'v6',compare:true});await oldCompare.api.open();
 assert.strictEqual(oldCompare.api._state.officialEngine,'v7');
 assert.strictEqual(oldCompare.api._state.labEnabled,false);
 const oldDraft={photo:'data:image/jpeg;base64,YQ==',
  scan:{ok:true,recognitionEngine:'V5',captureMode:'v5',_labReadOnly:false,_requiresRetake:false},
  roomId:'room-1',engine:'v5',compare:false};
 const oldPending=harness({engine:'v5',draft:oldDraft});await oldPending.api.open();
 assert.strictEqual(JSON.parse(oldPending.memory.get('damSan_TeacherOmrReload_v1')).draft,null);
 const v7Draft={...oldDraft,engine:'v7',scan:{...oldDraft.scan,recognitionEngine:'V7',captureMode:'v7'}};
 const pending=harness({engine:'v7',draft:v7Draft});await pending.api.open();
 assert.strictEqual(JSON.parse(pending.memory.get('damSan_TeacherOmrReload_v1')).draft.engine,'v7');
 const unavailable=harness(null,{v7Available:false});await unavailable.api.open();
 assert.strictEqual(unavailable.api._state.officialEngine,'v7');
 assert.strictEqual(unavailable.get('omrOpenCamera').disabled,true);
 assert.strictEqual(unavailable.get('omrPickFile').disabled,true);
 assert(unavailable.get('omrV7LoadStatus').textContent.includes('không tự chuyển'));
 assert(source.includes("state.lastPreview.scan?.captureMode!=='v7'"));
 console.log('PASS OMR 022: V7 default, old draft rejection, missing-module lock');
})().catch(e=>{console.error(e);process.exitCode=1;});
