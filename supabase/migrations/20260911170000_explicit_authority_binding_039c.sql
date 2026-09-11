begin;

-- 039C — Explicit assessment-authority binding.
-- Supersedes 039B implicit unique-profile linkage. A rule/benchmark document may
-- influence an assessment profile only after the teacher explicitly selects the
-- exact declared authority slot (profile_id + authority_code + source_role).

drop trigger if exists trg_knowledge_documents_authority_autolink_039b on public.knowledge_documents;
drop function if exists public._assessment_auto_link_unique_profile_039();

alter table public.knowledge_documents
  add column if not exists authority_profile_id text null,
  add column if not exists authority_code text null;

create index if not exists idx_knowledge_documents_authority_binding_039c
  on public.knowledge_documents(authority_profile_id, authority_code)
  where authority_profile_id is not null and authority_code is not null;

create unique index if not exists uq_assessment_profile_authority_slot_039c
  on public.assessment_profile_sources(profile_id, authority_code)
  where authority_code is not null;

-- Staff-facing slot catalogue. It exposes only machine-readable profile metadata;
-- private normalized source content and Storage paths remain hidden.
create or replace function public.rpc_assessment_authority_slots(
  p_staff_token text,
  p_ma_gv text,
  p_mon_id uuid,
  p_grade smallint,
  p_source_role text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_actor record;
  v_role text;
  v_slots jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;

  select id,ma_gv,quyen,truong_id,mon_id
  into v_actor
  from public.giao_vien
  where id=v_gv_id
  limit 1;

  if v_actor.id is null or v_actor.ma_gv<>btrim(p_ma_gv) then
    return jsonb_build_object('status','error','code','staff_identity_mismatch');
  end if;
  if p_mon_id is null then return jsonb_build_object('status','error','code','subject_required'); end if;
  if p_grade not between 10 and 12 then return jsonb_build_object('status','error','code','grade_invalid'); end if;
  if v_actor.quyen<>'Admin' and (v_actor.mon_id is null or v_actor.mon_id is distinct from p_mon_id) then
    return jsonb_build_object('status','error','code','subject_scope_mismatch');
  end if;

  v_role:=upper(btrim(coalesce(p_source_role,'')));
  if v_role<>'' and v_role not in ('ASSESSMENT_RULE','ASSESSMENT_BENCHMARK') then
    return jsonb_build_object('status','error','code','authority_source_role_invalid');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id',p.profile_id,
    'assessment_type',p.assessment_type,
    'profile_version',p.profile_version,
    'authority_code',s.item->>'authority_code',
    'source_kind',upper(coalesce(s.item->>'source_kind','')),
    'authority_rank',case when coalesce(s.item->>'authority_rank','') ~ '^[0-9]+$' then (s.item->>'authority_rank')::integer else 100 end,
    'required',coalesce((s.item->>'required')::boolean,false),
    'label',coalesce(nullif(btrim(s.item->>'label'),''),s.item->>'authority_code')
  ) order by p.assessment_type,p.profile_id,
    case when coalesce(s.item->>'authority_rank','') ~ '^[0-9]+$' then (s.item->>'authority_rank')::integer else 100 end,
    s.item->>'authority_code'),'[]'::jsonb)
  into v_slots
  from public.assessment_authority_profiles p
  cross join lateral jsonb_array_elements(coalesce(p.profile->'declared_sources','[]'::jsonb)) as s(item)
  where p.mon_id=p_mon_id
    and p.grade=p_grade
    and p.is_active=true
    and (p.effective_from is null or p.effective_from<=current_date)
    and (p.effective_to is null or p.effective_to>=current_date)
    and nullif(btrim(s.item->>'authority_code'),'') is not null
    and upper(coalesce(s.item->>'source_kind','')) in ('ASSESSMENT_RULE','ASSESSMENT_BENCHMARK')
    and (v_role='' or upper(coalesce(s.item->>'source_kind',''))=v_role);

  return jsonb_build_object(
    'status','success',
    'grade',p_grade,
    'source_role',nullif(v_role,''),
    'slots',coalesce(v_slots,'[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_assessment_authority_slots(text,text,uuid,smallint,text) from public;
grant execute on function public.rpc_assessment_authority_slots(text,text,uuid,smallint,text) to anon, authenticated;

-- Explicitly persist/clear the teacher-selected source identity BEFORE prompt generation
-- and again before import. Authority binding never comes from the AI manifest.
create or replace function public.rpc_knowledge_set_authority_binding(
  p_staff_token text,
  p_ma_gv text,
  p_document_id uuid,
  p_grade smallint,
  p_source_role text,
  p_profile_id text default null,
  p_authority_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_actor record;
  v_doc record;
  v_role text;
  v_profile record;
  v_slot jsonb;
  v_rank smallint;
  v_required boolean;
  v_existing uuid;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;

  select id,ma_gv,quyen,truong_id,mon_id
  into v_actor
  from public.giao_vien
  where id=v_gv_id
  limit 1;
  if v_actor.id is null or v_actor.ma_gv<>btrim(p_ma_gv) then
    return jsonb_build_object('status','error','code','staff_identity_mismatch');
  end if;
  if p_grade not between 10 and 12 then return jsonb_build_object('status','error','code','grade_invalid'); end if;

  select id,owner_gv_id,truong_id,mon_id,source_role,authority_profile_id,authority_code
  into v_doc
  from public.knowledge_documents
  where id=p_document_id
  for update;
  if v_doc.id is null then return jsonb_build_object('status','error','code','document_unavailable'); end if;
  if v_actor.quyen<>'Admin' and (v_doc.owner_gv_id is distinct from v_actor.id or v_doc.truong_id is distinct from v_actor.truong_id) then
    return jsonb_build_object('status','error','code','document_unavailable');
  end if;
  if v_actor.quyen<>'Admin' and (v_actor.mon_id is null or v_doc.mon_id is distinct from v_actor.mon_id) then
    return jsonb_build_object('status','error','code','subject_scope_mismatch');
  end if;

  v_role:=upper(btrim(coalesce(p_source_role,'')));
  if v_role not in ('KNOWLEDGE_SOURCE','ASSESSMENT_RULE','ASSESSMENT_BENCHMARK') then
    return jsonb_build_object('status','error','code','source_role_invalid');
  end if;

  if v_role='KNOWLEDGE_SOURCE' then
    delete from public.assessment_profile_sources where document_id=p_document_id;
    update public.knowledge_documents
    set grade=p_grade,
        source_role='KNOWLEDGE_SOURCE',
        authority_profile_id=null,
        authority_code=null,
        updated_at=now()
    where id=p_document_id;
    return jsonb_build_object('status','success','document_id',p_document_id,'grade',p_grade,'source_role',v_role,'binding',null);
  end if;

  if nullif(btrim(coalesce(p_profile_id,'')),'') is null or nullif(btrim(coalesce(p_authority_code,'')),'') is null then
    return jsonb_build_object('status','error','code','authority_binding_required');
  end if;

  select profile_id,mon_id,grade,assessment_type,profile
  into v_profile
  from public.assessment_authority_profiles
  where profile_id=btrim(p_profile_id)
    and is_active=true
    and (effective_from is null or effective_from<=current_date)
    and (effective_to is null or effective_to>=current_date)
  limit 1;

  if v_profile.profile_id is null
     or v_profile.grade<>p_grade
     or v_profile.mon_id is distinct from v_doc.mon_id then
    return jsonb_build_object('status','error','code','authority_profile_scope_mismatch');
  end if;

  select s.item
  into v_slot
  from jsonb_array_elements(coalesce(v_profile.profile->'declared_sources','[]'::jsonb)) as s(item)
  where btrim(coalesce(s.item->>'authority_code',''))=btrim(p_authority_code)
    and upper(coalesce(s.item->>'source_kind',''))=v_role
  limit 1;

  if v_slot is null then return jsonb_build_object('status','error','code','authority_slot_invalid'); end if;

  v_rank:=case when coalesce(v_slot->>'authority_rank','') ~ '^[0-9]+$' then (v_slot->>'authority_rank')::smallint else 100 end;
  v_required:=coalesce((v_slot->>'required')::boolean,false);

  select document_id into v_existing
  from public.assessment_profile_sources
  where profile_id=v_profile.profile_id
    and authority_code=btrim(p_authority_code)
    and document_id<>p_document_id
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('status','error','code','authority_slot_already_bound','document_id',v_existing);
  end if;

  update public.knowledge_documents
  set grade=p_grade,
      source_role=v_role,
      authority_profile_id=v_profile.profile_id,
      authority_code=btrim(p_authority_code),
      updated_at=now()
  where id=p_document_id;

  delete from public.assessment_profile_sources
  where document_id=p_document_id
    and (profile_id<>v_profile.profile_id or authority_code is distinct from btrim(p_authority_code));

  insert into public.assessment_profile_sources(
    profile_id,document_id,source_kind,authority_rank,authority_code,is_required,notes
  ) values (
    v_profile.profile_id,p_document_id,v_role,v_rank,btrim(p_authority_code),v_required,'EXPLICIT_BINDING_039C'
  )
  on conflict(profile_id,document_id) do update
  set source_kind=excluded.source_kind,
      authority_rank=excluded.authority_rank,
      authority_code=excluded.authority_code,
      is_required=excluded.is_required,
      notes='EXPLICIT_BINDING_039C';

  return jsonb_build_object(
    'status','success',
    'document_id',p_document_id,
    'grade',p_grade,
    'source_role',v_role,
    'binding',jsonb_build_object(
      'profile_id',v_profile.profile_id,
      'assessment_type',v_profile.assessment_type,
      'authority_code',btrim(p_authority_code),
      'authority_rank',v_rank,
      'required',v_required,
      'label',coalesce(nullif(btrim(v_slot->>'label'),''),btrim(p_authority_code))
    )
  );
end;
$$;

revoke all on function public.rpc_knowledge_set_authority_binding(text,text,uuid,smallint,text,text,text) from public;
grant execute on function public.rpc_knowledge_set_authority_binding(text,text,uuid,smallint,text,text,text) to anon, authenticated;

-- Canonicalize persisted authority metadata from the server-side binding. AI output
-- may echo these fields, but it cannot change them.
create or replace function public._knowledge_document_authority_guard_039c()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_slot jsonb;
  v_binding jsonb;
begin
  if new.source_role='KNOWLEDGE_SOURCE' then
    new.authority_profile_id:=null;
    new.authority_code:=null;
    delete from public.assessment_profile_sources where document_id=new.id;
    return new;
  end if;

  if new.source_role not in ('ASSESSMENT_RULE','ASSESSMENT_BENCHMARK') then return new; end if;
  if nullif(btrim(coalesce(new.authority_profile_id,'')),'') is null
     or nullif(btrim(coalesce(new.authority_code,'')),'') is null then
    raise exception 'authority_binding_required_039c';
  end if;

  select profile_id,mon_id,grade,assessment_type,profile
  into v_profile
  from public.assessment_authority_profiles
  where profile_id=new.authority_profile_id
    and is_active=true
  limit 1;
  if v_profile.profile_id is null
     or v_profile.mon_id is distinct from new.mon_id
     or v_profile.grade is distinct from new.grade then
    raise exception 'authority_binding_scope_mismatch_039c';
  end if;

  select s.item into v_slot
  from jsonb_array_elements(coalesce(v_profile.profile->'declared_sources','[]'::jsonb)) as s(item)
  where btrim(coalesce(s.item->>'authority_code',''))=new.authority_code
    and upper(coalesce(s.item->>'source_kind',''))=new.source_role
  limit 1;
  if v_slot is null then raise exception 'authority_slot_invalid_039c'; end if;

  v_binding:=jsonb_build_object(
    'profile_id',new.authority_profile_id,
    'assessment_type',v_profile.assessment_type,
    'authority_code',new.authority_code,
    'source_kind',new.source_role,
    'binding_mode','EXPLICIT_TEACHER_SELECTION_039C'
  );

  if jsonb_typeof(coalesce(new.normalized_manifest,'{}'::jsonb))='object' and new.normalized_manifest<>'{}'::jsonb then
    new.normalized_manifest:=new.normalized_manifest
      || jsonb_build_object(
        'authority_code',new.authority_code,
        'assessment_profile_ids',jsonb_build_array(new.authority_profile_id),
        'authority_binding',v_binding
      );
  end if;
  if jsonb_typeof(coalesce(new.analysis_manifest,'{}'::jsonb))='object' and new.analysis_manifest<>'{}'::jsonb then
    new.analysis_manifest:=new.analysis_manifest || jsonb_build_object('authority_binding',v_binding);
  end if;
  return new;
end;
$$;

revoke all on function public._knowledge_document_authority_guard_039c() from public,anon,authenticated;
drop trigger if exists trg_knowledge_document_authority_guard_039c on public.knowledge_documents;
create trigger trg_knowledge_document_authority_guard_039c
before insert or update of source_role,grade,mon_id,authority_profile_id,authority_code,normalized_manifest,analysis_manifest
on public.knowledge_documents
for each row execute function public._knowledge_document_authority_guard_039c();

-- Defensive gate for the legacy 038 auto-link loop: rows based on AI-supplied profile
-- IDs are ignored unless they exactly match the explicit document binding. For an
-- exact match, rank/required/code are canonicalized from the declared slot.
create or replace function public._assessment_profile_source_guard_039c()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_profile record;
  v_slot jsonb;
begin
  select authority_profile_id,authority_code,source_role,mon_id,grade
  into v_doc
  from public.knowledge_documents
  where id=new.document_id;

  if v_doc.authority_profile_id is null
     or v_doc.authority_code is null
     or v_doc.source_role not in ('ASSESSMENT_RULE','ASSESSMENT_BENCHMARK') then
    return null;
  end if;
  if new.profile_id is distinct from v_doc.authority_profile_id then return null; end if;

  select profile_id,mon_id,grade,profile
  into v_profile
  from public.assessment_authority_profiles
  where profile_id=v_doc.authority_profile_id and is_active=true
  limit 1;
  if v_profile.profile_id is null
     or v_profile.mon_id is distinct from v_doc.mon_id
     or v_profile.grade is distinct from v_doc.grade then
    raise exception 'authority_binding_scope_mismatch_039c';
  end if;

  select s.item into v_slot
  from jsonb_array_elements(coalesce(v_profile.profile->'declared_sources','[]'::jsonb)) as s(item)
  where btrim(coalesce(s.item->>'authority_code',''))=v_doc.authority_code
    and upper(coalesce(s.item->>'source_kind',''))=v_doc.source_role
  limit 1;
  if v_slot is null then raise exception 'authority_slot_invalid_039c'; end if;

  new.source_kind:=v_doc.source_role;
  new.authority_code:=v_doc.authority_code;
  new.authority_rank:=case when coalesce(v_slot->>'authority_rank','') ~ '^[0-9]+$' then (v_slot->>'authority_rank')::smallint else 100 end;
  new.is_required:=coalesce((v_slot->>'required')::boolean,false);
  new.notes:='EXPLICIT_BINDING_039C';
  return new;
end;
$$;

revoke all on function public._assessment_profile_source_guard_039c() from public,anon,authenticated;
drop trigger if exists trg_assessment_profile_source_guard_039c on public.assessment_profile_sources;
create trigger trg_assessment_profile_source_guard_039c
before insert or update on public.assessment_profile_sources
for each row execute function public._assessment_profile_source_guard_039c();

commit;
