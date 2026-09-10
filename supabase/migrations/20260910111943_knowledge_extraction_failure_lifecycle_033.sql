-- KNOWLEDGE-033: persist browser-side extraction/OCR failure instead of leaving raw uploads stuck in QUEUED.

create or replace function public.rpc_knowledge_fail_extraction_service(
  p_job_id uuid,
  p_error_code text default null,
  p_error_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_job record;
  v_code text;
  v_message text;
  v_stored_error text;
begin
  v_code := left(regexp_replace(coalesce(nullif(btrim(p_error_code), ''), 'extraction_failed'), '[^A-Za-z0-9_.:-]+', '_', 'g'), 80);
  v_message := left(regexp_replace(coalesce(nullif(btrim(p_error_message), ''), 'Không thể đọc nội dung tài liệu.'), E'[\r\n\t]+', ' ', 'g'), 500);
  v_stored_error := case when v_code <> '' then '[' || v_code || '] ' || v_message else v_message end;

  select
    j.id as job_id,
    j.document_id,
    j.status as job_status,
    j.current_stage,
    d.pipeline_status
  into v_job
  from public.knowledge_ingestion_jobs j
  join public.knowledge_documents d on d.id = j.document_id
  where j.id = p_job_id
  for update of j, d;

  if v_job.job_id is null then
    raise exception 'knowledge job not found';
  end if;

  if v_job.job_status = 'FAILED' and v_job.pipeline_status = 'FAILED' then
    return jsonb_build_object(
      'status', 'success',
      'idempotent', true,
      'document_id', v_job.document_id,
      'job_id', v_job.job_id,
      'pipeline_status', 'FAILED'
    );
  end if;

  if v_job.job_status not in ('QUEUED', 'RUNNING')
     or v_job.current_stage not in ('EXTRACT', 'OCR')
     or v_job.pipeline_status not in ('QUEUED', 'EXTRACTING', 'OCR', 'FAILED') then
    raise exception 'knowledge job is not eligible for extraction failure';
  end if;

  update public.knowledge_documents
  set pipeline_status = 'FAILED',
      processing_error = v_stored_error,
      updated_at = now()
  where id = v_job.document_id;

  update public.knowledge_ingestion_jobs
  set status = 'FAILED',
      error_message = v_stored_error,
      finished_at = coalesce(finished_at, now()),
      updated_at = now()
  where id = v_job.job_id;

  return jsonb_build_object(
    'status', 'success',
    'idempotent', false,
    'document_id', v_job.document_id,
    'job_id', v_job.job_id,
    'pipeline_status', 'FAILED',
    'error_code', v_code
  );
end;
$function$;

revoke all on function public.rpc_knowledge_fail_extraction_service(uuid, text, text) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_fail_extraction_service(uuid, text, text) to service_role;
