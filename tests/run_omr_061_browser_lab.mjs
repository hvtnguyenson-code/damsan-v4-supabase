// OMR 061 Chromium E2E. Runs against localhost and synthetic pixels only.
// No Supabase, no real student image, no score RPC and no Storage upload.
const endpoint='http://127.0.0.1:9236';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pages=await(await fetch(endpoint+'/json/list')).json();
const page=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
if(!page)throw Error('OMR 061 Chrome target unavailable');
const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();
let seq=0;const requests=[];
ws.addEventListener('message',ev=>{
 const msg=JSON.parse(String(ev.data));
 if(msg.method==='Network.requestWillBeSent')requests.push(msg.params?.request?.url||'');
 if(!msg.id||!pending.has(msg.id))return;
 const call=pending.get(msg.id);pending.delete(msg.id);
 msg.error?call.reject(Error(msg.error.message)):call.resolve(msg.result||{});
});
await new Promise((ok,bad)=>{
 ws.addEventListener('open',ok,{once:true});
 ws.addEventListener('error',bad,{once:true});
});
function cmd(method,params={}){
 const id=++seq;return new Promise((resolve,reject)=>{
  pending.set(id,{resolve,reject});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function evalBrowser(expr){
 const r=await cmd('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error('OMR 061 browser '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));
 return r.result?.value;
}
async function browserProbe(){
 const $=id=>document.getElementById(id),T=window.DamSanOmrTemplate.template;
 const w=1080,h=608,x0=350,y0=21,k=548/2254,dpi=200/2.54;
 const at=point=>[x0+point[0]*dpi*k,y0+point[1]*dpi*k];
 const image=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++){
  image[i*4]=image[i*4+1]=image[i*4+2]=235;image[i*4+3]=255;
 }
 function box(cx,cy,r,v){
  for(let yy=Math.max(0,Math.floor(cy-r));yy<=Math.min(h-1,Math.ceil(cy+r));yy++)
   for(let xx=Math.max(0,Math.floor(cx-r));xx<=Math.min(w-1,Math.ceil(cx+r));xx++){
    const j=(yy*w+xx)*4;image[j]=image[j+1]=image[j+2]=v;
   }
 }
 function dot(cx,cy,r,v){
  for(let yy=Math.max(0,Math.floor(cy-r));yy<=Math.min(h-1,Math.ceil(cy+r));yy++)
   for(let xx=Math.max(0,Math.floor(cx-r));xx<=Math.min(w-1,Math.ceil(cx+r));xx++){
    if((xx-cx)*(xx-cx)+(yy-cy)*(yy-cy)>r*r)continue;
    const j=(yy*w+xx)*4;image[j]=image[j+1]=image[j+2]=v;
   }
 }
 for(const m of T.markers)box(...at([m.x,m.y]),Math.max(2,m.size*dpi*k*.45),12);
 const sbd='00120601',code='0103';
 T.sbd.forEach((col,i)=>dot(...at(col[Number(sbd[i])]),3.3,35));
 T.maDe.forEach((col,i)=>dot(...at(col[Number(code[i])]),3.3,35));
 T.p1.forEach((row,i)=>dot(...at(row[i%4]),3.3,38));
 T.p2.forEach((row,i)=>dot(...at(row[i%2]),3.3,38));
 T.p3.forEach((q,i)=>{
  for(let j=0;j<3;j++){
   const p=q[j][T.p3Labels.indexOf(String((i+j)%10))];
   if(p)dot(...at(p),3.3,38);
  }
 });
 const source=document.createElement('canvas');source.width=w;source.height=h;
 source.getContext('2d').putImageData(new ImageData(image,w,h),0,0);
 const blob=await new Promise((resolve,reject)=>
  source.toBlob(b=>b?resolve(b):reject(Error('synthetic PNG encoding failed')),'image/png'));
 const input=$('file'),transfer=new DataTransfer();
 transfer.items.add(new File([blob],'synthetic-061.png',{type:'image/png'}));
 input.files=transfer.files;
 $('sbd').value=sbd;$('code').value=code;
 input.dispatchEvent(new Event('change',{bubbles:true}));
 async function waitResults(){
  const before=Date.now();
  while(Date.now()-before<18000){
   const value=$('result060').textContent;
   if(value.includes('"readOnly": true')&&
      $('status').textContent.startsWith('Đã đối chứng.'))
    return JSON.parse(value);
   await new Promise(r=>setTimeout(r,100));
  }
  throw Error('060 lab did not return: '+$('status').textContent);
 }
 const first=await waitResults();
 if(!first.ok||!first.readOnly||first.validForSave!==false||
    first.identity?.sbd!==sbd||first.identity?.maDe!==code||
    first.answers?.p1?.length!==18||first.answers?.p2?.length!==4||
    first.answers?.p3?.length!==6)
  throw Error('060 real browser recognition failed '+JSON.stringify(first).slice(0,700));
 const firstV7=JSON.parse($('resultV7').textContent);
 if(!firstV7?.answers?.p1)throw Error('V7 baseline did not run in lab');
 const firstDiff=JSON.parse($('diff').textContent);
 if(!Array.isArray(firstDiff.differences))
  throw Error('Diff data missing');
 $('sbd').value='00120602';$('code').value='0104';$('analyze').click();
 const mismatch=JSON.parse($('result060').textContent);
 const badKeys=(mismatch.identity?.issues||[]).map(x=>x.key);
 if(mismatch.ok||!badKeys.includes('SBD_BINDING')||!badKeys.includes('MADE_BINDING'))
  throw Error('Lab identity mismatch failed closed '+JSON.stringify(badKeys));
 $('sbd').value=sbd;$('code').value=code;
 const canvas=$('sheet'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const [px,py]=at(T.sbd[0][8]);
 ctx.fillStyle='rgb(35,35,35)';ctx.beginPath();ctx.arc(px,py,3.3,0,Math.PI*2);ctx.fill();
 $('analyze').click();
 const duplicate=JSON.parse($('result060').textContent);
 if(duplicate.identity?.valid!==false||duplicate.ok!==false)
  throw Error('Double marked SBD accepted');
 const docWidth=document.documentElement.scrollWidth,viewport=window.innerWidth;
 if(docWidth>viewport+2)throw Error('OMR 061 lab horizontal overflow');
 if(document.querySelectorAll('button[id*="save"],button[id*="Save"]').length)
  throw Error('Lab accidentally exposes save control');
 return {readOnly:first.readOnly,validForSave:first.validForSave,
  sbd:first.identity.sbd,code:first.identity.maDe,v7Loaded:!!firstV7.answers,
  differences:firstDiff.differences.length,
  identityMismatchBlocked:!mismatch.ok,doubleMarkBlocked:!duplicate.ok,
  viewport,docWidth,hasOfficialWriter:!!window.DamSanOmrResultWrite};
}
try{
 await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Network.enable');
 await cmd('Emulation.setDeviceMetricsOverride',
  {width:390,height:844,mobile:true,deviceScaleFactor:2});
 await cmd('Page.navigate',{url:'http://127.0.0.1:8769/omr/omr-060-integration-lab.html'});
 let ready=false;
 for(let i=0;i<40;i++){
  await pause(300);
  try{
   ready=await evalBrowser('Boolean(window.DamSanOmrV7Pipeline060&&window.DamSanOmrV7Candidate&&document.getElementById("file"))');
   if(ready)break;
  }catch(_){}
 }
 if(!ready)throw Error('OMR 061 browser modules did not load');
 const result=await evalBrowser('('+browserProbe.toString()+')()');
 if(!result?.readOnly||result.validForSave!==false||!result.identityMismatchBlocked||
    !result.doubleMarkBlocked||result.hasOfficialWriter||result.docWidth>result.viewport+2)
  throw Error('OMR 061 page validation failed: '+JSON.stringify(result));
 const unexpected=requests.filter(u=>!u.startsWith('http://127.0.0.1:8769/')&&!u.startsWith('data:')&&!u.startsWith('blob:'));
 if(unexpected.length)throw Error('OMR 061 unexpected external request: '+JSON.stringify(unexpected));
 console.log('PASS OMR 061 Chromium isolated UI, real pixels, V7 comparison, binding veto, double-mark veto, no writer/network',JSON.stringify(result));
}finally{
 try{ws.close();}catch(_){}
}
