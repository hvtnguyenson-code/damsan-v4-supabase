(function(root,factory){
 const resolve=(n,g)=>typeof module==='object'&&module.exports?require('./'+n+'.js'):root[g];
 const api=factory(resolve('omr-v7-pipeline-068','DamSanOmrV7Pipeline068'),
  resolve('omr-room-binding','DamSanOmrRoomBinding'),resolve('omr-scan-adapter','DamSanOmrScanAdapter'));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrRelease068=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(P,B,E){
 'use strict';
 const engine='V7_068',mode='v7_068';
 const available=()=>!!P?.analyze&&!!B?.bindScan&&!!E?.fromV6;
 function normalize(result,model){
  const c=result?.candidate,id=result?.identity,reg=result?.registration;
  if(result?.recognitionEngine!==engine||result.readOnly!==true||result.validForSave!==false||
   result.ok!==true||result.requiresRetake!==false||id?.valid!==true||id.issues?.length!==0||
   c?.engine!=='OMR068_RESEARCH_CANDIDATE'||c.ok!==true||c.requiresRetake!==false||
   c.geometryDiagnostic!=='ok'||c.calibration?.reliable!==true||c.p3Calibration?.reliable!==true||
   !Array.isArray(c.retakeReasons)||c.retakeReasons.length||
   !Array.isArray(reg?.corners)||reg.corners.length!==4||reg.corners.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||
   !/^\d{4}$/.test(id.maDe)||!/^\d{8}$/.test(id.sbd))
   throw Error('068 chưa xác minh đủ hình học hoặc SBD/mã đề; cần quét lại');
  const scanned={ok:true,sbd:id.sbd,maDe:id.maDe,markerCorners:reg.corners,
   markerMatches:reg.internalMatches,markerRmse:reg.rmse};
  const binding=B.bindScan(scanned,model);
  if(!binding.ok)throw Error('068: SBD hoặc mã đề không khớp duy nhất với phòng thi; kiểm tra phiếu và quét lại');
  // Retain all issues from the engine AND independently reconstruct unresolved
  // column/row states. Confirmed multiple marks must stay locked to zero.
  const issues=(c.issues||[]).slice(),invalid=new Set(c.invalidMarks||[]),seen=new Set(issues.map(x=>x.key));
  const add=(key,e,lock)=>{
   if(!e||!['review','multiple'].includes(e.state))return;
   if(!seen.has(key)){issues.push({key,state:e.state,reason:e.reason||'Cần kiểm tra dấu tô'});seen.add(key);}
   if(lock&&e.state==='multiple')invalid.add(key);
  };
  if(c.p1Evidence?.length!==18||c.p2Evidence?.length!==16||c.p3Evidence?.length!==6||
    c.p3Evidence.some(x=>x.columns?.length!==4))throw Error('068 thiếu bằng chứng nhận dạng');
  c.p1Evidence.forEach((e,i)=>add('P1.'+(i+1),e,true));
  c.p2Evidence.forEach((e,i)=>add('P2.'+(Math.floor(i/4)+1)+'abcd'[i%4],e,true));
  c.p3Evidence.forEach((x,i)=>{
   x.columns.forEach((e,j)=>add('P3.'+(i+1)+'.'+(j+1),e,false));
   if(x.uncertain||x.value==='?')add('P3.'+(i+1),{state:'review',reason:x.reason},false);
  });
  const candidate={...c,issues,invalidMarks:[...invalid]};
  E.validateCandidate(candidate);
  // Only this selected, room-bound production adapter promotes the isolated
  // optical result. The research pipeline itself remains read-only.
  const scan=E.fromV6(scanned,candidate);
  if(scan._requiresRetake)throw Error('068 cần quét lại');
  return {scan:{...scan,recognitionEngine:engine,captureMode:mode,_labReadOnly:false,
   release068:{version:'068',roomId:String(binding.room.id),studentId:String(binding.student.id),
    studentCode:String(binding.student.ma_hs??binding.student.MaHS),sbd:id.sbd,
    examCode:String(binding.variant.code),bubbleExamCode:id.maDe}},candidate};
 }
 function recognize(pixels,T,core,V7,model){
  if(!available()||!core?.warpTemplateGray||!model?.valid1846)throw Error('068 chưa sẵn sàng hoặc phòng thi không hợp lệ');
  let rect=null;
  const captureCore={...core,warpTemplateGray(...args){rect=core.warpTemplateGray(...args);return rect;}};
  const result=P.analyze(pixels,T,{core:captureCore,V7,longSide:1800});
  const normalized=normalize(result,model);
  if(!rect)throw Error('068 chưa có ảnh chuẩn hóa');
  return {...normalized,rect};
 }
 return {engine,mode,available,normalize,recognize};
});
