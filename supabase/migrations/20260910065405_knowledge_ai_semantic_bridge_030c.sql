-- KNOWLEDGE-030C: provider-neutral AI semantic analysis capability bridge.

create table if not exists public.knowledge_ai_handoffs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  job_id uuid not null references public.knowledge_ingestion_jobs(id) on delete cascade,
  requested_by uuid not null references public.giao_vien(id) on delete cascade,
  purpose text not null default 'ANALYZE' check (purpose in ('ANALYZE')),
  capability_hash text not null unique check (capability_hash ~ '^[0-9A-Fa-f]{64}$'),
  status text not null default 'PENDING' check (status in ('PENDING','CLAIMED','COMPLETED','EXPIRED','REVOKED')),
  read_count integer not null default 0 check (read_count >= 0),
  ai_provider text null,
  ai_model text null,
  validation_report jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_report) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists idx_knowledge_ai_handoffs_job
  on public.knowledge_ai_handoffs(job_id, created_at desc);
create index if not exists idx_knowledge_ai_handoffs_active
  on public.knowledge_ai_handoffs(status, expires_at);

alter table public.knowledge_ai_handoffs enable row level security;
revoke all on table public.knowledge_ai_handoffs from anon, authenticated;

create or replace function public.rpc_knowledge_issue_analysis_handoff_service(
  p_job_id uuid,
  p_requested_by uuid,
  p_capability_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_job record;
  v_handoff_id uuid;
begin
  if coalesce(p_capability_hash, '') !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'invalid capability hash';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '2 hours' then
    raise exception 'invalid capability expiry';
  end if;

  select j.id as job_id, j.document_id, j.status as job_status, j.current_stage,
         d.owner_gv_id, d.pipeline_status, d.extraction_manifest
  into v_job
  from public.knowledge_ingestion_jobs j
  join public.knowledge_documents d on d.id = j.document_id
  where j.id = p_job_id
  for update of j, d;

  if v_job.job_id is null then
    raise exception 'knowledge job not found';
  end if;
  if v_job.owner_gv_id is distinct from p_requested_by then
    raise exception 'knowledge owner mismatch';
  end if;
  if v_job.current_stage <> 'ANALYZE' or v_job.job_status not in ('QUEUED','RUNNING') then
    raise exception 'knowledge job is not awaiting analysis';
  end if;
  if v_job.pipeline_status not in ('EXTRACTED','ANALYZING') then
    raise exception 'knowledge document is not ready for analysis';
  end if;
  if coalesce(v_job.extraction_manifest->>'artifact_path','') = '' then
    raise exception 'knowledge extraction artifact is missing';
  end if;

  update public.knowledge_ai_handoffs
  set status = 'REVOKED', updated_at = now()
  where job_id = p_job_id
    and status in ('PENDING','CLAIMED')
    and completed_at is null;

  insert into public.knowledge_ai_handoffs(
    document_id, job_id, requested_by, capability_hash, expires_at
  ) values (
    v_job.document_id, p_job_id, p_requested_by, lower(p_capability_hash), p_expires_at
  ) returning id into v_handoff_id;

  return jsonb_build_object(
    'status','success',
    'handoff_id',v_handoff_id,
    'document_id',v_job.document_id,
    'job_id',p_job_id,
    'expires_at',p_expires_at
  );
end;
$function$;

create or replace function public.rpc_knowledge_claim_analysis_handoff_service(
  p_capability_hash text,
  p_worker_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row record;
begin
  if coalesce(p_capability_hash, '') !~ '^[0-9A-Fa-f]{64}$' then
    return jsonb_build_object('status','error','code','capability_invalid');
  end if;
  if coalesce(btrim(p_worker_id),'') = '' then
    return jsonb_build_object('status','error','code','worker_invalid');
  end if;

  select h.id as handoff_id, h.status as handoff_status, h.expires_at,
         h.document_id, h.job_id, h.requested_by, h.read_count,
         j.status as job_status, j.current_stage,
         d.pipeline_status, d.original_filename, d.title, d.source_format,
         d.mime_type, d.page_count, d.context_hint, d.extraction_manifest,
         d.truong_id, d.mon_id
  into v_row
  from public.knowledge_ai_handoffs h
  join public.knowledge_ingestion_jobs j on j.id = h.job_id
  join public.knowledge_documents d on d.id = h.document_id
  where h.capability_hash = lower(p_capability_hash)
  for update of h, j, d;

  if v_row.handoff_id is null then
    return jsonb_build_object('status','error','code','capability_invalid');
  end if;

  if v_row.expires_at <= now() then
    update public.knowledge_ai_handoffs
    set status='EXPIRED', updated_at=now()
    where id=v_row.handoff_id and status in ('PENDING','CLAIMED');
    return jsonb_build_object('status','error','code','capability_expired');
  end if;

  if v_row.handoff_status not in ('PENDING','CLAIMED') then
    return jsonb_build_object('status','error','code','capability_unavailable');
  end if;

  if v_row.current_stage <> 'ANALYZE' or v_row.job_status not in ('QUEUED','RUNNING') then
    return jsonb_build_object('status','error','code','analysis_job_unavailable');
  end if;

  if coalesce(v_row.extraction_manifest->>'artifact_path','') = '' then
    return jsonb_build_object('status','error','code','extraction_artifact_missing');
  end if;

  if v_row.job_status = 'QUEUED' then
    update public.knowledge_ingestion_jobs
    set status='RUNNING', current_stage='ANALYZE', worker_id=left(btrim(p_worker_id),200),
        attempt_count=attempt_count+1, started_at=coalesce(started_at,now()),
        finished_at=null, error_message=null, updated_at=now()
    where id=v_row.job_id;

    update public.knowledge_documents
    set pipeline_status='ANALYZING', processing_error=null, updated_at=now()
    where id=v_row.document_id;
  end if;

  update public.knowledge_ai_handoffs
  set status='CLAIMED', read_count=read_count+1,
      claimed_at=coalesce(claimed_at,now()), updated_at=now()
  where id=v_row.handoff_id;

  return jsonb_build_object(
    'status','success',
    'handoff_id',v_row.handoff_id,
    'document_id',v_row.document_id,
    'job_id',v_row.job_id,
    'original_filename',v_row.original_filename,
    'title',v_row.title,
    'source_format',v_row.source_format,
    'mime_type',v_row.mime_type,
    'page_count',v_row.page_count,
    'context_hint',v_row.context_hint,
    'extraction_manifest',v_row.extraction_manifest,
    'truong_id',v_row.truong_id,
    'mon_id',v_row.mon_id
  );
end;
$function$;

create or replace function public.rpc_knowledge_complete_analysis_handoff_service(
  p_capability_hash text,
  p_pipeline_version text,
  p_ai_provider text,
  p_ai_model text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row record;
  v_units jsonb;
  v_manifest jsonb;
  v_unit jsonb;
  v_unit_count integer := 0;
  v_low_confidence integer := 0;
  v_missing_provenance integer := 0;
  v_confidence numeric;
  v_extraction_quality text;
  v_unresolved_count integer := 0;
  v_quality_status text;
  v_report jsonb;
  v_commit jsonb;
begin
  if coalesce(p_capability_hash, '') !~ '^[0-9A-Fa-f]{64}$' then
    return jsonb_build_object('status','error','code','capability_invalid');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('status','error','code','payload_invalid');
  end if;
  if p_payload->>'schema_version' <> 'DAMSAN_KNOWLEDGE_V1' then
    return jsonb_build_object('status','error','code','schema_unsupported');
  end if;
  v_units := p_payload->'units';
  if v_units is null or jsonb_typeof(v_units) <> 'array' then
    return jsonb_build_object('status','error','code','units_invalid');
  end if;
  v_unit_count := jsonb_array_length(v_units);
  if v_unit_count < 1 or v_unit_count > 5000 then
    return jsonb_build_object('status','error','code','units_invalid');
  end if;

  select h.id as handoff_id, h.status as handoff_status, h.expires_at,
         h.document_id, h.job_id,
         j.status as job_status, j.current_stage,
         d.extraction_manifest
  into v_row
  from public.knowledge_ai_handoffs h
  join public.knowledge_ingestion_jobs j on j.id=h.job_id
  join public.knowledge_documents d on d.id=h.document_id
  where h.capability_hash=lower(p_capability_hash)
  for update of h, j, d;

  if v_row.handoff_id is null then
    return jsonb_build_object('status','error','code','capability_invalid');
  end if;
  if v_row.expires_at <= now() then
    update public.knowledge_ai_handoffs
    set status='EXPIRED', updated_at=now()
    where id=v_row.handoff_id and status in ('PENDING','CLAIMED');
    return jsonb_build_object('status','error','code','capability_expired');
  end if;
  if v_row.handoff_status <> 'CLAIMED' then
    return jsonb_build_object('status','error','code','capability_not_claimed');
  end if;
  if v_row.job_status <> 'RUNNING' or v_row.current_stage <> 'ANALYZE' then
    return jsonb_build_object('status','error','code','analysis_job_unavailable');
  end if;

  for v_unit in select value from jsonb_array_elements(v_units)
  loop
    if jsonb_typeof(v_unit) <> 'object' then
      return jsonb_build_object('status','error','code','unit_invalid');
    end if;

    v_confidence := null;
    if coalesce(v_unit->>'confidence','') ~ '^[0-9]+([.][0-9]+)?$' then
      v_confidence := (v_unit->>'confidence')::numeric;
    end if;
    if v_confidence is null or v_confidence < 0.70 then
      v_low_confidence := v_low_confidence + 1;
    end if;

    if v_unit->'provenance' is null
       or jsonb_typeof(v_unit->'provenance') <> 'object'
       or v_unit->'provenance' = '{}'::jsonb then
      v_missing_provenance := v_missing_provenance + 1;
    end if;
  end loop;

  v_extraction_quality := upper(coalesce(v_row.extraction_manifest->>'quality','UNKNOWN'));
  if jsonb_typeof(coalesce(v_row.extraction_manifest->'ocr_unresolved_pages','[]'::jsonb))='array' then
    v_unresolved_count := jsonb_array_length(coalesce(v_row.extraction_manifest->'ocr_unresolved_pages','[]'::jsonb));
  end if;

  v_quality_status := case
    when v_extraction_quality='COMPLETE'
      and v_unresolved_count=0
      and v_unit_count >= 3
      and v_low_confidence * 5 <= v_unit_count
      and v_missing_provenance * 10 <= v_unit_count
    then 'AUTO_ACCEPTED'
    else 'NEEDS_REVIEW'
  end;

  v_report := jsonb_build_object(
    'validator_version','030C1',
    'quality_status',v_quality_status,
    'unit_count',v_unit_count,
    'low_confidence_units',v_low_confidence,
    'missing_provenance_units',v_missing_provenance,
    'extraction_quality',v_extraction_quality,
    'unresolved_ocr_pages',v_unresolved_count
  );

  v_manifest := (p_payload - 'units') || jsonb_build_object('validation',v_report);

  v_commit := public.rpc_knowledge_commit_analysis_service(
    v_row.job_id,
    coalesce(nullif(btrim(p_pipeline_version),''),'DAMSAN_KNOWLEDGE_V1'),
    nullif(btrim(p_ai_provider),''),
    nullif(btrim(p_ai_model),''),
    v_manifest,
    v_units,
    v_quality_status
  );

  if coalesce(v_commit->>'status','') <> 'success' then
    raise exception 'knowledge analysis commit failed';
  end if;

  update public.knowledge_ai_handoffs
  set status='COMPLETED', ai_provider=nullif(btrim(p_ai_provider),''),
      ai_model=nullif(btrim(p_ai_model),''), validation_report=v_report,
      completed_at=now(), updated_at=now()
  where id=v_row.handoff_id;

  return v_commit || jsonb_build_object(
    'handoff_id',v_row.handoff_id,
    'validation',v_report
  );
end;
$function$;

revoke all on function public.rpc_knowledge_issue_analysis_handoff_service(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_issue_analysis_handoff_service(uuid,uuid,text,timestamptz) to service_role;

revoke all on function public.rpc_knowledge_claim_analysis_handoff_service(text,text) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_claim_analysis_handoff_service(text,text) to service_role;

revoke all on function public.rpc_knowledge_complete_analysis_handoff_service(text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_complete_analysis_handoff_service(text,text,text,text,jsonb) to service_role;
