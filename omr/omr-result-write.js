(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.DamSanOmrResultWrite=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function assertConfirmed(preview){
    if(!preview?.ok) throw new Error('preview_required');
    if((preview.scan?.uncertain||[]).length && preview.reviewedUncertain !== true) throw new Error('uncertain_scan_requires_review');
    if(!preview.student?.id) throw new Error('student_id_required');
    if(!preview.room?.id) throw new Error('room_id_required');
    if(!preview.variant?.code) throw new Error('exam_code_required');
    if(!Array.isArray(preview.rawAnswers)||!preview.rawAnswers.length) throw new Error('raw_answers_required');
  }
  function metadataFrom(preview){
    return {
      template_id:preview.scan?.templateId||'MOET_TLTN_2025_18_4_6_V1',
      reviewed:true,
      uncertain_reviewed: preview.reviewedUncertain === true,
      uncertain_count:(preview.scan?.uncertain||[]).length,
      invalid_multiple_marks:[...(preview.scan?.invalidMarks||[])],
      uncertain_details:(preview.scan?.uncertainDetails||[]).map(d=>({
        vi_tri:d.key||null,
        mo_ta:d.label||d.key||null,
        ly_do:d.reason||'Cần kiểm tra lại',
        to_nhieu_o:!!d.invalidMultiple,
        muc_to_chon:Number.isFinite(d.top)?Number(d.top.toFixed(4)):null,
        muc_to_thu_hai:Number.isFinite(d.second)?Number(d.second.toFixed(4)):null,
        do_chenh:Number.isFinite(d.margin)?Number(d.margin.toFixed(4)):null
      })),
      client_preview_score:preview.grade?.score??null
    };
  }
  async function submitConfirmed(preview,staffRpc){
    assertConfirmed(preview);
    if(typeof staffRpc!=='function') throw new Error('staffRpc_required');
    const data=await staffRpc('rpc_staff_submit_omr',{
      p_phong_id:preview.room.id,
      p_hs_id:preview.student.id,
      p_ma_de:preview.variant.code,
      p_raw_answers:preview.rawAnswers,
      p_source_metadata:metadataFrom(preview)
    });
    if(!data) throw new Error('empty_server_response');
    return data;
  }
  return {assertConfirmed,metadataFrom,submitConfirmed};
});
