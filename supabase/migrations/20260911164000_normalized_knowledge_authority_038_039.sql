begin;

-- 038/039 — AI-web normalized source ingestion + assessment authority registry.
-- Raw source documents remain canonical provenance. AI-normalized JSONL is a derived,
-- validated representation that can become the active knowledge revision.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge-normalized',
  'knowledge-normalized',
  false,
  8388608,
  array['application/x-ndjson','application/json','text/plain']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.knowledge_documents
  add column if not exists source_role text not null default 'KNOWLEDGE_SOURCE',
  add column if not exists curriculum_code text null,
  add column if not exists book_series text null,
  add column if not exists normalization_schema text null,
  add column if not exists normalized_storage_path text null,
  add column if not exists normalized_manifest jsonb not null default '{}'::jsonb;

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_source_role_check;
alter table public.knowledge_documents
  add constraint knowledge_documents_source_role_check
  check (source_role in ('KNOWLEDGE_SOURCE','ASSESSMENT_RULE','ASSESSMENT_BENCHMARK'));

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_normalized_manifest_check;
alter table public.knowledge_documents
  add constraint knowledge_documents_normalized_manifest_check
  check (jsonb_typeof(normalized_manifest)='object');

create index if not exists idx_knowledge_documents_role_grade
  on public.knowledge_documents(truong_id, mon_id, grade, source_role, active_revision);

alter table public.knowledge_units
  drop constraint if exists knowledge_units_unit_type_check;
alter table public.knowledge_units
  add constraint knowledge_units_unit_type_check
  check (unit_type in (
    'DOCUMENT','LESSON','SECTION','PARAGRAPH','FACT','TABLE','FIGURE',
    'LEARNING_OUTCOME','ASSESSMENT_RULE','BENCHMARK_PATTERN','PERSONAL_RULE','OTHER'
  ));

create table if not exists public.assessment_authority_profiles (
  profile_id text primary key,
  mon_id uuid not null references public.mon_hoc(id) on delete cascade,
  grade smallint not null check (grade between 1 and 12),
  assessment_type text not null,
  profile_version text not null,
  effective_from date null,
  effective_to date null,
  is_active boolean not null default true,
  profile jsonb not null check (jsonb_typeof(profile)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mon_id, grade, assessment_type, profile_version)
);

create index if not exists idx_assessment_authority_resolve
  on public.assessment_authority_profiles(mon_id, grade, assessment_type, is_active, effective_from desc);

create table if not exists public.assessment_profile_sources (
  profile_id text not null references public.assessment_authority_profiles(profile_id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  source_kind text not null check (source_kind in ('ASSESSMENT_RULE','ASSESSMENT_BENCHMARK')),
  authority_rank smallint not null check (authority_rank between 1 and 100),
  authority_code text null,
  is_required boolean not null default false,
  notes text null,
  created_at timestamptz not null default now(),
  primary key(profile_id, document_id)
);

alter table public.assessment_authority_profiles enable row level security;
alter table public.assessment_profile_sources enable row level security;
revoke all on table public.assessment_authority_profiles from anon, authenticated;
revoke all on table public.assessment_profile_sources from anon, authenticated;

-- Seed the machine-readable Geography 12 TNTHPT authority profile without hardcoding
-- a generated subject UUID. The actual regulation/reference PDFs can be linked later
-- through assessment_profile_sources after they are normalized and imported.
insert into public.assessment_authority_profiles(
  profile_id, mon_id, grade, assessment_type, profile_version, effective_from, is_active, profile
)
select
  'DIA_LI_TNTHPT_2025_PLUS_V1',
  m.id,
  12,
  'TOT_NGHIEP',
  '039',
  date '2025-01-01',
  true,
  jsonb_build_object(
    'id','DIA_LI_TNTHPT_2025_PLUS_V1',
    'version','039',
    'authority_order',jsonb_build_array('BGDDT_FORMAT_RULE','BGDDT_REFERENCE_EXAM','BGDDT_OFFICIAL_EXAM','PROVINCIAL_MOCK_BENCHMARK'),
    'official_full_blueprint',jsonb_build_object('p1',18,'p2',4,'p3',6,'minutes',50,'p1_points',4.5,'p2_points',4.0,'p3_points',1.5),
    'counts_locked',true,
    'p2_scoring',jsonb_build_object('1_correct',0.1,'2_correct',0.25,'3_correct',0.5,'4_correct',1.0),
    'benchmark_policy','STYLE_ONLY_NO_COPY',
    'model_knowledge_policy','FORBIDDEN',
    'rules',jsonb_build_object(
      'part1',jsonb_build_object('single_key',true,'homogeneous_options',true,'plausible_distractors',true,'avoid_answer_length_clues',true,'avoid_double_negative',true),
      'part2',jsonb_build_object('shared_stimulus_required',true,'statement_count',4,'independent_statements',true,'mixed_cognitive_demand',true,'all_same_truth_pattern_forbidden',true),
      'part3',jsonb_build_object('numeric_answer_required',true,'single_numeric_result',true,'source_sufficient_data',true,'unit_required',true,'rounding_instruction_required',true,'recompute_before_output',true),
      'metadata',jsonb_build_object('muc_do_required',jsonb_build_array('NB','TH','VD'),'source_refs_required',true,'bai_hoc_required',true)
    ),
    'declared_sources',jsonb_build_array(
      jsonb_build_object('authority_code','BGDDT_FORMAT_RULE_2025','source_kind','ASSESSMENT_RULE','authority_rank',1,'required',true,'label','Quy định/cấu trúc định dạng đề thi tốt nghiệp THPT từ năm 2025'),
      jsonb_build_object('authority_code','BGDDT_REFERENCE_EXAM_2025','source_kind','ASSESSMENT_BENCHMARK','authority_rank',2,'required',true,'label','Đề tham khảo chính thức môn Địa lí theo cấu trúc từ năm 2025')
    )
  )
from public.mon_hoc m
where lower(btrim(m.ten_mon)) in ('địa lí','địa lý')
on conflict (profile_id) do update
set mon_id=excluded.mon_id,
    grade=excluded.grade,
    assessment_type=excluded.assessment_type,
    profile_version=excluded.profile_version,
    effective_from=excluded.effective_from,
    is_active=excluded.is_active,
    profile=excluded.profile,
    updated_at=now();

create or replace function public._assessment_authority_snapshot_039(
  p_mon_id uuid,
  p_grade smallint,
  p_assessment_type text
) returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile record;
  v_sources jsonb;
  v_declared jsonb;
  v_required_count integer := 0;
  v_linked_required integer := 0;
  v_state text;
  v_snapshot jsonb;
begin
  select p.* into v_profile
  from public.assessment_authority_profiles p
  where p.mon_id=p_mon_id
    and p.grade=p_grade
    and p.is_active=true
    and (p.effective_from is null or p.effective_from<=current_date)
    and (p.effective_to is null or p.effective_to>=current_date)
    and p.assessment_type in (upper(coalesce(p_assessment_type,'')),'*')
  order by case when p.assessment_type=upper(coalesce(p_assessment_type,'')) then 0 else 1 end,
           p.effective_from desc nulls last,
           p.updated_at desc
  limit 1;

  if v_profile.profile_id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id',d.id,
    'title',d.title,
    'source_kind',s.source_kind,
    'authority_rank',s.authority_rank,
    'authority_code',s.authority_code,
    'is_required',s.is_required,
    'active_revision',d.active_revision,
    'normalization_schema',d.normalization_schema
  ) order by s.authority_rank,d.title),'[]'::jsonb),
  count(*) filter (where s.is_required and d.active_revision is not null)::integer
  into v_sources,v_linked_required
  from public.assessment_profile_sources s
  join public.knowledge_documents d on d.id=s.document_id
  where s.profile_id=v_profile.profile_id
    and d.grade=p_grade
    and d.source_role=s.source_kind;

  v_declared:=coalesce(v_profile.profile->'declared_sources','[]'::jsonb);
  if jsonb_typeof(v_declared)='array' then
    select count(*)::integer into v_required_count
    from jsonb_array_elements(v_declared) x
    where coalesce((x->>'required')::boolean,false)=true;
  end if;

  v_state:=case
    when v_required_count=0 then 'MACHINE_PROFILE_ONLY'
    when v_linked_required>=v_required_count then 'VERIFIED_SOURCES'
    else 'DECLARED_NOT_ATTACHED'
  end;

  v_snapshot:=jsonb_build_object(
    'profile_id',v_profile.profile_id,
    'profile_version',v_profile.profile_version,
    'grade',v_profile.grade,
    'assessment_type',v_profile.assessment_type,
    'effective_from',v_profile.effective_from,
    'effective_to',v_profile.effective_to,
    'source_state',v_state,
    'declared_sources',v_declared,
    'linked_sources',coalesce(v_sources,'[]'::jsonb),
    'profile',v_profile.profile
  );

  return v_snapshot || jsonb_build_object('snapshot_hash',md5(v_snapshot::text));
