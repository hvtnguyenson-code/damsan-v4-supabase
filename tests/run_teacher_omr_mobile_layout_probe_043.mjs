// Browser smoke test uses the SAME Chromium process as teacher PWA installability.
const host=process.env.PWA_DEVTOOLS_HOST||'http://127.0.0.1:9236';
const targetUrl=process.env.PWA_PROBE_URL||'http://127.0.0.1:8769/teacher/index.html';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const targets=await (await fetch(host+'/json/list',{cache:'no-store'})).json();
const target=targets.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
if(!target)throw Error('OMR 043: Chromium DevTools page not found');
const ws=new WebSocket(target.webSocketDebuggerUrl);
const pending=new Map();let seq=0;
ws.addEventListener('message',event=>{
 const msg=JSON.parse(String(event.data));
 if(!msg.id||!pending.has(msg.id))return;
 const task=pending.get(msg.id);pending.delete(msg.id);
 if(msg.error)task.reject(Error(task.method+': '+msg.error.message));
 else task.resolve(msg.result||{});
});
await new Promise((ok,bad)=>{
 ws.addEventListener('open',ok,{once:true});
 ws.addEventListener('error',bad,{once:true});
});
function cmd(method,params={}){
 const id=++seq;
 return new Promise((resolve,reject)=>{
  pending.set(id,{resolve,reject,method});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const out=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(out.exceptionDetails)throw Error('OMR 043 JavaScript: '+(out.exceptionDetails.text||out.exceptionDetails.exception?.description));
 return out.result?.value;
}
try{
 await cmd('Page.enable');await cmd('Runtime.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 await cmd('Page.navigate',{url:targetUrl});
 let ready=false;
 for(let attempt=0;attempt<30;attempt++){
  await wait(400);
  try{
   ready=(await evaluate('typeof window.DamSanOmrTeacher?.open'))==='function';
   if(ready)break;
  }catch(e){/* navigation is still in progress */}
 }
 if(!ready)throw Error('OMR 043: teacher OMR runtime did not load');
 const initialized=await evaluate(`(async()=>{
    window.rpcLayDanhSachPhongThi=async()=>[];
    try{await window.DamSanOmrTeacher.open();}catch(e){return 'open: '+String(e.message||e)}
    const area=document.getElementById('omrScanArea');
    const panel=document.getElementById('omrV7OverlayPanel');
    const map=document.getElementById('omrV7OverlayCanvas');
    if(!area||!panel||!map)return 'missing result DOM';
    area.style.display='block';
    panel.style.display='block';
    map.width=820;map.height=1500;
    document.getElementById('omrSbd').value='00100434';
    document.getElementById('omrMaDe').value='0103';
    document.getElementById('omrStudent').innerHTML='<option>100434 — Đinh Cao Thùy Uyên (10A4)</option>';
    return 'ok';
  })()`);
 if(initialized!=='ok')throw Error('OMR 043 setup failed: '+initialized);
 const js=`(()=>{
   const ids=['omrSbd','omrMaDe','omrStudent'];
   const root=document.getElementById('omrTeacherOverlay');
   const shell=root.querySelector('.omr-shell');
   const panel=document.getElementById('omrV7OverlayPanel');
   const canvas=document.getElementById('omrV7OverlayCanvas');
   const grid=root.querySelector('.omr-identity-grid');
   const bounds=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
   const area=bounds(shell),frame=bounds(panel),map=bounds(canvas);
   return {
    vw:window.innerWidth,doc:document.documentElement.scrollWidth,
    shellWidth:shell.clientWidth,shellScroll:shell.scrollWidth,
    shell:area,frame,map,gridColumns:getComputedStyle(grid).gridTemplateColumns,
    panelTag:panel.tagName,display:getComputedStyle(canvas).display,
    controls:ids.map(id=>({id,...bounds(document.getElementById(id))}))
   };
 })()`;
 for(const width of [320,360,390,430,768]){
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:2,mobile:true});
  await wait(80);
  const report=await evaluate(js);
  const eps=2;
  if(report.panelTag!=='SECTION'||report.display==='none')
    throw Error('OMR 043 map not permanently visible: '+JSON.stringify(report));
  if(report.doc>report.vw+eps||report.shellScroll>report.shellWidth+eps)
    throw Error('OMR 043 horizontal overflow @'+width+': '+JSON.stringify(report));
  for(const r of [...report.controls,report.frame,report.map]){
   if(r.left<report.shell.left-eps||r.right>report.shell.right+eps||r.width<=0)
    throw Error('OMR 043 field/map outside shell @'+width+': '+JSON.stringify(report));
  }
  const expectedCols=width<=340?1:2;
  const cols=report.gridColumns.trim().split(/\s+/).filter(Boolean).length;
  if(cols!==expectedCols)throw Error('OMR 043 wrong grid column count @'+width+': '+JSON.stringify(report));
  console.log('PASS OMR 043 mobile viewport='+width+'px, map visible, fields bounded, columns='+cols);
 }
}finally{
 try{ws.close();}catch{}
}
