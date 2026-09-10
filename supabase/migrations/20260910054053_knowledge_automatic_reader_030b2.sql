-- KNOWLEDGE-030B2: automatic browser-side document reader persistence boundary.
-- Raw files remain private. Extracted page text is uploaded as a private JSON
-- artifact; PostgreSQL stores only a small extraction manifest and workflow state.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge-artifacts',
  'knowledge-artifacts',
  false,
  8388608,
  array['application/json']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.knowledge_documents
  add column if not exists extraction_manifest jsonb not null default '{}'::jsonb;

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_pipeline_status_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_pipeline_status_check
  check (pipeline_status in ('QUEUED', 'EXTRACTING', 'OCR', 'EXTRACTED', 'ANALYZING', 'READY', 'FAILED'));

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_extraction_manifest_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_extraction_manifest_check
  check (jsonb_typeof(extraction_manifest) = 'object');

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
  v_page_count integer;
  v_extracted_chars bigint;
  v_ocr_pages integer;
  v_unresolved_pages integer;
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

  v_page_count := (p_manifest->>'page_count')::integer;
  v_extracted_chars := (p_manifest->>'extracted_chars')::bigint;
  v_ocr_pages := jsonb_array_length(coalesce(p_manifest->'ocr_pages', '[]'::jsonb));
  v_unresolved_pages := jsonb_array_length(coalesce(p_manifest->'ocr_unresolved_pages', '[]'::jsonb));

  if v_page_count < 1 or v_page_count > 5000 then
    raise exception 'page_count is outside supported range';
  end if;
  if v_extracted_chars < 0 or v_extracted_chars > 8000000 then
    raise exception 'extracted_chars is outside supported range';
  end if;
  if v_ocr_pages > v_page_count or v_unresolved_pages > v_page_count then
    raise exception 'OCR page count exceeds document page count';
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
  set page_count = v_page_count,
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
          'page_count', v_page_count,
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
    'page_count', v_page_count,
    'extracted_chars', v_extracted_chars,
    'ocr_pages', v_ocr_pages,
    'ocr_unresolved_pages', v_unresolved_pages
  );
end;
$function$;

revoke all on function public.rpc_knowledge_commit_extraction_service(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_commit_extraction_service(uuid, text, jsonb) to service_role;

create or replace function public.rpc_knowledge_library_read(
  p_staff_token text,
  p_ma_gv text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_actor record;
  v_documents jsonb;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object(
      'status', 'error',
      'code', 'staff_session_invalid',
      'message', 'Phiên làm việc không hợp lệ hoặc đã hết hạn.'
    );
  end if;

  select gv.id, gv.ma_gv, gv.quyen, gv.truong_id, gv.mon_id
  into v_actor
  from public.giao_vien gv
  where gv.id = v_gv_id
  limit 1;

  if v_actor.id is null or v_actor.ma_gv <> trim(p_ma_gv) then
    return jsonb_build_object('status', 'error', 'code', 'staff_identity_mismatch', 'message', 'Tài khoản không khớp phiên làm việc.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'truong_id', d.truong_id,
    'owner_gv_id', d.owner_gv_id,
    'mon_id', d.mon_id,
    'grade', d.grade,
    'title', d.title,
    'original_filename', d.original_filename,
    'mime_type', d.mime_type,
    'source_format', d.source_format,
    'file_size_bytes', d.file_size_bytes,
    'page_count', d.page_count,
    'document_type', d.document_type,
    'pipeline_status', d.pipeline_status,
    'quality_status', d.quality_status,
    'analysis_revision', d.analysis_revision,
    'active_revision', d.active_revision,
    'extraction', case
      when d.extraction_manifest = '{}'::jsonb then null
      else d.extraction_manifest - 'artifact_path'
    end,
    'processing_error', d.processing_error,
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'analyzed_at', d.analyzed_at,
    'activated_at', d.activated_at
  ) order by d.created_at desc, d.id desc), '[]'::jsonb)
  into v_documents
  from public.knowledge_documents d
  where v_actor.quyen = 'Admin' or d.owner_gv_id = v_gv_id;

  return jsonb_build_object('status', 'success', 'documents', v_documents);
end;
$function$;

revoke all on function public.rpc_knowledge_library_read(text, text) from public;
grant execute on function public.rpc_knowledge_library_read(text, text) to anon, authenticated;
