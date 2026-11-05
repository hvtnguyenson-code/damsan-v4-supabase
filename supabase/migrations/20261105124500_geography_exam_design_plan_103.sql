begin;

-- 103 — Deterministic Geography 28-slot Exam Design Plan.
-- The plan is server-owned and attached to exam_spec, but the generator does not consume it yet.
-- This lets us validate content/competency/cognitive/stimulus coverage independently before activation.

create or replace function public._ai_exam_geography_design_plan_103(
  p_document_ids uuid[],
  p_scope jsonb,
  p_blueprint jsonb
) returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_lessons jsonb;
  v_lesson_count integer;
  v_target jsonb;
  v_p1 jsonb := '[]'::jsonb;
  v_p2 jsonb := '[]'::jsonb;
  v_p3 jsonb := '[]'::jsonb;
  v_plan jsonb;
  v_i integer;

  -- P1 cognitive mix is a transparent project calibration target, NOT an official quota.
  -- It stays inside the ranges already used by the existing 060 quality envelope.
  v_p1_levels text[] := array[
    'NB','NB','NB','NB','NB',
    'TH','TH','TH','TH','TH','TH','TH','TH',
    'VD','VD','VD','VD','VD'
  ];
  v_p1_competencies text[] := array[
    'GEO_NK_SPATIAL','GEO_TH_TOOL','GEO_NK_SPATIAL','GEO_NK_SPATIAL','GEO_TH_TOOL',
    'GEO_NK_CAUSAL','GEO_NK_SPATIAL','GEO_TH_TOOL','GEO_NK_CAUSAL','GEO_TH_TOOL','GEO_NK_CAUSAL','GEO_NK_SPATIAL','GEO_TH_TOOL',
    'GEO_VD_PROBLEM','GEO_NK_CAUSAL','GEO_TH_TOOL','GEO_VD_PROBLEM','GEO_NK_SPATIAL'
  ];
  v_p1_operations text[] := array[
    'LOCATE','READ_TABLE','SPATIAL_DISTRIBUTION','REGIONAL_DIFFERENTIATION','READ_MAP',
    'CAUSE_EFFECT','SPATIAL_COMPARISON','TREND_ANALYSIS','MULTI_FACTOR_EXPLANATION','INTERPRET_CHART','NATURAL_SOCIOECONOMIC_RELATION','SPATIAL_RELATION','SPATIAL_DATA_ANALYSIS',
    'SCENARIO_APPLICATION','CONSEQUENCE_ANALYSIS','CALCULATE_GEO_INDICATOR','DECISION_MAKING','SPATIAL_RELATION'
  ];
  v_p1_stimuli text[] := array[
    'NONE','TABLE','NONE','NONE','MAP',
    'TEXT','MAP','TABLE','TEXT','CHART','TEXT','MAP','TABLE',
    'TEXT','MULTI_SOURCE','CHART','TABLE','MAP'
  ];

  v_p2_stimuli text[] := array['TEXT','CHART','TABLE','MAP'];
  v_p2_primary text[] := array['GEO_NK_CAUSAL','GEO_TH_TOOL','GEO_TH_TOOL','GEO_NK_SPATIAL'];

  v_p3_families text[] := array[
    'GROWTH_RATE',
    'SHARE_PERCENT',
    'DENSITY_OR_INVERSE_DENSITY',
    'BALANCE',
    'RANGE_OR_RANGE_DIFFERENCE',
    'PER_CAPITA_OR_SCALED_RATIO'
  ];
