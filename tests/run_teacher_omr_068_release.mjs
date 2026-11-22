import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {makeFixture}=require('./omr_068_release_fixture.js');
const endpoint='http://127.0.0.1:9236',pause=ms=>new Promise(r=>setTimeout(r,ms));
const pages=await(await fetch(endpoint+'/json/list')).json();
const page=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
if(!page)throw Error('OMR 052: Chrome tab missing');
const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let id=0;
ws.addEventListener('message',e=>{
 const m=JSON.parse(String(e.data)),p=pending.get(m.id);if(!p)return;
 pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result||{});
});
await new Promise((ok,bad)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',bad,{once:true});});
function call(method,params={}){const n=++id;return new Promise((resolve,reject)=>{
 pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));
});}
async function evaluate(expression){
 const out=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(out.exceptionDetails)throw Error(out.exceptionDetails.exception?.description||out.exceptionDetails.text);
 return out.result?.value;
}

async function browserTest(makeFixture){
 const T=window.DamSanOmrTemplate.template,B=window.DamSanOmrRoomBinding,W=window.DamSanOmrResultWrite;
 const app=window.DamSanOmrTeacher;
 if(app.release!=='068'||!W.supports068||!window.DamSanOmrRelease068.available())throw Error('Wrong release runtime');
 window.rpcLayDanhSachPhongThi=async()=>[];
 sessionStorage.removeItem('damSan_TeacherOmrReload_v1');
 await app.open();
 const q=id=>document.getElementById(id),selector=q('omrEngineReleaseSelect'),state=app._state;
 if(!selector||selector.options.length!==2||selector.value!=='v7_068'||selector.options[0].value!=='v7_068'||selector.options[1].value!=='v7')throw Error('Expected 068 default and V7 fallback');
 const f=makeFixture(T);
 q('omrRoomSelect').add(new Option(f.room.MaPhong,f.room.id));q('omrRoomSelect').value=f.room.id;
 state.roomModel=B.buildRoomModel(f.room,f.exams,f.students);
 const fixture=document.createElement('canvas');
 fixture.width=f.pixels.width;fixture.height=f.pixels.height;
 fixture.getContext('2d').putImageData(new ImageData(f.pixels.data,f.pixels.width,f.pixels.height),0,0);
 const png=await new Promise((ok,bad)=>fixture.toBlob(b=>b?ok(b):bad(Error('fixture encoding')),'image/png'));
 const choose=value=>{selector.value=value;selector.dispatchEvent(new Event('change',{bubbles:true}));};
 const load=async()=>{
  const transfer=new DataTransfer();transfer.items.add(new File([png],'generated.png',{type:'image/png'}));
  q('omrPickFile').files=transfer.files;
  q('omrPickFile').dispatchEvent(new Event('change',{bubbles:true}));
  for(let i=0;i<80;i++){
   if(state.lastScan&&state.lastPreview)return state.lastPreview;
   await new Promise(r=>setTimeout(r,80));
  }
  throw Error('Optical file did not reach canonical review: '+q('omrWarning').textContent);
 };
 choose('v7_068');
 if(state.officialEngine!=='v7_068'||!q('omrSbd').readOnly||!q('omrMaDe').readOnly)
  throw Error('068 selection and identity lock required');
 const newPreview=await load();
 if(newPreview.scan.recognitionEngine!=='V7_068'||newPreview.scan.sbd!==f.expected.sbd||
  newPreview.scan.maDe!==f.expected.exam||newPreview.grade.score!==9.5)
  throw Error('068 full UI recognition mismatch: '+JSON.stringify({scan:newPreview.scan,score:newPreview.grade.score}).slice(0,600));
 if(q('omrGradeEngine').textContent!=='V7_068'||q('omrSave').disabled)
  throw Error('068 UI save gate or engine label incorrect');
 // No real network/RPC; exercise the same writer against a mock receipt.
 let writes=0;
 const receipt=await W.submitConfirmed(newPreview,async(name,args)=>{
  if(name!=='rpc_staff_submit_omr'||args.p_source_metadata.recognition_engine!=='V7_068')throw Error('bad canonical payload');
  writes++;return {status:'success',score:9.5,submission_id:'synthetic-receipt'};
 });
 if(writes!==1||receipt.status!=='success')throw Error('068 mock receipt failed');
 choose('v7');
 if(state.officialEngine!=='v7'||state.lastScan||state.lastPreview||!q('omrSave').disabled||
  q('omrSbd').readOnly||q('omrMaDe').readOnly)throw Error('Changing algorithm must clear pending scan');
 const legacy=await load();
 if(legacy.scan.recognitionEngine!=='V7'||legacy.scan.captureMode!=='v7'||legacy.grade.score!==9.5)
  throw Error('V7 fallback no longer operational '+JSON.stringify({engine:legacy.scan.recognitionEngine,score:legacy.grade.score}));
 // A pending, in-memory V7 result must survive reopening this same page.
 app.close();await app.open();
 if(state.officialEngine!=='v7'||q('omrEngineReleaseSelect').value!=='v7'||
   !state.lastScan||!state.lastPreview)
  throw Error('Unfinished in-memory V7 scan must keep V7');
 // Once the pending scan is cleared, the next session selects 068.
 choose('v7_068');
 if(state.lastScan||state.lastPreview||!q('omrSave').disabled)
  throw Error('Switching engines must clear the previous scan');
 app.close();await app.open();
 if(state.officialEngine!=='v7_068'||q('omrEngineReleaseSelect').value!=='v7_068')
  throw Error('Fresh OMR session must revert to 068 default');
 // An actual unsaved V7 draft is protected from silent algorithm changes.
 sessionStorage.setItem('damSan_GVSession',JSON.stringify({id:'synthetic-grader'}));
 sessionStorage.setItem('damSan_TeacherOmrReload_v1',JSON.stringify({
  v:1,owner:'synthetic-grader',at:Date.now(),roomId:'synthetic-room',engine:'v7',compare:false,
  draft:{photo:'data:image/jpeg;base64,AA',roomId:'synthetic-room',engine:'v7',compare:false,
   scan:{ok:true,recognitionEngine:'V7',captureMode:'v7',_labReadOnly:false,_requiresRetake:false}}
 }));
 app.close();await app.open();
 if(state.officialEngine!=='v7'||q('omrEngineReleaseSelect').value!=='v7')
  throw Error('Unfinished V7 draft must keep V7 on recovery');
 sessionStorage.removeItem('damSan_TeacherOmrReload_v1');
 sessionStorage.removeItem('damSan_GVSession');
 app.close();await app.open();
 if(state.officialEngine!=='v7_068')throw Error('068 must return after draft is cleared');
 // Committed score with pending evidence must keep its original engine.
 state.officialEngine='v7';q('omrEngineReleaseSelect').value='v7';
 state.evidenceCommittedSubmissionId='synthetic-receipt';
 app.close();await app.open();
 if(state.officialEngine!=='v7'||state.evidenceCommittedSubmissionId!=='synthetic-receipt')
  throw Error('Committed evidence must retain the selected engine');
 state.evidenceCommittedSubmissionId=null;
 app.close();await app.open();
 if(state.officialEngine!=='v7_068')throw Error('068 must resume after evidence finishes');
 const width=q('omrTeacherOverlay').querySelector('.omr-shell');
 if(width.scrollWidth>width.clientWidth+2)throw Error('068 selector overflows mobile');
 return {options:[...selector.options].map(x=>x.textContent.trim()),newEngine:newPreview.scan.recognitionEngine,oldEngine:legacy.scan.recognitionEngine,
  score068:newPreview.grade.score,scoreV7:legacy.grade.score,mockWrites:writes,realWrites:0};
}
try{
 await call('Page.enable');await call('Runtime.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,mobile:true,deviceScaleFactor:2});
 await call('Page.navigate',{url:'http://127.0.0.1:8769/teacher/index.html?omr-release=068'});
 let loaded=false;
 for(let i=0;i<50;i++){
  await pause(300);
  try{if(await evaluate('window.DamSanOmrTeacher?.release==="068"&&document.readyState!=="loading"')){loaded=true;break;}}catch(_){}
 }
 if(!loaded)throw Error('068 versioned release did not load');
 const report=await evaluate('('+browserTest.toString()+')('+makeFixture.toString()+')');
 console.log('PASS OMR 068 Chromium default, V7 fallback and unfinished V7 draft safety',JSON.stringify(report));
}finally{ws.close();}
