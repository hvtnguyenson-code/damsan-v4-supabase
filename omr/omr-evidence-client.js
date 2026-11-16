(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrEvidenceClient=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const FUNCTION='omr-evidence';
const MAX_IMAGE_BYTES=1500000;
function imageUrl(canvas){
 if(!canvas?.width||!canvas?.height)throw Error('evidence_canvas_empty');
 if(typeof document==='undefined')throw Error('evidence_browser_required');
 let target=canvas;
 const maximum=1900,scale=Math.min(1,maximum/Math.max(canvas.width,canvas.height));
 if(scale<1){
  target=document.createElement('canvas');
  target.width=Math.max(1,Math.round(canvas.width*scale));
  target.height=Math.max(1,Math.round(canvas.height*scale));
  target.getContext('2d').drawImage(canvas,0,0,target.width,target.height);
 }
 for(const [format,quality] of [['image/webp',.72],['image/webp',.55],['image/jpeg',.58]]){
  const image=target.toDataURL(format,quality);
  if(!image.startsWith('data:'+format+';base64,'))continue;
  if(Math.ceil((image.length-image.indexOf(',')-1)*.75)<=MAX_IMAGE_BYTES)return image;
 }
 throw Error('evidence_image_too_large');
}
async function call(sb,token,request){
 if(!sb?.functions?.invoke||typeof token!=='string'||token.length<20)
   throw Error('evidence_session_required');
 const {data,error}=await sb.functions.invoke(FUNCTION,{body:{...request,staff_token:token}});
 if(error)throw Error('evidence_service_unavailable');
 if(data?.status!=='success')throw Error(data?.code||'evidence_request_failed');
 return data;
}
function save(sb,token,{scanId,revision,preview,original,report,canvas,capture,mode='test'}){
 if(!preview?.ok||!scanId||!Number.isInteger(revision))throw Error('evidence_invalid_preview');
 return call(sb,token,{
  action:'save',mode,scan_id:scanId,revision,room_id:preview.room.id,
  student_id:preview.student?.id||null,exam_code:preview.variant.code,
  annotated_image:imageUrl(canvas),capture_image:imageUrl(capture),
  evidence:report
 });
}
async function list(sb,token,roomId){
 const items=[];let offset=0;
 for(let page=0;page<50;page++){
  const response=await call(sb,token,{action:'list',room_id:roomId,offset});
  const segment=response.items||[];
  items.push(...segment);
  if(response.next_offset==null)return items;
  if(response.next_offset<=offset||segment.length!==200)throw Error('evidence_pagination_invalid');
  offset=response.next_offset;
 }
 throw Error('evidence_max_pages_exceeded');
}
async function signed(sb,token,id,kind='annotated'){
 const res=await call(sb,token,{action:'get',artifact_id:id,kind});
 return res;
}
function downloadBlob(blob,filename){
 if(typeof document==='undefined')throw Error('evidence_browser_required');
 const href=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=href;a.download=String(filename||'minh-chung').normalize('NFC')
   .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,' ').replace(/\s+/g,' ')
   .trim().slice(0,140);
 document.body.appendChild(a);a.click();a.remove();
 // Keep the blob alive while Android's download manager accepts it.
 setTimeout(()=>URL.revokeObjectURL(href),60000);
}
// Durable download link: Android PWAs may reject an automatic blob download
// after awaited network operations have exhausted the user's tap activation.
// A real visible anchor lets the user initiate that download explicitly.
const preparedLinks=new WeakMap();
function clearPreparedDownload(anchor){
 if(!anchor)return;
 const old=preparedLinks.get(anchor);
 if(old){URL.revokeObjectURL(old);preparedLinks.delete(anchor);}
 anchor.removeAttribute('href');
 anchor.removeAttribute('download');
 anchor.style.display='none';
}
function prepareDownload(blob,filename,anchor){
 if(!(blob instanceof Blob)||!blob.size||!anchor||anchor.tagName!=='A')
   throw Error('evidence_download_prepare_invalid');
 const safeName=String(filename||'minh-chung.zip').replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,100);
 clearPreparedDownload(anchor);
 const href=URL.createObjectURL(blob);
 preparedLinks.set(anchor,href);
 anchor.href=href;anchor.download=safeName;anchor.style.display='block';
 anchor.textContent='Tải tệp '+safeName+' ('+(blob.size/1024/1024).toFixed(2)+' MB)';
 return {href,filename:safeName,bytes:blob.size};
}
function canvasDownload(canvas,name){
 if(!canvas)throw Error('evidence_canvas_empty');
 // The cloud keeps compressed WebP; human-facing downloads use JPG.
 canvas.toBlob(blob=>{
  if(!blob)return;
  downloadBlob(blob,name+'.jpg');
 },'image/jpeg',.88);
}
return {FUNCTION,MAX_IMAGE_BYTES,imageUrl,call,save,list,signed,downloadBlob,canvasDownload,
 prepareDownload,clearPreparedDownload};
});