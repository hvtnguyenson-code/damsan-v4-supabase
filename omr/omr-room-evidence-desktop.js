(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrRoomEvidence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const $=id=>root.document?.getElementById(id);
const Client=root.DamSanOmrEvidenceClient;
const Export=root.DamSanOmrEvidenceExport;
const Naming=root.DamSanOmrEvidenceNaming;
const state={room:null,items:[],index:null,lastLoad:0,loading:null,exportOffset:0,
 exportedRoom:null,drawerId:null,viewerObjectUrl:null,initialized:false};
const text=v=>String(v??'');
function accessToken(){return root.sessionStorage?.getItem('damSan_StaffToken')||'';}
function roomCode(room){return text(room?.MaPhong||room?.ma_phong||'');}
function status(message){if($('omrRoomExportStatus'))$('omrRoomExportStatus').textContent=message;}
function hideDrawer(){
 const drawer=$('omrRoomEvidenceDrawer');if(drawer)drawer.hidden=true;
 const image=$('omrRoomEvidenceImage');if(image)image.removeAttribute('src');
 if(state.viewerObjectUrl){URL.revokeObjectURL(state.viewerObjectUrl);state.viewerObjectUrl=null;}
 state.drawerId=null;
}
function init(){
 if(state.initialized)return;
 if(!Client||!Export||!Naming||!$('omrRoomEvidencePanel'))return;
 state.initialized=true;
 $('omrRoomEvidenceExport').addEventListener('click',exportRoom);
 $('omrRoomEvidenceRefresh').addEventListener('click',()=>refreshForRoom(state.room,{force:true}));
 $('omrRoomEvidenceClose').addEventListener('click',hideDrawer);
 $('omrRoomEvidenceBackdrop').addEventListener('click',hideDrawer);
 root.document.addEventListener('keydown',e=>{if(e.key==='Escape')hideDrawer();});
 $('dashBody')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-omr-view]');
  if(!button)return;
  const sbd=button.dataset.omrView||'';
  void openBySbd(sbd);
 });
}
function clearRoom(room){
 state.room=room;state.items=[];state.index=null;state.lastLoad=0;state.exportOffset=0;
 state.exportedRoom=null;hideDrawer();
 if($('omrRoomEvidenceDownload'))Client?.clearPreparedDownload($('omrRoomEvidenceDownload'));
 status('Chọn phòng và tải điểm để xem minh chứng.');
 decorateTable();
}
function decorateTable(){
 const cells=root.document?.querySelectorAll('#dashBody td[data-omr-sbd]')||[];
 for(const cell of cells){
  cell.textContent='';
  const code=decodeURIComponent(cell.dataset.omrSbd||'');
  const item=state.index?.byCode.get(Naming.normalizedCode(code));
  if(!item){cell.textContent='—';continue;}
  const btn=root.document.createElement('button');
  btn.type='button';btn.className='omr-room-view-btn';
  btn.textContent='Xem phiếu';btn.dataset.omrView=code;
  btn.setAttribute('aria-label','Xem phiếu OMR của SBD '+code);
  cell.appendChild(btn);
 }
}
async function refreshForRoom(room,{force=false}={}){
 init();
 if(!room||!room.id){clearRoom(null);return;}
 if(!state.room||String(room.id)!==String(state.room.id))clearRoom(room);
 decorateTable();
 if(!Client||!state.initialized||!accessToken())return;
 if(state.loading)return state.loading;
 if(!force&&Date.now()-state.lastLoad<30000)return;
 state.loading=(async()=>{
  try{
   status('Đang kiểm tra minh chứng của phòng '+roomCode(room)+'...');
   const items=await Client.list(root.DamSanOmrEvidenceRuntime?.getClient?.(),accessToken(),room.id);
   if(String(state.room?.id)!==String(room.id))return;
   state.items=items;state.index=Naming.latestByStudent(items);state.lastLoad=Date.now();
   const count=state.index.byCode.size;
   status(count+' học sinh có phiếu minh chứng • '+items.length+' phiên bản phiếu.');
   decorateTable();
  }catch(e){
   if(String(state.room?.id)===String(room.id))
    status('Chưa tải được danh sách phiếu OMR: '+text(e?.message||e)+'. Điểm phòng thi không bị ảnh hưởng.');
  }finally{state.loading=null;}
 })();
 return state.loading;
}
async function openBySbd(sbd){
 init();
 if(!state.room||!state.index){status('Vui lòng chọn phòng và làm mới minh chứng.');return;}
 const item=state.index.byCode.get(Naming.normalizedCode(sbd));
 if(!item){status('Không tìm thấy minh chứng của SBD '+sbd);return;}
 const drawer=$('omrRoomEvidenceDrawer'),info=$('omrRoomEvidenceInfo'),img=$('omrRoomEvidenceImage');
 if(!drawer||!img)return;
 drawer.hidden=false;state.drawerId=item.id;
 const roomId=state.room.id;
 info.textContent='Đang mở phiếu '+item.student_code+' — '+item.student_name+'...';
 img.removeAttribute('src');
 if(state.viewerObjectUrl){URL.revokeObjectURL(state.viewerObjectUrl);state.viewerObjectUrl=null;}
 try{
  const signed=await Client.signed(root.DamSanOmrEvidenceRuntime?.getClient?.(),accessToken(),item.id);
  if(state.drawerId!==item.id||state.room?.id!==roomId)return;
  const preview=signed.record?.evidence?.grade?.total;
  info.textContent=(item.student_code||'')+' — '+(item.student_name||'')+
    ' ('+(item.class_name||'')+') • Mã đề '+(item.exam_code||'—')+
    ' • Điểm dự kiến V7: '+(Number.isFinite(Number(preview))?Number(preview).toFixed(2).replace('.',','):'—')+
    ' • '+(item.mode==='test'?'Minh chứng thử nghiệm':'Minh chứng chính thức');
  // connect-src permits Supabase, but img-src only permits same-origin and blob:.
  // Retrieve the private photo and show a revocable blob URL.
  const url=new URL(signed.url);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co'))
   throw Error('evidence_signed_url_untrusted');
  const response=await fetch(url.toString(),{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('evidence_image_fetch_'+response.status);
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!['image/webp','image/jpeg','image/png'].includes(mime))throw Error('evidence_image_type_invalid');
  const blob=await response.blob();
  if(!blob.size||blob.size>2000000)throw Error('evidence_image_size_invalid');
  if(state.drawerId!==item.id||state.room?.id!==roomId)return;
  if(state.viewerObjectUrl)URL.revokeObjectURL(state.viewerObjectUrl);
  const objectUrl=URL.createObjectURL(blob);
  state.viewerObjectUrl=objectUrl;
  img.alt='Phiếu OMR '+item.student_code+' của '+item.student_name;
  img.onerror=()=>{
   if(state.drawerId===item.id){
    info.textContent='Không hiển thị được phiếu. Có thể mở lại hoặc tải gói PDF.';
    if(state.viewerObjectUrl===objectUrl){URL.revokeObjectURL(objectUrl);state.viewerObjectUrl=null;}
   }
  };
  img.src=objectUrl;
 }catch(e){
  if(state.drawerId===item.id)info.textContent='Lỗi mở phiếu: '+text(e?.message||e);
 }
}
async function exportRoom(){
 init();
 const room=state.room,button=$('omrRoomEvidenceExport'),anchor=$('omrRoomEvidenceDownload');
 if(!room||!button||button.disabled)return;
 button.disabled=true;button.textContent='Đang tạo Excel + PDF...';
 Client.clearPreparedDownload(anchor);
 try{
  await refreshForRoom(room,{force:true});
  const roster=typeof root.getOmrDashboardRoster==='function'?root.getOmrDashboardRoster():[];
  if(!roster.length)throw Error('Chưa có danh sách học sinh. Bấm Cập nhật Bảng Điểm trước.');
  const index=Naming.latestByStudent(state.items);
  const sorted=[...roster].sort(Naming.codeSort);
  const images=[],added=new Set();
  for(const student of sorted){
   const item=Naming.findByStudent(index,student);
   if(item&&!added.has(item.id)){images.push(item);added.add(item.id);}
  }
  // A room of <=60 marked sheets is one ZIP. Larger sets are delivered
  // sequentially, never many simultaneous downloads on an Android PWA.
  const offset=state.exportedRoom===room.id&&state.exportOffset<images.length?state.exportOffset:0;
  const group=images.slice(offset,offset+60);
  const part=Math.floor(offset/60)+1;
  let archive,filename;
  if(group.length){
   const result=await Export.exportBatch(group,Client,root.DamSanOmrEvidenceRuntime?.getClient?.(),accessToken(),
    {roster:sorted,roomLabel:roomCode(room),part,maxItems:60,download:false,status});
   archive=result.archive;filename=result.filename;
  }else{
   const excel=await Export.xlsx([],await Export.ensureExcelJS(),{roster:sorted});
   archive=Export.zip([{name:'thong-ke-omr.xlsx',data:excel}]);
   filename='OMR-'+roomCode(room).replace(/[^a-z0-9_-]/gi,'-')+'-diem-phong.xlsx.zip';
  }
  const prepared=Client.prepareDownload(archive,filename,anchor);
  const left=Math.max(0,images.length-offset-group.length);
  state.exportedRoom=room.id;state.exportOffset=offset+group.length;
  status('Đã tạo bảng điểm đủ '+roster.length+' học sinh (theo SBD), kèm '+group.length+
   ' phiếu minh chứng. '+(left?'Còn '+left+' phiếu ở gói tiếp theo. ':'')+
   'Chạm liên kết màu xanh để tải '+(prepared.bytes/1024/1024).toFixed(2)+' MB.');
  button.textContent=left?'Tạo ZIP tiếp ('+left+' phiếu)':'Xuất điểm + phiếu OMR';
  anchor.scrollIntoView?.({block:'nearest'});
 }catch(e){
  status('Không xuất được gói điểm + phiếu: '+text(e?.message||e)+'. Không thay đổi kết quả đã lưu.');
 }finally{
  button.disabled=false;
  if(button.textContent==='Đang tạo Excel + PDF...')button.textContent='Xuất điểm + phiếu OMR';
 }
}
return {init,refreshForRoom,decorateTable,openBySbd,exportRoom,hideDrawer};
});