(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrEvidenceExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const Naming=(typeof module==='object'&&module.exports)
 ?require('./omr-evidence-naming.js')
 :root.DamSanOmrEvidenceNaming;
const Print=(typeof module==='object'&&module.exports)
 ?require('./omr-evidence-print.js')
 :root.DamSanOmrEvidencePrint;
const enc=new TextEncoder();
const crcTable=Array.from({length:256},(_,n)=>{
 let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;
 return c>>>0;
});
function crc32(bytes){
 let c=0xffffffff;
 for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);
 return (c^0xffffffff)>>>0;
}
function zip(files, exportDate=new Date()){
 if(!Array.isArray(files)||!files.length)throw Error('zip_files_required');
 if(!(exportDate instanceof Date)||!Number.isFinite(exportDate.getTime()))
  throw Error('zip_date_invalid');
 // ZIP's MS-DOS timestamps use a *nonzero* date: year 1980..2107,
 // month 1..12 and day 1..31. All-zero fields were shown as 30/11/1979.
 // Store local date/time consistently in both the local header and
 // central directory. ExcelJS manages its nested XLSX timestamps.
 const year=exportDate.getFullYear();
 const stamp=year<1980?new Date(1980,0,1):year>2107?
  new Date(2107,11,31,23,59,58):exportDate;
 const dosDate=((stamp.getFullYear()-1980)<<9)|
  ((stamp.getMonth()+1)<<5)|stamp.getDate();
 const dosTime=(stamp.getHours()<<11)|(stamp.getMinutes()<<5)|
  Math.floor(stamp.getSeconds()/2);
 const chunks=[],central=[];let offset=0;
 const u16=(d,o,n)=>d.setUint16(o,n,true),u32=(d,o,n)=>d.setUint32(o,n>>>0,true);
 const append=bytes=>{chunks.push(bytes);offset+=bytes.length;};
 for(const f of files){
  // Names are UTF-8 (general purpose flag 11): preserve Vietnamese accents.
  const name=String(f.name||'').normalize('NFC').replace(/\\/g,'/');
  const segments=name.split('/');
  if(!name||name.startsWith('/')||/[\u0000-\u001f\u007f<>:"|?*]/.test(name)||
    segments.some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part))||
    enc.encode(name).length>235)throw Error('zip_name_invalid');
  const body=f.data instanceof Uint8Array?f.data:enc.encode(String(f.data??''));
  if(body.length>20*1024*1024)throw Error('zip_file_too_large');
  const basename=enc.encode(name),checksum=crc32(body),start=offset;
  const h=new Uint8Array(30+basename.length),v=new DataView(h.buffer);
  u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x0800);u16(v,8,0); // UTF-8, store
  u16(v,10,dosTime);u16(v,12,dosDate);
  u32(v,14,checksum);u32(v,18,body.length);u32(v,22,body.length);
  u16(v,26,basename.length);h.set(basename,30);
  append(h);append(body);
  const d=new Uint8Array(46+basename.length),w=new DataView(d.buffer);
  u32(w,0,0x02014b50);u16(w,4,20);u16(w,6,20);u16(w,8,0x0800);u16(w,10,0);
  u16(w,12,dosTime);u16(w,14,dosDate);
  u32(w,16,checksum);u32(w,20,body.length);u32(w,24,body.length);
  u16(w,28,basename.length);u32(w,42,start);d.set(basename,46);
  central.push(d);
 }
 const centralAt=offset;for(const d of central)append(d);
 const end=new Uint8Array(22),e=new DataView(end.buffer);
 u32(e,0,0x06054b50);u16(e,8,files.length);u16(e,10,files.length);
 u32(e,12,offset-centralAt);u32(e,16,centralAt);append(end);
 return new Blob(chunks,{type:'application/zip'});
}
function rowsFrom(records){
 const overview=[],details=[],audit=[];
 for(const r of records){
  const data=r.record?.evidence||{},grade=data.grade||{},parts=grade.parts||{};
  const base=[data.student_code||'',data.student_name||'',data.class_name||'',
    data.exam_code||r.exam_code||'',parts.p1??'',parts.p2??'',
    parts.p3??'',grade.total??r.preview_score??'',r.status||'',
    r.record?.scan_id||r.scan_id||'',r.filename||'',
    (data.uncertain_details||[]).length,(data.edits||[]).length,
    data.version||''];
  overview.push(base);
  (grade.details||[]).forEach(q=>details.push([data.student_code||'',
    q.phan||'',q.q||'',q.chon||'',q.dung||'',q.diem??0]));
  (data.edits||[]).forEach(change=>audit.push([data.student_code||'',
    change.key||'',change.before||'',change.after||'',r.record?.scan_id||'']));
 }
 return {overview,details,audit};
}

