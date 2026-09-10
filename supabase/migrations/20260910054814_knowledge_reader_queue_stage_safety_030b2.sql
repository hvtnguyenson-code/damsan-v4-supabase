-- KNOWLEDGE-030B2 correction: once extraction advances a job to ANALYZE,
-- the extraction worker claim RPC must never pull that job back to EXTRACT.

create or replace function public.rpc_knowledge_claim_job_service(p_worker_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_job record;
begin
  if coalesce(btrim(p_worker_id), '') = '' then
    raise exception 'worker_id is required';
  end if;

  select
    j.id as job_id,
    j.document_id,
    d.storage_bucket,
    d.storage_path,
    d.original_filename,
    d.mime_type,
    d.file_size_bytes,
    d.context_hint,
    d.truong_id,
    d.owner_gv_id,
    d.mon_id
  into v_job
  from public.knowledge_ingestion_jobs j
  join public.knowledge_documents d on d.id = j.document_id
  where j.status = 'QUEUED'
    and j.current_stage = 'EXTRACT'
  order by j.created_at, j.id
  for update of j skip locked
  limit 1;

  if v_job.job_id is null then
    return jsonb_build_object('status', 'empty');
  end if;

  update public.knowledge_ingestion_jobs
  set status = 'RUNNING',
      current_stage = 'EXTRACT',
      worker_id = btrim(p_worker_id),
      attempt_count = attempt_count + 1,
      started_at = now(),
      finished_at = null,
      error_message = null,
      updated_at = now()
  where id = v_job.job_id;

  update public.knowledge_documents
  set pipeline_status = 'EXTRACTING',
      processing_error = null,
      updated_at = now()
  where id = v_job.document_id;

  return jsonb_build_object(
    'status', 'success',
    'job_id', v_job.job_id,
    'document_id', v_job.document_id,
    'storage_bucket', v_job.storage_bucket,
    'storage_path', v_job.storage_path,
    'original_filename', v_job.original_filename,
    'mime_type', v_job.mime_type,
    'file_size_bytes', v_job.file_size_bytes,
    'context_hint', v_job.context_hint,
    'truong_id', v_job.truong_id,
    'owner_gv_id', v_job.owner_gv_id,
    'mon_id', v_job.mon_id
  );
end;
$function$;

revoke all on function public.rpc_knowledge_claim_job_service(text) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_claim_job_service(text) to service_role;
