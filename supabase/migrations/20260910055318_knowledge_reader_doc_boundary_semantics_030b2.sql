-- KNOWLEDGE-030B2 semantic correction: page_count is physical-page metadata.
-- DOC/DOCX use logical document boundaries, so they must not fabricate page_count=1.

create or replace function public.rpc_knowledge_commit_extraction_service(
  p_job_id uuid,
  p_artifact_path text,
  p_manifest jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_job record;
  v_boundary_count integer;
  v_physical_page_count integer;
  v_extracted_chars bigint;
  v_ocr_pages integer;
  v_unresolved_pages integer;
  v_boundary_mode text;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'extraction manifest must be an object';
  end if;
  if p_manifest->>'schema_version' <> 'DAMSAN_EXTRACT_V1' then
    raise exception 'unsupported extraction schema';
  end if;
  if coalesce(btrim(p_artifact_path), '') = '' then
    raise exception 'artifact path is required';
  end if;
  if coalesce(p_manifest->>'page_count', '') !~ '^[0-9]+$' then
    raise exception 'page_count must be a non-negative integer';
  end if;
  if coalesce(p_manifest->>'extracted_chars', '') !~ '^[0-9]+$' then
    raise exception 'extracted_chars must be a non-negative integer';
  end if;
  if jsonb_typeof(coalesce(p_manifest->'ocr_pages', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_manifest->'ocr_unresolved_pages', '[]'::jsonb)) <> 'array' then
    raise exception 'OCR page fields must be arrays';
  end if;

  v_boundary_count := (p_manifest->>'page_count')::integer;
  v_extracted_chars := (p_manifest->>'extracted_chars')::bigint;
  v_ocr_pages := jsonb_array_length(coalesce(p_manifest->'ocr_pages', '[]'::jsonb));
  v_unresolved_pages := jsonb_array_length(coalesce(p_manifest->'ocr_unresolved_pages', '[]'::jsonb));
  v_boundary_mode := upper(coalesce(nullif(btrim(p_manifest->>'boundary_mode'), ''), 'UNKNOWN'));
  v_physical_page_count := case when v_boundary_mode = 'PDF_PAGE' then v_boundary_count else null end;

  if v_boundary_count < 1 or v_boundary_count > 5000 then
    raise exception 'page_count is outside supported range';
  end if;
  if v_extracted_chars < 0 or v_extracted_chars > 8000000 then
    raise exception 'extracted_chars is outside supported range';
  end if;
  if v_ocr_pages > v_boundary_count or v_unresolved_pages > v_boundary_count then
    raise exception 'OCR page count exceeds document boundary count';
  end if;

  select
    j.id as job_id,
    j.document_id,
    j.status as job_status,
    j.current_stage,
    d.pipeline_status,
    d.analysis_revision,
    d.active_revision
  into v_job
  from public.knowledge_ingestion_jobs j
  join public.knowledge_documents d on d.id = j.document_id
  where j.id = p_job_id
  for update of j, d;

  if v_job.job_id is null then
    raise exception 'knowledge job not found';
  end if;
  if v_job.job_status not in ('QUEUED', 'RUNNING') or v_job.current_stage not in ('EXTRACT', 'OCR') then
    raise exception 'knowledge job is not eligible for extraction commit';
  end if;

  update public.knowledge_documents
  set page_count = coalesce(v_physical_page_count, page_count),
      extraction_manifest = p_manifest || jsonb_build_object('artifact_path', btrim(p_artifact_path)),
      pipeline_status = 'EXTRACTED',
      processing_error = null,
      updated_at = now()
  where id = v_job.document_id;

  update public.knowledge_ingestion_jobs
  set status = 'QUEUED',
      current_stage = 'ANALYZE',
      worker_id = null,
      metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object(
        'extraction', jsonb_build_object(
          'boundary_count', v_boundary_count,
          'boundary_mode', v_boundary_mode,
          'physical_page_count', v_physical_page_count,
          'extracted_chars', v_extracted_chars,
          'ocr_pages', v_ocr_pages,
          'ocr_unresolved_pages', v_unresolved_pages,
          'quality', coalesce(p_manifest->>'quality', 'UNKNOWN')
        )
      ),
      error_message = null,
      finished_at = null,
      updated_at = now()
  where id = p_job_id;

  return jsonb_build_object(
    'status', 'success',
    'document_id', v_job.document_id,
    'pipeline_status', 'EXTRACTED',
    'next_stage', 'ANALYZE',
    'boundary_count', v_boundary_count,
    'boundary_mode', v_boundary_mode,
    'page_count', v_physical_page_count,
    'extracted_chars', v_extracted_chars,
    'ocr_pages', v_ocr_pages,
    'ocr_unresolved_pages', v_unresolved_pages
  );
end;
$function$;

revoke all on function public.rpc_knowledge_commit_extraction_service(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_commit_extraction_service(uuid, text, jsonb) to service_role;
