-- KNOWLEDGE-031B1: staff-safe lookup of the current semantic-analysis job.
-- The browser still cannot access protected knowledge tables directly. It receives
-- only the eligible job UUID after the existing custom staff session is validated.

create or replace function public.rpc_knowledge_analysis_job_read(
  p_staff_token text,
  p_ma_gv text,
  p_document_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_actor record;
  v_document record;
  v_job record;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object(
      'status','error',
      'code','staff_session_invalid',
      'message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'
    );
  end if;

  select id, ma_gv, truong_id
  into v_actor
  from public.giao_vien
  where id = v_gv_id
  limit 1;

  if v_actor.id is null or v_actor.ma_gv is distinct from btrim(p_ma_gv) then
    return jsonb_build_object(
      'status','error',
      'code','staff_identity_mismatch',
      'message','Tài khoản không khớp phiên làm việc.'
    );
  end if;

  select id, owner_gv_id, truong_id, pipeline_status, active_revision
  into v_document
  from public.knowledge_documents
  where id = p_document_id
  limit 1;

  if v_document.id is null
     or v_document.owner_gv_id is distinct from v_gv_id
     or v_document.truong_id is distinct from v_actor.truong_id then
    return jsonb_build_object(
      'status','error',
      'code','knowledge_document_unavailable',
      'message','Không tìm thấy tài liệu thuộc phạm vi của tài khoản hiện tại.'
    );
  end if;

  select id, status, current_stage, created_at
  into v_job
  from public.knowledge_ingestion_jobs
  where document_id = p_document_id
    and current_stage = 'ANALYZE'
    and status in ('QUEUED','RUNNING')
  order by created_at desc, id desc
  limit 1;

  if v_job.id is null or v_document.pipeline_status not in ('EXTRACTED','ANALYZING') then
    return jsonb_build_object(
      'status','error',
      'code','analysis_job_unavailable',
      'message','Tài liệu hiện không ở trạng thái chờ AI phân tích.'
    );
  end if;

  return jsonb_build_object(
    'status','success',
    'document_id',p_document_id,
    'job_id',v_job.id,
    'job_status',v_job.status,
    'pipeline_status',v_document.pipeline_status,
    'active_revision',v_document.active_revision
  );
end;
$function$;

revoke all on function public.rpc_knowledge_analysis_job_read(text,text,uuid) from public;
grant execute on function public.rpc_knowledge_analysis_job_read(text,text,uuid) to anon, authenticated;