begin
  if p_blueprint is null
     or p_blueprint->>'schema_version'<>'DAMSAN_GEO_BLUEPRINT_V1'
     or p_blueprint #>> '{authority_basis,source_state}'<>'VERIFIED_SOURCES'
     or p_document_ids is null
     or cardinality(p_document_ids)=0 then
    return null;
  end if;

  select coalesce(jsonb_agg(x.lesson order by x.lesson_code,x.lesson_title,x.scope_key),'[]'::jsonb)
  into v_lessons
  from (
    select distinct
      coalesce(nullif(btrim(u.lesson_code),''),'') lesson_code,
      coalesce(nullif(btrim(u.lesson_title),''),nullif(btrim(u.section_title),''),'Phạm vi đã chọn') lesson_title,
      public._knowledge_scope_key_036(u.lesson_code,u.lesson_title,u.hierarchy) scope_key,
      jsonb_build_object(
        'scope_key',public._knowledge_scope_key_036(u.lesson_code,u.lesson_title,u.hierarchy),
        'lesson_code',nullif(btrim(u.lesson_code),''),
        'lesson_title',coalesce(nullif(btrim(u.lesson_title),''),nullif(btrim(u.section_title),''),'Phạm vi đã chọn')
      ) lesson
    from public.knowledge_units u
    join public.knowledge_documents d on d.id=u.document_id
    where d.id=any(p_document_ids)
      and d.source_role='KNOWLEDGE_SOURCE'
      and d.active_revision is not null
      and u.revision=d.active_revision
      and u.is_usable is true
      and public._ai_exam_scope_allows_unit_036(
        p_scope,u.document_id,u.lesson_code,u.lesson_title,u.hierarchy
      )
  ) x;

  v_lesson_count:=jsonb_array_length(v_lessons);
  if v_lesson_count<1 then return null; end if;

  -- 18 P1 slots.
  for v_i in 1..18 loop
    v_target:=v_lessons->((v_i-1)%v_lesson_count);
    v_p1:=v_p1 || jsonb_build_array(jsonb_build_object(
      'slot_id',format('P1-%s',lpad(v_i::text,2,'0')),
      'part',1,
      'item_format','MCQ_SINGLE',
      'content_target',v_target,
      'competency_code',v_p1_competencies[v_i],
      'cognitive_level',v_p1_levels[v_i],
      'operation_code',v_p1_operations[v_i],
      'stimulus_type',v_p1_stimuli[v_i],
      'design_constraints',jsonb_build_object(
        'single_key',true,
        'distractor_policy',case
          when v_p1_levels[v_i]='NB' then 'HOMOGENEOUS_DOMAIN'
          else 'NEAR_MISS_GEOGRAPHIC_CONDITION'
        end,
        'answer_leakage_forbidden',true
      ),
      'reading_cost',case when v_p1_stimuli[v_i] in ('TABLE','CHART','MAP','MULTI_SOURCE') then 'MEDIUM' else 'LOW' end
    ));
  end loop;

  -- 4 P2 clusters. Each cluster is one item slot but contributes four answer commands.
  for v_i in 1..4 loop
    v_target:=v_lessons->((18+v_i-1)%v_lesson_count);
    v_p2:=v_p2 || jsonb_build_array(jsonb_build_object(
      'slot_id',format('P2-%s',lpad(v_i::text,2,'0')),
      'part',2,
      'item_format','TRUE_FALSE_CLUSTER',
      'content_target',v_target,
      'primary_competency_code',v_p2_primary[v_i],
      'stimulus_type',v_p2_stimuli[v_i],
      'statement_count',4,
      'statements',jsonb_build_object(
        'A',jsonb_build_object(
          'cognitive_level','NB',
          'competency_code',case when v_p2_stimuli[v_i] in ('CHART','TABLE','MAP') then 'GEO_TH_TOOL' else v_p2_primary[v_i] end,
          'operation_code',case
            when v_p2_stimuli[v_i]='CHART' then 'READ_CHART'
            when v_p2_stimuli[v_i]='TABLE' then 'READ_TABLE'
            when v_p2_stimuli[v_i]='MAP' then 'READ_MAP'
            else 'SPATIAL_DISTRIBUTION'
          end
        ),
        'B',jsonb_build_object(
          'cognitive_level','TH',
          'competency_code','GEO_NK_CAUSAL',
          'operation_code','CAUSE_EFFECT'
        ),
        'C',jsonb_build_object(
          'cognitive_level','TH',
          'competency_code',case when v_p2_stimuli[v_i] in ('CHART','TABLE','MAP') then 'GEO_TH_TOOL' else 'GEO_NK_SPATIAL' end,
          'operation_code',case
            when v_p2_stimuli[v_i]='CHART' then 'TREND_ANALYSIS'
            when v_p2_stimuli[v_i]='TABLE' then 'COMPARE_DATA'
            when v_p2_stimuli[v_i]='MAP' then 'SPATIAL_COMPARISON'
            else 'SPATIAL_RELATION'
          end
        ),
        'D',jsonb_build_object(
          'cognitive_level','VD',
          'competency_code','GEO_VD_PROBLEM',
          'operation_code','SCENARIO_APPLICATION'
        )
      ),
      'design_constraints',jsonb_build_object(
        'shared_stimulus_required',true,
        'independent_statements',true,
        'at_least_one_th',true,
        'at_least_one_vd',true,
        'all_same_truth_pattern_forbidden',true
      ),
      'reading_cost','HIGH'
    ));
  end loop;

  -- 6 P3 slots. Quantitative family is a design target; canonical operation_code remains server-validated later.
  for v_i in 1..6 loop
    v_target:=v_lessons->((22+v_i-1)%v_lesson_count);
    v_p3:=v_p3 || jsonb_build_array(jsonb_build_object(
      'slot_id',format('P3-%s',lpad(v_i::text,2,'0')),
      'part',3,
      'item_format','SHORT_ANSWER',
      'content_target',v_target,
      'competency_code','GEO_TH_TOOL',
      'cognitive_level','VD',
      'operation_code','CALCULATE_GEO_INDICATOR',
      'quantitative_family',v_p3_families[v_i],
      'stimulus_type',case when v_i in (1,2,5) then 'TABLE' else 'TEXT' end,
      'design_constraints',jsonb_build_object(
        'authentic_data_required',true,
        'single_numeric_result',true,
        'student_visible_source_data_required',true,
        'rounding_when_needed',true,
        'geographic_reasoning_required',true
      ),
      'reading_cost',case when v_i in (1,2,5) then 'HIGH' else 'MEDIUM' end
    ));
  end loop;

  v_plan:=jsonb_build_object(
    'schema_version','DAMSAN_GEO_DESIGN_PLAN_V1',
    'planner_version','103',
    'status','PREVIEW_ONLY_NOT_GENERATOR_ACTIVE',
    'blueprint_snapshot_hash',p_blueprint #>> '{authority_basis,source_snapshot_hash}',
    'content_scope',jsonb_build_object(
      'lesson_count',v_lesson_count,
      'lessons',v_lessons,
      'assignment_policy','DETERMINISTIC_ROUND_ROBIN_SELECTED_SCOPE'
    ),
    'calibration_policy',jsonb_build_object(
      'p1_cognitive_mix',jsonb_build_object('NB',5,'TH',8,'VD',5),
      'p1_mix_status','SOFT_PROJECT_CALIBRATION_NOT_OFFICIAL_QUOTA',
      'p2_statement_pattern',jsonb_build_array('NB','TH','TH','VD'),
      'p3_level','VD',
      'benchmark_basis',p_blueprint #> '{authority_basis,benchmark_sources}'
    ),
    'slots',jsonb_build_object(
      'part1',v_p1,
      'part2',v_p2,
      'part3',v_p3
    ),
    'coverage_targets',jsonb_build_object(
      'item_slot_count',28,
      'answer_command_count',40,
      'part1_slots',18,
      'part2_clusters',4,
      'part2_commands',16,
      'part3_slots',6,
      'required_competencies',jsonb_build_array('GEO_NK_SPATIAL','GEO_NK_CAUSAL','GEO_TH_TOOL','GEO_VD_PROBLEM'),
      'required_stimuli',jsonb_build_array('TEXT','TABLE','CHART','MAP'),
      'no_atlas_dependency',true
    ),
    'presentation_budget',jsonb_build_object(
      'minutes',coalesce((p_blueprint #>> '{presentation_constraints,minutes}')::integer,50),
      'max_print_pages',coalesce((p_blueprint #>> '{presentation_constraints,max_print_pages}')::integer,4)
    )
  );

  return v_plan || jsonb_build_object('plan_hash',md5(v_plan::text));
end;
$$;

revoke all on function public._ai_exam_geography_design_plan_103(uuid[],jsonb,jsonb) from public, anon, authenticated;

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
  v_design_plan jsonb;
  v_assessment_type text;
begin
  begin
    v_grade:=(new.exam_spec->>'grade')::smallint;
  exception when others then
    v_grade:=null;
  end;

  if v_grade is null then
    new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)
      -'assessment_authority'-'competency_blueprint'-'exam_design_plan';
    return new;
  end if;

  v_assessment_type:=upper(coalesce(new.exam_spec->>'assessment_type',''));
  v_snapshot:=public._assessment_authority_snapshot_039(new.mon_id,v_grade,v_assessment_type);

  if v_snapshot is null then
    new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)
      -'assessment_authority'-'competency_blueprint'-'exam_design_plan';
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

      v_design_plan:=public._ai_exam_geography_design_plan_103(
        new.knowledge_document_ids,
        new.exam_spec->'knowledge_scope',
        v_blueprint
      );

      if v_design_plan is not null then
        new.exam_spec:=new.exam_spec || jsonb_build_object('exam_design_plan',v_design_plan);
      else
        new.exam_spec:=new.exam_spec-'exam_design_plan';
      end if;
    else
      new.exam_spec:=new.exam_spec-'competency_blueprint'-'exam_design_plan';
    end if;
  else
    new.exam_spec:=new.exam_spec-'competency_blueprint'-'exam_design_plan';
  end if;

  return new;
end;
$$;

revoke all on function public._ai_exam_apply_authority_039() from public, anon, authenticated;

commit;
