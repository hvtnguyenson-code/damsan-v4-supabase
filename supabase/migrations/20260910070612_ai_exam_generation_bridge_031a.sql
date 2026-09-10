-- AI-EXAM-031A: provider-neutral exam generation request, draft, and single approval boundary.

create table if not exists public.ai_exam_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.giao_vien(id) on delete cascade,
  truong_id uuid not null references public.truong_hoc(id) on delete restrict,
  mon_id uuid not null references public.mon_hoc(id) on delete restrict,
  ma_phong text not null check (length(btrim(ma_phong)) between 1 and 120),
  exam_spec jsonb not null default '{}'::jsonb check (jsonb_typeof(exam_spec) = 'object'),
  knowledge_document_ids uuid[] not null check (cardinality(knowledge_document_ids) > 0),
  status text not null default 'AWAITING_AI' check (status in (
    'AWAITING_AI','AI_WORKING','READY_FOR_REVIEW','PUBLISHED','REJECTED','FAILED'
  )),
  active_draft_revision integer null check (active_draft_revision is null or active_draft_revision > 0),
  publish_result jsonb not null default '{}'::jsonb check (jsonb_typeof(publish_result) = 'object'),
  processing_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz null,
  published_at timestamptz null,
  rejected_at timestamptz null
);

create index if not exists idx_ai_exam_requests_owner
  on public.ai_exam_requests(requested_by, created_at desc);
create index if not exists idx_ai_exam_requests_status
  on public.ai_exam_requests(status, created_at desc);

create table if not exists public.ai_exam_drafts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ai_exam_requests(id) on delete cascade,
  revision integer not null check (revision > 0),
  schema_version text not null default 'DAMSAN_EXAM_V1' check (schema_version = 'DAMSAN_EXAM_V1'),
  ai_provider text null,
  ai_model text null,
  exam_payload jsonb not null check (jsonb_typeof(exam_payload) = 'object'),
  variants_payload jsonb not null check (jsonb_typeof(variants_payload) = 'array' and jsonb_array_length(variants_payload) > 0),
  validation_report jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_report) = 'object'),
  status text not null default 'VALIDATED' check (status in ('VALIDATED','SUPERSEDED','PUBLISHED')),
  created_at timestamptz not null default now(),
  published_at timestamptz null,
  unique(request_id, revision)
);

create index if not exists idx_ai_exam_drafts_request
  on public.ai_exam_drafts(request_id, revision desc);

create table if not exists public.ai_exam_handoffs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ai_exam_requests(id) on delete cascade,
  requested_by uuid not null references public.giao_vien(id) on delete cascade,
  capability_hash text not null unique check (capability_hash ~ '^[0-9A-Fa-f]{64}$'),
  status text not null default 'PENDING' check (status in ('PENDING','CLAIMED','COMPLETED','EXPIRED','REVOKED')),
  read_count integer not null default 0 check (read_count >= 0),
  ai_provider text null,
  ai_model text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists idx_ai_exam_handoffs_request
  on public.ai_exam_handoffs(request_id, created_at desc);
create index if not exists idx_ai_exam_handoffs_active
  on public.ai_exam_handoffs(status, expires_at);

alter table public.ai_exam_requests enable row level security;
alter table public.ai_exam_drafts enable row level security;
alter table public.ai_exam_handoffs enable row level security;
revoke all on table public.ai_exam_requests from anon, authenticated;
revoke all on table public.ai_exam_drafts from anon, authenticated;
revoke all on table public.ai_exam_handoffs from anon, authenticated;

