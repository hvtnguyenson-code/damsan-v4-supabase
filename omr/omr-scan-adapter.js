(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DamSanOmrScanAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MODES=['v6','v5','compare'];
  function safeMode(mode){
    if(!MODES.includes(mode))throw Error('unknown_omr_mode');
    return mode;
  }
  function issueLabel(key){
    let m=/^P1\.(\d+)$/.exec(key);
    if(m)return 'Phần I – Câu '+Number(m[1]);
    m=/^P2\.(\d+)([abcd])$/.exec(key);
    if(m)return 'Phần II – Câu '+Number(m[1])+', ý '+m[2];
    m=/^P3\.(\d+)\.(\d+)$/.exec(key);
    if(m)return 'Phần III – Câu '+Number(m[1])+', vị trí '+Number(m[2]);
    m=/^P3\.(\d+)$/.exec(key);
    return m?'Phần III – Câu '+Number(m[1]):key;
  }
  function validateCandidate(candidate){
    if(!candidate||typeof candidate.p1!=='string'||candidate.p1.length!==18
      ||!/^[ABCD?]{18}$/.test(candidate.p1)
      ||!Array.isArray(candidate.p2)||candidate.p2.length!==4
      ||candidate.p2.some(row=>typeof row!=='string'||!/^[ĐS?](-[ĐS?]){3}$/.test(row))
      ||!Array.isArray(candidate.p3)||candidate.p3.length!==6
      ||candidate.p3.some(row=>typeof row!=='string'||row.length>5
        ||(row!==''&&row!=='?'&&!/^-?\d+(,\d+)?$/.test(row)))
      ||!Array.isArray(candidate.issues)||!Array.isArray(candidate.invalidMarks))
      throw Error('V6 chưa trả đủ dữ liệu đáp án 18–4–6, cần quét lại');
    for(const issue of candidate.issues)
      if(!issue||typeof issue.key!=='string'
        ||!/^P1\.\d+$|^P2\.\d+[abcd]$|^P3\.\d+(?:\.\d+)?$/.test(issue.key))
        throw Error('V6 trả mã cảnh báo không hợp lệ');
    for(const key of candidate.invalidMarks)
      if(typeof key!=='string'||!/^P1\.\d+$|^P2\.\d+[abcd]$/.test(key))
        throw Error('V6 có chỉ dấu tô nhiều ô không hợp lệ');
  }
  function fromV6(v5,candidate){
    if(!v5?.ok)throw Error('Cần xác định bốn góc và thông tin phiếu trước');
    validateCandidate(candidate);
    const issues=[],seen=new Set();
    for(const issue of candidate.issues){
      if(seen.has(issue.key))continue;
      seen.add(issue.key);issues.push(issue);
    }
    const blocking=[];
    if(candidate.calibration?.reliable!==true)
      blocking.push('Phần I/II chưa hiệu chuẩn được mực tô');
    if(candidate.p3Calibration?.reliable!==true)
      blocking.push('Phần III chưa hiệu chuẩn được mực tô');
    if(!candidate.geometry||candidate.geometry.status!=='ok')
      blocking.push('Mốc khống chế bên trong phiếu chưa đạt chất lượng');
    const invalidMarks=[...new Set(candidate.invalidMarks)];
    for(const key of invalidMarks)if(!seen.has(key)){
      issues.push({key,state:'multiple',reason:'Tô từ hai ô trở lên; câu/ý này không được tính điểm'});
      seen.add(key);
    }
    const uncertain=issues.map(issue=>issue.key);
    const uncertainDetails=issues.map(issue=>{
      const key=issue.key,label=issueLabel(key);
      const p1=/^P1\.(\d+)$/.exec(key);
      const p2=/^P2\.(\d+)([abcd])$/.exec(key);
      const p3=/^P3\.(\d+)\.(\d+)$/.exec(key);
      const ev=p1?candidate.p1Evidence?.[Number(p1[1])-1]:
        p2?candidate.p2Evidence?.[(Number(p2[1])-1)*4+'abcd'.indexOf(p2[2])]:
        p3?candidate.p3Evidence?.[Number(p3[1])-1]?.columns?.[Number(p3[2])-1]:null;
      return {key,label,reason:issue.reason||'Cần kiểm tra dấu tô',
        invalidMultiple:issue.state==='multiple'||invalidMarks.includes(key),
        top:Number.isFinite(ev?.top)?ev.top:null,
        second:Number.isFinite(ev?.second)?ev.second:null,
        margin:Number.isFinite(ev?.margin)?ev.margin:
          Number.isFinite(ev?.top)&&Number.isFinite(ev?.second)?ev.top-ev.second:null};
    });
    return {...v5,p1:candidate.p1,p2:[...candidate.p2],p3:[...candidate.p3],
      recognitionEngine:'V6',captureMode:'v6',_labReadOnly:false,
      uncertain,uncertainDetails,invalidMarks,
      _requiresRetake:blocking.length>0,_retakeReason:blocking.join('; '),
      v6Diagnostics:{geometry:candidate.geometry?.status||'unknown',issues:uncertain.length}};
  }
  return {safeMode,issueLabel,validateCandidate,fromV6};
});