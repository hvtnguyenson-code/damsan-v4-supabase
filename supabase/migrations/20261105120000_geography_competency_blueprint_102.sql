begin;

-- 102 — Geography Competency Blueprint compiler.
-- This stage only attaches a deterministic, authority-grounded blueprint to exam_spec.
-- It does NOT alter the generator prompt and does NOT create the 28-slot design plan yet.

create or replace function public._ai_exam_geography_competency_blueprint_102(
  p_authority_snapshot jsonb
) returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile_id text;
  v_snapshot_hash text;
  v_source_state text;
  v_competency_framework jsonb;
  v_spatial jsonb;
  v_causal jsonb;
  v_tool jsonb;
  v_reality jsonb;
  v_map_table jsonb;
  v_format_principle jsonb;
  v_context_policy jsonb;
  v_item_format jsonb;
  v_time_rule jsonb;
  v_bench_features jsonb;
  v_benchmark_sources jsonb;
begin
  if p_authority_snapshot is null or jsonb_typeof(p_authority_snapshot)<>'object' then
    return null;
  end if;

  v_profile_id:=nullif(btrim(coalesce(p_authority_snapshot->>'profile_id','')),'');
  v_snapshot_hash:=nullif(btrim(coalesce(p_authority_snapshot->>'snapshot_hash','')),'');
  v_source_state:=upper(btrim(coalesce(p_authority_snapshot->>'source_state','')));

  if v_profile_id<>'DIA_LI_TNTHPT_2025_PLUS_V1'
     or v_source_state<>'VERIFIED_SOURCES'
     or v_snapshot_hash is null then
    return null;
  end if;

  select
    max(u.content) filter (where u.unit_key='RULE_GEO_COMP_001'),
    max(u.content) filter (where u.unit_key='RULE_GEO_SPATIAL_002'),
    max(u.content) filter (where u.unit_key='RULE_GEO_CAUSAL_003'),
    max(u.content) filter (where u.unit_key='RULE_GEO_TOOL_004'),
    max(u.content) filter (where u.unit_key='RULE_GEO_REALITY_005'),
    max(u.content) filter (where u.unit_key='RULE_GEO_2025_MAP_TABLE_008'),
    max(u.content) filter (where u.unit_key='RULE_FORMAT_2025_001'),
    max(u.content) filter (where u.unit_key='RULE_FORMAT_2025_002'),
    max(u.content) filter (where u.unit_key='RULE_FORMAT_2025_003'),
    max(u.content) filter (where u.unit_key='RULE_FORMAT_2025_006')
  into
    v_competency_framework,v_spatial,v_causal,v_tool,v_reality,v_map_table,
    v_format_principle,v_context_policy,v_item_format,v_time_rule
  from public.knowledge_documents d
  join public.knowledge_units u
    on u.document_id=d.id
   and u.revision=d.active_revision
   and u.is_usable is true
  where d.authority_profile_id=v_profile_id
    and d.active_revision is not null
    and d.pipeline_status='READY'
    and d.quality_status in ('AUTO_ACCEPTED','TEACHER_ACCEPTED','ACCEPTED')
    and u.unit_type='ASSESSMENT_RULE';

  if v_competency_framework is null
     or v_spatial is null
     or v_causal is null
     or v_tool is null
     or v_reality is null
     or v_map_table is null
     or v_format_principle is null
     or v_context_policy is null
     or v_item_format is null
     or v_time_rule is null then
    return null;
  end if;

  select
    coalesce(jsonb_agg(distinct x.feature order by x.feature),'[]'::jsonb),
    coalesce(jsonb_agg(distinct d.authority_code order by d.authority_code),'[]'::jsonb)
  into v_bench_features,v_benchmark_sources
  from public.knowledge_documents d
  join public.knowledge_units u
    on u.document_id=d.id
   and u.revision=d.active_revision
   and u.is_usable is true
  cross join lateral (
    select jsonb_array_elements_text(
      case
        when jsonb_typeof(u.content->'observed_features')='array' then u.content->'observed_features'
        else '[]'::jsonb
      end
    ) as feature
    union all
    select nullif(btrim(u.content->>'stimulus_type'),'')
  ) x
  where d.authority_profile_id=v_profile_id
    and d.source_role='ASSESSMENT_BENCHMARK'
    and d.active_revision is not null
    and d.pipeline_status='READY'
    and d.quality_status in ('AUTO_ACCEPTED','TEACHER_ACCEPTED','ACCEPTED')
    and u.unit_type='BENCHMARK_PATTERN'
    and x.feature is not null;

  return jsonb_build_object(
    'schema_version','DAMSAN_GEO_BLUEPRINT_V1',
    'compiler_version','102',
    'mode','AUTHORITY_GROUNDED_PREPLAN',
    'authority_basis',jsonb_build_object(
      'profile_id',v_profile_id,
      'source_state',v_source_state,
      'source_snapshot_hash',v_snapshot_hash,
      'benchmark_sources',coalesce(v_benchmark_sources,'[]'::jsonb)
    ),
    'competency_catalog',jsonb_build_array(
      jsonb_build_object(
        'code','GEO_NK_SPATIAL',
        'group','GEO_NK',
        'label','Nhận thức không gian địa lí',
        'operations',coalesce(v_spatial->'operations','[]'::jsonb),
        'preferred_stimuli',coalesce(v_spatial->'preferred_stimuli','[]'::jsonb),
        'assessability','DIRECT'
      ),
      jsonb_build_object(
        'code','GEO_NK_CAUSAL',
        'group','GEO_NK',
        'label','Giải thích hiện tượng và quá trình địa lí',
        'operations',coalesce(v_causal->'operations','[]'::jsonb),
        'preferred_stimuli',jsonb_build_array('TEXT','TABLE','CHART','MAP','MULTI_SOURCE'),
        'assessability','DIRECT'
      ),
      jsonb_build_object(
        'code','GEO_TH_TOOL',
        'group','GEO_TH',
        'label','Sử dụng công cụ địa lí',
        'operations',coalesce(v_tool->'operations','[]'::jsonb),
        'preferred_stimuli',jsonb_build_array('MAP','SCHEMATIC_MAP','TABLE','CHART','IMAGE','DIAGRAM','CLIMOGRAPH','CROSS_SECTION'),
        'assessability','DIRECT'
      ),
      jsonb_build_object(
        'code','GEO_VD_PROBLEM',
        'group','GEO_VD',
        'label','Vận dụng để giải quyết vấn đề thực tiễn',
        'operations',coalesce(v_reality->'operations','[]'::jsonb),
        'preferred_stimuli',jsonb_build_array('TEXT','TABLE','CHART','MAP','MULTI_SOURCE'),
        'assessability','DIRECT'
      )
    ),
    'matrix',jsonb_build_array(
      jsonb_build_object(
        'competency_code','GEO_NK_SPATIAL',
        'parts_allowed',jsonb_build_array(1,2),
        'cognitive_levels',jsonb_build_array('NB','TH','VD'),
        'operations',coalesce(v_spatial->'operations','[]'::jsonb),
        'stimulus_types',coalesce(v_spatial->'preferred_stimuli','[]'::jsonb),
        'authority_refs',jsonb_build_array('RULE_GEO_COMP_001','RULE_GEO_SPATIAL_002')
      ),
      jsonb_build_object(
        'competency_code','GEO_NK_CAUSAL',
        'parts_allowed',jsonb_build_array(1,2),
        'cognitive_levels',jsonb_build_array('TH','VD'),
        'operations',coalesce(v_causal->'operations','[]'::jsonb),
        'stimulus_types',jsonb_build_array('TEXT','TABLE','CHART','MAP','MULTI_SOURCE'),
        'authority_refs',jsonb_build_array('RULE_GEO_COMP_001','RULE_GEO_CAUSAL_003')
      ),
      jsonb_build_object(
        'competency_code','GEO_TH_TOOL',
        'parts_allowed',jsonb_build_array(1,2,3),
        'cognitive_levels',jsonb_build_array('NB','TH','VD'),
        'operations',coalesce(v_tool->'operations','[]'::jsonb),
        'stimulus_types',jsonb_build_array('MAP','SCHEMATIC_MAP','TABLE','CHART','IMAGE','DIAGRAM','CLIMOGRAPH','CROSS_SECTION'),
        'authority_refs',jsonb_build_array('RULE_GEO_COMP_001','RULE_GEO_TOOL_004','RULE_GEO_2025_MAP_TABLE_008')
      ),
      jsonb_build_object(
        'competency_code','GEO_VD_PROBLEM',
        'parts_allowed',jsonb_build_array(1,2),
        'cognitive_levels',jsonb_build_array('VD'),
        'operations',coalesce(v_reality->'operations','[]'::jsonb),
        'stimulus_types',jsonb_build_array('TEXT','TABLE','CHART','MAP','MULTI_SOURCE'),
        'authority_refs',jsonb_build_array('RULE_GEO_COMP_001','RULE_GEO_REALITY_005')
      )
    ),
    'stimulus_policy',jsonb_build_object(
      'taxonomy',jsonb_build_array(
        'NONE','TEXT','TABLE','CHART','MAP','SCHEMATIC_MAP','IMAGE','DIAGRAM','CLIMOGRAPH','CROSS_SECTION','MULTI_SOURCE'
      ),
      'map_first_class',coalesce((v_map_table #>> '{machine_rule,map_first_class}')::boolean,false),
      'table_first_class',coalesce((v_map_table #>> '{machine_rule,table_first_class}')::boolean,false),
      'atlas_dependency',coalesce((v_map_table #>> '{machine_rule,atlas_dependency}')::boolean,true),
      'meaningful_context_preferred',coalesce((v_context_policy #>> '{machine_rule,meaningful_context_preferred}')::boolean,false),
      'benchmark_observed_features',coalesce(v_bench_features,'[]'::jsonb)
    ),
    'item_format_policy',jsonb_build_object(
      'allowed_formats',coalesce(v_item_format #> '{machine_rule,allowed_formats}','[]'::jsonb),
      'competency_oriented',coalesce((v_format_principle #>> '{machine_rule,competency_oriented}')::boolean,false),
      'competency_cognitive_matrix_expected',coalesce((v_format_principle #>> '{machine_rule,competency_cognitive_matrix_expected}')::boolean,false)
    ),
    'coverage_constraints',jsonb_build_object(
      'dimensions',jsonb_build_array('CONTENT','COMPETENCY','COGNITIVE','STIMULUS','OPERATION'),
      'muc_do_is_not_competency',true,
      'part3_primary_competency','GEO_TH_TOOL',
      'part3_geographic_reasoning_required',true,
      'exact_slot_targets_deferred_to_planner_103',true
    ),
    'presentation_constraints',jsonb_build_object(
      'minutes',coalesce((v_time_rule #>> '{machine_rule,minutes}')::integer,50),
      'max_print_pages',4
    )
  );
end;
$$;

revoke all on function public._ai_exam_geography_competency_blueprint_102(jsonb) from public, anon, authenticated;

create or replace function public._ai_exam_apply_authority_039()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grade smallint;
  v_snapshot jsonb;
  v_blueprint jsonb;
  v_assessment_type text;
begin
  begin
    v_grade:=(new.exam_spec->>'grade')::smallint;
  exception when others then
    v_grade:=null;
  end;

  if v_grade is null then
    new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)-'assessment_authority'-'competency_blueprint';
    return new;
  end if;

  v_assessment_type:=upper(coalesce(new.exam_spec->>'assessment_type',''));
  v_snapshot:=public._assessment_authority_snapshot_039(new.mon_id,v_grade,v_assessment_type);

  if v_snapshot is null then
    new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)-'assessment_authority'-'competency_blueprint';
    return new;
  end if;

  new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)
    || jsonb_build_object('assessment_authority',v_snapshot);

  if v_grade=12
     and v_assessment_type='TOT_NGHIEP'
     and v_snapshot->>'profile_id'='DIA_LI_TNTHPT_2025_PLUS_V1'
     and v_snapshot->>'source_state'='VERIFIED_SOURCES' then
    v_blueprint:=public._ai_exam_geography_competency_blueprint_102(v_snapshot);
    if v_blueprint is not null then
      new.exam_spec:=new.exam_spec || jsonb_build_object('competency_blueprint',v_blueprint);
    else
      new.exam_spec:=new.exam_spec-'competency_blueprint';
    end if;
  else
    new.exam_spec:=new.exam_spec-'competency_blueprint';
  end if;

  return new;
end;
$$;

revoke all on function public._ai_exam_apply_authority_039() from public, anon, authenticated;

commit;
