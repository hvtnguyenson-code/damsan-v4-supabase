(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrEvidenceExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
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
function zip(files){
 if(!Array.isArray(files)||!files.length)throw Error('zip_files_required');
 const chunks=[],central=[];let offset=0;
 const u16=(d,o,n)=>d.setUint16(o,n,true),u32=(d,o,n)=>d.setUint32(o,n>>>0,true);
 const append=bytes=>{chunks.push(bytes);offset+=bytes.length;};
 for(const f of files){
  const name=String(f.name||'').replace(/\\/g,'/').replace(/^\/+/,'');
  if(!name||name.includes('..')||name.length>128||!/^[a-zA-Z0-9_\-./]+$/.test(name))
   throw Error('zip_name_invalid');
  const body=f.data instanceof Uint8Array?f.data:enc.encode(String(f.data??''));
  if(body.length>20*1024*1024)throw Error('zip_file_too_large');
  const basename=enc.encode(name),checksum=crc32(body),start=offset;
  const h=new Uint8Array(30+basename.length),v=new DataView(h.buffer);
  u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x0800);u16(v,8,0); // UTF-8, store
  u32(v,14,checksum);u32(v,18,body.length);u32(v,22,body.length);
  u16(v,26,basename.length);h.set(basename,30);
  append(h);append(body);
  const d=new Uint8Array(46+basename.length),w=new DataView(d.buffer);
  u32(w,0,0x02014b50);u16(w,4,20);u16(w,6,20);u16(w,8,0x0800);u16(w,10,0);
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
    r.record?.scan_id||r.scan_id||''];
  overview.push(base);
  (grade.details||[]).forEach(q=>details.push([data.student_code||'',
    q.phan||'',q.q||'',q.chon||'',q.dung||'',q.diem??0]));
  (data.edits||[]).forEach(change=>audit.push([data.student_code||'',
    change.key||'',change.before||'',change.after||'',r.record?.scan_id||'']));
 }
 return {overview,details,audit};
}
async function xlsx(records,ExcelJS){
 if(!ExcelJS?.Workbook)throw Error('exceljs_unavailable');
 const wb=new ExcelJS.Workbook();wb.creator='Đam San OMR V7';
 const data=rowsFrom(records);
 const defs=[
  ['Tổng hợp',['SBD','Họ tên','Lớp','Mã đề','P1','P2','P3','Tổng','Trạng thái','Scan ID'],data.overview],
  ['Chi tiết',['SBD','Phần','Câu','Học sinh chọn','Đáp án đúng','Điểm'],data.details],
  ['Đối chiếu',['SBD','Vị trí sửa','Trước','Sau','Scan ID'],data.audit]
 ];
 for(const [sheet,headers,rows] of defs){
  const ws=wb.addWorksheet(sheet);
  ws.addRow(headers);for(const r of rows)ws.addRow(r);
  ws.getRow(1).font={bold:true};
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
async function exportBatch(list,client,sb,token,{download,status,part=1}={}){
 if(!Array.isArray(list)||!list.length)throw Error('no_evidence_records');
 if(!client?.signed||!client?.downloadBlob)throw Error('client_required');
 const selected=list.slice(0,20);
 const records=[],files=[],manifest={version:1,generated_at:new Date().toISOString(),items:[]};
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
  const filename='sheets/'+String(i+1).padStart(3,'0')+'-'+item.id.slice(0,8)+
    (response.headers.get('content-type')?.includes('webp')?'.webp':'.jpg');
  records.push({...item,record:signed.record});
  files.push({name:filename,data:bytes});
  manifest.items.push({id:item.id,filename,scan_id:item.scan_id,exam_code:item.exam_code});
 }
 if(status)status('Đang tạo Excel và gói ZIP...');
 const excel=await xlsx(records,await ensureExcelJS());
 files.unshift({name:'thong-ke-omr.xlsx',data:excel});
 files.push({name:'manifest.json',data:JSON.stringify(manifest,null,2)});
 const archive=zip(files),name='omr-minh-chung-'+new Date().toISOString().slice(0,10)+'-phan-'+String(part).padStart(2,'0')+'.zip';
 if(download!==false)client.downloadBlob(archive,name);
 if(status)status('Đã tạo ZIP: '+records.length+' phiếu, '+(archive.size/1024/1024).toFixed(1)+' MB');
 return {archive,records:records.length,bytes:archive.size};
}
return {crc32,zip,rowsFrom,xlsx,ensureExcelJS,exportBatch};
});