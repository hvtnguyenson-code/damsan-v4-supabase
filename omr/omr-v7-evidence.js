(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DamSanOmrEvidence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='OMR_EVIDENCE_01';
const COLORS={correct:'#159449',wrong:'#d92d20',expected:'#e8b008',review:'#f97316',marker:'#0284c7',edited:'#7c3aed'};
const displayScore=n=>Number.isFinite(Number(n))?Number(n).toFixed(2).replace('.',','):'—';
const text=v=>String(v??'').trim();
const normalizedShort=v=>text(v).replace(/'/g,'').replace(/,/g,'.').replace(/\s/g,'').toLowerCase();
const normalizedDs=v=>text(v).toUpperCase().replace(/Đ/g,'D');
const isChoice=v=>/^[A-D]$/.test(text(v).toUpperCase());
const isDs=v=>/^[ĐDS]$/.test(text(v).toUpperCase());
function slotsOf(v){
 const s=text(v).replace(/\./g,',');
 if(!/^-?\d+(,\d+)?$/.test(s)||s.length>4)return null;
 const chars=[...s];if(chars.some((c,i)=>(c==='-'&&i!==0)||(c===','&&(i===0||i===3))))return null;
 return Array.from({length:4},(_,i)=>chars[i]||'');
}
function pointAt(T,section,q,slot,token){
 if(section==='P1'){
  const labels=T.p1Labels||['A','B','C','D'];
  const j=labels.indexOf(text(token).toUpperCase());
  return j>=0?T.p1[q]?.[j]:null;
 }
 if(section==='P2'){
  const labels=T.p2Labels||['Đ','S'];
  const j=labels.findIndex(label=>normalizedDs(label)===normalizedDs(token));
  return j>=0?T.p2[q*4+slot]?.[j]:null;
 }
 const labels=T.p3Labels||['-',',','0','1','2','3','4','5','6','7','8','9'];
 const j=labels.indexOf(text(token));
 return j>=0?T.p3[q]?.[slot]?.[j]:null;
}
function markers(T){
 return (T.markers||[]).filter(m=>!['TL','TR','BR','BL'].includes(m.name)).map(m=>[m.x,m.y]);
}
function makeMarks(preview,T,original){
 if(!preview?.ok||!preview.grade?.details||!T)throw Error('EVIDENCE_PREVIEW_REQUIRED');
 const marks=[],edits=[],warnings=[],summary={correct:0,wrong:0,blank:0,review:0,manual:0,unsafeP3Answer:0};
 const originalP1=text(original?.p1);
 const originalP2=Array.isArray(original?.p2)?original.p2:[];
 const originalP3=Array.isArray(original?.p3)?original.p3:[];
 const push=(pt,kind,key,edited=false)=>{
  if(!Array.isArray(pt)||pt.length!==2||!pt.every(Number.isFinite))return;
  marks.push({pt,kind,key,edited});
 };
 const p1=preview.grade.details.filter(d=>String(d.phan)==='1'),
       p2=preview.grade.details.filter(d=>String(d.phan)==='2'),
       p3=preview.grade.details.filter(d=>String(d.phan)==='3');
 p1.forEach((d,i)=>{
  const key='P1.'+(i+1),got=text(d.chon).toUpperCase(),correct=text(d.dung).toUpperCase();
  const edited=(originalP1[i]||'')!==got;
  if(edited){summary.manual++;edits.push({key,before:originalP1[i]||'',after:got});}
  if(!isChoice(correct)){warnings.push(key+': invalid answer key');return;}
  if(got===correct){push(pointAt(T,'P1',i,0,got),'correct',key,edited);summary.correct++;}
  else{
   if(isChoice(got)){push(pointAt(T,'P1',i,0,got),'wrong',key,edited);summary.wrong++;}
   else{summary.blank++;if(got==='?'){summary.review++;warnings.push(key+': uncertain');}}
   push(pointAt(T,'P1',i,0,correct),'expected',key);
  }
 });
 p2.forEach((d,i)=>{
  const got=text(d.chon).split('-'),correct=text(d.dung).split('-');
  const base=text(originalP2[i]).split('-');
  for(let j=0;j<4;j++){
   const key='P2.'+(i+1)+'abcd'[j];
   const c=correct[j]||'',g=got[j]||'',edited=normalizedDs(base[j])!==normalizedDs(g);
   if(edited){summary.manual++;edits.push({key,before:base[j]||'',after:g});}
   if(!isDs(c)){warnings.push(key+': invalid answer key');continue;}
   if(isDs(g)&&normalizedDs(g)===normalizedDs(c)){
    push(pointAt(T,'P2',i,j,g),'correct',key,edited);summary.correct++;
   }else{
    if(isDs(g)){push(pointAt(T,'P2',i,j,g),'wrong',key,edited);summary.wrong++;}
    else{summary.blank++;if(g==='?'){summary.review++;warnings.push(key+': uncertain');}}
    push(pointAt(T,'P2',i,j,c),'expected',key);
   }
  }
 });
 p3.forEach((d,i)=>{
  const key='P3.'+(i+1),got=text(d.chon),correct=text(d.dung),
       orig=text(originalP3[i]);
  const edited=got!==orig;
  if(edited){summary.manual++;edits.push({key,before:orig,after:got});}
  const right=got!==''&&normalizedShort(got)===normalizedShort(correct);
  const gotSlots=slotsOf(got),correctSlots=slotsOf(correct);
  if(right){
   if(gotSlots)for(let j=0;j<4;j++)if(gotSlots[j])push(pointAt(T,'P3',i,j,gotSlots[j]),'correct',key+'.'+(j+1),edited);
   summary.correct++;
  }else{
   if(gotSlots)for(let j=0;j<4;j++)if(gotSlots[j])push(pointAt(T,'P3',i,j,gotSlots[j]),'wrong',key+'.'+(j+1),edited);
   if(!got||got==='?'){summary.blank++;if(got==='?')summary.review++;}
   // Numeric equivalents and invalid lengths cannot safely be drawn as expected bubbles.
   // In those cases only the textual correct answer is shown in the report.
   if(correctSlots)for(let j=0;j<4;j++)if(correctSlots[j])
    push(pointAt(T,'P3',i,j,correctSlots[j]),'expected',key+'.'+(j+1));
   else{}
   if(!correctSlots){summary.unsafeP3Answer++;warnings.push(key+': correct numeric form not drawable; show text');}
   summary.wrong++;
  }
 });
 return {marks,edits,warnings,summary,version:VERSION,diagnosticOnly:true};
}
function renderImage(canvas,gray,T,report,{markersVisible=false}={}){
 if(!canvas?.getContext||!gray?.gray||!T||!report)throw Error('EVIDENCE_IMAGE_REQUIRED');
 const srcW=gray.width,srcH=gray.height,w=Math.min(1200,srcW),h=Math.round(srcH*w/srcW);
 const ctx=canvas.getContext('2d');
 canvas.width=w;canvas.height=h;
 const image=ctx.createImageData(w,h),dst=image.data,data=gray.gray;
 for(let y=0;y<h;y++){
  const iy=Math.min(srcH-1,Math.round(y*(srcH-1)/Math.max(1,h-1)));
  for(let x=0;x<w;x++){
   const ix=Math.min(srcW-1,Math.round(x*(srcW-1)/Math.max(1,w-1)));
   const v=data[iy*srcW+ix],p=(y*w+x)*4;
   dst[p]=v;dst[p+1]=v;dst[p+2]=v;dst[p+3]=255;
  }
 }
 ctx.putImageData(image,0,0);
 const px=pt=>[pt[0]*(w-1)/T.widthCm,pt[1]*(h-1)/T.heightCm];
 const radius=Math.max(3,T.bubbleRadiusCm*(w-1)/T.widthCm*.62);
 if(markersVisible)for(const pt of markers(T)){
  const [x,y]=px(pt);ctx.strokeStyle=COLORS.marker;ctx.lineWidth=1.2;
  ctx.strokeRect(x-radius*.7,y-radius*.7,1.4*radius,1.4*radius);
 }
 for(const m of report.marks){
  const [x,y]=px(m.pt);
  ctx.strokeStyle=COLORS[m.kind];ctx.lineWidth=Math.max(2,radius*.35);
  ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
  if(m.edited){ctx.strokeStyle=COLORS.edited;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(x,y,radius+3,0,Math.PI*2);ctx.stroke();}
 }
 return {width:w,height:h};
}
function compose(canvas,gray,T,preview,original,meta={},options={}){
 const report=makeMarks(preview,T,original);
 const photo=(typeof document!=='undefined')?document.createElement('canvas'):options.createCanvas?.();
 if(!photo)throw Error('EVIDENCE_CANVAS_REQUIRED');
 renderImage(photo,gray,T,report,options);
 const out=canvas||((typeof document!=='undefined')?document.createElement('canvas'):options.createCanvas?.());
 if(!out?.getContext)throw Error('EVIDENCE_OUTPUT_CANVAS_REQUIRED');
 const header=188,gutter=24;
 out.width=photo.width;out.height=photo.height+header;
 const ctx=out.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);
 const name=text(meta.studentName||preview.student?.ho_ten||'');
 const room=text(meta.roomName||preview.room?.ten_dot||'');
 const student=text(meta.studentCode||preview.student?.ma_hs||'');
 const code=text(preview.variant?.code||'');
 ctx.fillStyle='#0f172a';ctx.font='bold 24px Arial, sans-serif';
 ctx.fillText('KẾT QUẢ CHẤM OMR V7',gutter,36,out.width-2*gutter);
 ctx.font='18px Arial, sans-serif';
 ctx.fillText('Bài: '+room,gutter,70,out.width-2*gutter);
 ctx.fillText('Học sinh: '+name+'  |  SBD: '+student+'  |  Mã đề: '+code,gutter,100,out.width-2*gutter);
 const parts=preview.grade.parts;
 ctx.font='bold 19px Arial, sans-serif';
 ctx.fillText('P1: '+displayScore(parts.p1)+'   P2: '+displayScore(parts.p2)+'   P3: '+displayScore(parts.p3)+'   TỔNG: '+displayScore(meta.finalScore??preview.grade.score),gutter,132,out.width-2*gutter);
 ctx.font='14px Arial, sans-serif';ctx.fillStyle='#475569';
 const status=meta.status==='official'?'ĐÃ LƯU CHÍNH THỨC':'DỰ KIẾN / THỬ NGHIỆM';
 ctx.fillText(status+'  •  '+VERSION+'  •  '+text(meta.timestamp||new Date().toISOString()),gutter,159,out.width-2*gutter);
 ctx.fillText('Xanh: đúng • Đỏ: chọn sai • Vàng: đáp án đúng • Tím: giáo viên đã sửa',gutter,180,out.width-2*gutter);
 ctx.drawImage(photo,0,header);
 return {canvas:out,report};
}
function record(preview,original,report,meta={}){
 const grade=preview.grade,part=grade.parts;
 return {schema:1,version:VERSION,scan_id:meta.scanId||null,revision:meta.revision||1,
  room_id:preview.room?.id||null,student_id:preview.student?.id||null,
  student_name:preview.student?.ho_ten||'',student_code:preview.student?.ma_hs||'',
  class_name:preview.student?.lop||'',room_name:preview.room?.ten_dot||preview.room?.MaPhong||'',
  exam_code:preview.variant?.code||null,mode:meta.mode||'test',
  recognized:{p1:original?.p1||'',p2:original?.p2||[],p3:original?.p3||[]},
  confirmed:{p1:preview.scan?.p1||'',p2:preview.scan?.p2||[],p3:preview.scan?.p3||[]},
  grade:{total:grade.score,parts:{p1:part.p1,p2:part.p2,p3:part.p3},details:grade.details},
  edits:report.edits,uncertain_details:preview.scan?.uncertainDetails||[],
  report_summary:report.summary,notes:report.warnings,created_at:meta.timestamp||new Date().toISOString()};
}
return {VERSION,COLORS,slotsOf,pointAt,makeMarks,renderImage,compose,record,displayScore};
});