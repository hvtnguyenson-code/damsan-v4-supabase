-- KNOWLEDGE-030A: AI-native knowledge ingestion foundation.
-- Raw source documents are stored privately in Supabase Storage. PostgreSQL stores
-- only metadata, structured AI output, provenance, and processing state.
-- Browser roles never receive direct table or storage-object write access.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge-source',
  'knowledge-source',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  truong_id uuid not null references public.truong_hoc(id) on delete restrict,
  owner_gv_id uuid null references public.giao_vien(id) on delete set null,
  mon_id uuid null references public.mon_hoc(id) on delete set null,
  grade smallint null check (grade between 1 and 12),
  title text not null,
  original_filename text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  source_format text not null check (source_format in ('PDF', 'DOC', 'DOCX')),
  storage_bucket text not null default 'knowledge-source',
  storage_path text not null unique,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  sha256 text null check (sha256 is null or sha256 ~ '^[0-9A-Fa-f]{64}$'),
  page_count integer null check (page_count is null or page_count > 0),
  document_type text null check (document_type is null or document_type in (
    'TEXTBOOK',
    'CURRICULUM',
    'LEARNING_OUTCOMES',
    'ASSESSMENT_FRAMEWORK',
    'SUPPLEMENTARY',
    'PERSONAL_RULES',
    'OTHER'
  )),
  context_hint jsonb not null default '{}'::jsonb check (jsonb_typeof(context_hint) = 'object'),
  analysis_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(analysis_manifest) = 'object'),
  pipeline_status text not null default 'QUEUED' check (pipeline_status in (
    'QUEUED', 'EXTRACTING', 'OCR', 'ANALYZING', 'READY', 'FAILED'
  )),
  quality_status text not null default 'UNASSESSED' check (quality_status in (
    'UNASSESSED', 'AUTO_ACCEPTED', 'NEEDS_REVIEW', 'MANUAL_ACCEPTED', 'REJECTED'
  )),
  analysis_revision integer not null default 0 check (analysis_revision >= 0),
  active_revision integer null check (active_revision is null or active_revision > 0),
  processing_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  analyzed_at timestamptz null,
  activated_at timestamptz null,
  check (active_revision is null or active_revision <= analysis_revision)
);

create index if not exists idx_knowledge_documents_owner
  on public.knowledge_documents(owner_gv_id, created_at desc);
create index if not exists idx_knowledge_documents_scope
  on public.knowledge_documents(truong_id, mon_id, grade, created_at desc);
create index if not exists idx_knowledge_documents_pipeline
  on public.knowledge_documents(pipeline_status, quality_status, created_at);

create table if not exists public.knowledge_units (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  revision integer not null check (revision > 0),
  unit_key text not null,
  unit_type text not null check (unit_type in (
    'DOCUMENT', 'LESSON', 'SECTION', 'PARAGRAPH', 'FACT', 'TABLE', 'FIGURE',
    'LEARNING_OUTCOME', 'ASSESSMENT_RULE', 'PERSONAL_RULE', 'OTHER'
  )),
  ordinal_no integer not null default 0 check (ordinal_no >= 0),
  hierarchy jsonb not null default '{}'::jsonb check (jsonb_typeof(hierarchy) = 'object'),
  lesson_code text null,
  lesson_title text null,
  section_title text null,
  page_start integer null check (page_start is null or page_start > 0),
  page_end integer null check (page_end is null or page_end > 0),
  content jsonb not null check (jsonb_typeof(content) in ('object', 'array')),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  confidence numeric(5,4) null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  is_usable boolean not null default true,
  created_at timestamptz not null default now(),
  unique(document_id, revision, unit_key),
  check (page_end is null or page_start is null or page_end >= page_start)
);

create index if not exists idx_knowledge_units_document_revision
  on public.knowledge_units(document_id, revision, ordinal_no, id);
create index if not exists idx_knowledge_units_scope
  on public.knowledge_units(document_id, revision, lesson_code, page_start, page_end);

