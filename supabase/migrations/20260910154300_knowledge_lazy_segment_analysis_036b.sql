begin;

-- 036B — lazy semantic analysis for whole books.
-- A physical source remains one document. A mechanical book index identifies lesson
-- page ranges; AI capabilities are then restricted to selected ranges only.

alter table public.knowledge_documents
  add column if not exists book_index jsonb not null default '{}'::jsonb,
  add column if not exists semantic_coverage text[] not null default array[]::text[];

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_book_index_check;
alter table public.knowledge_documents
  add constraint knowledge_documents_book_index_check
  check (jsonb_typeof(book_index) = 'object');

create table if not exists public.knowledge_segment_handoffs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  job_id uuid not null references public.knowledge_ingestion_jobs(id) on delete cascade,
  requested_by uuid not null references public.giao_vien(id) on delete cascade,
  analysis_scope jsonb not null check (jsonb_typeof(analysis_scope) = 'object'),
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

create index if not exists idx_knowledge_segment_handoffs_document
  on public.knowledge_segment_handoffs(document_id, created_at desc);
create index if not exists idx_knowledge_segment_handoffs_active
  on public.knowledge_segment_handoffs(status, expires_at);

alter table public.knowledge_segment_handoffs enable row level security;
revoke all on table public.knowledge_segment_handoffs from anon, authenticated;

