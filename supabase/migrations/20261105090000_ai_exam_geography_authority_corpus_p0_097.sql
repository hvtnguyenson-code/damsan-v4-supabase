begin;

-- 097 — Geography P0 authority corpus registry.
-- This migration does NOT attach or invent assessment sources. It expands the canonical
-- Geography authority slots, records verified public source locators, and makes authority
-- readiness reflect actual normalized/usable linked corpus instead of mere linkage.

update public.assessment_authority_profiles p
set profile_version='097',
    profile = coalesce(p.profile,'{}'::jsonb)
      || jsonb_build_object(
        'version','097',
        'authority_axes',jsonb_build_object(
          'normative',jsonb_build_array('BGDDT_GEOGRAPHY_CURRICULUM_2018','BGDDT_FORMAT_RULE_2025'),
          'calibration',jsonb_build_array(
            'BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY',
            'BGDDT_OFFICIAL_EXAM_2025_GEOGRAPHY',
            'BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY',
            'PROVINCIAL_GEOGRAPHY_HIGH_QUALITY'
          )
        ),
        'declared_sources',jsonb_build_array(
          jsonb_build_object(
            'authority_code','BGDDT_GEOGRAPHY_CURRICULUM_2018',
            'source_kind','ASSESSMENT_RULE',
            'authority_rank',1,
            'required',true,
            'label','Chương trình GDPT 2018 môn Địa lí — năng lực và yêu cầu cần đạt',
            'publisher','Bộ Giáo dục và Đào tạo',
            'source_url','https://moet.gov.vn/content/vanban/Lists/VBPQ/Attachments/1483/vbhn-ttu-322018-202021-132022-ttbgddt.pdf',
            'locator_status','OFFICIAL_SOURCE_LOCATED'
          ),
          jsonb_build_object(
            'authority_code','BGDDT_FORMAT_RULE_2025',
            'source_kind','ASSESSMENT_RULE',
            'authority_rank',1,
            'required',true,
            'label','Cấu trúc định dạng đề thi tốt nghiệp THPT từ năm 2025',
            'publisher','Cục Quản lý chất lượng — Bộ Giáo dục và Đào tạo',
            'source_url','https://vqa.moet.gov.vn/vi/news/thong-bao/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-74.html',
            'locator_status','OFFICIAL_SOURCE_LOCATED'
          ),
          jsonb_build_object(
            'authority_code','BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY',
            'source_kind','ASSESSMENT_BENCHMARK',
            'authority_rank',3,
            'required',true,
            'label','Đề tham khảo chính thức môn Địa lí — Kỳ thi tốt nghiệp THPT từ năm 2025',
            'publisher','Cục Quản lý chất lượng — Bộ Giáo dục và Đào tạo',
            'source_url','https://vqa.moet.gov.vn/vi/news/tin-tuc-su-kien/de-thi-tham-khao-ky-thi-tot-nghiep-thpt-tu-nam-2025-159.html',
            'artifact_url','https://drive.google.com/file/d/1F_UfWJSW04Y52Wq90YANGvHjmu9bZHBb/view',
            'artifact_name','07_DiaLi.pdf',
            'locator_status','OFFICIAL_ARTIFACT_LOCATED'
          ),
          jsonb_build_object(
            'authority_code','BGDDT_OFFICIAL_EXAM_2025_GEOGRAPHY',
            'source_kind','ASSESSMENT_BENCHMARK',
            'authority_rank',2,
            'required',false,
            'label','Đề thi chính thức môn Địa lí — Kỳ thi tốt nghiệp THPT 2025',
            'publisher','Bộ Giáo dục và Đào tạo',
            'locator_status','PENDING_ARTIFACT_VERIFICATION'
          ),
          jsonb_build_object(
            'authority_code','BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY',
            'source_kind','ASSESSMENT_BENCHMARK',
            'authority_rank',2,
            'required',true,
            'label','Đề thi chính thức môn Địa lí — Kỳ thi tốt nghiệp THPT 2026',
            'publisher','Bộ Giáo dục và Đào tạo',
            'source_url','https://xaydungchinhsach.chinhphu.vn/thi-tot-nghiep-thpt-2026-de-thi-mon-dia-li-va-goi-y-dap-an-119260612141919076.htm',
            'locator_status','GOVERNMENT_PORTAL_ARTIFACT_LOCATED'
          )
        )
      ),
    updated_at=now()
where p.profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

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
  v_verified_required integer := 0;
  v_verified_any integer := 0;
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

  with linked as (
    select
      s.profile_id,
      s.document_id,
      s.source_kind,
      s.authority_rank,
      s.authority_code,
      s.is_required,
      d.title,
      d.active_revision,
      d.normalization_schema,
      d.pipeline_status,
      d.quality_status,
      count(u.id) filter (
        where u.revision=d.active_revision
          and u.is_usable is true
          and (
            (s.source_kind='ASSESSMENT_RULE' and u.unit_type='ASSESSMENT_RULE')
            or
            (s.source_kind='ASSESSMENT_BENCHMARK' and u.unit_type='BENCHMARK_PATTERN')
          )
      )::integer as usable_unit_count
    from public.assessment_profile_sources s
    join public.knowledge_documents d on d.id=s.document_id
    left join public.knowledge_units u on u.document_id=d.id
    where s.profile_id=v_profile.profile_id
      and d.grade=p_grade
      and d.source_role=s.source_kind
    group by
      s.profile_id,s.document_id,s.source_kind,s.authority_rank,s.authority_code,s.is_required,
      d.title,d.active_revision,d.normalization_schema,d.pipeline_status,d.quality_status
  ), assessed as (
    select *,
      (
        active_revision is not null
        and normalization_schema='DAMSAN_SOURCE_V2'
        and pipeline_status='READY'
        and quality_status in ('AUTO_ACCEPTED','TEACHER_ACCEPTED','ACCEPTED')
        and usable_unit_count>0
      ) as verified
    from linked
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'document_id',document_id,
      'title',title,
      'source_kind',source_kind,
      'authority_rank',authority_rank,
      'authority_code',authority_code,
      'is_required',is_required,
      'active_revision',active_revision,
      'normalization_schema',normalization_schema,
      'pipeline_status',pipeline_status,
      'quality_status',quality_status,
      'usable_unit_count',usable_unit_count,
      'verified',verified
    ) order by authority_rank,title),'[]'::jsonb),
    count(*) filter (where is_required and verified)::integer,
    count(*) filter (where verified)::integer
  into v_sources,v_verified_required,v_verified_any
  from assessed;

  v_declared:=coalesce(v_profile.profile->'declared_sources','[]'::jsonb);
  if jsonb_typeof(v_declared)='array' then
    select count(*)::integer into v_required_count
    from jsonb_array_elements(v_declared) x
    where coalesce((x->>'required')::boolean,false)=true;
  end if;

  v_state:=case
    when v_required_count=0 then 'MACHINE_PROFILE_ONLY'
    when v_verified_required>=v_required_count then 'VERIFIED_SOURCES'
    when v_verified_any>0 then 'PARTIAL_SOURCES'
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
    'required_source_count',v_required_count,
    'verified_required_source_count',v_verified_required,
    'verified_source_count',v_verified_any,
    'declared_sources',v_declared,
    'linked_sources',coalesce(v_sources,'[]'::jsonb),
    'profile',v_profile.profile
  );

  return v_snapshot || jsonb_build_object('snapshot_hash',md5(v_snapshot::text));
end;
$$;

revoke all on function public._assessment_authority_snapshot_039(uuid,smallint,text) from public, anon, authenticated;

commit;
