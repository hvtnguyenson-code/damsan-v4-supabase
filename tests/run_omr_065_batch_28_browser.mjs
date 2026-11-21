// OMR 065: reproduce 28 local field captures and export only captures 21–28.
// Runs after OMR 062 browser smoke in the same Chrome profile.
const endpoint='http://127.0.0.1:9236';
const pages=await(await fetch(endpoint+'/json/list')).json();
const page=pages.find(x=>x.type==='page'&&x.url.includes('/omr/field-060/index.html'));
if(!page)throw Error('OMR065 field page not found in Chromium');
const ws=new WebSocket(page.webSocketDebuggerUrl);
const waits=new Map();let seq=0;
ws.addEventListener('message',e=>{
 const msg=JSON.parse(e.data);
 if(!msg.id||!waits.has(msg.id))return;
 const p=waits.get(msg.id);waits.delete(msg.id);
 msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result||{});
});
await new Promise((resolve,reject)=>{
 ws.addEventListener('open',resolve,{once:true});
 ws.addEventListener('error',reject,{once:true});
});
const cmd=(method,params={})=>new Promise((resolve,reject)=>{
 const id=++seq;waits.set(id,{resolve,reject});
 ws.send(JSON.stringify({id,method,params}));
});
async function evalJS(script){
 const r=await cmd('Runtime.evaluate',{expression:script,awaitPromise:true,returnByValue:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
 return r.result?.value;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function seed(){
 const store=window.DamSanOmrFieldStore060.create(window.indexedDB);
 const rows=await store.list();
 if(rows.length!==2)throw Error('OMR065 fixture expected 2 preexisting captures, got '+rows.length);
 const sample=await store.get(rows[0].id);
 if(!sample?.image||sample.image.type!=='image/jpeg')throw Error('Missing recorded JPEG');
 for(let i=0;i<26;i++){
  const id='omr065-fixture-'+String(i+3).padStart(3,'0')+'-local';
  const createdAt=new Date(Date.now()+i*1000).toISOString();
  const next={...sample,id,createdAt,report:{...sample.report,createdAt},
   review:{verdict:'unchecked',notes:'',updatedAt:null}};
  await store.add(next);
 }
 return await store.count();
}
async function check(){
 const $=id=>document.getElementById(id);
 const store=window.DamSanOmrFieldStore060.create(window.indexedDB);
 const rows=await store.list();
 if(rows.length!==28||$('countOut').textContent!=='28')
  throw Error('28 stored captures were not recovered after reload');
 const select=$('exportPart');
 const options=[...select.options].map(x=>({value:x.value,label:x.textContent}));
 if(options.length!==2||options[0].value!=='0'||options[1].value!=='20'||
    !options[1].label.includes('21–28'))
  throw Error('Second batch option missing: '+JSON.stringify(options));
 if($('appBuildStatus').textContent!=='Phiên bản đang chạy: OMR060_FIELD_065')
  throw Error('MIXED_CACHE: old app JS served with new HTML');
 select.value='20';
 const original=URL.createObjectURL.bind(URL);
 let zipBlob=null;
 URL.createObjectURL=obj=>{
  if(obj?.type==='application/zip')zipBlob=obj;
  return original(obj);
 };
 try{
  $('prepareExport').click();
  const started=Date.now();
  while(!zipBlob&&Date.now()-started<15000){
   await new Promise(r=>setTimeout(r,60));
  }
 }finally{URL.createObjectURL=original;}
 if(!zipBlob)throw Error('Failed to create ZIP 21–28');
 const buf=new Uint8Array(await zipBlob.arrayBuffer());
 const d=new DataView(buf.buffer),txt=new TextDecoder();
 let i=0,names=[],data={};
 while(i+30<buf.length&&d.getUint32(i,true)===0x04034b50){
  const size=d.getUint32(i+18,true),nameLen=d.getUint16(i+26,true);
  const extraLen=d.getUint16(i+28,true),start=i+30+nameLen+extraLen;
  const name=txt.decode(buf.subarray(i+30,i+30+nameLen));
  names.push(name);data[name]=buf.subarray(start,start+size);i=start+size;
 }
 if(!data['manifest.json']||!data['bao-cao.csv'])
  throw Error('Missing ZIP manifest/CSV');
 const manifest=JSON.parse(txt.decode(data['manifest.json']));
 const jpg=names.filter(x=>x.endsWith('.jpg'));
 const json=names.filter(x=>x.endsWith('.json')&&x!=='manifest.json');
 if(jpg.length!==8||json.length!==8||manifest.totalRecords!==28||
  manifest.records.length!==8||manifest.exportBuild!=='OMR060_FIELD_065')
  throw Error('Incorrect second ZIP: '+JSON.stringify({
   jpg:jpg.length,json:json.length,total:manifest.totalRecords,
   records:manifest.records.length,build:manifest.exportBuild}));
 if(!jpg.some(x=>x.includes('Phieu-021-'))||
    !jpg.some(x=>x.includes('Phieu-028-')))
  throw Error('ZIP lacks 21–28 sheet labels: '+JSON.stringify(jpg));
 if(!$('downloadLink').download.includes('Phieu-21-28.zip'))
  throw Error('Incorrect ZIP filename: '+$('downloadLink').download);
 return {stored:rows.length,options:options.map(x=>x.label),
  exported:manifest.records.length,images:jpg.length,answers:json.length,
  zipBytes:zipBlob.size,build:manifest.exportBuild};
}
try{
 await cmd('Runtime.enable');
 const count=await evalJS('('+seed.toString()+')()');
 if(count!==28)throw Error('Failed to populate 28 evidence records');
 await cmd('Page.reload',{ignoreCache:false});
 let ready=false;
 for(let i=0;i<50;i++){
  await wait(200);
  try{ready=await evalJS('document.getElementById("countOut")?.textContent==="28"');
   if(ready)break;}catch(_){}
 }
 if(!ready)throw Error('PWA did not recover 28 captures after reload');
 const result=await evalJS('('+check.toString()+')()');
 if(result.exported!==8)throw Error('Wrong export count');
 console.log('PASS OMR065: 28 stored, batch 21–28 selectable after restart, only 8 JPG + 8 JSON exported',JSON.stringify(result));
}finally{ws.close();}
