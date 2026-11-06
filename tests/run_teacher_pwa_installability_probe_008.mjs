const devtoolsHost=process.env.PWA_DEVTOOLS_HOST||'http://127.0.0.1:9236';
const targetUrl=process.env.PWA_PROBE_URL||'http://127.0.0.1:8769/teacher/index.html';
const deadline=Date.now()+90000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function waitTarget(){
  let last=null;
  while(Date.now()<deadline){
    try{
      const r=await fetch(devtoolsHost+'/json/list',{cache:'no-store'});
      if(r.ok){
        const a=await r.json();
        const t=a.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
        if(t)return t;
      }
    }catch(e){last=e;}
    await sleep(250);
  }
  throw new Error('DevTools unavailable: '+(last?.message||'timeout'));
}

const target=await waitTarget();
const ws=new WebSocket(target.webSocketDebuggerUrl);
let nextId=1;
const pending=new Map();
const consoleLines=[];
function send(method,params={}){
  const id=nextId++;
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject,method});ws.send(JSON.stringify({id,method,params}));});
}
ws.addEventListener('message',ev=>{
  const m=JSON.parse(String(ev.data));
  if(m.id&&pending.has(m.id)){
    const p=pending.get(m.id);pending.delete(m.id);
    if(m.error)p.reject(new Error(p.method+': '+m.error.message)); else p.resolve(m.result||{});
    return;
  }
  if(m.method==='Runtime.consoleAPICalled'){
    const vals=(m.params?.args||[]).map(a=>a.value??a.description??'').join(' ');
    consoleLines.push('[console.'+(m.params?.type||'log')+'] '+vals);
  }
  if(m.method==='Runtime.exceptionThrown'){
    const d=m.params?.exceptionDetails;
    consoleLines.push('[exception] '+(d?.text||'')+' '+(d?.exception?.description||''));
  }
});
await new Promise((resolve,reject)=>{
  ws.addEventListener('open',resolve,{once:true});
  ws.addEventListener('error',()=>reject(new Error('DevTools websocket failed')),{once:true});
});
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setUserAgentOverride',{
  userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',
  platform:'Android'
});
await send('Page.navigate',{url:targetUrl});
await sleep(1800);

const expression="(async()=>{"+
"const regs=await navigator.serviceWorker.getRegistrations();"+
"const reg=await navigator.serviceWorker.getRegistration('./');"+
"let manifest=null,manifestStatus=null;"+
"try{const r=await fetch('./manifest.json',{cache:'no-store'});manifestStatus=r.status;manifest=await r.json();}catch(e){manifest={error:String(e)}}"+
"return JSON.stringify({href:location.href,secure:isSecureContext,hasSW:'serviceWorker' in navigator,controller:navigator.serviceWorker.controller?.scriptURL||null,registrations:regs.map(r=>({scope:r.scope,active:r.active?.scriptURL||null,installing:r.installing?.scriptURL||null,waiting:r.waiting?.scriptURL||null})),teacherRegistration:reg?{scope:reg.scope,active:reg.active?.scriptURL||null,installing:reg.installing?.scriptURL||null,waiting:reg.waiting?.scriptURL||null}:null,manifestStatus,manifest,installButton:document.getElementById('installBtn')?.textContent||null,installCard:!!document.getElementById('installCard')});"+
"})()";
const snapshot=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
const manifestInfo=await send('Page.getAppManifest');
const installability=await send('Page.getInstallabilityErrors');

process.stdout.write('=== TEACHER PWA CONSOLE ===\n');
for(const l of consoleLines.slice(-80))process.stdout.write(l+'\n');
process.stdout.write('=== TEACHER PWA SNAPSHOT ===\n'+snapshot.result.value+'\n');
process.stdout.write('=== TEACHER PWA MANIFEST ===\n'+JSON.stringify(manifestInfo,null,2)+'\n');
process.stdout.write('=== TEACHER PWA INSTALLABILITY ===\n'+JSON.stringify(installability,null,2)+'\n');
try{ws.close();}catch{}

const parsed=JSON.parse(snapshot.result.value);
if(!parsed.secure)throw new Error('teacher PWA not secure');
if(!manifestInfo?.url||!manifestInfo.url.includes('/teacher/manifest.json'))throw new Error('teacher manifest not discovered');
const manifestIcons=manifestInfo?.manifest?.icons||[];
if(!manifestIcons.some(i=>String(i.url||'').includes('/teacher/icons/teacher-gv-installable.svg')))throw new Error('teacher launcher icon not selected from teacher scope');
if(manifestIcons.some(i=>/\/teacher\/icons\/exam-(192|512|installable)/.test(String(i.url||''))))throw new Error('teacher manifest still exposes student launcher icon');
if(Array.isArray(manifestInfo.errors)&&manifestInfo.errors.some(e=>e.critical===2))throw new Error('critical manifest errors: '+JSON.stringify(manifestInfo.errors));
if(!parsed.teacherRegistration?.active)throw new Error('teacher service worker not active');
if(!String(parsed.teacherRegistration.scope||'').endsWith('/teacher/'))throw new Error('teacher SW scope mismatch: '+parsed.teacherRegistration?.scope);
const errors=installability?.installabilityErrors||[];
if(errors.length)throw new Error('teacher installability errors: '+JSON.stringify(errors));