create or replace function public.rpc_ai_exam_create_request_service(
  p_requested_by uuid,
  p_truong_id uuid,
  p_mon_id uuid,
  p_ma_phong text,
  p_exam_spec jsonb,
  p_knowledge_document_ids uuid[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor record;
  v_effective_truong_id uuid;
  v_effective_mon_id uuid;
  v_docs uuid[];
  v_requested_count integer := 0;
  v_valid_count integer := 0;
  v_request_id uuid;
  v_profile text;
  v_variant_count integer;
begin
  if p_exam_spec is null or jsonb_typeof(p_exam_spec) <> 'object' then
    raise exception 'exam_spec must be an object';
  end if;
  if nullif(btrim(p_ma_phong),'') is null then
    raise exception 'room code is required';
  end if;

  select id, truong_id, mon_id, quyen into v_actor
  from public.giao_vien where id=p_requested_by limit 1;
  if v_actor.id is null or v_actor.truong_id is null then
    raise exception 'teacher not found';
  end if;

  if v_actor.quyen='Admin' then
    if p_truong_id is null or p_mon_id is null then
      raise exception 'admin target scope is required';
    end if;
    v_effective_truong_id := p_truong_id;
    v_effective_mon_id := p_mon_id;
  else
    if p_truong_id is distinct from v_actor.truong_id
       or v_actor.mon_id is null
       or p_mon_id is distinct from v_actor.mon_id then
      raise exception 'teacher target scope mismatch';
    end if;
    v_effective_truong_id := v_actor.truong_id;
    v_effective_mon_id := v_actor.mon_id;
  end if;

  v_profile := upper(coalesce(nullif(btrim(p_exam_spec->>'assessment_type'),''),'TOT_NGHIEP'));
  if v_profile not in ('LEGACY','TOT_NGHIEP','MCQ_ONLY','TRUE_FALSE_ONLY','SHORT_ONLY','CUSTOM') then
    raise exception 'unsupported assessment_type';
  end if;

  begin
    v_variant_count := coalesce((p_exam_spec->>'variant_count')::integer,4);
  exception when others then
    raise exception 'variant_count must be an integer';
  end;
  if v_variant_count < 1 or v_variant_count > 8 then
    raise exception 'variant_count must be between 1 and 8';
  end if;

  if p_knowledge_document_ids is null or cardinality(p_knowledge_document_ids)=0 then
    select coalesce(array_agg(d.id order by d.created_at, d.id), array[]::uuid[])
    into v_docs
    from public.knowledge_documents d
    where d.truong_id=v_effective_truong_id
      and (d.mon_id=v_effective_mon_id or d.mon_id is null)
      and d.active_revision is not null;
  else
    v_requested_count := cardinality(p_knowledge_document_ids);
    select coalesce(array_agg(d.id order by d.created_at, d.id), array[]::uuid[]), count(*)::integer
    into v_docs, v_valid_count
    from public.knowledge_documents d
    where d.id = any(p_knowledge_document_ids)
      and d.truong_id=v_effective_truong_id
      and (d.mon_id=v_effective_mon_id or d.mon_id is null)
      and d.active_revision is not null;
    if v_valid_count <> v_requested_count then
      raise exception 'one or more knowledge documents are unavailable for this scope';
    end if;
  end if;

  if v_docs is null or cardinality(v_docs)=0 then
    raise exception 'no active knowledge documents are available';
  end if;

  insert into public.ai_exam_requests(
    requested_by, truong_id, mon_id, ma_phong, exam_spec, knowledge_document_ids, status
  ) values (
    p_requested_by, v_effective_truong_id, v_effective_mon_id, btrim(p_ma_phong),
    p_exam_spec || jsonb_build_object('assessment_type',v_profile,'variant_count',v_variant_count),
    v_docs, 'AWAITING_AI'
  ) returning id into v_request_id;

  return jsonb_build_object(
    'status','success','request_id',v_request_id,'truong_id',v_effective_truong_id,
    'mon_id',v_effective_mon_id,'ma_phong',btrim(p_ma_phong),'knowledge_document_count',cardinality(v_docs),
    'assessment_type',v_profile,'variant_count',v_variant_count
  );
end;
$function$;

create or replace function public.rpc_ai_exam_issue_handoff_service(
  p_request_id uuid,
  p_requested_by uuid,
  p_capability_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_request record;
  v_handoff_id uuid;
begin
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'invalid capability hash';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now()+interval '2 hours' then
    raise exception 'invalid capability expiry';
  end if;

  select id, requested_by, status into v_request
  from public.ai_exam_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'exam request not found'; end if;
  if v_request.requested_by is distinct from p_requested_by then raise exception 'exam request owner mismatch'; end if;
  if v_request.status not in ('AWAITING_AI','AI_WORKING') then raise exception 'exam request is not AI-writable'; end if;

  update public.ai_exam_handoffs
  set status='REVOKED', updated_at=now()
  where request_id=p_request_id and status in ('PENDING','CLAIMED') and completed_at is null;

  insert into public.ai_exam_handoffs(request_id,requested_by,capability_hash,expires_at)
  values (p_request_id,p_requested_by,lower(p_capability_hash),p_expires_at)
  returning id into v_handoff_id;

  return jsonb_build_object('status','success','handoff_id',v_handoff_id,'request_id',p_request_id,'expires_at',p_expires_at);
end;
$function$;

create or replace function public.rpc_ai_exam_claim_handoff_service(
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
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then
    return jsonb_build_object('status','error','code','capability_invalid');
  end if;

  select h.id handoff_id,h.status handoff_status,h.expires_at,h.request_id,h.requested_by,h.read_count,
         r.status request_status,r.truong_id,r.mon_id,r.ma_phong,r.exam_spec,r.knowledge_document_ids
  into v_row
  from public.ai_exam_handoffs h
  join public.ai_exam_requests r on r.id=h.request_id
  where h.capability_hash=lower(p_capability_hash)
  for update of h, r;

  if v_row.handoff_id is null then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if v_row.expires_at <= now() then
    update public.ai_exam_handoffs set status='EXPIRED',updated_at=now()
    where id=v_row.handoff_id and status in ('PENDING','CLAIMED');
    return jsonb_build_object('status','error','code','capability_expired');
  end if;
  if v_row.handoff_status not in ('PENDING','CLAIMED') then
    return jsonb_build_object('status','error','code','capability_unavailable');
  end if;
  if v_row.request_status not in ('AWAITING_AI','AI_WORKING') then
    return jsonb_build_object('status','error','code','exam_request_unavailable');
  end if;

  update public.ai_exam_handoffs
  set status='CLAIMED',read_count=read_count+1,claimed_at=coalesce(claimed_at,now()),updated_at=now()
  where id=v_row.handoff_id;
  update public.ai_exam_requests set status='AI_WORKING',processing_error=null,updated_at=now()
  where id=v_row.request_id and status='AWAITING_AI';

  return jsonb_build_object(
    'status','success','handoff_id',v_row.handoff_id,'request_id',v_row.request_id,
    'truong_id',v_row.truong_id,'mon_id',v_row.mon_id,'ma_phong',v_row.ma_phong,
    'exam_spec',v_row.exam_spec,'knowledge_document_ids',to_jsonb(v_row.knowledge_document_ids)
  );
end;
$function$;

create or replace function public.rpc_ai_exam_knowledge_pack_service(
  p_request_id uuid,
  p_offset integer default 0,
  p_limit integer default 80
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_request record;
  v_offset integer;
  v_limit integer;
  v_total integer;
  v_units jsonb;
begin
  select id, knowledge_document_ids into v_request
  from public.ai_exam_requests where id=p_request_id;
  if v_request.id is null then raise exception 'exam request not found'; end if;

  v_offset := greatest(coalesce(p_offset,0),0);
  v_limit := least(greatest(coalesce(p_limit,80),1),120);

  select count(*)::integer into v_total
  from public.knowledge_units u
  join public.knowledge_documents d on d.id=u.document_id
  where d.id=any(v_request.knowledge_document_ids)
    and d.active_revision is not null
    and u.revision=d.active_revision
    and u.is_usable=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id',s.document_id,'document_title',s.document_title,'document_type',s.document_type,
    'grade',s.grade,'unit_key',s.unit_key,'unit_type',s.unit_type,'ordinal_no',s.ordinal_no,
    'hierarchy',s.hierarchy,'lesson_code',s.lesson_code,'lesson_title',s.lesson_title,
    'section_title',s.section_title,'page_start',s.page_start,'page_end',s.page_end,
    'content',s.content,'provenance',s.provenance,'confidence',s.confidence
  ) order by s.doc_order,s.ordinal_no,s.unit_id),'[]'::jsonb)
  into v_units
  from (
    select u.id unit_id,u.document_id,d.title document_title,d.document_type,d.grade,
           u.unit_key,u.unit_type,u.ordinal_no,u.hierarchy,u.lesson_code,u.lesson_title,u.section_title,
           u.page_start,u.page_end,u.content,u.provenance,u.confidence,d.created_at doc_order
    from public.knowledge_units u
    join public.knowledge_documents d on d.id=u.document_id
    where d.id=any(v_request.knowledge_document_ids)
      and d.active_revision is not null
      and u.revision=d.active_revision
      and u.is_usable=true
    order by d.created_at,d.id,u.ordinal_no,u.id
    offset v_offset limit v_limit
  ) s;

  return jsonb_build_object(
    'status','success','request_id',p_request_id,'offset',v_offset,'limit',v_limit,
    'total_units',v_total,'units',v_units,
    'has_more',(v_offset+jsonb_array_length(v_units))<v_total,
    'next_offset',case when (v_offset+jsonb_array_length(v_units))<v_total then v_offset+jsonb_array_length(v_units) else null end
  );
end;
$function$;

create or replace function public.rpc_ai_exam_store_draft_service(
  p_capability_hash text,
  p_ai_provider text,
  p_ai_model text,
  p_exam_payload jsonb,
  p_variants_payload jsonb,
  p_validation_report jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row record;
  v_revision integer;
begin
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then
    return jsonb_build_object('status','error','code','capability_invalid');
  end if;
  if p_exam_payload is null or jsonb_typeof(p_exam_payload)<>'object' or p_exam_payload->>'schema_version'<>'DAMSAN_EXAM_V1' then
    return jsonb_build_object('status','error','code','exam_payload_invalid');
  end if;
  if p_variants_payload is null or jsonb_typeof(p_variants_payload)<>'array' or jsonb_array_length(p_variants_payload)<1 then
    return jsonb_build_object('status','error','code','variants_payload_invalid');
  end if;
  if p_validation_report is null or jsonb_typeof(p_validation_report)<>'object' then
    return jsonb_build_object('status','error','code','validation_report_invalid');
  end if;
  if coalesce((p_validation_report->>'valid')::boolean,false) is not true then
    return jsonb_build_object('status','error','code','draft_not_validated');
  end if;

  select h.id handoff_id,h.status handoff_status,h.expires_at,h.request_id,r.status request_status
  into v_row
  from public.ai_exam_handoffs h
  join public.ai_exam_requests r on r.id=h.request_id
  where h.capability_hash=lower(p_capability_hash)
  for update of h,r;

  if v_row.handoff_id is null then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if v_row.expires_at<=now() then
    update public.ai_exam_handoffs set status='EXPIRED',updated_at=now() where id=v_row.handoff_id;
    return jsonb_build_object('status','error','code','capability_expired');
  end if;
  if v_row.handoff_status<>'CLAIMED' then return jsonb_build_object('status','error','code','capability_not_claimed'); end if;
  if v_row.request_status<>'AI_WORKING' then return jsonb_build_object('status','error','code','exam_request_unavailable'); end if;

  select coalesce(max(revision),0)+1 into v_revision from public.ai_exam_drafts where request_id=v_row.request_id;
  update public.ai_exam_drafts set status='SUPERSEDED'
  where request_id=v_row.request_id and status='VALIDATED';

  insert into public.ai_exam_drafts(
    request_id,revision,ai_provider,ai_model,exam_payload,variants_payload,validation_report,status
  ) values (
    v_row.request_id,v_revision,nullif(btrim(p_ai_provider),''),nullif(btrim(p_ai_model),''),
    p_exam_payload,p_variants_payload,p_validation_report,'VALIDATED'
  );

  update public.ai_exam_requests
  set status='READY_FOR_REVIEW',active_draft_revision=v_revision,ready_at=now(),processing_error=null,updated_at=now()
  where id=v_row.request_id;
  update public.ai_exam_handoffs
  set status='COMPLETED',ai_provider=nullif(btrim(p_ai_provider),''),ai_model=nullif(btrim(p_ai_model),''),completed_at=now(),updated_at=now()
  where id=v_row.handoff_id;

  return jsonb_build_object('status','success','request_id',v_row.request_id,'revision',v_revision,'request_status','READY_FOR_REVIEW');
end;
$function$;

create or replace function public.rpc_ai_exam_request_read(
  p_staff_token text,
  p_ma_gv text,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_ma_gv text;
  v_quyen text;
  v_rows jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;
  select ma_gv,quyen into v_ma_gv,v_quyen from public.giao_vien where id=v_gv_id;
  if v_ma_gv is distinct from btrim(p_ma_gv) then return jsonb_build_object('status','error','code','staff_identity_mismatch'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id',r.id,'ma_phong',r.ma_phong,'truong_id',r.truong_id,'mon_id',r.mon_id,
    'exam_spec',r.exam_spec,'knowledge_document_count',cardinality(r.knowledge_document_ids),
    'status',r.status,'active_draft_revision',r.active_draft_revision,'created_at',r.created_at,'ready_at',r.ready_at,
    'published_at',r.published_at,'rejected_at',r.rejected_at,'publish_result',r.publish_result,
    'draft',case when d.id is null then null else jsonb_build_object(
      'revision',d.revision,'exam_payload',d.exam_payload,'variants_payload',d.variants_payload,
      'validation_report',d.validation_report,'ai_provider',d.ai_provider,'ai_model',d.ai_model,'status',d.status,'created_at',d.created_at
    ) end
  ) order by r.created_at desc),'[]'::jsonb)
  into v_rows
  from public.ai_exam_requests r
  left join public.ai_exam_drafts d on d.request_id=r.id and d.revision=r.active_draft_revision
  where (v_quyen='Admin' or r.requested_by=v_gv_id)
    and (p_request_id is null or r.id=p_request_id);

  return jsonb_build_object('status','success','requests',v_rows);
end;
$function$;

create or replace function public.rpc_ai_exam_approve_and_publish(
  p_staff_token text,
  p_ma_gv text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_ma_gv text;
  v_quyen text;
  v_request record;
  v_draft record;
  v_result jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select ma_gv,quyen into v_ma_gv,v_quyen from public.giao_vien where id=v_gv_id;
  if v_ma_gv is distinct from btrim(p_ma_gv) then return jsonb_build_object('status','error','code','staff_identity_mismatch','message','Tài khoản không khớp phiên làm việc.'); end if;

  select * into v_request from public.ai_exam_requests where id=p_request_id for update;
  if not found or (v_quyen<>'Admin' and v_request.requested_by<>v_gv_id) then
    return jsonb_build_object('status','error','code','request_not_found','message','Không tìm thấy yêu cầu tạo đề.');
  end if;
  if v_request.status='PUBLISHED' then
    return jsonb_build_object('status','success','idempotent',true,'request_id',v_request.id,'publish_result',v_request.publish_result);
  end if;
  if v_request.status<>'READY_FOR_REVIEW' or v_request.active_draft_revision is null then
    return jsonb_build_object('status','error','code','request_not_ready','message','Đề chưa ở trạng thái sẵn sàng xác minh.');
  end if;

  select * into v_draft from public.ai_exam_drafts
  where request_id=v_request.id and revision=v_request.active_draft_revision and status='VALIDATED'
  for update;
  if not found then return jsonb_build_object('status','error','code','draft_not_found','message','Không tìm thấy bản đề đã xác minh kỹ thuật.'); end if;

  -- The final teacher approval reuses the canonical room-save RPC. No alternate write path is introduced.
  v_result:=public.rpc_luu_de_thi_len_phong(
    p_staff_token,p_ma_gv,v_request.truong_id,v_request.mon_id,v_request.ma_phong,v_draft.variants_payload
  );
  if coalesce(v_result->>'status','')<>'success' then
    return v_result || jsonb_build_object('request_id',v_request.id,'code',coalesce(v_result->>'code','publish_failed'));
  end if;

  update public.ai_exam_requests
  set status='PUBLISHED',publish_result=v_result,published_at=now(),updated_at=now()
  where id=v_request.id;
  update public.ai_exam_drafts set status='PUBLISHED',published_at=now()
  where id=v_draft.id;

  return v_result || jsonb_build_object('request_id',v_request.id,'request_status','PUBLISHED');
end;
$function$;

create or replace function public.rpc_ai_exam_reject(
  p_staff_token text,
  p_ma_gv text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_ma_gv text;
  v_quyen text;
  v_request record;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;
  select ma_gv,quyen into v_ma_gv,v_quyen from public.giao_vien where id=v_gv_id;
  if v_ma_gv is distinct from btrim(p_ma_gv) then return jsonb_build_object('status','error','code','staff_identity_mismatch'); end if;

  select * into v_request from public.ai_exam_requests where id=p_request_id for update;
  if not found or (v_quyen<>'Admin' and v_request.requested_by<>v_gv_id) then
    return jsonb_build_object('status','error','code','request_not_found');
  end if;
  if v_request.status='PUBLISHED' then return jsonb_build_object('status','error','code','already_published'); end if;
  if v_request.status='REJECTED' then return jsonb_build_object('status','success','idempotent',true,'request_id',v_request.id,'request_status','REJECTED'); end if;

  update public.ai_exam_requests set status='REJECTED',rejected_at=now(),updated_at=now() where id=v_request.id;
  update public.ai_exam_handoffs set status='REVOKED',updated_at=now()
  where request_id=v_request.id and status in ('PENDING','CLAIMED');
  return jsonb_build_object('status','success','request_id',v_request.id,'request_status','REJECTED');
end;
$function$;

revoke all on function public.rpc_ai_exam_create_request_service(uuid,uuid,uuid,text,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.rpc_ai_exam_create_request_service(uuid,uuid,uuid,text,jsonb,uuid[]) to service_role;
revoke all on function public.rpc_ai_exam_issue_handoff_service(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.rpc_ai_exam_issue_handoff_service(uuid,uuid,text,timestamptz) to service_role;
revoke all on function public.rpc_ai_exam_claim_handoff_service(text,text) from public,anon,authenticated;
grant execute on function public.rpc_ai_exam_claim_handoff_service(text,text) to service_role;
revoke all on function public.rpc_ai_exam_knowledge_pack_service(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.rpc_ai_exam_knowledge_pack_service(uuid,integer,integer) to service_role;
revoke all on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) to service_role;

grant execute on function public.rpc_ai_exam_request_read(text,text,uuid) to anon,authenticated;
grant execute on function public.rpc_ai_exam_approve_and_publish(text,text,uuid) to anon,authenticated;
grant execute on function public.rpc_ai_exam_reject(text,text,uuid) to anon,authenticated;
