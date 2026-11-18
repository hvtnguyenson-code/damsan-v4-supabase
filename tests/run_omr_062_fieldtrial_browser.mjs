// OMR 062: real Chromium browser E2E for device-local field PWA.
// Images are synthesized in-memory, no student data or Supabase credentials.
const endpoint='http://127.0.0.1:9236',wait=ms=>new Promise(r=>setTimeout(r,ms));
const pages=await (await fetch(endpoint+'/json/list')).json();
const page=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
if(!page)throw Error('OMR 062 Chrome target unavailable');
const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),requests=[];
let seq=0;
ws.addEventListener('message',ev=>{
 const msg=JSON.parse(String(ev.data));
 if(msg.method==='Network.requestWillBeSent')
  requests.push(msg.params?.request?.url||'');
 if(!msg.id||!pending.has(msg.id))return;
 const p=pending.get(msg.id);pending.delete(msg.id);
 msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result||{});
});
await new Promise((resolve,reject)=>{
 ws.addEventListener('open',resolve,{once:true});
 ws.addEventListener('error',reject,{once:true});
});
function cmd(method,params={}){
 const id=++seq;return new Promise((resolve,reject)=>{
  pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(js){
 const x=await cmd('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true});
 if(x.exceptionDetails)throw Error(x.exceptionDetails.exception?.description||x.exceptionDetails.text);
 return x.result?.value;
}
async function probe(){
 const $=id=>document.getElementById(id),T=window.DamSanOmrTemplate.template;
 const w=1080,h=608,x0=350,y0=21,dpi=200/2.54,k=548/2254;
 const at=p=>[x0+p[0]*dpi*k,y0+p[1]*dpi*k];
 const data=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++){const n=i*4;data[n]=data[n+1]=data[n+2]=235;data[n+3]=255;}
 function box(cx,cy,r,v){
  for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)
   for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++){
    const n=(y*w+x)*4;data[n]=data[n+1]=data[n+2]=v;
   }
 }
 function dot(cx,cy,r,v){
  for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)
   for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++){
    if((x-cx)**2+(y-cy)**2>r*r)continue;
    const n=(y*w+x)*4;data[n]=data[n+1]=data[n+2]=v;
   }
 }
 for(const m of T.markers)
  box(...at([m.x,m.y]),Math.max(2,m.size*dpi*k*.45),12);
 const student='00120601',code='0103';
 T.sbd.forEach((col,i)=>dot(...at(col[Number(student[i])]),3.3,35));
 T.maDe.forEach((col,i)=>dot(...at(col[Number(code[i])]),3.3,35));
 T.p1.forEach((row,i)=>dot(...at(row[i%4]),3.3,38));
 T.p2.forEach((row,i)=>dot(...at(row[i%2]),3.3,38));
 T.p3.forEach((q,i)=>{for(let j=0;j<3;j++){
  const p=q[j][T.p3Labels.indexOf(String((i+j)%10))];
  if(p)dot(...at(p),3.3,38);
 }});
 const synthetic=document.createElement('canvas');
 synthetic.width=w;synthetic.height=h;
 synthetic.getContext('2d').putImageData(new ImageData(data,w,h),0,0);
 const blob=await new Promise((resolve,reject)=>
  synthetic.toBlob(b=>b?resolve(b):reject(Error('PNG encode failed')),'image/png'));
 const store=window.DamSanOmrFieldStore060.create(window.indexedDB);
 const initial=await store.list();
 if(initial.length!==0)throw Error('Field browser fixture not empty');
 async function feed(name,expectedSbd,expectedCode){
  $('expectedSbd').value=expectedSbd;$('expectedCode').value=expectedCode;
  const files=new DataTransfer();
  files.items.add(new File([blob],name,{type:'image/png'}));
  const input=$('fileInput');input.files=files.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
  const started=Date.now();
  while(Date.now()-started<25000){
   const records=await store.list();
   const completed=$('status').textContent.startsWith('Đã tự lưu')&&
    !$('fileInput').disabled&&$('expectedSbd').value==='';
   if(completed&&records.length>0&&
    records.some(x=>x.report?.expected?.sbd===expectedSbd))
    return records;
   await new Promise(r=>setTimeout(r,120));
  }
  throw Error('Capture timed out '+$('status').textContent);
 }
 const invalid=await feed('synthetic-1.png','00120602','0104');
 if(invalid.length!==1||invalid[0].report.identity.valid!==false||
  !invalid[0].report.warnings.some(x=>x.key==='SBD_BINDING')||
  !invalid[0].report.warnings.some(x=>x.key==='MADE_BINDING')||
  invalid[0].report.validForSave!==false||invalid[0].report.readOnly!==true)
  throw Error('First capture / binding guards failed');
 if($('expectedSbd').value!=='')throw Error('Old student ID remained for next scan');
 await feed('synthetic-2.png','00120601','0103');
 const saved=await store.list();
 if(saved.length!==2||saved[0].report.ok!==true||saved[0].report.identity.valid!==true)
  throw Error('Second captured scan failed '+JSON.stringify(saved.map(x=>({ok:x.report.ok,valid:x.report.identity.valid}))));
 if($('countOut').textContent!=='2'||$('preview').hidden)
  throw Error('UI did not update count or photo preview');
 if(window.DamSanOmrResultWrite||window.supabase)
  throw Error('Official score writer/backend unexpectedly loaded');
 // A teacher can label disputes without editing the machine's predictions.
 const target=await store.get(saved[0].id);
 $('humanVerdict').value='needs_review';
 $('humanNotes').value='P3.2 dung la 11';
 $('saveReview').click();
 const started=Date.now();
 while(Date.now()-started<6000){
  const row=await store.get(target.id);
  if(row?.review?.notes==='P3.2 dung la 11')break;
  await new Promise(r=>setTimeout(r,70));
 }
 const corrected=await store.get(target.id);
 if(corrected.review.verdict!=='needs_review'||corrected.report.answers.p3.length!==6)
  throw Error('Teacher review not persisted or changed machine answers');
 // Intercept generated Blob (without fetch: CSP deliberately denies connections).
 const originalCreate=URL.createObjectURL.bind(URL);
 let archive=null;
 URL.createObjectURL=(b)=>{if(b.type==='application/zip')archive=b;return originalCreate(b);};
 $('prepareExport').click();
 const startedZip=Date.now();
 while(Date.now()-startedZip<12000){
  if(archive&&$('downloadLink').href.startsWith('blob:'))break;
  await new Promise(r=>setTimeout(r,90));
 }
 URL.createObjectURL=originalCreate;
 if(!archive||archive.size<1000)throw Error('ZIP export was not prepared');
 const buf=new Uint8Array(await archive.arrayBuffer()),v=new DataView(buf.buffer);
 const names=[],parts={};let pos=0;
 while(pos+30<buf.length&&v.getUint32(pos,true)===0x04034b50){
  const size=v.getUint32(pos+18,true),len=v.getUint16(pos+26,true),
    extra=v.getUint16(pos+28,true),start=pos+30+len+extra;
  const name=new TextDecoder().decode(buf.subarray(pos+30,pos+30+len));
  names.push(name);parts[name]=buf.subarray(start,start+size);pos=start+size;
 }
 if(names.length!==6||!names.includes('bao-cao.csv')||
    !names.includes('manifest.json')||
    names.filter(x=>x.endsWith('.jpg')).length!==2||
    names.filter(x=>x.endsWith('.json')).length!==3)
  throw Error('ZIP contents invalid: '+JSON.stringify(names));
 const manifest=JSON.parse(new TextDecoder().decode(parts['manifest.json']));
 const report1=manifest.records.find(x=>x.id===target.id);
 if(manifest.records.length!==2||!report1)
  throw Error('ZIP manifest not linked');
 const savedDetails=JSON.parse(new TextDecoder().decode(parts[report1.resultFile]));
 if(savedDetails.review.notes!=='P3.2 dung la 11'||
  savedDetails.report.readOnly!==true||savedDetails.report.validForSave!==false)
  throw Error('ZIP lost annotations or safety flags');
 if(!(parts[report1.imageFile][0]===255&&parts[report1.imageFile][1]===216))
  throw Error('JPG evidence bytes invalid');
 const width=document.documentElement.scrollWidth,viewport=window.innerWidth;
 if(width>viewport+2)throw Error('Field PWA horizontal overflow');
 return {saved:saved.length,zipEntries:names.length,zipBytes:archive.size,
  reviewPersisted:corrected.review.verdict,readOnly:corrected.report.readOnly,
  imageType:corrected.image.type,bytesStored:saved.reduce((n,x)=>n+x.bytes,0),
  hasBackend:false,width,viewport};
}
const url='http://127.0.0.1:8769/omr/field-060/index.html';
try{
 await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Network.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{
  width:390,height:844,mobile:true,deviceScaleFactor:2
 });
 await cmd('Page.navigate',{url});
 let ready=false;
 for(let i=0;i<45;i++){
  await wait(350);
  try{
   ready=await evaluate('Boolean(window.DamSanOmrFieldStore060&&window.DamSanOmrV7Pipeline060&&document.getElementById("cameraInput"))');
   if(ready)break;
  }catch(_){}
 }
 if(!ready)throw Error('Field PWA failed to load');
 const report=await evaluate('('+probe.toString()+')()');
 if(report.saved!==2||report.zipEntries!==6||report.width>report.viewport+2)
  throw Error('OMR 062 invalid browser report '+JSON.stringify(report));
 const external=requests.filter(u=>!u.startsWith('http://127.0.0.1:8769/')&&
  !u.startsWith('blob:')&&!u.startsWith('data:'));
 if(external.length)throw Error('Unexpected external request: '+JSON.stringify(external));
 // Test persistence across full browser reload and offline SW navigation.
 await cmd('Page.reload',{ignoreCache:true});
 let recovered=false;
 for(let i=0;i<40;i++){
  await wait(250);
  try{
   recovered=await evaluate('document.getElementById("countOut")?.textContent==="2"');
   if(recovered)break;
  }catch(_){}
 }
 if(!recovered)throw Error('IndexedDB captures not recovered after reload');
 const sw=await evaluate('(async()=>{ const x=await navigator.serviceWorker.getRegistrations();return x.some(r=>r.scope.includes("/omr/field-060/")&&!!r.active); })()');
 if(!sw)throw Error('Field PWA service worker not installed');
 await cmd('Network.emulateNetworkConditions',{
  offline:true,latency:0,downloadThroughput:0,uploadThroughput:0
 });
 await cmd('Page.reload',{ignoreCache:false});
 let offlineRecovered=false;
 for(let i=0;i<40;i++){
  await wait(250);
  try{
   offlineRecovered=await evaluate('Boolean(window.DamSanOmrFieldStore060&&document.getElementById("countOut")?.textContent==="2")');
   if(offlineRecovered)break;
  }catch(_){}
 }
 if(!offlineRecovered)throw Error('Field PWA not usable offline');
 await cmd('Network.emulateNetworkConditions',{
  offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1
 });
 console.log('PASS OMR 062 Chromium field PWA: camera input -> two saved images -> IDB review -> ZIP -> reload -> offline persistence',JSON.stringify(report));
}finally{
 try{await cmd('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});}catch(_){}
 ws.close();
}