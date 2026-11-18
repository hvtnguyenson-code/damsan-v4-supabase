(function(){
'use strict';
// FIELD TRIAL ONLY. Never authenticate, call RPC, fetch, or submit scores.
const $=id=>document.getElementById(id);
const Core=window.DamSanOmr,V7=window.DamSanOmrV7Candidate,
 Pipeline=window.DamSanOmrV7Pipeline060,Template=window.DamSanOmrTemplate.template;
const Zip=window.DamSanOmrEvidenceExport;
const db=window.DamSanOmrFieldStore060.create(window.indexedDB);
const canvas=$('photoCanvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
let busy=false,currentId=null,previewUrl=null,zipUrl=null,exportOffset=0;
const BATCH_SIZE=20;
const now=()=>new Date().toISOString();
function putText(id,text){$(id).textContent=String(text??'');}
function status(message,bad=false){
 putText('status',message);$('status').className=bad?'small error':'small good';
}
function reason(issue){
 if(typeof issue==='string')return issue;
 return String(issue?.reason||issue?.message||issue?.type||issue?.code||issue?.key||'Cần kiểm tra');
}
function slimIssues(items,cap=90){
 return (Array.isArray(items)?items:[]).slice(0,cap).map(x=>({
  key:String(x?.key||x?.code||'').slice(0,55),reason:reason(x).slice(0,250),
  state:x?.state||null
 }));
}
function summarize(next,legacy,legacyError,expected,frame){
 const candidate=next?.candidate;
 const oldOk=legacy?.ok===true;
 const reference=oldOk&&Array.isArray(legacy?.p2)&&Array.isArray(legacy?.p3)
   ?legacy:null;
 const comparison=reference?Pipeline.compareAnswers(reference,next):null;
 const inkFlags=Array.isArray(next?.ink?.flags)?next.ink.flags.slice(0,160).map(x=>({
  key:x.key,kind:x.kind,state:x.state,
  topFill:x.topFill??null,secondFill:x.secondFill??null
 })):[];
 const identity=next?.identity||{};
 const items=slimIssues(next?.issues);
 const retake=next?.requiresRetake===true||next?.ok===false;
 return {
  version:2,engine:'OMR060_RESEARCH_ONLY',createdAt:now(),
  readOnly:true,validForSave:false,
  ok:next?.ok===true,requiresReview:!!next?.requiresReview||retake||
    items.length>0,requiresRetake:retake,
  error:next?.reason||next?.error||null,
  identity:{sbd:identity.sbd||'',maDe:identity.maDe||'',
    valid:identity.valid===true,issues:slimIssues(identity.issues,40)},
  expected,
  answers:{p1:next?.answers?.p1||'',p2:Array.isArray(next?.answers?.p2)?next.answers.p2:[],
   p3:Array.isArray(next?.answers?.p3)?next.answers.p3:[]},
  warnings:items,inkFlags,
  geometry:{
    internalMatches:next?.registration?.internalMatches??null,
    rmse:next?.registration?.rmse??null,
    spanX:next?.registration?.spanX??null,
    spanY:next?.registration?.spanY??null,
    corners:next?.registration?.corners||null,
    rectified:next?.normalization||null,
    quality:next?.geometryStatus||candidate?.geometryDiagnostic||null
  },
  image:{width:frame.width,height:frame.height},
  recognitionMs:next?.elapsedMs??null,
  legacyV7:{
    available:!!legacy&&!legacyError,
    ok:oldOk,
    error:legacyError||legacy?.error||legacy?.stage||null,
    identity:{sbd:legacy?.sbd||'',maDe:legacy?.maDe||''},
    answers:reference?{p1:legacy.p1,p2:legacy.p2,p3:legacy.p3}:null
  },
  comparison:comparison?{count:comparison.count,changes:comparison.changes}:null
 };
}
function compareLabel(report){
 if(!report?.legacyV7?.ok)return 'V7: từ chối hoặc không đọc được ảnh này; 060 được đánh giá riêng.';
 const n=report.comparison?.count;
 return 'So với V7 trên cùng ảnh: '+(n==null?'không đủ dữ liệu':n+' vị trí khác biệt')+'.';
}
function viewReport(record){
 const r=record.report;
 currentId=record.id;
 $('currentCard').hidden=false;
 putText('sbdOut',r.identity?.sbd||'Chưa rõ');
 putText('codeOut',r.identity?.maDe||'Chưa rõ');
 const verdict=r.ok&&r.identity?.valid&&!r.requiresReview?'Đọc được':'Xem lại';
 putText('reviewOut',verdict);
 $('reviewOut').className=r.ok&&!r.requiresReview?'good':'error';
 putText('v7Out',compareLabel(r));
 putText('p1Out',r.answers?.p1||'—');
 putText('p2Out',r.answers?.p2?.length?r.answers.p2.join(' / '):'—');
 putText('p3Out',r.answers?.p3?.length?r.answers.p3.join(' ; '):'—');
 const warnings=[
  ...(r.identity?.issues||[]),...(r.warnings||[]),...(r.inkFlags||[])
 ].map(x=>((x.key||'?')+': '+reason(x)));
 if(r.error)warnings.unshift('Hình học/định vị: '+r.error);
 putText('warningsSummary',warnings.length+' mục cần kiểm tra');
 putText('warningsOut',warnings.length?warnings.join('\n'):'Không có cảnh báo được ghi nhận.');
 $('warningsDetails').open=warnings.length>0;
 $('humanVerdict').value=record.review?.verdict||'unchecked';
 $('humanNotes').value=record.review?.notes||'';
 putText('savedStatus',record.id?'Mã phiên cục bộ: '+record.id.slice(-12):'');
 if(previewUrl)URL.revokeObjectURL(previewUrl);
 previewUrl=URL.createObjectURL(record.image);
 $('preview').src=previewUrl;$('preview').hidden=false;
 $('currentCard').scrollIntoView({block:'nearest',behavior:'auto'});
}
function humanTime(stamp){
 const t=new Date(stamp);return Number.isFinite(t.getTime())?
 t.toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}):
 String(stamp).slice(0,16);
}
async function refreshList(){
 const rows=await db.list();
 putText('countOut',rows.length);
 putText('flagOut',rows.filter(x=>x.review?.verdict==='needs_review'||
   x.report?.requiresReview||x.report?.ok===false).length);
 const bytes=rows.reduce((a,x)=>a+x.bytes,0);
 putText('bytesOut',(bytes/1048576).toFixed(1)+' MB');
 $('prepareExport').disabled=rows.length===0;
 $('removeAll').disabled=rows.length===0;
 const container=$('recordsList');
 container.replaceChildren();
 for(const row of rows.slice(0,35)){
  const area=document.createElement('div');area.className='record';
  const info=document.createElement('div');info.className='record-label';
  const title=document.createElement('strong');
  title.textContent='SBD '+(row.report?.identity?.sbd||'chưa rõ')+
   ' · MD '+(row.report?.identity?.maDe||'chưa rõ');
  const sub=document.createElement('small');
  sub.textContent=humanTime(row.createdAt)+' · '+
   (row.review?.verdict==='needs_review'?'GV yêu cầu xem lại':
    row.review?.verdict==='correct'?'GV xác nhận đúng':
    row.report?.requiresReview?'Cảnh báo tự động':'Chưa đối chứng thủ công');
  const btn=document.createElement('button');
  btn.type='button';btn.textContent='Xem';btn.className='secondary';
  btn.addEventListener('click',async()=>{
   try{const item=await db.get(row.id);if(item)viewReport(item);}
   catch(e){status('Không đọc được minh chứng: '+e.message,true);}
  });
  info.append(title,sub);area.append(info,btn);container.appendChild(area);
 }
}
async function compressJPEG(){
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));
 if(!(blob instanceof Blob)||blob.size<100)throw Error('Không tạo được JPG minh chứng');
 if(blob.size>=20*1024*1024)throw Error('Ảnh quá lớn để đóng gói');
 return blob;
}
function decodeImage(file){
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
   URL.revokeObjectURL(url);
   if(!img.naturalWidth||!img.naturalHeight)return reject(Error('Ảnh trống'));
   resolve(img);
  };
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Điện thoại không đọc được định dạng ảnh này'));};
  img.src=url;
 });
}
function captureID(){
 if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();
 return 'field-'+Date.now()+'-'+Math.random().toString(36).slice(2);
}
async function processFile(file,source){
 if(busy||!file)return;
 busy=true;
 $('cameraInput').disabled=true;$('fileInput').disabled=true;
 $('prepareExport').disabled=true;
 status('Đang đọc phiếu và tự lưu minh chứng...');
 try{
  if(file.size>35*1024*1024)throw Error('Ảnh vượt 35MB; hãy chụp lại ở độ phân giải vừa phải');
  if(!/^image\//.test(file.type))throw Error('Chỉ chấp nhận ảnh');
  const expectedSbd=$('expectedSbd').value.trim();
  const expectedCode=$('expectedCode').value.trim();
  if(expectedSbd&&!/^\d{8}$/.test(expectedSbd))
   throw Error('SBD đối chiếu phải đủ đúng 8 chữ số');
  if(expectedCode&&!/^\d{1,4}$/.test(expectedCode))
   throw Error('Mã đề đối chiếu phải từ 1 đến 4 chữ số');
  const img=await decodeImage(file);
  const scale=Math.min(1,2200/Math.max(img.naturalWidth,img.naturalHeight));
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
  let next=null,old=null,oldError=null;
  try{
   next=Pipeline.analyze(frame,Template,{
    core:Core,V7,longSide:1800,
    expectedStudentCode:expectedSbd||null,expectedExamCode:expectedCode||null
   });
  }catch(e){next={ok:false,readOnly:true,validForSave:false,
    reason:'OMR060: '+String(e.message||e)};}
  if(next.readOnly!==true||next.validForSave===true)
   throw Error('Bộ chặn chỉ đọc không đạt, không xử lý phiếu này');
  try{old=V7.analyzeImageData(frame,Template,Core,null,{longSide:1800});}
  catch(e){oldError=String(e.message||e);}
  const report=summarize(next,old,oldError,
   {sbd:expectedSbd,maDe:expectedCode},frame);
  const image=await compressJPEG();
  const record={id:captureID(),createdAt:report.createdAt,report,image,
   review:{verdict:'unchecked',notes:'',updatedAt:null},source};
  try{
   await db.add(record);
   viewReport(record);
   await refreshList();
   status('Đã tự lưu phiếu #'+(await db.count())+
    (report.ok?' · Nhận dạng hoàn thành.':' · Có mục cần kiểm tra.'));
   // Never carry a previous student's SBD into the next capture.
   $('expectedSbd').value='';
  }catch(e){
   viewReport(record);
   status('Không lưu được trên điện thoại: '+e.message+
    '. Hãy tải ZIP minh chứng một phiếu ngay.',true);
   await prepareArchive([record],0,1);
  }
 }catch(e){status('Không xử lý được ảnh: '+String(e.message||e),true);}
 finally{
  busy=false;$('cameraInput').disabled=false;$('fileInput').disabled=false;
  $('cameraInput').value='';$('fileInput').value='';
  try{await refreshList();}catch(_){}
 }
}
function sanitizeDigits(v,n){return /^\d+$/.test(String(v||''))?String(v).slice(0,n):'Khong-ro';}
function quoteCsv(v){
 const text=String(v??'').replace(/\r?\n/g,' ');
 return '"'+text.replace(/"/g,'""')+'"';
}
async function prepareArchive(records,offset,total){
 const files=[],manifest=[],csv=[];
 csv.push(['STT','Ngay gio','SBD 060','Ma de 060','Nhan dang duoc',
  'Danh tinh hop le','Can xem lai','V7 hop le','So vi tri khac V7',
  'Danh gia GV','Ghi chu','Ten anh JPG','Ma luot'].map(quoteCsv).join(','));
 let number=offset;
 for(const record of records){
  number++;
  const r=record.report||{},sbd=sanitizeDigits(r.identity?.sbd,8),
   code=sanitizeDigits(r.identity?.maDe,4);
  const prefix='Phieu-'+String(number).padStart(3,'0')+'-SBD'+sbd+'-MD'+code;
  const jpgName='anh-phieu/'+prefix+'.jpg';
  const jsonName='ket-qua/'+prefix+'.json';
  files.push({name:jpgName,data:new Uint8Array(await record.image.arrayBuffer())});
  files.push({name:jsonName,data:JSON.stringify({id:record.id,
   capturedAt:record.createdAt,report:r,review:record.review||null,
   imageFile:jpgName},null,2)});
  manifest.push({id:record.id,createdAt:record.createdAt,
   sbd:r.identity?.sbd||'',maDe:r.identity?.maDe||'',imageFile:jpgName,
   resultFile:jsonName,review:record.review||null});
  csv.push([number,humanTime(record.createdAt),r.identity?.sbd||'',
   r.identity?.maDe||'',r.ok?'YES':'NO',r.identity?.valid?'YES':'NO',
   r.requiresReview?'YES':'NO',r.legacyV7?.ok?'YES':'NO',
   r.comparison?.count??'',record.review?.verdict||'unchecked',
   record.review?.notes||'',jpgName,record.id].map(quoteCsv).join(','));
 }
 files.unshift({name:'bao-cao.csv',data:'\ufeff'+csv.join('\r\n')});
 files.unshift({name:'manifest.json',data:JSON.stringify({
  schema:'DAMSAN_OMR060_FIELD_V2',readOnly:true,productionWrites:false,
  generatedAt:now(),part:Math.floor(offset/BATCH_SIZE)+1,totalRecords:total,
  records:manifest},null,2)});
 const blob=Zip.zip(files);
 if(zipUrl)URL.revokeObjectURL(zipUrl);
 zipUrl=URL.createObjectURL(blob);
 const date=new Date().toISOString().slice(0,10);
 const name='OMR060_DamSan_'+date+'_Phieu-'+
  String(offset+1).padStart(2,'0')+'-'+String(offset+records.length).padStart(2,'0')+'.zip';
 const anchor=$('downloadLink');
 anchor.href=zipUrl;anchor.download=name;anchor.textContent='Tải '+name+
  ' ('+(blob.size/1048576).toFixed(1)+' MB)';
 anchor.hidden=false;
 putText('exportStatus','Đã tạo gói '+(offset+1)+'–'+
  (offset+records.length)+' / '+total+' phiếu. Bấm liên kết xanh để lưu ZIP vào điện thoại.');
 return {bytes:blob.size,filename:name,count:records.length};
}
async function createExport(){
 if(busy)return;
 $('prepareExport').disabled=true;putText('exportStatus','Đang đóng gói JPG + CSV + JSON...');
 try{
  const all=(await db.list()).reverse();
  if(!all.length)throw Error('Chưa có phiếu nào');
  if(exportOffset>=all.length)exportOffset=0;
  const selected=all.slice(exportOffset,exportOffset+BATCH_SIZE);
  const records=[];
  for(const meta of selected){
   const row=await db.get(meta.id);
   if(!row?.image)throw Error('Thiếu ảnh phiếu '+meta.id);
   records.push(row);
  }
  await prepareArchive(records,exportOffset,all.length);
  exportOffset+=records.length;
  putText('prepareExport',exportOffset<all.length?'Tạo ZIP phần tiếp theo':'Tạo lại ZIP từ đầu');
 }catch(e){putText('exportStatus','Lỗi tạo ZIP: '+e.message);}
 finally{$('prepareExport').disabled=false;}
}
$('cameraInput').addEventListener('change',e=>void processFile(e.target.files?.[0],'camera'));
$('fileInput').addEventListener('change',e=>void processFile(e.target.files?.[0],'file'));
$('saveReview').addEventListener('click',async()=>{
 if(!currentId)return;
 try{
  const value=await db.review(currentId,$('humanVerdict').value,$('humanNotes').value);
  if(!value)throw Error('Không tìm thấy phiếu đã lưu');
  putText('savedStatus','Đã lưu đánh giá của giáo viên trong thiết bị này.');
  await refreshList();
 }catch(e){putText('savedStatus','Chưa lưu được đánh giá: '+e.message);}
});
$('prepareExport').addEventListener('click',()=>void createExport());
$('removeAll').addEventListener('click',async()=>{
 if(!confirm('Xóa TOÀN BỘ minh chứng OMR 060 trên điện thoại này? Chỉ thực hiện sau khi đã tải ZIP.'))return;
 try{
  await db.clear();currentId=null;exportOffset=0;
  if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;
  if(zipUrl)URL.revokeObjectURL(zipUrl);zipUrl=null;
  $('currentCard').hidden=true;$('preview').hidden=true;
  $('downloadLink').hidden=true;$('downloadLink').removeAttribute('href');
  putText('exportStatus','Đã xóa dữ liệu thử trên thiết bị.');
  await refreshList();
 }catch(e){status('Không xóa được dữ liệu: '+e.message,true);}
});
window.addEventListener('pagehide',()=>{
 if(previewUrl)URL.revokeObjectURL(previewUrl);
 if(zipUrl)URL.revokeObjectURL(zipUrl);
});
async function init(){
 try{await refreshList();}
 catch(e){status('Không mở được bộ nhớ cục bộ: '+e.message+
  '. Hãy dùng Safari/Chrome thường, không ở chế độ riêng tư.',true);}
 if('serviceWorker' in navigator){
  try{
   await navigator.serviceWorker.register('./sw.js',{scope:'./'});
   putText('offlineStatus','PWA 060 · có thể lưu vào màn hình chính · dữ liệu nằm trên thiết bị');
  }catch(e){
   putText('offlineStatus','Không cài được chế độ offline: '+e.message+
    '. Có thể tiếp tục quét khi có Internet.');
  }
 }else putText('offlineStatus','Trình duyệt không hỗ trợ PWA offline; dữ liệu vẫn lưu trên máy khi cho phép.');
 try{if(navigator.storage?.persist)await navigator.storage.persist();}catch(_){}
}
void init();
})();