function roomRows(roster,records){
 const map=Naming.latestByStudent(records);
 return [...roster].sort(Naming.codeSort).map(hs=>{
  const evidenceRecord=Naming.findByStudent(map,hs);
  const grade=evidenceRecord?.record?.evidence?.grade||{};
  const official=hs.officialScore===null||hs.officialScore===undefined||hs.officialScore===''?
    null:Number(hs.officialScore);
  const realScore=official!==null&&Number.isFinite(official)?official:null;
  const preview=evidenceRecord&&Number.isFinite(Number(evidenceRecord.preview_score))?
    Number(evidenceRecord.preview_score):null;
  const code=hs.MaDe&&hs.MaDe!=='-'?String(hs.MaDe):String(evidenceRecord?.exam_code||'');
  const mismatch=realScore!==null&&!!evidenceRecord&&(
   (preview!==null&&Math.abs(realScore-preview)>0.005)||
   (hs.MaDe&&hs.MaDe!=='-'&&evidenceRecord.exam_code&&
    String(hs.MaDe).replace(/^0+/,'')!==String(evidenceRecord.exam_code).replace(/^0+/,'')));
  const status=mismatch?'Cần đối chiếu':realScore!==null?'Đã lưu điểm':
    evidenceRecord?'Có minh chứng, chưa lưu điểm':'Chưa có điểm';
  const info=evidenceRecord?.record?.evidence||{};
  return [String(hs.MaHS||''),String(hs.HoTen||''),String(hs.Lop||''),code,
   realScore===null?'':Number(realScore.toFixed(2)),
   hs.P1??'',hs.P2??'',hs.P3??'',
   preview===null?'':Number(preview.toFixed(2)),status,
   evidenceRecord?.filename||'',evidenceRecord?.record?.scan_id||evidenceRecord?.scan_id||'',
   evidenceRecord?(info.uncertain_details||[]).length:0,
   evidenceRecord?(info.edits||[]).length:0,
   evidenceRecord?.record?.revision||evidenceRecord?.revision||''];
 });
}

