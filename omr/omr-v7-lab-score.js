(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrV7LabScore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // A comparison-only helper. Never accept an unbound student/exam code,
 // never alter exam answers, and never call a submission/grade-writing RPC.
 const blocked=reason=>({ok:false,reason});
 function estimate(scan,candidate,roomModel,B,S,E){
  if(scan?._labReadOnly!==true||scan.captureMode!=='compare')
   return blocked('Chỉ có thể tính trong chế độ đối chiếu không lưu điểm');
  if(scan?.ok!==true)
   return blocked('Ảnh chưa xác định được đủ bốn góc phiếu');
  if(!roomModel?.valid1846||typeof B?.bindScan!=='function'
   ||typeof S?.previewScan!=='function'||typeof E?.validateCandidate!=='function')
   return blocked('Phòng thi hoặc dữ liệu chấm chưa sẵn sàng');
  // Always derive the binding from the original, unedited OMR identifiers.
  // An invalid student/code must NEVER be replaced by a guessed binding.
  const binding=B.bindScan({sbd:scan.sbd,maDe:scan.maDe},roomModel);
  if(!binding.ok)
   return blocked('SBD hoặc mã đề không hợp lệ trong phòng thi');
  if(!candidate)return blocked('Thuật toán chưa trả kết quả');
  try{E.validateCandidate(candidate);}
  catch(_err){return blocked('Dữ liệu nhận dạng 18–4–6 không hợp lệ');}
  if(candidate.geometry?.status!=='ok')
   return blocked('Mốc khống chế bên trong phiếu chưa đạt');
  if(candidate.calibration?.reliable!==true)
   return blocked('Phần I/II chưa hiệu chuẩn được');
  if(candidate.p3Calibration?.reliable!==true)
   return blocked('Phần III chưa hiệu chuẩn được');
  if(candidate.engine==='V7_COMPLETE_CANDIDATE'
    &&(candidate.ok!==true||candidate.requiresRetake!==false
      ||candidate.geometryDiagnostic!=='ok'
      ||candidate.readOnly!==true||candidate.validForSave!==false
      ||!Array.isArray(candidate.retakeReasons)||candidate.retakeReasons.length))
   return blocked('V7 chưa đủ điều kiện nhận dạng');
  const uncertain=(candidate.issues||[]).map(issue=>issue.key);
  const candidateScan={...scan,p1:candidate.p1,p2:[...candidate.p2],
   p3:[...candidate.p3],invalidMarks:[...candidate.invalidMarks],
   uncertain,uncertainDetails:[],
   // This value is for an estimate ONLY. In particular, retain lab flags
   // and the original scan's save-blocking properties.
   _labReadOnly:true,captureMode:'compare'};
  let preview;
  try{preview=S.previewScan(candidateScan,binding,{allowUncertain:true});}
  catch(_err){return blocked('Lỗi tính điểm từ đáp án đã nhận dạng');}
  if(!preview?.ok||!Number.isFinite(preview.grade?.score))
   return blocked('Thiếu dữ liệu đáp án để tính điểm');
  return {ok:true,score:preview.grade.score,parts:preview.grade.parts,
   warningCount:uncertain.length,requiresReview:uncertain.length>0,
   experimental:candidate.engine==='V7_COMPLETE_CANDIDATE',
   readOnly:true};
 }
 return {estimate};
});