create or replace function public.rpc_knowledge_store_book_index_service(
  p_document_id uuid,
  p_book_index jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_seg jsonb;
  v_codes text[] := array[]::text[];
  v_code text;
  v_title text;
  v_start integer;
  v_end integer;
  v_prev_start integer := 0;
  v_count integer := 0;
begin
  if p_book_index is null or jsonb_typeof(p_book_index) <> 'object'
     or p_book_index->>'schema_version' <> 'DAMSAN_BOOK_INDEX_V1'
     or jsonb_typeof(p_book_index->'segments') <> 'array' then
    raise exception 'book_index_invalid';
  end if;

  select id,page_count,semantic_coverage into v_doc
  from public.knowledge_documents where id=p_document_id for update;
  if v_doc.id is null or v_doc.page_count is null then raise exception 'knowledge_document_unavailable'; end if;

  v_count := jsonb_array_length(p_book_index->'segments');
  if v_count < 2 or v_count > 300 then raise exception 'book_index_segment_count_invalid'; end if;

  for v_seg in
    select value from jsonb_array_elements(p_book_index->'segments') with ordinality t(value,ord)
    order by ord
  loop
    if jsonb_typeof(v_seg) <> 'object' then raise exception 'book_index_segment_invalid'; end if;
    v_code := upper(btrim(coalesce(v_seg->>'segment_code','')));
    v_title := btrim(coalesce(v_seg->>'title',''));
    begin
      v_start := (v_seg->>'page_start')::integer;
      v_end := (v_seg->>'page_end')::integer;
    exception when others then
      raise exception 'book_index_page_range_invalid';
    end;
    if v_code !~ '^BAI_[0-9]{2,3}$' or length(v_title) < 4 or length(v_title) > 300 then
      raise exception 'book_index_segment_invalid';
    end if;
    if array_position(v_codes,v_code) is not null then raise exception 'book_index_segment_duplicate'; end if;
    if v_start < 1 or v_end < v_start or v_end > v_doc.page_count or v_start <= v_prev_start then
      raise exception 'book_index_page_range_invalid';
    end if;
    v_codes := array_append(v_codes,v_code);
    v_prev_start := v_start;
  end loop;

  update public.knowledge_documents
  set book_index=p_book_index,
      semantic_coverage=coalesce((
        select array_agg(c order by c)
        from unnest(coalesce(semantic_coverage,array[]::text[])) c
        where c=any(v_codes)
      ),array[]::text[]),
      updated_at=now()
  where id=p_document_id;

  return jsonb_build_object('status','success','document_id',p_document_id,'segment_count',v_count,'segment_codes',to_jsonb(v_codes));
end;
$$;

create or replace function public._knowledge_segment_scope_matches_unit_036b(
  p_scope jsonb,
  p_lesson_code text,
  p_page_start integer,
  p_page_end integer,
  p_overlap boolean default false
) returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_seg jsonb;
  v_code text;
  v_start integer;
  v_end integer;
  v_unit_end integer;
begin
  if p_scope is null or p_scope->>'schema_version' <> 'DAMSAN_ANALYSIS_SCOPE_V1'
     or jsonb_typeof(p_scope->'segments') <> 'array' then return false; end if;
  v_code := upper(btrim(coalesce(p_lesson_code,'')));
  v_unit_end := coalesce(p_page_end,p_page_start);
  for v_seg in select value from jsonb_array_elements(p_scope->'segments') loop
    if v_code <> '' and v_code = upper(coalesce(v_seg->>'segment_code','')) then return true; end if;
    begin
      v_start := (v_seg->>'page_start')::integer;
      v_end := (v_seg->>'page_end')::integer;
    exception when others then
      continue;
    end;
    if p_page_start is not null and v_unit_end is not null then
      if p_overlap and p_page_start <= v_end and v_unit_end >= v_start then return true; end if;
      if not p_overlap and p_page_start >= v_start and v_unit_end <= v_end then return true; end if;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.rpc_knowledge_issue_segment_handoff_service(
  p_document_id uuid,
  p_requested_by uuid,
  p_segment_codes text[],
  p_capability_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_doc record;
  v_codes text[];
  v_segments jsonb;
  v_job_id uuid;
  v_handoff_id uuid;
  v_scope jsonb;
begin
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then raise exception 'invalid capability hash'; end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now()+interval '2 hours' then raise exception 'invalid capability expiry'; end if;

  select id,quyen into v_actor from public.giao_vien where id=p_requested_by limit 1;
  if v_actor.id is null then raise exception 'knowledge owner unavailable'; end if;

  select id,owner_gv_id,pipeline_status,extraction_manifest,book_index,page_count,semantic_coverage
  into v_doc from public.knowledge_documents where id=p_document_id for update;
  if v_doc.id is null or not (v_actor.quyen='Admin' or v_doc.owner_gv_id=p_requested_by) then raise exception 'knowledge document unavailable'; end if;
  if v_doc.pipeline_status not in ('EXTRACTED','READY','ANALYZING') then raise exception 'knowledge document is not eligible for segment analysis'; end if;
  if coalesce(v_doc.extraction_manifest->>'artifact_path','')='' then raise exception 'knowledge extraction artifact is missing'; end if;
  if v_doc.book_index->>'schema_version' <> 'DAMSAN_BOOK_INDEX_V1' or jsonb_typeof(v_doc.book_index->'segments')<>'array' then
    raise exception 'book index unavailable';
  end if;

  select coalesce(array_agg(distinct upper(btrim(x)) order by upper(btrim(x))),array[]::text[])
  into v_codes from unnest(coalesce(p_segment_codes,array[]::text[])) x where btrim(x)<>'';
  if cardinality(v_codes)<1 or cardinality(v_codes)>50 then raise exception 'segment selection invalid'; end if;

  select coalesce(jsonb_agg(s.value order by s.ord),'[]'::jsonb)
  into v_segments
  from jsonb_array_elements(v_doc.book_index->'segments') with ordinality s(value,ord)
  where upper(s.value->>'segment_code')=any(v_codes);
  if jsonb_array_length(v_segments)<>cardinality(v_codes) then raise exception 'segment selection unavailable'; end if;

  v_scope := jsonb_build_object(
    'schema_version','DAMSAN_ANALYSIS_SCOPE_V1',
    'mode','SEGMENTS',
    'document_id',p_document_id,
    'segments',v_segments
  );

  select j.id into v_job_id
  from public.knowledge_ingestion_jobs j
  where j.document_id=p_document_id and j.current_stage='ANALYZE' and j.status in ('QUEUED','RUNNING')
  order by case when j.status='QUEUED' then 0 else 1 end,j.created_at desc
  limit 1 for update;

  if v_job_id is null then
    insert into public.knowledge_ingestion_jobs(document_id,requested_by,status,current_stage,pipeline_version)
    values(p_document_id,p_requested_by,'QUEUED','ANALYZE','036B') returning id into v_job_id;
  end if;

  update public.knowledge_segment_handoffs set status='REVOKED',updated_at=now()
  where document_id=p_document_id and status in ('PENDING','CLAIMED') and completed_at is null;

  insert into public.knowledge_segment_handoffs(document_id,job_id,requested_by,analysis_scope,capability_hash,expires_at)
  values(p_document_id,v_job_id,p_requested_by,v_scope,lower(p_capability_hash),p_expires_at)
  returning id into v_handoff_id;

  return jsonb_build_object(
    'status','success','handoff_id',v_handoff_id,'job_id',v_job_id,'document_id',p_document_id,
    'analysis_scope',v_scope,'semantic_coverage',to_jsonb(v_doc.semantic_coverage),'expires_at',p_expires_at
  );
end;
$$;

create or replace function public.rpc_knowledge_claim_segment_handoff_service(
  p_capability_hash text,
  p_worker_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then return jsonb_build_object('status','error','code','capability_invalid'); end if;

  select h.id handoff_id,h.status handoff_status,h.expires_at,h.document_id,h.job_id,h.requested_by,h.analysis_scope,h.read_count,
         j.status job_status,j.current_stage,
         d.pipeline_status,d.original_filename,d.title,d.source_format,d.mime_type,d.page_count,d.context_hint,d.extraction_manifest,d.book_index,d.semantic_coverage,d.truong_id,d.mon_id
  into v_row
  from public.knowledge_segment_handoffs h
  join public.knowledge_ingestion_jobs j on j.id=h.job_id
  join public.knowledge_documents d on d.id=h.document_id
  where h.capability_hash=lower(p_capability_hash)
  for update of h,j,d;

  if v_row.handoff_id is null then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if v_row.expires_at<=now() then
    update public.knowledge_segment_handoffs set status='EXPIRED',updated_at=now() where id=v_row.handoff_id and status in ('PENDING','CLAIMED');
    return jsonb_build_object('status','error','code','capability_expired');
  end if;
  if v_row.handoff_status not in ('PENDING','CLAIMED') then return jsonb_build_object('status','error','code','capability_unavailable'); end if;
  if v_row.current_stage<>'ANALYZE' or v_row.job_status not in ('QUEUED','RUNNING') then return jsonb_build_object('status','error','code','analysis_job_unavailable'); end if;

  update public.knowledge_ingestion_jobs
  set status='RUNNING',current_stage='ANALYZE',worker_id=left(coalesce(nullif(btrim(p_worker_id),''),'segment-web-ai'),200),
      attempt_count=case when status='QUEUED' then attempt_count+1 else attempt_count end,
      started_at=coalesce(started_at,now()),finished_at=null,error_message=null,updated_at=now()
  where id=v_row.job_id;
  update public.knowledge_documents set pipeline_status='ANALYZING',processing_error=null,updated_at=now() where id=v_row.document_id;
  update public.knowledge_segment_handoffs
  set status='CLAIMED',read_count=read_count+1,claimed_at=coalesce(claimed_at,now()),updated_at=now()
  where id=v_row.handoff_id;

  return jsonb_build_object(
    'status','success','handoff_id',v_row.handoff_id,'document_id',v_row.document_id,'job_id',v_row.job_id,
    'original_filename',v_row.original_filename,'title',v_row.title,'source_format',v_row.source_format,'mime_type',v_row.mime_type,
    'page_count',v_row.page_count,'context_hint',v_row.context_hint,'extraction_manifest',v_row.extraction_manifest,
    'book_index',v_row.book_index,'semantic_coverage',to_jsonb(v_row.semantic_coverage),'analysis_scope',v_row.analysis_scope,
    'truong_id',v_row.truong_id,'mon_id',v_row.mon_id
  );
end;
$$;

create or replace function public.rpc_knowledge_complete_segment_handoff_service(
  p_capability_hash text,
  p_pipeline_version text,
  p_ai_provider text,
  p_ai_model text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_units jsonb;
  v_old_units jsonb;
  v_merged_units jsonb;
  v_unit jsonb;
  v_scope jsonb;
  v_unit_count integer;
  v_low_confidence integer := 0;
  v_missing_provenance integer := 0;
  v_confidence numeric;
  v_quality_status text;
  v_report jsonb;
  v_manifest jsonb;
  v_commit jsonb;
  v_selected_codes text[];
  v_coverage text[];
  v_all_codes text[];
  v_remaining integer;
  v_extraction_quality text;
  v_unresolved integer := 0;
begin
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload->>'schema_version'<>'DAMSAN_KNOWLEDGE_V1' then
    return jsonb_build_object('status','error','code','payload_invalid');
  end if;

  v_units := public._knowledge_normalize_ai_units(p_payload->'units');
  if v_units is null or jsonb_typeof(v_units)<>'array' or jsonb_array_length(v_units)<1 or jsonb_array_length(v_units)>5000 then
    return jsonb_build_object('status','error','code','units_invalid');
  end if;

  select h.id handoff_id,h.status handoff_status,h.expires_at,h.document_id,h.job_id,h.analysis_scope,
         j.status job_status,j.current_stage,
         d.active_revision,d.analysis_revision,d.analysis_manifest,d.title,d.document_type,d.grade,d.page_count,d.extraction_manifest,d.book_index,d.semantic_coverage
  into v_row
  from public.knowledge_segment_handoffs h
  join public.knowledge_ingestion_jobs j on j.id=h.job_id
  join public.knowledge_documents d on d.id=h.document_id
  where h.capability_hash=lower(p_capability_hash)
  for update of h,j,d;

  if v_row.handoff_id is null then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if v_row.expires_at<=now() then return jsonb_build_object('status','error','code','capability_expired'); end if;
  if v_row.handoff_status<>'CLAIMED' then return jsonb_build_object('status','error','code','capability_not_claimed'); end if;
  if v_row.job_status<>'RUNNING' or v_row.current_stage<>'ANALYZE' then return jsonb_build_object('status','error','code','analysis_job_unavailable'); end if;
  v_scope := v_row.analysis_scope;

  select coalesce(array_agg(upper(value->>'segment_code') order by ord),array[]::text[])
  into v_selected_codes from jsonb_array_elements(v_scope->'segments') with ordinality t(value,ord);

  for v_unit in select value from jsonb_array_elements(v_units) loop
    if jsonb_typeof(v_unit)<>'object' or coalesce(btrim(v_unit->>'unit_key'),'')='' then return jsonb_build_object('status','error','code','unit_invalid'); end if;
    if v_unit->'content' is null or jsonb_typeof(v_unit->'content') not in ('object','array') then return jsonb_build_object('status','error','code','unit_content_invalid'); end if;
    if not public._knowledge_segment_scope_matches_unit_036b(
      v_scope,v_unit->>'lesson_code',
      case when coalesce(v_unit->>'page_start','')~'^[0-9]+$' then (v_unit->>'page_start')::integer else null end,
      case when coalesce(v_unit->>'page_end','')~'^[0-9]+$' then (v_unit->>'page_end')::integer else null end,
      false
    ) then return jsonb_build_object('status','error','code','unit_outside_segment_scope','unit_key',v_unit->>'unit_key'); end if;

    v_confidence:=null;
    if coalesce(v_unit->>'confidence','')~'^[0-9]+([.][0-9]+)?$' then v_confidence:=(v_unit->>'confidence')::numeric; end if;
    if v_confidence is null or v_confidence<0.70 then v_low_confidence:=v_low_confidence+1; end if;
    if v_unit->'provenance' is null or jsonb_typeof(v_unit->'provenance')<>'object' or v_unit->'provenance'='{}'::jsonb then
      v_missing_provenance:=v_missing_provenance+1;
    end if;
  end loop;

  v_unit_count:=jsonb_array_length(v_units);
  v_extraction_quality:=upper(coalesce(v_row.extraction_manifest->>'quality','UNKNOWN'));
  if jsonb_typeof(coalesce(v_row.extraction_manifest->'ocr_unresolved_pages','[]'::jsonb))='array' then
    v_unresolved:=jsonb_array_length(coalesce(v_row.extraction_manifest->'ocr_unresolved_pages','[]'::jsonb));
  end if;
  v_quality_status:=case when v_extraction_quality='COMPLETE' and v_unresolved=0 and v_unit_count>=3
    and v_low_confidence*5<=v_unit_count and v_missing_provenance*10<=v_unit_count then 'AUTO_ACCEPTED' else 'NEEDS_REVIEW' end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_key',u.unit_key,'unit_type',u.unit_type,'ordinal_no',u.ordinal_no,'hierarchy',u.hierarchy,
    'lesson_code',u.lesson_code,'lesson_title',u.lesson_title,'section_title',u.section_title,
    'page_start',u.page_start,'page_end',u.page_end,'content',u.content,'provenance',u.provenance,
    'confidence',u.confidence,'is_usable',u.is_usable
  ) order by u.ordinal_no,u.id),'[]'::jsonb)
  into v_old_units
  from public.knowledge_units u
  where u.document_id=v_row.document_id and v_row.active_revision is not null and u.revision=v_row.active_revision
    and not public._knowledge_segment_scope_matches_unit_036b(v_scope,u.lesson_code,u.page_start,u.page_end,true);

  v_merged_units:=coalesce(v_old_units,'[]'::jsonb)||v_units;
  if jsonb_array_length(v_merged_units)>5000 then return jsonb_build_object('status','error','code','merged_units_too_large'); end if;

  select coalesce(array_agg(distinct upper(value->>'segment_code') order by upper(value->>'segment_code')),array[]::text[])
  into v_all_codes from jsonb_array_elements(v_row.book_index->'segments');

  if v_quality_status='AUTO_ACCEPTED' then
    select coalesce(array_agg(distinct c order by c),array[]::text[])
    into v_coverage
    from (
      select upper(x) c from unnest(coalesce(v_row.semantic_coverage,array[]::text[])) x
      union
      select upper(x) c from unnest(v_selected_codes) x
    ) q;
  else
    v_coverage:=coalesce(v_row.semantic_coverage,array[]::text[]);
  end if;
  select count(*)::integer into v_remaining from unnest(v_all_codes) c where not (c=any(v_coverage));

  v_report:=jsonb_build_object(
    'validator_version','036B','quality_status',v_quality_status,'unit_count',v_unit_count,
    'low_confidence_units',v_low_confidence,'missing_provenance_units',v_missing_provenance,
    'extraction_quality',v_extraction_quality,'unresolved_ocr_pages',v_unresolved,
    'analysis_scope',v_scope,'semantic_coverage',to_jsonb(v_coverage),'remaining_segments',v_remaining
  );

  v_manifest:=coalesce(case when v_row.active_revision is not null then v_row.analysis_manifest else p_payload-'units' end,'{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'schema_version','DAMSAN_KNOWLEDGE_V1','title',v_row.title,'document_type',coalesce(v_row.document_type,'OTHER'),
      'grade',v_row.grade,'page_count',v_row.page_count,'book_index',v_row.book_index,
      'semantic_coverage',to_jsonb(v_coverage),'last_analysis_scope',v_scope,'validation',v_report
    ));

  v_commit:=public.rpc_knowledge_commit_analysis_service(
    v_row.job_id,coalesce(nullif(btrim(p_pipeline_version),''),'DAMSAN_KNOWLEDGE_V1/036B'),
    nullif(btrim(p_ai_provider),''),nullif(btrim(p_ai_model),''),v_manifest,v_merged_units,v_quality_status
  );
  if coalesce(v_commit->>'status','')<>'success' then raise exception 'segment analysis commit failed'; end if;

  update public.knowledge_documents
  set semantic_coverage=v_coverage,
      book_index=v_row.book_index,
      pipeline_status=case when v_quality_status='AUTO_ACCEPTED' and v_remaining=0 then 'READY' else 'EXTRACTED' end,
      updated_at=now()
  where id=v_row.document_id;

  update public.knowledge_segment_handoffs
  set status='COMPLETED',ai_provider=nullif(btrim(p_ai_provider),''),ai_model=nullif(btrim(p_ai_model),''),
      validation_report=v_report,completed_at=now(),updated_at=now()
  where id=v_row.handoff_id;

  return v_commit||jsonb_build_object(
    'handoff_id',v_row.handoff_id,'validation',v_report,'semantic_coverage',to_jsonb(v_coverage),
    'remaining_segments',v_remaining,'pipeline_status',case when v_quality_status='AUTO_ACCEPTED' and v_remaining=0 then 'READY' else 'EXTRACTED' end
  );
end;
$$;

revoke all on function public.rpc_knowledge_store_book_index_service(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.rpc_knowledge_store_book_index_service(uuid,jsonb) to service_role;
revoke all on function public._knowledge_segment_scope_matches_unit_036b(jsonb,text,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.rpc_knowledge_issue_segment_handoff_service(uuid,uuid,text[],text,timestamptz) from public,anon,authenticated;
grant execute on function public.rpc_knowledge_issue_segment_handoff_service(uuid,uuid,text[],text,timestamptz) to service_role;
revoke all on function public.rpc_knowledge_claim_segment_handoff_service(text,text) from public,anon,authenticated;
grant execute on function public.rpc_knowledge_claim_segment_handoff_service(text,text) to service_role;
revoke all on function public.rpc_knowledge_complete_segment_handoff_service(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.rpc_knowledge_complete_segment_handoff_service(text,text,text,text,jsonb) to service_role;

commit;