async function xlsx(records,ExcelJS,{roster=null}={}){
 if(!ExcelJS?.Workbook)throw Error('exceljs_unavailable');
 const wb=new ExcelJS.Workbook();wb.creator='Đam San OMR V7';
 const data=rowsFrom(records);
 const defs=roster?[
  ['Điểm phòng thi',['SBD','Họ tên','Lớp','Mã đề','Điểm chính thức','P1','P2','P3',
   'Điểm dự kiến V7','Trạng thái','Tệp phiếu','Scan ID','Cảnh báo V7','Số vị trí sửa','Revision'],roomRows(roster,records)],
  ['Chi tiết OMR',['SBD','Phần','Câu','Học sinh chọn','Đáp án đúng','Điểm'],data.details],
  ['Đối chiếu',['SBD','Vị trí sửa','Trước','Sau','Scan ID'],data.audit]
 ]:[
  ['Tổng hợp',['SBD','Họ tên','Lớp','Mã đề','P1','P2','P3','Tổng','Trạng thái','Scan ID','Tệp phiếu','Cảnh báo V7','Số vị trí sửa','Phiên bản'],data.overview],
  ['Chi tiết',['SBD','Phần','Câu','Học sinh chọn','Đáp án đúng','Điểm'],data.details],
  ['Đối chiếu',['SBD','Vị trí sửa','Trước','Sau','Scan ID'],data.audit]
 ];
 for(const [sheet,headers,rows] of defs){
  const ws=wb.addWorksheet(sheet);
  ws.addRow(headers);
  for(const r of rows){
   const row=ws.addRow(r);
   // Stable ZIP-relative links; never expose short-lived signed URLs in Excel.
   if((sheet==='Tổng hợp'||sheet==='Điểm phòng thi')&&r[10]){
    row.getCell(11).value={text:r[10],hyperlink:r[10]};
    row.getCell(11).font={color:{argb:'FF1565C0'},underline:true};
   }
  }
  ws.getRow(1).font={bold:true};
  if(typeof ws.getColumn==='function'&&(sheet==='Tổng hợp'||sheet==='Điểm phòng thi')){
   ws.getColumn(1).numFmt='@';
   for(const col of sheet==='Điểm phòng thi'?[5,6,7,8,9]:[5,6,7,8])
    ws.getColumn(col).numFmt='0.00';
  }
  ws.columns=headers.map(h=>({width:Math.max(14,Math.min(32,h.length+8))}));
  if(ws.autoFilter===undefined){}else ws.autoFilter={from:'A1',to:ws.getRow(1).getCell(headers.length).address};
 }
 const b=await wb.xlsx.writeBuffer();
 return new Uint8Array(b);
}
async function ensureExcelJS(){
 if(typeof window==='undefined')throw Error('browser_required');
 if(window.ExcelJS?.Workbook)return window.ExcelJS;
 const prefix=location.pathname.includes('/teacher/')?'../vendor/':'vendor/';
 const load=path=>new Promise((resolve,reject)=>{
  const s=document.createElement('script');s.src=prefix+path;s.onload=resolve;
  s.onerror=()=>reject(Error('exceljs_dependency_load_failed'));document.head.appendChild(s);
 });
 // The repo's ExcelJS *bare* bundle requires regeneratorRuntime to be loaded
 // first. Desktop already loads it, while PWA must load it on demand.
 if(typeof window.regeneratorRuntime==='undefined')
   await load('regenerator-runtime-0.13.11.min.js');
 await load('exceljs-4.3.0.bare.min.js');
 if(!window.ExcelJS?.Workbook)throw Error('exceljs_unavailable');
 return window.ExcelJS;
}
async function exportBatch(list,client,sb,token,{download,status,part=1,
 maxItems=20,roster=null,roomLabel='',printEngine=Print}={}){
 if(!Array.isArray(list)||!list.length)throw Error('no_evidence_records');
 if(!client?.signed||!client?.downloadBlob)throw Error('client_required');
 const selected=[...list].sort(Naming.codeSort).slice(0,Math.max(1,Math.min(60,Number(maxItems)||20)));
 if(!printEngine?.bytesToJpeg||!printEngine?.pdfFromJpeg)
  throw Error('omr_export_print_engine_unavailable');
 const records=[],files=[],seenNames=new Set();
 const manifest={version:2,generated_at:new Date().toISOString(),
  formats:['pdf','jpg','json','xlsx'],items:[]};
 for(let i=0;i<selected.length;i++){
  const item=selected[i];
  if(status)status('Đang chuẩn bị phiếu '+(i+1)+'/'+selected.length);
  const signed=await client.signed(sb,token,item.id);
  const url=new URL(signed.url);
  if(!url.hostname.endsWith('.supabase.co'))throw Error('signed_url_untrusted_host');
  const response=await fetch(url.toString(),{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('evidence_download_failed');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(!bytes.length||bytes.length>2000000)throw Error('evidence_download_size_invalid');
  const evidence=signed.record?.evidence||{};
  // The authenticated staff list is the preferred identity source.
  const entry={...item,student_code:item.student_code||evidence.student_code,
    student_name:item.student_name||evidence.student_name,
    class_name:item.class_name||evidence.class_name,
    exam_code:item.exam_code||evidence.exam_code};
  const stem=Naming.uniqueStem(entry,seenNames);
  const pdfName=Naming.pathFromStem(stem,'pdf');
  const jpgName=Naming.pathFromStem(stem,'jpg');
  const jsonName=Naming.pathFromStem(stem,'json');
  const mime=response.headers.get('content-type')||'image/webp';
  // Storage retains compressed private WebP; exports use common, printable formats.
  const jpg=await printEngine.bytesToJpeg(bytes,mime);
  const pdf=printEngine.pdfFromJpeg(jpg.bytes,jpg.width,jpg.height);
  const record={...signed.record,evidence:{...evidence,
    student_code:entry.student_code,student_name:entry.student_name,
    class_name:entry.class_name,exam_code:entry.exam_code}};
  records.push({...entry,filename:pdfName,imageFilename:jpgName,record});
  files.push({name:pdfName,data:pdf});
  files.push({name:jpgName,data:jpg.bytes});
  files.push({name:jsonName,data:JSON.stringify(record.evidence,null,2)});
  manifest.items.push({id:item.id,filename:pdfName,pdf:pdfName,image:jpgName,
    json:jsonName,sbd:entry.student_code,student_name:entry.student_name,
    scan_id:item.scan_id,revision:item.revision,exam_code:entry.exam_code});
 }
 if(status)status('Đang tạo Excel và gói ZIP...');
 const excel=await xlsx(records,await ensureExcelJS(),{roster});
 files.unshift({name:'thong-ke-omr.xlsx',data:excel});
 files.push({name:'manifest.json',data:JSON.stringify(manifest,null,2)});
 const safeRoom=Naming.clean(roomLabel,'minh-chung').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,38);
 const archive=zip(files),name='OMR-'+safeRoom+'-'+new Date().toISOString().slice(0,10)+
  '-phan-'+String(part).padStart(2,'0')+'.zip';
 if(download!==false)client.downloadBlob(archive,name);
 if(status)status('Đã tạo ZIP: '+records.length+' phiếu, '+(archive.size/1024/1024).toFixed(1)+' MB');
 return {archive,filename:name,records:records.length,bytes:archive.size};
}
return {crc32,zip,rowsFrom,roomRows,xlsx,ensureExcelJS,exportBatch};
});