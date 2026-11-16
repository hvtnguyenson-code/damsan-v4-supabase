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
 a.href=href;a.download=filename.replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,100);
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(href),1500);
}
function canvasDownload(canvas,name){
 if(!canvas)throw Error('evidence_canvas_empty');
 canvas.toBlob(blob=>{
  if(!blob)return;
  downloadBlob(blob,name+(blob.type==='image/webp'?'.webp':'.jpg'));
 },'image/webp',.72);
}
return {FUNCTION,MAX_IMAGE_BYTES,imageUrl,call,save,list,signed,downloadBlob,canvasDownload};
});