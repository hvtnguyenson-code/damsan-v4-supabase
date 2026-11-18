(function(){
'use strict';
// Standalone 060 laboratory. No RPC, auth, storage, official writer or PWA import.
const $=id=>document.getElementById(id);
const C=window.DamSanOmr, V7=window.DamSanOmrV7Candidate,
  P=window.DamSanOmrV7Pipeline060, T=window.DamSanOmrTemplate.template;
const sheet=$('sheet'),ctx=sheet.getContext('2d',{willReadFrequently:true});
let hasImage=false,stream=null,busy=false;
function show(id,value){$(id).textContent=JSON.stringify(value,null,2);}
function status(message,bad){$('status').textContent=message;$('status').className=bad?'bad':'good';}
function answers(scan){return scan?{p1:scan.p1,p2:scan.p2,p3:scan.p3}:null;}
function differences(v7,next){
 if(!v7||!v7.p1||!next)return [];
 const diffs=[],add=(key,oldValue,newValue)=>{
  if(String(oldValue??'')!==String(newValue??'')) diffs.push({key,v7:oldValue,omr060:newValue});
 };
 for(let i=0;i<18;i++)add('P1.'+(i+1),v7.p1[i],next.p1?.[i]);
 for(let i=0;i<4;i++)for(let j=0;j<4;j++)
  add('P2.'+(i+1)+'abcd'[j],v7.p2?.[i]?.split('-')?.[j],next.p2?.[i]?.split('-')?.[j]);
 for(let i=0;i<6;i++)add('P3.'+(i+1),v7.p3?.[i],next.p3?.[i]);
 return diffs;
}
function digitField(id,expected){
 const s=$(id).value.trim();
 if(s&&!new RegExp('^[0-9]{1,'+expected+'}$').test(s))
  throw Error(id==='sbd'?'SBD chỉ được gồm tối đa 8 chữ số':'Mã đề chỉ được gồm tối đa 4 chữ số');
 return s||null;
}
async function analyze(){
 if(!hasImage||busy)return;
 busy=true;$('analyze').disabled=true;status('Đang xử lý ảnh cục bộ ...');
 try{
  const expectedStudentCode=digitField('sbd',8),expectedExamCode=digitField('code',4);
  const frame=ctx.getImageData(0,0,sheet.width,sheet.height);
  let old,oldError;
  try{old=V7.analyzeImageData(frame,T,C,null,{longSide:1800});}
  catch(error){oldError=String(error?.message||error);}
  const next=P.analyze(frame,T,{core:C,V7,longSide:1800,expectedStudentCode,expectedExamCode});
  if(next.readOnly!==true||next.validForSave!==false)
   throw Error('OMR060_READ_ONLY_INVARIANT_BROKEN');
  // Never pass results to a write adapter. Keep them as research data only.
  const diffs=differences(old,next.answers);
  show('resultV7',{ok:old?.ok??false,error:oldError||old?.error||null,
    geometry:old?.geometryDiagnostic||old?.stage||null,answers:answers(old),
    warnings:old?.issues||[],elapsedMs:old?.elapsedMs||null});
  show('result060',{ok:next.ok,readOnly:next.readOnly,validForSave:next.validForSave,
    identity:next.identity,answers:next.answers,geometry:next.registration,
    normalization:next.normalization,elapsedMs:next.elapsedMs});
  show('diff',{differences:diffs,identityWarnings:next.identity?.issues||[],
    recognitionWarnings:next.issues||[],inkFlags:next.ink?.flags||[],
    bindingVerified:!!(expectedStudentCode&&expectedExamCode),
    note:'Dữ liệu tham khảo, tuyệt đối không dùng để ghi điểm'});
  status('Đã đối chứng. 060 '+(next.ok?'đạt điều kiện nhận dạng':'cần rà soát/quét lại')+
    '; khác V7 '+diffs.length+' vị trí; không có thao tác lưu.',!next.ok);
 }catch(error){status('Không đọc được phiếu: '+String(error?.message||error),true);}
 finally{busy=false;$('analyze').disabled=!hasImage;}
}
function draw(source,w,h){
 const scale=Math.min(1,2200/Math.max(w,h));
 sheet.width=Math.max(1,Math.round(w*scale));
 sheet.height=Math.max(1,Math.round(h*scale));
 ctx.drawImage(source,0,0,sheet.width,sheet.height);
 hasImage=true;$('analyze').disabled=false;
 void analyze();
}
$('file').addEventListener('change',()=>{
 const file=$('file').files?.[0];
 if(!file)return;
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)){status('Ảnh không đúng định dạng.',true);return;}
 const url=URL.createObjectURL(file),img=new Image();
 img.onload=()=>{URL.revokeObjectURL(url);draw(img,img.naturalWidth,img.naturalHeight);};
 img.onerror=()=>{URL.revokeObjectURL(url);status('Không giải mã được ảnh.',true);};
 img.src=url;
});
async function closeCamera(){
 const previous=stream;stream=null;
 if(previous)for(const track of previous.getTracks())track.stop();
 $('video').hidden=true;$('video').srcObject=null;
 $('capture').disabled=true;$('close').disabled=true;
}
$('camera').addEventListener('click',async()=>{
 await closeCamera();
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera yêu cầu HTTPS hoặc localhost');
  stream=await navigator.mediaDevices.getUserMedia({audio:false,
    video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
  $('video').srcObject=stream;$('video').hidden=false;
  $('capture').disabled=false;$('close').disabled=false;status('Camera sẵn sàng.');
 }catch(e){status('Không mở được camera: '+String(e.message||e),true);}
});
$('capture').addEventListener('click',()=>{
 const v=$('video');
 if(v.videoWidth&&v.videoHeight)draw(v,v.videoWidth,v.videoHeight);
 void closeCamera();
});
$('close').addEventListener('click',()=>void closeCamera());
$('analyze').addEventListener('click',()=>void analyze());
window.addEventListener('pagehide',()=>void closeCamera());
})();
