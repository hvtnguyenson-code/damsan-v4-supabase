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
async function browserTest(){
 window.rpcLayDanhSachPhongThi=async()=>[];
 await window.DamSanOmrTeacher.open();
 const q=id=>document.getElementById(id);
 q('omrScanArea').style.display='block';
 q('omrEvidenceCard').style.display='block';
 q('omrEvidenceCanvas').width=800;q('omrEvidenceCanvas').height=1300;
 q('omrTeacherCanvas').width=800;q('omrTeacherCanvas').height=1300;
 q('omrV7OverlayPanel').style.display='block';
 q('omrV7OverlayCanvas').width=800;q('omrV7OverlayCanvas').height=1300;
 q('omrTechnicalDetails').open=false;
 q('omrReviewDetails').open=false;
 q('omrEvidenceToolsDetails').open=false;
 const visible=[...q('omrScanArea').querySelectorAll('canvas')].filter(c=>{
  const rect=c.getBoundingClientRect(),sty=getComputedStyle(c);
  return rect.width>0&&rect.height>0&&sty.display!=='none'&&sty.visibility!=='hidden';
 }).map(c=>c.id);
 const before={tools:q('omrEvidenceToolsDetails').open,details:q('omrReviewDetails').open};
 q('omrEditAnswers').click();
 const after=q('omrReviewDetails').open;
 return {visible,before,after,
  shellScroll:q('omrTeacherOverlay').querySelector('.omr-shell').scrollWidth,
  shellClient:q('omrTeacherOverlay').querySelector('.omr-shell').clientWidth,
  totalWidth:document.documentElement.scrollWidth,viewport:window.innerWidth};
}
try{
 await call('Page.enable');await call('Runtime.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,mobile:true,deviceScaleFactor:2});
 await call('Page.navigate',{url:'http://127.0.0.1:8769/teacher/index.html'});
 let loaded=false;
 for(let i=0;i<35;i++){
  await pause(300);
  try{if(await evaluate('typeof window.DamSanOmrTeacher?.open==="function"')){loaded=true;break;}}catch(_){}
 }
 if(!loaded)throw Error('OMR 052: grading UI did not boot');
 const report=await evaluate('('+browserTest.toString()+')()');
 if(report.visible.length!==1||report.visible[0]!=='omrEvidenceCanvas'||report.before.tools||
  report.before.details||!report.after||report.shellScroll>report.shellClient+2||
  report.totalWidth>report.viewport+2)
  throw Error('OMR 052: unified mobile result failed '+JSON.stringify(report));
 console.log('PASS OMR 052: one visible annotated sheet, technical/edit tools collapsed, edit opens',JSON.stringify(report));
}finally{ws.close();}