end;
$$;

revoke all on function public._assessment_authority_snapshot_039(uuid,smallint,text) from public, anon, authenticated;

create or replace function public.rpc_assessment_authority_resolve(
  p_staff_token text,
  p_ma_gv text,
  p_mon_id uuid,
  p_grade smallint,
  p_assessment_type text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_actor record;
  v_snapshot jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;
  select id,ma_gv,quyen,truong_id,mon_id into v_actor from public.giao_vien where id=v_gv_id limit 1;
  if v_actor.id is null or v_actor.ma_gv<>btrim(p_ma_gv) then return jsonb_build_object('status','error','code','staff_identity_mismatch'); end if;
  if p_grade not between 10 and 12 then return jsonb_build_object('status','error','code','grade_invalid'); end if;
  if v_actor.quyen<>'Admin' and (v_actor.mon_id is null or v_actor.mon_id is distinct from p_mon_id) then
    return jsonb_build_object('status','error','code','subject_scope_mismatch');
  end if;
  v_snapshot:=public._assessment_authority_snapshot_039(p_mon_id,p_grade,upper(coalesce(p_assessment_type,'')));
  return jsonb_build_object('status','success','grade',p_grade,'assessment_type',upper(coalesce(p_assessment_type,'')),'authority',v_snapshot);
end;
$$;

revoke all on function public.rpc_assessment_authority_resolve(text,text,uuid,smallint,text) from public;
grant execute on function public.rpc_assessment_authority_resolve(text,text,uuid,smallint,text) to anon, authenticated;

create or replace function public.rpc_knowledge_import_normalized_source_service(
  p_requested_by uuid,
  p_document_id uuid,
  p_grade smallint,
  p_source_role text,
  p_manifest jsonb,
  p_units jsonb,
  p_normalized_storage_path text,
  p_payload_sha256 text,
  p_ai_provider text default null,
  p_ai_model text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_doc record;
  v_role text;
  v_revision integer;
  v_unit jsonb;
  v_unit_key text;
  v_unit_type text;
  v_page_start integer;
  v_page_end integer;
  v_confidence numeric;
  v_is_usable boolean;
  v_uncertain_count integer:=0;
  v_missing_count integer:=0;
  v_quality text;
  v_document_type text;
  v_lesson_units integer:=0;
  v_profile_id text;
  v_rank integer;
  v_profile record;
begin
  if p_grade not between 10 and 12 then raise exception 'normalized_grade_invalid'; end if;
  v_role:=upper(btrim(coalesce(p_source_role,'')));
  if v_role not in ('KNOWLEDGE_SOURCE','ASSESSMENT_RULE','ASSESSMENT_BENCHMARK') then raise exception 'normalized_source_role_invalid'; end if;
  if p_manifest is null or jsonb_typeof(p_manifest)<>'object' or p_manifest->>'schema_version'<>'DAMSAN_SOURCE_V2' then
    raise exception 'normalized_manifest_invalid';
  end if;
  if coalesce(p_manifest->>'grade','') !~ '^[0-9]+$' or (p_manifest->>'grade')::integer<>p_grade then
    raise exception 'normalized_manifest_grade_mismatch';
  end if;
  if upper(coalesce(p_manifest->>'source_role',''))<>v_role then raise exception 'normalized_manifest_role_mismatch'; end if;
  if p_units is null or jsonb_typeof(p_units)<>'array' or jsonb_array_length(p_units)<1 or jsonb_array_length(p_units)>12000 then
    raise exception 'normalized_units_invalid';
  end if;
  if coalesce(p_payload_sha256,'') !~ '^[0-9A-Fa-f]{64}$' then raise exception 'normalized_payload_hash_invalid'; end if;
  if nullif(btrim(p_normalized_storage_path),'') is null then raise exception 'normalized_storage_path_required'; end if;

  select id,truong_id,mon_id,quyen into v_actor from public.giao_vien where id=p_requested_by limit 1;
  if v_actor.id is null or v_actor.truong_id is null then raise exception 'normalized_actor_invalid'; end if;

  select id,owner_gv_id,truong_id,mon_id,page_count,analysis_revision,active_revision,pipeline_status,document_type
  into v_doc
  from public.knowledge_documents
  where id=p_document_id
  for update;
  if v_doc.id is null then raise exception 'normalized_document_unavailable'; end if;
  if v_actor.quyen<>'Admin' and v_doc.owner_gv_id is distinct from p_requested_by then raise exception 'normalized_document_unavailable'; end if;
  if v_doc.truong_id is distinct from v_actor.truong_id and v_actor.quyen<>'Admin' then raise exception 'normalized_document_unavailable'; end if;
  if exists(select 1 from public.knowledge_ingestion_jobs j where j.document_id=p_document_id and j.status='RUNNING') then
    raise exception 'normalized_document_processing_busy';
  end if;

  if jsonb_typeof(coalesce(p_manifest->'coverage','{}'::jsonb))<>'object' then raise exception 'normalized_coverage_invalid'; end if;
  if coalesce(p_manifest #>> '{coverage,source_page_count}','') !~ '^[0-9]+$' then raise exception 'normalized_coverage_invalid'; end if;
  if v_doc.page_count is not null and (p_manifest #>> '{coverage,source_page_count}')::integer<>v_doc.page_count then
    raise exception 'normalized_source_page_count_mismatch';
  end if;
  if jsonb_typeof(coalesce(p_manifest #> '{coverage,missing_pages}','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_manifest #> '{coverage,uncertain_pages}','[]'::jsonb))<>'array' then
    raise exception 'normalized_coverage_invalid';
  end if;
  v_missing_count:=jsonb_array_length(coalesce(p_manifest #> '{coverage,missing_pages}','[]'::jsonb));
  v_uncertain_count:=jsonb_array_length(coalesce(p_manifest #> '{coverage,uncertain_pages}','[]'::jsonb));
  if v_missing_count>0 then raise exception 'normalized_coverage_incomplete'; end if;

  v_revision:=coalesce(v_doc.analysis_revision,0)+1;

  for v_unit in select value from jsonb_array_elements(p_units) loop
    if jsonb_typeof(v_unit)<>'object' then raise exception 'normalized_unit_invalid'; end if;
    v_unit_key:=btrim(coalesce(v_unit->>'unit_key',''));
    v_unit_type:=upper(btrim(coalesce(v_unit->>'unit_type','OTHER')));
    if v_unit_key='' or length(v_unit_key)>500 then raise exception 'normalized_unit_key_invalid'; end if;
    if v_unit_type not in ('DOCUMENT','LESSON','SECTION','PARAGRAPH','FACT','TABLE','FIGURE','LEARNING_OUTCOME','ASSESSMENT_RULE','BENCHMARK_PATTERN','PERSONAL_RULE','OTHER') then
      raise exception 'normalized_unit_type_invalid';
    end if;
    if v_role='ASSESSMENT_RULE' and v_unit_type<>'ASSESSMENT_RULE' then raise exception 'normalized_rule_unit_type_invalid'; end if;
    if v_role='ASSESSMENT_BENCHMARK' and v_unit_type not in ('BENCHMARK_PATTERN','OTHER') then raise exception 'normalized_benchmark_unit_type_invalid'; end if;
    if v_role='KNOWLEDGE_SOURCE' and v_unit_type in ('ASSESSMENT_RULE','BENCHMARK_PATTERN') then raise exception 'normalized_knowledge_unit_type_invalid'; end if;
    if v_unit->'content' is null or jsonb_typeof(v_unit->'content') not in ('object','array') then raise exception 'normalized_unit_content_invalid'; end if;
    if v_unit ? 'hierarchy' and jsonb_typeof(v_unit->'hierarchy')<>'object' then raise exception 'normalized_unit_hierarchy_invalid'; end if;
    if v_unit ? 'provenance' and jsonb_typeof(v_unit->'provenance')<>'object' then raise exception 'normalized_unit_provenance_invalid'; end if;

    v_page_start:=null; v_page_end:=null;
    if coalesce(v_unit->>'page_start','') ~ '^[0-9]+$' then v_page_start:=(v_unit->>'page_start')::integer; end if;
    if coalesce(v_unit->>'page_end','') ~ '^[0-9]+$' then v_page_end:=(v_unit->>'page_end')::integer; end if;
    if v_page_start is not null and (v_page_start<1 or (v_doc.page_count is not null and v_page_start>v_doc.page_count)) then raise exception 'normalized_unit_page_invalid'; end if;
    if v_page_end is not null and (v_page_end<1 or (v_doc.page_count is not null and v_page_end>v_doc.page_count)) then raise exception 'normalized_unit_page_invalid'; end if;
    if v_page_start is not null and v_page_end is not null and v_page_end<v_page_start then raise exception 'normalized_unit_page_invalid'; end if;

    v_confidence:=null;
    if coalesce(v_unit->>'confidence','') ~ '^[0-9]+([.][0-9]+)?$' then v_confidence:=(v_unit->>'confidence')::numeric; end if;
    if v_confidence is not null and (v_confidence<0 or v_confidence>1) then raise exception 'normalized_unit_confidence_invalid'; end if;
    v_is_usable:=lower(coalesce(v_unit->>'is_usable','true')) not in ('false','0');
    if v_role='KNOWLEDGE_SOURCE' and v_unit_type='LESSON' then v_lesson_units:=v_lesson_units+1; end if;

    insert into public.knowledge_units(
      document_id,revision,unit_key,unit_type,ordinal_no,hierarchy,lesson_code,lesson_title,section_title,
      page_start,page_end,content,provenance,confidence,is_usable
    ) values (
      p_document_id,v_revision,v_unit_key,v_unit_type,
      case when coalesce(v_unit->>'ordinal_no','') ~ '^[0-9]+$' then (v_unit->>'ordinal_no')::integer else 0 end,
      coalesce(v_unit->'hierarchy','{}'::jsonb),nullif(btrim(v_unit->>'lesson_code'),''),nullif(btrim(v_unit->>'lesson_title'),''),
      nullif(btrim(v_unit->>'section_title'),''),v_page_start,v_page_end,v_unit->'content',coalesce(v_unit->'provenance','{}'::jsonb),v_confidence,v_is_usable
    );
  end loop;

  if v_role='KNOWLEDGE_SOURCE' and v_lesson_units<1 then raise exception 'normalized_lessons_missing'; end if;

  v_quality:=case when v_uncertain_count=0 then 'AUTO_ACCEPTED' else 'NEEDS_REVIEW' end;
  v_document_type:=case v_role
    when 'ASSESSMENT_RULE' then 'ASSESSMENT_FRAMEWORK'
    when 'ASSESSMENT_BENCHMARK' then 'SUPPLEMENTARY'
    else upper(coalesce(nullif(btrim(p_manifest->>'document_type'),''),coalesce(v_doc.document_type,'TEXTBOOK')))
  end;
  if v_document_type not in ('TEXTBOOK','CURRICULUM','LEARNING_OUTCOMES','ASSESSMENT_FRAMEWORK','SUPPLEMENTARY','PERSONAL_RULES','OTHER') then
    v_document_type:=case when v_role='KNOWLEDGE_SOURCE' then 'TEXTBOOK' else 'OTHER' end;
  end if;

  update public.knowledge_documents
  set title=coalesce(nullif(btrim(p_manifest->>'title'),''),title),
      grade=p_grade,
      source_role=v_role,
      curriculum_code=nullif(btrim(p_manifest->>'curriculum_code'),''),
      book_series=nullif(btrim(p_manifest->>'book_series'),''),
      normalization_schema='DAMSAN_SOURCE_V2',
      normalized_storage_path=btrim(p_normalized_storage_path),
      normalized_manifest=p_manifest || jsonb_build_object(
        'payload_sha256',lower(p_payload_sha256),
        'normalized_storage_path',btrim(p_normalized_storage_path),
        'ai_provider',nullif(btrim(p_ai_provider),''),
        'ai_model',nullif(btrim(p_ai_model),'')
      ),
      document_type=v_document_type,
      analysis_manifest=p_manifest || jsonb_build_object('normalization',jsonb_build_object('schema_version','DAMSAN_SOURCE_V2','payload_sha256',lower(p_payload_sha256))),
      analysis_revision=v_revision,
      active_revision=case when v_quality='AUTO_ACCEPTED' then v_revision else active_revision end,
      quality_status=v_quality,
      pipeline_status='READY',
      processing_error=null,
      analyzed_at=now(),
      activated_at=case when v_quality='AUTO_ACCEPTED' then now() else activated_at end,
      updated_at=now()
  where id=p_document_id;

  update public.knowledge_ingestion_jobs
  set status='SUCCEEDED',current_stage='COMMIT',pipeline_version='DAMSAN_SOURCE_V2/038',
      ai_provider=nullif(btrim(p_ai_provider),''),ai_model=nullif(btrim(p_ai_model),''),
      metrics=coalesce(metrics,'{}'::jsonb) || jsonb_build_object('normalized_import',jsonb_build_object('revision',v_revision,'unit_count',jsonb_array_length(p_units),'source_role',v_role)),
      error_message=null,finished_at=now(),updated_at=now()
  where document_id=p_document_id and status='QUEUED';

  if v_role in ('ASSESSMENT_RULE','ASSESSMENT_BENCHMARK')
     and jsonb_typeof(coalesce(p_manifest->'assessment_profile_ids','[]'::jsonb))='array' then
    for v_profile_id in select value from jsonb_array_elements_text(coalesce(p_manifest->'assessment_profile_ids','[]'::jsonb)) loop
      select profile_id,mon_id,grade into v_profile
      from public.assessment_authority_profiles
      where profile_id=v_profile_id and is_active=true;
      if v_profile.profile_id is not null and v_profile.grade=p_grade and v_profile.mon_id is not distinct from v_doc.mon_id then
        v_rank:=case when v_role='ASSESSMENT_RULE' then 1 else 2 end;
        insert into public.assessment_profile_sources(profile_id,document_id,source_kind,authority_rank,authority_code,is_required)
        values(v_profile_id,p_document_id,v_role,v_rank,nullif(btrim(p_manifest->>'authority_code'),''),true)
        on conflict(profile_id,document_id) do update
        set source_kind=excluded.source_kind,authority_rank=excluded.authority_rank,authority_code=excluded.authority_code,is_required=excluded.is_required;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'status','success','document_id',p_document_id,'revision',v_revision,'source_role',v_role,'grade',p_grade,
    'quality_status',v_quality,'active_revision',case when v_quality='AUTO_ACCEPTED' then v_revision else v_doc.active_revision end,
    'unit_count',jsonb_array_length(p_units),'uncertain_page_count',v_uncertain_count
  );
end;
$$;

revoke all on function public.rpc_knowledge_import_normalized_source_service(uuid,uuid,smallint,text,jsonb,jsonb,text,text,text,text) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_import_normalized_source_service(uuid,uuid,smallint,text,jsonb,jsonb,text,text,text,text) to service_role;

-- Expose source-role/normalization metadata without leaking private Storage paths.
create or replace function public.rpc_knowledge_library_read(
  p_staff_token text,
  p_ma_gv text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_actor record;
  v_documents jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select gv.id,gv.ma_gv,gv.quyen,gv.truong_id,gv.mon_id into v_actor from public.giao_vien gv where gv.id=v_gv_id limit 1;
  if v_actor.id is null or v_actor.ma_gv<>trim(p_ma_gv) then return jsonb_build_object('status','error','code','staff_identity_mismatch','message','Tài khoản không khớp phiên làm việc.'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'truong_id',d.truong_id,'owner_gv_id',d.owner_gv_id,'mon_id',d.mon_id,'grade',d.grade,
    'title',d.title,'original_filename',d.original_filename,'mime_type',d.mime_type,'source_format',d.source_format,
    'file_size_bytes',d.file_size_bytes,'page_count',d.page_count,'document_type',d.document_type,'source_role',d.source_role,
    'curriculum_code',d.curriculum_code,'book_series',d.book_series,'normalization_schema',d.normalization_schema,
    'normalized',case when d.normalized_manifest='{}'::jsonb then null else d.normalized_manifest-'normalized_storage_path' end,
    'pipeline_status',d.pipeline_status,'quality_status',d.quality_status,'analysis_revision',d.analysis_revision,'active_revision',d.active_revision,
    'extraction',case when d.extraction_manifest='{}'::jsonb then null else d.extraction_manifest-'artifact_path' end,
    'processing_error',d.processing_error,'created_at',d.created_at,'updated_at',d.updated_at,'analyzed_at',d.analyzed_at,'activated_at',d.activated_at
  ) order by d.created_at desc,d.id desc),'[]'::jsonb)
  into v_documents
  from public.knowledge_documents d
  where v_actor.quyen='Admin' or d.owner_gv_id=v_gv_id;

  return jsonb_build_object('status','success','documents',v_documents);
end;
$$;

revoke all on function public.rpc_knowledge_library_read(text,text) from public;
grant execute on function public.rpc_knowledge_library_read(text,text) to anon, authenticated;

-- Lesson catalog is content-only. Assessment rules and benchmark corpora are never
-- offered as exam knowledge sources.
create or replace function public.rpc_knowledge_scope_catalog_read(
  p_staff_token text,
  p_ma_gv text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_actor record;
  v_doc record;
  v_lessons jsonb;
  v_documents jsonb:='[]'::jsonb;
  v_lesson_count integer;
  v_unscoped_count integer;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select gv.id,gv.ma_gv,gv.quyen,gv.truong_id,gv.mon_id into v_actor from public.giao_vien gv where gv.id=v_gv_id limit 1;
  if v_actor.id is null or v_actor.ma_gv<>trim(p_ma_gv) then return jsonb_build_object('status','error','code','staff_identity_mismatch','message','Tài khoản không khớp phiên làm việc.'); end if;

  for v_doc in
    select d.id,d.truong_id,d.mon_id,d.grade,d.title,d.original_filename,d.document_type,d.source_format,d.source_role,
           d.normalization_schema,d.active_revision,d.page_count,d.created_at
    from public.knowledge_documents d
    where d.active_revision is not null
      and d.source_role='KNOWLEDGE_SOURCE'
      and (v_actor.quyen='Admin' or d.owner_gv_id=v_gv_id)
    order by d.created_at desc,d.id desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'scope_key',q.scope_key,'lesson_title',q.scope_title,'page_start',q.page_start,'page_end',q.page_end,'unit_count',q.unit_count
    ) order by q.first_ordinal,q.scope_key),'[]'::jsonb),count(*)::integer
    into v_lessons,v_lesson_count
    from (
      select x.scope_key,min(x.scope_title) scope_title,
             min(x.page_start) filter(where x.page_start is not null) page_start,
             max(x.page_end) filter(where x.page_end is not null) page_end,
             count(*)::integer unit_count,min(x.ordinal_no) first_ordinal
      from (
        select public._knowledge_scope_key_036(u.lesson_code,u.lesson_title,u.hierarchy) scope_key,
               public._knowledge_scope_title_036(u.lesson_code,u.lesson_title,u.hierarchy) scope_title,
               u.page_start,u.page_end,u.ordinal_no
        from public.knowledge_units u
        where u.document_id=v_doc.id and u.revision=v_doc.active_revision and u.is_usable=true
      ) x
      where x.scope_key<>'__DOCUMENT__'
      group by x.scope_key
    ) q;

    select count(*)::integer into v_unscoped_count
    from public.knowledge_units u
    where u.document_id=v_doc.id and u.revision=v_doc.active_revision and u.is_usable=true
      and public._knowledge_scope_key_036(u.lesson_code,u.lesson_title,u.hierarchy)='__DOCUMENT__';

    v_documents:=v_documents || jsonb_build_array(jsonb_build_object(
      'id',v_doc.id,'truong_id',v_doc.truong_id,'mon_id',v_doc.mon_id,'grade',v_doc.grade,'title',v_doc.title,
      'original_filename',v_doc.original_filename,'document_type',v_doc.document_type,'source_format',v_doc.source_format,
      'source_role',v_doc.source_role,'normalization_schema',v_doc.normalization_schema,'active_revision',v_doc.active_revision,
      'page_count',v_doc.page_count,'lesson_count',coalesce(v_lesson_count,0),'lesson_scopes',coalesce(v_lessons,'[]'::jsonb),
      'unscoped_unit_count',coalesce(v_unscoped_count,0),'scope_mode',case when coalesce(v_lesson_count,0)>0 then 'LESSON_AWARE' else 'DOCUMENT_ONLY' end
    ));
  end loop;
  return jsonb_build_object('status','success','schema_version','DAMSAN_KNOWLEDGE_SCOPE_CATALOG_V2','documents',v_documents);
end;
$$;

revoke all on function public.rpc_knowledge_scope_catalog_read(text,text) from public;
grant execute on function public.rpc_knowledge_scope_catalog_read(text,text) to anon, authenticated;

-- Grade-aware, content-role-aware exam request creation. Source grade must match the
-- assessment grade. Rule/benchmark documents can never enter the Knowledge Pack.
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
as $$
declare
  v_actor record;
  v_effective_truong_id uuid;
  v_effective_mon_id uuid;
  v_docs uuid[];
  v_requested_count integer:=0;
  v_valid_count integer:=0;
  v_request_id uuid;
  v_profile text;
  v_variant_count integer;
  v_scope jsonb;
  v_grade smallint;
  v_subject text;
  v_p1 integer;
  v_p2 integer;
  v_p3 integer;
begin
  if p_exam_spec is null or jsonb_typeof(p_exam_spec)<>'object' then raise exception 'exam_spec must be an object'; end if;
  if nullif(btrim(p_ma_phong),'') is null then raise exception 'room code is required'; end if;
  begin v_grade:=(p_exam_spec->>'grade')::smallint; exception when others then raise exception 'assessment_grade_required'; end;
  if v_grade not between 10 and 12 then raise exception 'assessment_grade_invalid'; end if;

  select id,truong_id,mon_id,quyen into v_actor from public.giao_vien where id=p_requested_by limit 1;
  if v_actor.id is null or v_actor.truong_id is null then raise exception 'teacher not found'; end if;
  if v_actor.quyen='Admin' then
    if p_truong_id is null or p_mon_id is null then raise exception 'admin target scope is required'; end if;
    v_effective_truong_id:=p_truong_id; v_effective_mon_id:=p_mon_id;
  else
    if p_truong_id is distinct from v_actor.truong_id or v_actor.mon_id is null or p_mon_id is distinct from v_actor.mon_id then raise exception 'teacher target scope mismatch'; end if;
    v_effective_truong_id:=v_actor.truong_id; v_effective_mon_id:=v_actor.mon_id;
  end if;

  v_profile:=upper(coalesce(nullif(btrim(p_exam_spec->>'assessment_type'),''),'TOT_NGHIEP'));
  if v_profile not in ('LEGACY','TOT_NGHIEP','MCQ_ONLY','TRUE_FALSE_ONLY','SHORT_ONLY','CUSTOM') then raise exception 'unsupported assessment_type'; end if;
  begin v_variant_count:=coalesce((p_exam_spec->>'variant_count')::integer,4); exception when others then raise exception 'variant_count must be an integer'; end;
  if v_variant_count<1 or v_variant_count>8 then raise exception 'variant_count must be between 1 and 8'; end if;

  select lower(btrim(ten_mon)) into v_subject from public.mon_hoc where id=v_effective_mon_id;
  if v_subject in ('địa lí','địa lý') and v_grade=12 and v_profile='TOT_NGHIEP' then
    begin
      v_p1:=(p_exam_spec #>> '{counts,p1}')::integer;
      v_p2:=(p_exam_spec #>> '{counts,p2}')::integer;
      v_p3:=(p_exam_spec #>> '{counts,p3}')::integer;
    exception when others then raise exception 'official_blueprint_counts_required'; end;
    if v_p1<>18 or v_p2<>4 or v_p3<>6 then raise exception 'official_blueprint_counts_locked_18_4_6'; end if;
  end if;

  if p_knowledge_document_ids is null or cardinality(p_knowledge_document_ids)=0 then
    select coalesce(array_agg(d.id order by d.created_at,d.id),array[]::uuid[]) into v_docs
    from public.knowledge_documents d
    where d.truong_id=v_effective_truong_id and (d.mon_id=v_effective_mon_id or d.mon_id is null)
      and d.grade=v_grade and d.source_role='KNOWLEDGE_SOURCE' and d.active_revision is not null;
  else
    v_requested_count:=cardinality(p_knowledge_document_ids);
    select coalesce(array_agg(d.id order by d.created_at,d.id),array[]::uuid[]),count(*)::integer into v_docs,v_valid_count
    from public.knowledge_documents d
    where d.id=any(p_knowledge_document_ids) and d.truong_id=v_effective_truong_id
      and (d.mon_id=v_effective_mon_id or d.mon_id is null) and d.grade=v_grade
      and d.source_role='KNOWLEDGE_SOURCE' and d.active_revision is not null;
    if v_valid_count<>v_requested_count then raise exception 'one or more knowledge documents are unavailable for selected grade'; end if;
  end if;
  if v_docs is null or cardinality(v_docs)=0 then raise exception 'no active knowledge documents are available for selected grade'; end if;

  v_scope:=public._ai_exam_normalize_scope_036(p_exam_spec->'knowledge_scope',v_docs);

  insert into public.ai_exam_requests(requested_by,truong_id,mon_id,ma_phong,exam_spec,knowledge_document_ids,status)
  values(
    p_requested_by,v_effective_truong_id,v_effective_mon_id,btrim(p_ma_phong),
    (p_exam_spec-'knowledge_scope') || jsonb_build_object('grade',v_grade,'assessment_type',v_profile,'variant_count',v_variant_count,'knowledge_scope',v_scope),
    v_docs,'AWAITING_AI'
  ) returning id into v_request_id;

  return jsonb_build_object(
    'status','success','request_id',v_request_id,'truong_id',v_effective_truong_id,'mon_id',v_effective_mon_id,'grade',v_grade,
    'ma_phong',btrim(p_ma_phong),'knowledge_document_count',cardinality(v_docs),'assessment_type',v_profile,'variant_count',v_variant_count,'knowledge_scope',v_scope
  );
end;
$$;

revoke all on function public.rpc_ai_exam_create_request_service(uuid,uuid,uuid,text,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.rpc_ai_exam_create_request_service(uuid,uuid,uuid,text,jsonb,uuid[]) to service_role;

create or replace function public.rpc_ai_exam_knowledge_pack_service(
  p_request_id uuid,
  p_offset integer default 0,
  p_limit integer default 80
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_scope jsonb;
  v_grade smallint;
  v_offset integer;
  v_limit integer;
  v_total integer;
  v_units jsonb;
begin
  select id,knowledge_document_ids,exam_spec->'knowledge_scope' knowledge_scope,(exam_spec->>'grade')::smallint grade into v_request
  from public.ai_exam_requests where id=p_request_id;
  if v_request.id is null then raise exception 'exam request not found'; end if;
  v_scope:=v_request.knowledge_scope; v_grade:=v_request.grade;
  v_offset:=greatest(coalesce(p_offset,0),0); v_limit:=least(greatest(coalesce(p_limit,80),1),120);

  select count(*)::integer into v_total
  from public.knowledge_units u join public.knowledge_documents d on d.id=u.document_id
  where d.id=any(v_request.knowledge_document_ids) and d.grade=v_grade and d.source_role='KNOWLEDGE_SOURCE'
    and d.active_revision is not null and u.revision=d.active_revision and u.is_usable=true
    and public._ai_exam_scope_allows_unit_036(v_scope,u.document_id,u.lesson_code,u.lesson_title,u.hierarchy);

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id',s.document_id,'document_title',s.document_title,'document_type',s.document_type,'grade',s.grade,
    'unit_key',s.unit_key,'unit_type',s.unit_type,'ordinal_no',s.ordinal_no,'hierarchy',s.hierarchy,
    'lesson_code',s.lesson_code,'lesson_title',s.lesson_title,'section_title',s.section_title,'page_start',s.page_start,'page_end',s.page_end,
    'content',s.content,'provenance',s.provenance,'confidence',s.confidence,'scope_key',s.scope_key
  ) order by s.doc_order,s.ordinal_no,s.unit_id),'[]'::jsonb)
  into v_units
  from (
    select u.id unit_id,u.document_id,d.title document_title,d.document_type,d.grade,u.unit_key,u.unit_type,u.ordinal_no,u.hierarchy,
           u.lesson_code,u.lesson_title,u.section_title,u.page_start,u.page_end,u.content,u.provenance,u.confidence,d.created_at doc_order,
           public._knowledge_scope_key_036(u.lesson_code,u.lesson_title,u.hierarchy) scope_key
    from public.knowledge_units u join public.knowledge_documents d on d.id=u.document_id
    where d.id=any(v_request.knowledge_document_ids) and d.grade=v_grade and d.source_role='KNOWLEDGE_SOURCE'
      and d.active_revision is not null and u.revision=d.active_revision and u.is_usable=true
      and public._ai_exam_scope_allows_unit_036(v_scope,u.document_id,u.lesson_code,u.lesson_title,u.hierarchy)
    order by d.created_at,d.id,u.ordinal_no,u.id offset v_offset limit v_limit
  ) s;

  return jsonb_build_object('status','success','request_id',p_request_id,'grade',v_grade,'offset',v_offset,'limit',v_limit,
    'total_units',v_total,'units',v_units,'knowledge_scope',v_scope,
    'has_more',(v_offset+jsonb_array_length(v_units))<v_total,
    'next_offset',case when (v_offset+jsonb_array_length(v_units))<v_total then v_offset+jsonb_array_length(v_units) else null end);
end;
$$;

revoke all on function public.rpc_ai_exam_knowledge_pack_service(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.rpc_ai_exam_knowledge_pack_service(uuid,integer,integer) to service_role;

-- Tighten the legacy 037 attachment so the TNTHPT profile cannot leak into grade 10/11.
create or replace function public._ai_exam_apply_assessment_standard_037()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_profile text;
  v_grade integer;
begin
  select lower(btrim(m.ten_mon)) into v_subject from public.mon_hoc m where m.id=new.mon_id;
  v_profile:=upper(coalesce(new.exam_spec->>'assessment_type',''));
  begin v_grade:=(new.exam_spec->>'grade')::integer; exception when others then v_grade:=null; end;
  if v_subject in ('địa lí','địa lý') and v_grade=12 and v_profile in ('TOT_NGHIEP','MCQ_ONLY','TRUE_FALSE_ONLY','SHORT_ONLY','CUSTOM') then
    new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb) || jsonb_build_object('assessment_standard',public._ai_exam_geography_standard_037());
  else
    new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)-'assessment_standard';
  end if;
  return new;
end;
$$;

create or replace function public._ai_exam_apply_authority_039()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grade smallint;
  v_snapshot jsonb;
begin
  begin v_grade:=(new.exam_spec->>'grade')::smallint; exception when others then v_grade:=null; end;
  if v_grade is null then
    new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)-'assessment_authority';
    return new;
  end if;
  v_snapshot:=public._assessment_authority_snapshot_039(new.mon_id,v_grade,upper(coalesce(new.exam_spec->>'assessment_type','')));
  if v_snapshot is null then new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)-'assessment_authority';
  else new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb) || jsonb_build_object('assessment_authority',v_snapshot); end if;
  return new;
end;
$$;

revoke all on function public._ai_exam_apply_authority_039() from public, anon, authenticated;
drop trigger if exists trg_ai_exam_requests_authority_039 on public.ai_exam_requests;
create trigger trg_ai_exam_requests_authority_039
before insert or update of mon_id,exam_spec on public.ai_exam_requests
for each row execute function public._ai_exam_apply_authority_039();

create or replace function public._ai_exam_authority_gate_039(
  p_request_id uuid,
  p_exam_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spec jsonb;
  v_profile_id text;
  v_assessment_type text;
  v_payload_type text;
  v_p1 integer;
  v_p2 integer;
  v_p3 integer;
begin
  select exam_spec into v_spec from public.ai_exam_requests where id=p_request_id;
  if v_spec is null then return jsonb_build_object('valid',false,'code','authority_request_missing'); end if;
  v_profile_id:=v_spec #>> '{assessment_authority,profile_id}';
  if nullif(v_profile_id,'') is null then return jsonb_build_object('valid',true,'applied',false,'quality_gate_version','039'); end if;
  v_assessment_type:=upper(coalesce(v_spec->>'assessment_type',''));
  v_payload_type:=upper(coalesce(p_exam_payload->>'assessment_type',''));
  if v_payload_type<>v_assessment_type then return jsonb_build_object('valid',false,'code','authority_assessment_type_mismatch'); end if;

  if v_profile_id='DIA_LI_TNTHPT_2025_PLUS_V1' and v_assessment_type='TOT_NGHIEP' then
    select count(*) filter(where value->>'phan'='1')::integer,
           count(*) filter(where value->>'phan'='2')::integer,
           count(*) filter(where value->>'phan'='3')::integer
    into v_p1,v_p2,v_p3
    from jsonb_array_elements(coalesce(p_exam_payload->'questions','[]'::jsonb));
    if v_p1<>18 or v_p2<>4 or v_p3<>6 then
      return jsonb_build_object('valid',false,'code','authority_official_blueprint_mismatch','expected',jsonb_build_object('p1',18,'p2',4,'p3',6),'actual',jsonb_build_object('p1',v_p1,'p2',v_p2,'p3',v_p3));
    end if;
  end if;
  return jsonb_build_object('valid',true,'applied',true,'profile_id',v_profile_id,'quality_gate_version','039','snapshot_hash',v_spec #>> '{assessment_authority,snapshot_hash}');
end;
$$;

revoke all on function public._ai_exam_authority_gate_039(uuid,jsonb) from public, anon, authenticated;

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
as $$
declare
  v_row record;
  v_revision integer;
  v_quality jsonb;
  v_scope_quality jsonb;
  v_authority_quality jsonb;
  v_validation_report jsonb;
begin
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if p_exam_payload is null or jsonb_typeof(p_exam_payload)<>'object' or p_exam_payload->>'schema_version'<>'DAMSAN_EXAM_V1' then return jsonb_build_object('status','error','code','exam_payload_invalid'); end if;
  if p_variants_payload is null or jsonb_typeof(p_variants_payload)<>'array' or jsonb_array_length(p_variants_payload)<1 then return jsonb_build_object('status','error','code','variants_payload_invalid'); end if;
  if p_validation_report is null or jsonb_typeof(p_validation_report)<>'object' then return jsonb_build_object('status','error','code','validation_report_invalid'); end if;
  if coalesce((p_validation_report->>'valid')::boolean,false) is not true then return jsonb_build_object('status','error','code','draft_not_validated'); end if;

  select h.id handoff_id,h.status handoff_status,h.expires_at,h.request_id,r.status request_status into v_row
  from public.ai_exam_handoffs h join public.ai_exam_requests r on r.id=h.request_id
  where h.capability_hash=lower(p_capability_hash) for update of h,r;
  if v_row.handoff_id is null then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if v_row.expires_at<=now() then update public.ai_exam_handoffs set status='EXPIRED',updated_at=now() where id=v_row.handoff_id; return jsonb_build_object('status','error','code','capability_expired'); end if;
  if v_row.handoff_status<>'CLAIMED' then return jsonb_build_object('status','error','code','capability_not_claimed'); end if;
  if v_row.request_status<>'AI_WORKING' then return jsonb_build_object('status','error','code','exam_request_unavailable'); end if;

  v_scope_quality:=public._ai_exam_scope_quality_gate_036(v_row.request_id,p_exam_payload);
  if coalesce((v_scope_quality->>'valid')::boolean,false) is not true then
    return jsonb_build_object('status','error','code',coalesce(v_scope_quality->>'code','knowledge_scope_quality_invalid'),'quality',v_scope_quality);
  end if;
  v_quality:=public._ai_exam_quality_gate_037(v_row.request_id,p_exam_payload);
  if coalesce((v_quality->>'valid')::boolean,false) is not true then
    return jsonb_build_object('status','error','code',coalesce(v_quality->>'code','assessment_quality_invalid'),'quality',v_quality);
  end if;
  v_authority_quality:=public._ai_exam_authority_gate_039(v_row.request_id,p_exam_payload);
  if coalesce((v_authority_quality->>'valid')::boolean,false) is not true then
    return jsonb_build_object('status','error','code',coalesce(v_authority_quality->>'code','assessment_authority_invalid'),'quality',v_authority_quality);
  end if;
  v_validation_report:=p_validation_report || jsonb_build_object('assessment_quality',v_quality,'knowledge_scope_quality',v_scope_quality,'assessment_authority_quality',v_authority_quality);

  select coalesce(max(revision),0)+1 into v_revision from public.ai_exam_drafts where request_id=v_row.request_id;
  update public.ai_exam_drafts set status='SUPERSEDED' where request_id=v_row.request_id and status='VALIDATED';
  insert into public.ai_exam_drafts(request_id,revision,ai_provider,ai_model,exam_payload,variants_payload,validation_report,status)
  values(v_row.request_id,v_revision,nullif(btrim(p_ai_provider),''),nullif(btrim(p_ai_model),''),p_exam_payload,p_variants_payload,v_validation_report,'VALIDATED');
  update public.ai_exam_requests set status='READY_FOR_REVIEW',active_draft_revision=v_revision,ready_at=now(),processing_error=null,updated_at=now() where id=v_row.request_id;
  update public.ai_exam_handoffs set status='COMPLETED',ai_provider=nullif(btrim(p_ai_provider),''),ai_model=nullif(btrim(p_ai_model),''),completed_at=now(),updated_at=now() where id=v_row.handoff_id;
  return jsonb_build_object('status','success','request_id',v_row.request_id,'revision',v_revision,'request_status','READY_FOR_REVIEW','quality',v_quality,'knowledge_scope_quality',v_scope_quality,'assessment_authority_quality',v_authority_quality);
end;
$$;

revoke all on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) to service_role;

commit;
