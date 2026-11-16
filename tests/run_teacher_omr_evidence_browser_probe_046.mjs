const host='http://127.0.0.1:9236';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const targets=await(await fetch(host+'/json/list')).json();
const page=targets.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
if(!page)throw Error('OMR 046 no Chrome target');
const ws=new WebSocket(page.webSocketDebuggerUrl);
const pending=new Map();let serial=0;
ws.addEventListener('message',event=>{
 const msg=JSON.parse(String(event.data));
 if(!pending.has(msg.id))return;
 const item=pending.get(msg.id);pending.delete(msg.id);
 msg.error?item.reject(Error(msg.error.message)):item.resolve(msg.result);
});
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
function call(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{
 pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
});}
async function browserTest(){
 const E=window.DamSanOmrEvidence,S=window.DamSanOmrScoring,T=window.DamSanOmrTemplate.template;
 const items=[...Array.from({length:18},()=>({phan:'1',dap_an_dung:'B'})),
  {phan:'2',dap_an_dung:'S-Đ-Đ-Đ'},
  {phan:'2',dap_an_dung:'S-Đ-Đ-S'},
  {phan:'2',dap_an_dung:'Đ-S-S-Đ'},
  {phan:'2',dap_an_dung:'Đ-Đ-Đ-S'},
  ...['150','10','11','18','7','21'].map(dap_an_dung=>({phan:'3',dap_an_dung}))];
 const scan={p1:'BAAAAAAAAAAAAAAAAA',p2:['S-S-Đ-Đ','S-Đ-Đ-S','Đ-S-S-Đ','Đ-S-S-Đ'],
  p3:['150','10','11','18','7','21'],uncertain:[],uncertainDetails:[],invalidMarks:[]};
 const variant={code:'105',items},room={id:'room-test',assessment_type:'TOT_NGHIEP'};
 const preview=S.previewScan(scan,{ok:true,room,student:{id:'student-test',ho_ten:'Example Student',ma_hs:'100412',lop:'10A4'},variant},{allowUncertain:true});
 const original={...scan,p2:['S-?-Đ-Đ',...scan.p2.slice(1)]};
 const gray={width:180,height:260,gray:new Uint8ClampedArray(180*260).fill(230)};
 const out=E.compose(null,gray,T,preview,original,{studentName:'Example Student',studentCode:'100412',
  roomName:'OMR V7 TEST',scanId:'synthetic',mode:'test'});
 const png=out.canvas.toDataURL('image/png');
 const evidence=E.record(preview,original,out.report,{scanId:'synthetic',mode:'test'});
 const X=window.DamSanOmrEvidenceExport,C=window.DamSanOmrEvidenceClient;
 const workbook=await X.xlsx([{status:'TEST',filename:'sheets/001-synthetic.webp',
  record:{scan_id:'synthetic',evidence}}],await X.ensureExcelJS());
 const zip=X.zip([{name:'thong-ke-omr.xlsx',data:workbook}]);
 // Real browser end-to-end export path, with mock private signed URL and image bytes.
 const previousFetch=window.fetch;
 let downloads=0,linkValid=false,batchBytes=0;
 try{
  window.fetch=async (url,opts)=>{
   if(String(url).includes('example.supabase.co')){
    if(opts?.credentials!=='omit')throw Error('invalid signed file credentials');
    return new Response(new Uint8Array([82,73,70,70,9,8,7,6,87,69,66,80]),{
     status:200,headers:{'content-type':'image/webp'}});
   }
   return previousFetch(url,opts);
  };
  const fake={signed:async()=>({url:'https://example.supabase.co/storage/v1/object/sign/sample/a?token=synthetic',
   record:{scan_id:'synthetic',evidence}}),
   downloadBlob:()=>{downloads++;}};
  const bundle=await X.exportBatch([{id:'12345678-1234-4234-8234-123456789abc',
   exam_code:'105',scan_id:'synthetic'}],fake,null,null,{download:false,part:1});
  batchBytes=bundle.archive.size;
  const anchor=document.createElement('a');
  document.body.appendChild(anchor);
  const offered=C.prepareDownload(bundle.archive,bundle.filename,anchor);
  const blob=await previousFetch(offered.href).then(r=>r.arrayBuffer());
  linkValid=!!offered.href.startsWith('blob:')&&
    anchor.download.endsWith('.zip')&&new Uint8Array(blob).length===batchBytes;
  C.clearPreparedDownload(anchor);anchor.remove();
 }finally{window.fetch=previousFetch;}
 return {width:out.canvas.width,height:out.canvas.height,preview:preview.grade.score,
  diff:out.report.edits.length,ring:out.report.marks.find(m=>m.key==='P2.1b')?.kind,
  encoded:png.startsWith('data:image/png;base64,'),photoBytes:png.length,serial:evidence.version,
  xlsxBytes:workbook.length,zipBytes:zip.size,imageEncoded:C.imageUrl(out.canvas).startsWith('data:image/'),
  downloadLinkValid:linkValid,exportedBatchBytes:batchBytes,automaticDownloads:downloads};
}
try{
 await call('Runtime.enable');
 await call('Page.navigate',{url:'http://127.0.0.1:8769/teacher/index.html'});
 let ready=false;
 for(let tries=0;tries<25;tries++){
  await sleep(300);
  try{
   const out=await call('Runtime.evaluate',{expression:
    'Boolean(window.DamSanOmrEvidence&&window.DamSanOmrScoring&&window.DamSanOmrTemplate)',
    returnByValue:true});
   if(out.result?.value){ready=true;break;}
  }catch(_){/* navigation */}
 }
 if(!ready)throw Error('OMR 046 evidence modules did not load');
 const out=await call('Runtime.evaluate',{expression:'('+browserTest.toString()+')()',returnByValue:true,awaitPromise:true});
 if(out.exceptionDetails)throw Error('OMR 046 '+(out.exceptionDetails.exception?.description||out.exceptionDetails.text));
 const result=out.result?.value;
 if(!result?.encoded||result.width!==180||result.height!==448||
    result.diff!==1||result.ring!=='wrong'||result.serial!=='OMR_EVIDENCE_01'||
    !result.imageEncoded||result.xlsxBytes<1000||result.zipBytes<1000||
    !result.downloadLinkValid||result.exportedBatchBytes<1000||result.automaticDownloads!==0)
  throw Error('OMR 046 invalid evidence canvas: '+JSON.stringify(result));
 console.log('PASS OMR 046 Chromium: composite annotated sheet, manual edit, PNG encoding',JSON.stringify(result));
}finally{ws.close();}