create table if not exists public.knowledge_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  requested_by uuid null references public.giao_vien(id) on delete set null,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  current_stage text not null default 'EXTRACT' check (current_stage in ('EXTRACT', 'OCR', 'ANALYZE', 'VALIDATE', 'COMMIT')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  worker_id text null,
  pipeline_version text null,
  ai_provider text null,
  ai_model text null,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  error_message text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_jobs_queue
  on public.knowledge_ingestion_jobs(status, created_at, id);
create index if not exists idx_knowledge_jobs_document
  on public.knowledge_ingestion_jobs(document_id, created_at desc);

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_units enable row level security;
alter table public.knowledge_ingestion_jobs enable row level security;

revoke all on table public.knowledge_documents from anon, authenticated;
revoke all on table public.knowledge_units from anon, authenticated;
revoke all on table public.knowledge_ingestion_jobs from anon, authenticated;

-- Service-only registration. A future Edge Function will validate the custom staff
-- session, obtain a signed Storage upload URL, upload the raw file, then register it.
-- The caller supplies raw-file identity plus optional context hints; no normalized
-- lesson/section metadata is required from the teacher.
create or replace function public.rpc_knowledge_register_upload_service(
  p_owner_gv_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text default null,
  p_context_hint jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner record;
  v_document_id uuid;
  v_job_id uuid;
  v_format text;
begin
  if p_context_hint is null or jsonb_typeof(p_context_hint) <> 'object' then
    raise exception 'context_hint must be an object';
  end if;
  if coalesce(btrim(p_storage_path), '') = '' or coalesce(btrim(p_original_filename), '') = '' then
    raise exception 'storage path and original filename are required';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes <= 0 then
    raise exception 'file size must be positive';
  end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'invalid sha256';
  end if;

  select gv.id, gv.truong_id, gv.mon_id, gv.quyen
  into v_owner
  from public.giao_vien gv
  where gv.id = p_owner_gv_id
  limit 1;

  if v_owner.id is null or v_owner.truong_id is null then
    raise exception 'knowledge owner must belong to a school';
  end if;

  v_format := case p_mime_type
    when 'application/pdf' then 'PDF'
    when 'application/msword' then 'DOC'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'DOCX'
    else null
  end;
  if v_format is null then
    raise exception 'unsupported knowledge document mime type';
  end if;

  insert into public.knowledge_documents(
    truong_id, owner_gv_id, mon_id, title, original_filename, mime_type,
    source_format, storage_path, file_size_bytes, sha256, context_hint,
    pipeline_status, quality_status
  ) values (
    v_owner.truong_id, v_owner.id, v_owner.mon_id,
    p_original_filename, p_original_filename, p_mime_type,
    v_format, p_storage_path, p_file_size_bytes, lower(p_sha256), p_context_hint,
    'QUEUED', 'UNASSESSED'
  ) returning id into v_document_id;

  insert into public.knowledge_ingestion_jobs(document_id, requested_by, status, current_stage)
  values (v_document_id, v_owner.id, 'QUEUED', 'EXTRACT')
  returning id into v_job_id;

  return jsonb_build_object(
    'status', 'success',
    'document_id', v_document_id,
    'job_id', v_job_id,
    'pipeline_status', 'QUEUED'
  );
end;
$function$;

-- Service worker lease. FOR UPDATE SKIP LOCKED prevents two workers from claiming
-- the same queued document if processing is parallelized later.
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

create or replace function public.rpc_knowledge_set_stage_service(
  p_job_id uuid,
  p_stage text,
  p_metrics jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_document_id uuid;
  v_pipeline_status text;
begin
  if p_stage not in ('EXTRACT', 'OCR', 'ANALYZE', 'VALIDATE', 'COMMIT') then
    raise exception 'invalid knowledge processing stage';
  end if;
  if p_metrics is null or jsonb_typeof(p_metrics) <> 'object' then
    raise exception 'metrics must be an object';
  end if;

  select document_id into v_document_id
  from public.knowledge_ingestion_jobs
  where id = p_job_id and status = 'RUNNING'
  for update;

  if v_document_id is null then
    raise exception 'knowledge job is not running';
  end if;

  v_pipeline_status := case p_stage
    when 'EXTRACT' then 'EXTRACTING'
    when 'OCR' then 'OCR'
    else 'ANALYZING'
  end;

  update public.knowledge_ingestion_jobs
  set current_stage = p_stage,
      metrics = p_metrics,
      updated_at = now()
  where id = p_job_id;

  update public.knowledge_documents
  set pipeline_status = v_pipeline_status,
      updated_at = now()
  where id = v_document_id;

  return jsonb_build_object('status', 'success', 'stage', p_stage);
end;
$function$;

-- Atomically commits one AI analysis revision. If automated validation accepts the
-- revision it becomes active immediately. If confidence/validation is insufficient,
-- the previous active revision (if any) remains active and the new revision is kept
-- for exception review. Routine ingestion therefore requires no manual normalization.
create or replace function public.rpc_knowledge_commit_analysis_service(
  p_job_id uuid,
  p_pipeline_version text,
  p_ai_provider text,
  p_ai_model text,
  p_manifest jsonb,
  p_units jsonb,
  p_quality_status text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_job record;
  v_revision integer;
  v_unit jsonb;
  v_unit_key text;
  v_unit_type text;
  v_confidence numeric;
  v_page_start integer;
  v_page_end integer;
  v_grade integer;
  v_page_count integer;
  v_document_type text;
  v_is_usable boolean;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'manifest must be an object';
  end if;
  if p_units is null or jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) = 0 then
    raise exception 'units must be a non-empty array';
  end if;
  if p_quality_status not in ('AUTO_ACCEPTED', 'NEEDS_REVIEW') then
    raise exception 'invalid automated quality status';
  end if;
  if coalesce(btrim(p_pipeline_version), '') = '' then
    raise exception 'pipeline version is required';
  end if;

  select j.id as job_id, j.document_id, d.analysis_revision, d.active_revision
  into v_job
  from public.knowledge_ingestion_jobs j
  join public.knowledge_documents d on d.id = j.document_id
  where j.id = p_job_id and j.status = 'RUNNING'
  for update of j, d;

  if v_job.job_id is null then
    raise exception 'knowledge job is not running';
  end if;

  v_revision := v_job.analysis_revision + 1;

  for v_unit in select value from jsonb_array_elements(p_units)
  loop
    if jsonb_typeof(v_unit) <> 'object' then
      raise exception 'each knowledge unit must be an object';
    end if;

    v_unit_key := btrim(coalesce(v_unit->>'unit_key', ''));
    v_unit_type := upper(btrim(coalesce(v_unit->>'unit_type', 'OTHER')));
    if v_unit_key = '' then
      raise exception 'knowledge unit_key is required';
    end if;
    if v_unit_type not in (
      'DOCUMENT', 'LESSON', 'SECTION', 'PARAGRAPH', 'FACT', 'TABLE', 'FIGURE',
      'LEARNING_OUTCOME', 'ASSESSMENT_RULE', 'PERSONAL_RULE', 'OTHER'
    ) then
      raise exception 'invalid knowledge unit_type';
    end if;
    if v_unit->'content' is null or jsonb_typeof(v_unit->'content') not in ('object', 'array') then
      raise exception 'knowledge unit content must be an object or array';
    end if;
    if v_unit ? 'hierarchy' and jsonb_typeof(v_unit->'hierarchy') <> 'object' then
      raise exception 'knowledge unit hierarchy must be an object';
    end if;
    if v_unit ? 'provenance' and jsonb_typeof(v_unit->'provenance') <> 'object' then
      raise exception 'knowledge unit provenance must be an object';
    end if;

    v_confidence := null;
    if coalesce(v_unit->>'confidence', '') ~ '^[0-9]+([.][0-9]+)?$' then
      v_confidence := (v_unit->>'confidence')::numeric;
    end if;
    if v_confidence is not null and (v_confidence < 0 or v_confidence > 1) then
      raise exception 'knowledge unit confidence must be between 0 and 1';
    end if;

    v_page_start := null;
    v_page_end := null;
    if coalesce(v_unit->>'page_start', '') ~ '^[0-9]+$' then
      v_page_start := (v_unit->>'page_start')::integer;
    end if;
    if coalesce(v_unit->>'page_end', '') ~ '^[0-9]+$' then
      v_page_end := (v_unit->>'page_end')::integer;
    end if;
    if v_page_start is not null and v_page_start <= 0 then
      raise exception 'knowledge unit page_start must be positive';
    end if;
    if v_page_end is not null and v_page_end <= 0 then
      raise exception 'knowledge unit page_end must be positive';
    end if;
    if v_page_start is not null and v_page_end is not null and v_page_end < v_page_start then
      raise exception 'knowledge unit page range is invalid';
    end if;

    v_is_usable := case lower(coalesce(v_unit->>'is_usable', 'true'))
      when 'false' then false
      when '0' then false
      else true
    end;

    insert into public.knowledge_units(
      document_id, revision, unit_key, unit_type, ordinal_no, hierarchy,
      lesson_code, lesson_title, section_title, page_start, page_end,
      content, provenance, confidence, is_usable
    ) values (
      v_job.document_id,
      v_revision,
      v_unit_key,
      v_unit_type,
      case when coalesce(v_unit->>'ordinal_no', '') ~ '^[0-9]+$' then (v_unit->>'ordinal_no')::integer else 0 end,
      coalesce(v_unit->'hierarchy', '{}'::jsonb),
      nullif(btrim(v_unit->>'lesson_code'), ''),
      nullif(btrim(v_unit->>'lesson_title'), ''),
      nullif(btrim(v_unit->>'section_title'), ''),
      v_page_start,
      v_page_end,
      v_unit->'content',
      coalesce(v_unit->'provenance', '{}'::jsonb),
      v_confidence,
      v_is_usable
    );
  end loop;

  v_grade := null;
  if coalesce(p_manifest->>'grade', '') ~ '^[0-9]+$' then
    v_grade := (p_manifest->>'grade')::integer;
    if v_grade < 1 or v_grade > 12 then v_grade := null; end if;
  end if;

  v_page_count := null;
  if coalesce(p_manifest->>'page_count', '') ~ '^[0-9]+$' then
    v_page_count := (p_manifest->>'page_count')::integer;
    if v_page_count <= 0 then v_page_count := null; end if;
  end if;

  v_document_type := upper(btrim(coalesce(p_manifest->>'document_type', 'OTHER')));
  if v_document_type not in (
    'TEXTBOOK', 'CURRICULUM', 'LEARNING_OUTCOMES', 'ASSESSMENT_FRAMEWORK',
    'SUPPLEMENTARY', 'PERSONAL_RULES', 'OTHER'
  ) then
    v_document_type := 'OTHER';
  end if;

  update public.knowledge_documents
  set title = coalesce(nullif(btrim(p_manifest->>'title'), ''), title),
      grade = coalesce(v_grade, grade),
      page_count = coalesce(v_page_count, page_count),
      document_type = v_document_type,
      analysis_manifest = p_manifest,
      analysis_revision = v_revision,
      active_revision = case when p_quality_status = 'AUTO_ACCEPTED' then v_revision else active_revision end,
      quality_status = p_quality_status,
      pipeline_status = 'READY',
      processing_error = null,
      analyzed_at = now(),
      activated_at = case when p_quality_status = 'AUTO_ACCEPTED' then now() else activated_at end,
      updated_at = now()
  where id = v_job.document_id;

  update public.knowledge_ingestion_jobs
  set status = 'SUCCEEDED',
      current_stage = 'COMMIT',
      pipeline_version = p_pipeline_version,
      ai_provider = nullif(btrim(p_ai_provider), ''),
      ai_model = nullif(btrim(p_ai_model), ''),
      error_message = null,
      finished_at = now(),
      updated_at = now()
  where id = p_job_id;

  return jsonb_build_object(
    'status', 'success',
    'document_id', v_job.document_id,
    'revision', v_revision,
    'quality_status', p_quality_status,
    'active_revision', case when p_quality_status = 'AUTO_ACCEPTED' then v_revision else v_job.active_revision end
  );
end;
$function$;

create or replace function public.rpc_knowledge_fail_job_service(
  p_job_id uuid,
  p_stage text,
  p_error_message text,
  p_metrics jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_document_id uuid;
begin
  if p_metrics is null or jsonb_typeof(p_metrics) <> 'object' then
    raise exception 'metrics must be an object';
  end if;

  select document_id into v_document_id
  from public.knowledge_ingestion_jobs
  where id = p_job_id and status = 'RUNNING'
  for update;

  if v_document_id is null then
    raise exception 'knowledge job is not running';
  end if;

  update public.knowledge_ingestion_jobs
  set status = 'FAILED',
      current_stage = case when p_stage in ('EXTRACT', 'OCR', 'ANALYZE', 'VALIDATE', 'COMMIT') then p_stage else current_stage end,
      metrics = p_metrics,
      error_message = left(coalesce(p_error_message, 'Unknown processing error'), 2000),
      finished_at = now(),
      updated_at = now()
  where id = p_job_id;

  update public.knowledge_documents
  set pipeline_status = 'FAILED',
      processing_error = left(coalesce(p_error_message, 'Unknown processing error'), 2000),
      updated_at = now()
  where id = v_document_id;

  return jsonb_build_object('status', 'success', 'document_id', v_document_id);
end;
$function$;

-- Staff-side read-only library view. Normal teachers see only their own documents;
-- Admin can inspect the whole library. No raw Storage URL or service credential leaks.
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

-- Service functions are callable only from trusted backend/Edge Function code.
revoke all on function public.rpc_knowledge_register_upload_service(uuid, text, text, text, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_register_upload_service(uuid, text, text, text, bigint, text, jsonb) to service_role;

revoke all on function public.rpc_knowledge_claim_job_service(text) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_claim_job_service(text) to service_role;

revoke all on function public.rpc_knowledge_set_stage_service(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_set_stage_service(uuid, text, jsonb) to service_role;

revoke all on function public.rpc_knowledge_commit_analysis_service(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_commit_analysis_service(uuid, text, text, text, jsonb, jsonb, text) to service_role;

revoke all on function public.rpc_knowledge_fail_job_service(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_fail_job_service(uuid, text, text, jsonb) to service_role;

-- Staff read uses the existing custom staff-token control plane through anon/authenticated.
revoke all on function public.rpc_knowledge_library_read(text, text) from public;
grant execute on function public.rpc_knowledge_library_read(text, text) to anon, authenticated;
