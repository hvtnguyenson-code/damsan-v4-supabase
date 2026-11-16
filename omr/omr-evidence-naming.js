(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrEvidenceNaming=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clean=(value,fallback='Chưa rõ')=>{
 const raw=String(value??'').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,' ')
  .replace(/\s+/g,' ').replace(/^[. ]+|[. ]+$/g,'').trim();
 return raw||fallback;
};
const normalizedCode=value=>String(value??'').trim().replace(/^00(?=\d{6}$)/,'');
const lower=value=>clean(value,'').toLocaleLowerCase('vi-VN');
function evidenceKey(entry){
 const id=String(entry?.student_id||entry?.record?.student_id||'').trim();
 const code=normalizedCode(entry?.student_code||entry?.record?.evidence?.student_code||'');
 return id?'id:'+id:code?'code:'+code:'';
}
function latestByStudent(entries){
 const items=[...(entries||[])].filter(x=>x&&evidenceKey(x));
 items.sort((a,b)=>{
  const time=Date.parse(b.created_at||b.record?.evidence?.created_at||0)-
   Date.parse(a.created_at||a.record?.evidence?.created_at||0);
  return (Number.isFinite(time)?time:0)||(Number(b.revision||b.record?.revision||0)-Number(a.revision||a.record?.revision||0))||
   String(b.id||'').localeCompare(String(a.id||''));
 });
 const byId=new Map(),byCode=new Map();
 for(const item of items){
  const id=String(item.student_id||item.record?.student_id||''),code=normalizedCode(item.student_code||item.record?.evidence?.student_code);
  if(id&&!byId.has(id))byId.set(id,item);
  if(code&&!byCode.has(code))byCode.set(code,item);
 }
 return {items,byId,byCode};
}
function findByStudent(index,student){
 const id=String(student?.id||student?.student_id||'');
 const code=normalizedCode(student?.MaHS||student?.ma_hs||student?.student_code||'');
 return (id&&index.byId.get(id))||(code&&index.byCode.get(code))||null;
}
function codeSort(a,b){
 const aCode=normalizedCode(a?.MaHS||a?.ma_hs||a?.student_code||'');
 const bCode=normalizedCode(b?.MaHS||b?.ma_hs||b?.student_code||'');
 return aCode.localeCompare(bCode,'vi',{numeric:true,sensitivity:'base'});
}
function stem(item){
 const evidence=item?.record?.evidence||item?.evidence||{};
 const sbd=clean(item?.student_code||evidence.student_code,'Không-SBD');
 const name=clean(item?.student_name||evidence.student_name,'Chưa rõ học sinh');
 const lop=clean(item?.class_name||evidence.class_name,'Không-lớp');
 const code=clean(item?.exam_code||evidence.exam_code,'Không-mã-đề');
 const revision=String(Math.max(1,Math.min(9999,Number(item?.revision||item?.record?.revision||1)||1))).padStart(2,'0');
 const uid=String(item?.scan_id||item?.record?.scan_id||item?.id||'').replace(/[^0-9a-z]/gi,'').slice(0,8)||'noscan';
 // Preserve the student's actual Vietnamese name, while scan ID guarantees
 // uniqueness when the same student is rescanned at revision 1.
 const suffix=' - '+lop+' - MD'+code+' - R'+revision+' - '+uid;
 const prefix=sbd+' - ';
 const encoder=new TextEncoder();
 let safeName=name;
 while(encoder.encode(prefix+safeName+suffix+'.webp').length>188&&safeName.length>1){
  safeName=Array.from(safeName).slice(0,-1).join('');
 }
 return prefix+safeName.trim()+suffix;
}
function filename(item,ext='webp'){return stem(item)+'.'+(String(ext).toLowerCase()==='jpg'?'jpg':'webp');}
function imagePath(item,ext='webp'){return 'phieu-minh-chung/'+filename(item,ext);}
function jsonPath(item){return 'doi-chieu-json/'+stem(item)+'.json';}
return {clean,normalizedCode,evidenceKey,latestByStudent,findByStudent,codeSort,stem,filename,imagePath,jsonPath};
});