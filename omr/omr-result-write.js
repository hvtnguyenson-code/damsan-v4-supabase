(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.DamSanOmrResultWrite=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function assertConfirmed(preview){
    if(!preview?.ok) throw new Error('preview_required');
    if(preview.scan?._labReadOnly||preview.scan?.captureMode==='compare')
      throw new Error('comparison_mode_never_writes');
    if(preview.scan?._requiresRetake)throw new Error('unreliable_omr_requires_retake');
    if(preview.scan?.recognitionEngine==='V7_068'||preview.scan?.captureMode==='v7_068'){
      const s=preview.scan,b=s.release068;
      if(s.recognitionEngine!=='V7_068'||s.captureMode!=='v7_068'||s._labReadOnly!==false||
        !b||b.version!=='068'||b.roomId!==String(preview.room?.id)||b.studentId!==String(preview.student?.id)||
        b.studentCode!==String(preview.student?.ma_hs??preview.student?.MaHS)||b.sbd!=='00'+b.studentCode||
        b.sbd!==s.sbd||b.bubbleExamCode!==s.maDe||b.examCode!==String(preview.variant?.code)||
        !/^\d{4}$/.test(s.maDe)||!/^\d+$/.test(String(b.examCode))||Number(s.maDe)!==Number(b.examCode))
        throw new Error('omr068_binding_required');
      if(preview.rawAnswers?.length!==28)throw new Error('omr068_answer_count');
      // Defense in depth: the canonical UI applies locked multiple marks,
      // and the writer independently refuses inconsistent raw answers.
      let offset={1:0,2:0,3:0};
      for(let i=0;i<28;i++){
        const part=String(preview.variant?.items?.[i]?.phan??preview.variant?.items?.[i]?.Phan??'');
        if(!['1','2','3'].includes(part))throw new Error('omr068_answer_structure');
        const j=offset[part]++,v=part==='1'?s.p1?.[j]:part==='2'?s.p2?.[j]:s.p3?.[j];
        if(String(preview.rawAnswers[i]?.chon??'')!==String(v??''))throw new Error('omr068_raw_answer_mismatch');
      }
      if(offset[1]!==18||offset[2]!==4||offset[3]!==6)throw new Error('omr068_answer_structure');
      for(const k of s.invalidMarks||[]){
        let m=/^P1\.(\d+)$/.exec(k);
        if(m){if(s.p1?.[Number(m[1])-1]!=='?')throw new Error('omr068_invalid_multiple');continue;}
        m=/^P2\.(\d+)([abcd])$/.exec(k);
        if(!m||s.p2?.[Number(m[1])-1]?.split('-')?.['abcd'.indexOf(m[2])]!=='?')throw new Error('omr068_invalid_multiple');
      }
    }
    if((preview.scan?.uncertain||[]).length && preview.reviewedUncertain !== true) throw new Error('uncertain_scan_requires_review');
    if(!preview.student?.id) throw new Error('student_id_required');
    if(!preview.room?.id) throw new Error('room_id_required');
    if(!preview.variant?.code) throw new Error('exam_code_required');
    if(!Array.isArray(preview.rawAnswers)||!preview.rawAnswers.length) throw new Error('raw_answers_required');
  }
  function metadataFrom(preview){
    const metadata={
      template_id:preview.scan?.templateId||'MOET_TLTN_2025_18_4_6_V1',
      recognition_engine:['V5','V6','V7','V7_068'].includes(preview.scan?.recognitionEngine)
        ?preview.scan.recognitionEngine:'V5',
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
    // Comparative evidence stays inside the existing, access-controlled
    // OMR submission metadata, only for the designated research room.
    // No image, student identity, token, or answer-key contents are copied.
    const roomCode=String(preview.room?.MaPhong||preview.room?.ma_phong||'').trim();
    const evidence=preview.scan?.omrV7TestEvidence;
    if(roomCode==='OMR_V7_TEST'&&preview.scan?.recognitionEngine==='V7'
      &&evidence?.schema===1&&evidence.room==='OMR_V7_TEST'
      &&Array.isArray(evidence.v7?.p2)&&Array.isArray(evidence.v7?.p3)){
      metadata.omr_v7_test={
        version:1,
        v6:evidence.v6||null,
        v7:evidence.v7,
        v6_ms:Number.isFinite(evidence.v6Ms)?evidence.v6Ms:null,
        v7_ms:Number.isFinite(evidence.v7Ms)?evidence.v7Ms:null,
        comparison:evidence.comparison||null,
        v6_error:evidence.v6Error||null
      };
    }
    return metadata;
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
  return {assertConfirmed,metadataFrom,submitConfirmed,supports068:true};
});
