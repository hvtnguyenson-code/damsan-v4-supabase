begin;

-- 048 — Geography Part III geographic quantitative quality.
-- Keeps the public profile id stable while tightening the machine rules used for
-- Grade 12 TNTHPT short-answer item generation and validation.

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '{
    "id":"DIA_LI_TNTHPT_2025_PLUS_V1",
    "version":"048",
    "authority_order":["BGDDT_FORMAT_RULE","BGDDT_REFERENCE_EXAM","BGDDT_OFFICIAL_EXAM","PROVINCIAL_MOCK_BENCHMARK"],
    "official_full_blueprint":{"p1":18,"p2":4,"p3":6,"minutes":50,"p1_points":4.5,"p2_points":4.0,"p3_points":1.5},
    "p2_scoring":{"1_correct":0.1,"2_correct":0.25,"3_correct":0.5,"4_correct":1.0},
    "benchmark_policy":"STYLE_ONLY_NO_COPY",
    "model_knowledge_policy":"FORBIDDEN",
    "part1":{"single_key":true,"homogeneous_options":true,"plausible_distractors":true,"avoid_answer_length_clues":true,"avoid_double_negative":true},
    "part2":{"shared_stimulus_required":true,"statement_count":4,"independent_statements":true,"mixed_cognitive_demand":true,"all_same_truth_pattern_forbidden":true},
    "part3":{
      "numeric_answer_required":true,
      "single_numeric_result":true,
      "source_sufficient_data":true,
      "unit_required":true,
      "rounding_instruction_required":true,
      "recompute_before_output":true,
      "geographic_quantitative_reasoning_required":true,
      "quantitative_metadata_required":true,
      "min_multistep_for_full_tnthpt":4,
      "max_single_step_for_full_tnthpt":2,
      "min_rich_data_for_full_tnthpt":3,
      "min_distinct_skills_for_full_tnthpt":4,
      "max_same_skill_for_full_tnthpt":2,
      "forbid_unit_conversion_only":true,
      "forbid_simple_two_percent_sum":true,
      "forbid_arbitrary_fact_arithmetic":true
    },
    "metadata":{"muc_do_required":["NB","TH","VD"],"source_refs_required":true,"bai_hoc_required":true}
  }'::jsonb;
$$;

revoke all on function public._ai_exam_geography_standard_037() from public, anon, authenticated;

update public.assessment_authority_profiles p
set profile_version='048',
    profile=jsonb_build_object(
      'id','DIA_LI_TNTHPT_2025_PLUS_V1',
      'version','048',
      'authority_order',jsonb_build_array('BGDDT_FORMAT_RULE','BGDDT_REFERENCE_EXAM','BGDDT_OFFICIAL_EXAM','PROVINCIAL_MOCK_BENCHMARK'),
      'official_full_blueprint',jsonb_build_object('p1',18,'p2',4,'p3',6,'minutes',50,'p1_points',4.5,'p2_points',4.0,'p3_points',1.5),
      'counts_locked',true,
      'p2_scoring',jsonb_build_object('1_correct',0.1,'2_correct',0.25,'3_correct',0.5,'4_correct',1.0),
      'benchmark_policy','STYLE_ONLY_NO_COPY',
      'model_knowledge_policy','FORBIDDEN',
      'rules',jsonb_build_object(
        'part1',jsonb_build_object(
          'single_key',true,'homogeneous_options',true,'plausible_distractors',true,
          'avoid_answer_length_clues',true,'avoid_double_negative',true
        ),
        'part2',jsonb_build_object(
          'shared_stimulus_required',true,'statement_count',4,'independent_statements',true,
          'mixed_cognitive_demand',true,'all_same_truth_pattern_forbidden',true
        ),
        'part3',jsonb_build_object(
          'numeric_answer_required',true,
          'single_numeric_result',true,
          'source_sufficient_data',true,
          'unit_required',true,
          'rounding_instruction_required',true,
          'recompute_before_output',true,
          'geographic_quantitative_reasoning_required',true,
          'quantitative_metadata_required',true,
          'min_multistep_for_full_tnthpt',4,
          'max_single_step_for_full_tnthpt',2,
          'min_rich_data_for_full_tnthpt',3,
          'min_distinct_skills_for_full_tnthpt',4,
          'max_same_skill_for_full_tnthpt',2,
          'forbid_unit_conversion_only',true,
          'forbid_simple_two_percent_sum',true,
          'forbid_arbitrary_fact_arithmetic',true
        ),
        'metadata',jsonb_build_object(
          'muc_do_required',jsonb_build_array('NB','TH','VD'),
          'source_refs_required',true,
          'bai_hoc_required',true
        )
      ),
      'declared_sources',coalesce(p.profile->'declared_sources','[]'::jsonb)
    ),
    updated_at=now()
where p.profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

create or replace function public._ai_exam_part3_recompute_048(
  p_quant jsonb
) returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_op text;
  v_inputs numeric[];
  v_len integer;
  v_scale numeric := 1;
  v_group_sizes integer[];
  v_g1 integer;
  v_g2 integer;
  v_result numeric;
begin
  if p_quant is null or jsonb_typeof(p_quant)<>'object' then return null; end if;
  if jsonb_typeof(p_quant->'inputs')<>'array' then return null; end if;
  if exists(
    select 1 from jsonb_array_elements(p_quant->'inputs') as t(value)
    where jsonb_typeof(value)<>'number'
  ) then return null; end if;

  select array_agg((value #>> '{}')::numeric order by ord)
  into v_inputs
  from jsonb_array_elements(p_quant->'inputs') with ordinality as t(value,ord);

  v_len:=coalesce(array_length(v_inputs,1),0);
  if v_len<2 or v_len>30 then return null; end if;

  v_op:=upper(btrim(coalesce(p_quant->>'operation_code','')));
  if nullif(btrim(coalesce(p_quant->>'scale_factor','')),'') is not null then
    if coalesce(p_quant->>'scale_factor','') !~ '^-?[0-9]+([.][0-9]+)?$' then return null; end if;
    v_scale:=(p_quant->>'scale_factor')::numeric;
  end if;

  if v_op='RANGE' then
    select max(v)-min(v) into v_result from unnest(v_inputs) v;
  elsif v_op='SUM' then
    if v_len<3 then return null; end if;
    select sum(v) into v_result from unnest(v_inputs) v;
  elsif v_op='AVERAGE' then
    select avg(v) into v_result from unnest(v_inputs) v;
  elsif v_op='DIFFERENCE' then
    if v_len<>2 then return null; end if;
    v_result:=abs(v_inputs[1]-v_inputs[2]);
  elsif v_op in ('SUM_DIFFERENCE_TWO_GROUPS','AVERAGE_DIFFERENCE_TWO_GROUPS') then
    if jsonb_typeof(p_quant->'group_sizes')<>'array'
       or jsonb_array_length(p_quant->'group_sizes')<>2
       or exists(
         select 1 from jsonb_array_elements(p_quant->'group_sizes') as t(value)
         where jsonb_typeof(value)<>'number' or (value #>> '{}') !~ '^[0-9]+$'
       ) then return null; end if;
    select array_agg((value #>> '{}')::integer order by ord)
    into v_group_sizes
    from jsonb_array_elements(p_quant->'group_sizes') with ordinality as t(value,ord);
    v_g1:=v_group_sizes[1];
    v_g2:=v_group_sizes[2];
    if v_g1<1 or v_g2<1 or v_g1+v_g2<>v_len then return null; end if;
    if v_op='SUM_DIFFERENCE_TWO_GROUPS' then
      select abs(
        (select sum(v_inputs[i]) from generate_series(1,v_g1) i)
        -
        (select sum(v_inputs[i]) from generate_series(v_g1+1,v_g1+v_g2) i)
      ) into v_result;
    else
      select abs(
        (select avg(v_inputs[i]) from generate_series(1,v_g1) i)
        -
        (select avg(v_inputs[i]) from generate_series(v_g1+1,v_g1+v_g2) i)
      ) into v_result;
    end if;
  elsif v_op='SHARE_PERCENT' then
    if v_len<>2 or v_inputs[2]=0 then return null; end if;
    v_result:=v_inputs[1]/v_inputs[2]*100;
  elsif v_op in ('RATIO_SCALED','DENSITY','YIELD','PER_CAPITA') then
    if v_len<>2 or v_inputs[2]=0 then return null; end if;
    v_result:=v_inputs[1]/v_inputs[2]*v_scale;
  elsif v_op='COMPONENT_FROM_SHARE' then
    if v_len<>2 then return null; end if;
    v_result:=v_inputs[1]*v_inputs[2]/100;
  elsif v_op='TOTAL_FROM_COMPONENT_SHARE' then
    if v_len<>2 or v_inputs[2]=0 then return null; end if;
    v_result:=v_inputs[1]*100/v_inputs[2];
  elsif v_op='GROWTH_INDEX' then
    if v_len<>2 or v_inputs[2]=0 then return null; end if;
    v_result:=v_inputs[1]/v_inputs[2]*100;
  elsif v_op='GROWTH_PERCENT' then
    if v_len<>2 or v_inputs[2]=0 then return null; end if;
    v_result:=(v_inputs[1]-v_inputs[2])/v_inputs[2]*100;
  elsif v_op='BALANCE' then
    if v_len<>2 then return null; end if;
    v_result:=v_inputs[1]-v_inputs[2];
  else
    return null;
  end if;

  return v_result;
end;
$$;

revoke all on function public._ai_exam_part3_recompute_048(jsonb) from public, anon, authenticated;

create or replace function public._ai_exam_quality_gate_037(
  p_request_id uuid,
  p_exam_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_standard_id text;
  v_assessment_type text;
  v_q jsonb;
  v_part text;
  v_stem text;
  v_answer text;
  v_level text;
  v_idx integer := 0;
  v_distinct integer;
  v_min_len integer;
  v_max_len integer;
  v_warnings jsonb := '[]'::jsonb;
  v_quant jsonb;
  v_skill text;
  v_op text;
  v_data_form text;
  v_reasoning_steps integer;
  v_rounding_digits integer;
  v_input_count integer;
  v_numeric_tokens integer;
  v_recomputed numeric;
  v_answer_numeric numeric;
  v_simple_count integer := 0;
  v_multistep_count integer := 0;
  v_rich_data_count integer := 0;
  v_p3_count integer := 0;
  v_distinct_skills integer := 0;
  v_max_skill_count integer := 0;
  v_skills text[] := array[]::text[];
begin
  select r.exam_spec #>> '{assessment_standard,id}',
         upper(coalesce(r.exam_spec->>'assessment_type',''))
  into v_standard_id,v_assessment_type
  from public.ai_exam_requests r
  where r.id = p_request_id;

  if v_standard_id is distinct from 'DIA_LI_TNTHPT_2025_PLUS_V1' then
    return jsonb_build_object('valid',true,'applied',false,'quality_gate_version','048');
  end if;

  if p_exam_payload is null or jsonb_typeof(p_exam_payload) <> 'object'
     or jsonb_typeof(p_exam_payload->'questions') <> 'array' then
    return jsonb_build_object('valid',false,'code','quality_questions_invalid');
  end if;

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx := v_idx + 1;
    v_part := btrim(coalesce(v_q->>'phan',''));
    v_stem := btrim(coalesce(v_q->>'noi_dung',''));
    v_answer := upper(replace(btrim(coalesce(v_q->>'dap_an_dung','')),'D','Đ'));
    v_level := upper(btrim(coalesce(v_q->>'muc_do','')));

    if v_level not in ('NB','TH','VD') then
      return jsonb_build_object('valid',false,'code','quality_cognitive_level_invalid','question_no',v_idx);
    end if;
    if btrim(coalesce(v_q->>'bai_hoc','')) = '' then
      return jsonb_build_object('valid',false,'code','quality_lesson_scope_invalid','question_no',v_idx);
    end if;
    if jsonb_typeof(v_q->'source_refs') <> 'array' or jsonb_array_length(v_q->'source_refs') < 1 then
      return jsonb_build_object('valid',false,'code','quality_source_refs_invalid','question_no',v_idx);
    end if;
    if char_length(btrim(coalesce(v_q->>'loi_giai',''))) < 12 then
      return jsonb_build_object('valid',false,'code','quality_explanation_invalid','question_no',v_idx);
    end if;

    if v_part = '1' then
      select count(distinct lower(regexp_replace(btrim(value),'\s+',' ','g'))),
             min(char_length(btrim(value))), max(char_length(btrim(value)))
        into v_distinct, v_min_len, v_max_len
      from jsonb_array_elements_text(jsonb_build_array(
        coalesce(v_q->>'A',''), coalesce(v_q->>'B',''), coalesce(v_q->>'C',''), coalesce(v_q->>'D','')
      )) as t(value);
      if v_distinct <> 4 or coalesce(v_min_len,0) < 1 then
        return jsonb_build_object('valid',false,'code','quality_part1_duplicate_options_invalid','question_no',v_idx);
      end if;
      if v_min_len > 0 and v_max_len::numeric / v_min_len::numeric > 3.0 then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','part1_option_length_imbalance'
        ));
      end if;

    elsif v_part = '2' then
      if char_length(regexp_replace(v_stem,'<[^>]+>','','g')) < 40 then
        return jsonb_build_object('valid',false,'code','quality_part2_stimulus_invalid','question_no',v_idx);
      end if;
      select count(distinct lower(regexp_replace(btrim(value),'\s+',' ','g'))), min(char_length(btrim(value)))
        into v_distinct, v_min_len
      from jsonb_array_elements_text(jsonb_build_array(
        coalesce(v_q->>'A',''), coalesce(v_q->>'B',''), coalesce(v_q->>'C',''), coalesce(v_q->>'D','')
      )) as t(value);
      if v_distinct <> 4 or coalesce(v_min_len,0) < 8 then
        return jsonb_build_object('valid',false,'code','quality_part2_statements_invalid','question_no',v_idx);
      end if;
      if v_answer !~ '^(Đ|S)-(Đ|S)-(Đ|S)-(Đ|S)$' then
        return jsonb_build_object('valid',false,'code','quality_part2_truth_pattern_invalid','question_no',v_idx);
      end if;
      if v_answer in ('Đ-Đ-Đ-Đ','S-S-S-S') then
        return jsonb_build_object('valid',false,'code','quality_part2_all_same_invalid','question_no',v_idx);
      end if;

    elsif v_part = '3' then
      v_p3_count:=v_p3_count+1;

      if btrim(coalesce(v_q->>'dap_an_dung','')) !~ '^-?[0-9]+([\,\.][0-9]+)?$' then
        return jsonb_build_object('valid',false,'code','quality_part3_numeric_answer_invalid','question_no',v_idx);
      end if;
      if lower(v_stem) !~ '(làm tròn|lấy kết quả|kết quả đến|đến hàng|chữ số thập phân)' then
        return jsonb_build_object('valid',false,'code','quality_part3_rounding_invalid','question_no',v_idx);
      end if;

      v_quant:=v_q->'quantitative';
      if v_quant is null or jsonb_typeof(v_quant)<>'object' then
        return jsonb_build_object('valid',false,'code','quality_part3_quantitative_metadata_required','question_no',v_idx);
      end if;

      v_skill:=upper(btrim(coalesce(v_quant->>'skill_code','')));
      if v_skill not in (
        'TEMPERATURE_AMPLITUDE','TEMPERATURE_DIFFERENCE','RAINFALL_TOTAL','RAINFALL_DIFFERENCE',
        'FLOW_AVERAGE','DENSITY','YIELD','SHARE','STRUCTURE','GROWTH','PER_CAPITA','RATIO',
        'NATURAL_INCREASE','BALANCE','COMPONENT_VALUE','TOTAL_VALUE'
      ) then
        return jsonb_build_object('valid',false,'code','quality_part3_skill_invalid','question_no',v_idx,'skill_code',v_skill);
      end if;

      v_op:=upper(btrim(coalesce(v_quant->>'operation_code','')));
      if v_op not in (
        'RANGE','SUM','AVERAGE','DIFFERENCE','SUM_DIFFERENCE_TWO_GROUPS',
        'AVERAGE_DIFFERENCE_TWO_GROUPS','SHARE_PERCENT','RATIO_SCALED','DENSITY',
        'YIELD','PER_CAPITA','COMPONENT_FROM_SHARE','TOTAL_FROM_COMPONENT_SHARE',
        'GROWTH_INDEX','GROWTH_PERCENT','BALANCE'
      ) then
        return jsonb_build_object('valid',false,'code','quality_part3_operation_invalid','question_no',v_idx,'operation_code',v_op);
      end if;

      v_data_form:=upper(btrim(coalesce(v_quant->>'data_form','')));
      if v_data_form not in ('TABLE_SERIES','MULTI_VALUE','DIRECT_RELATION') then
        return jsonb_build_object('valid',false,'code','quality_part3_data_form_invalid','question_no',v_idx);
      end if;

      if nullif(btrim(coalesce(v_quant->>'unit','')),'') is null then
        return jsonb_build_object('valid',false,'code','quality_part3_unit_metadata_required','question_no',v_idx);
      end if;

      if not (
        (v_skill='TEMPERATURE_AMPLITUDE' and v_op='RANGE')
        or (v_skill='TEMPERATURE_DIFFERENCE' and v_op in ('DIFFERENCE','AVERAGE_DIFFERENCE_TWO_GROUPS'))
        or (v_skill='RAINFALL_TOTAL' and v_op='SUM')
        or (v_skill='RAINFALL_DIFFERENCE' and v_op in ('DIFFERENCE','SUM_DIFFERENCE_TWO_GROUPS'))
        or (v_skill='FLOW_AVERAGE' and v_op='AVERAGE')
        or (v_skill='DENSITY' and v_op in ('DENSITY','RATIO_SCALED'))
        or (v_skill='YIELD' and v_op in ('YIELD','RATIO_SCALED'))
        or (v_skill in ('SHARE','STRUCTURE') and v_op='SHARE_PERCENT')
        or (v_skill='GROWTH' and v_op in ('GROWTH_INDEX','GROWTH_PERCENT'))
        or (v_skill='PER_CAPITA' and v_op in ('PER_CAPITA','RATIO_SCALED'))
        or (v_skill='RATIO' and v_op='RATIO_SCALED')
        or (v_skill='NATURAL_INCREASE' and v_op='BALANCE')
        or (v_skill='BALANCE' and v_op='BALANCE')
        or (v_skill='COMPONENT_VALUE' and v_op='COMPONENT_FROM_SHARE')
        or (v_skill='TOTAL_VALUE' and v_op='TOTAL_FROM_COMPONENT_SHARE')
      ) then
        return jsonb_build_object(
          'valid',false,'code','quality_part3_skill_operation_mismatch',
          'question_no',v_idx,'skill_code',v_skill,'operation_code',v_op
        );
      end if;

      if coalesce(v_quant->>'reasoning_steps','') !~ '^[0-9]+$' then
        return jsonb_build_object('valid',false,'code','quality_part3_reasoning_steps_invalid','question_no',v_idx);
      end if;
      v_reasoning_steps:=(v_quant->>'reasoning_steps')::integer;
      if v_reasoning_steps not between 1 and 4 then
        return jsonb_build_object('valid',false,'code','quality_part3_reasoning_steps_invalid','question_no',v_idx);
      end if;

      if coalesce(v_quant->>'rounding_digits','') !~ '^[0-9]+$' then
        return jsonb_build_object('valid',false,'code','quality_part3_rounding_metadata_invalid','question_no',v_idx);
      end if;
      v_rounding_digits:=(v_quant->>'rounding_digits')::integer;
      if v_rounding_digits not between 0 and 3 then
        return jsonb_build_object('valid',false,'code','quality_part3_rounding_metadata_invalid','question_no',v_idx);
      end if;

      if jsonb_typeof(v_quant->'inputs')<>'array' then
        return jsonb_build_object('valid',false,'code','quality_part3_inputs_invalid','question_no',v_idx);
      end if;
      v_input_count:=jsonb_array_length(v_quant->'inputs');
      if v_input_count<2 or v_input_count>30 or exists(
        select 1 from jsonb_array_elements(v_quant->'inputs') as t(value) where jsonb_typeof(value)<>'number'
      ) then
        return jsonb_build_object('valid',false,'code','quality_part3_inputs_invalid','question_no',v_idx);
      end if;
      if v_data_form='TABLE_SERIES' and v_input_count<3 then
        return jsonb_build_object('valid',false,'code','quality_part3_table_series_too_small','question_no',v_idx);
      end if;
      if v_op='SUM' and v_input_count<3 then
        return jsonb_build_object('valid',false,'code','quality_part3_simple_sum_invalid','question_no',v_idx);
      end if;

      select count(*)::integer into v_numeric_tokens
      from regexp_matches(v_stem, '[-+]?[0-9]+([ .][0-9]{3})*([,.][0-9]+)?', 'g');
      if coalesce(v_numeric_tokens,0) < v_input_count then
        return jsonb_build_object(
          'valid',false,'code','quality_part3_source_data_not_exposed',
          'question_no',v_idx,'numeric_tokens',coalesce(v_numeric_tokens,0),'input_count',v_input_count
        );
      end if;

      v_recomputed:=public._ai_exam_part3_recompute_048(v_quant);
      if v_recomputed is null then
        return jsonb_build_object('valid',false,'code','quality_part3_recompute_unsupported','question_no',v_idx);
      end if;
      v_answer_numeric:=replace(btrim(v_q->>'dap_an_dung'),',','.')::numeric;
      if round(v_recomputed,v_rounding_digits) is distinct from round(v_answer_numeric,v_rounding_digits) then
        return jsonb_build_object(
          'valid',false,'code','quality_part3_recompute_mismatch','question_no',v_idx,
          'expected',round(v_recomputed,v_rounding_digits),'actual',round(v_answer_numeric,v_rounding_digits)
        );
      end if;

      if v_reasoning_steps=1 then v_simple_count:=v_simple_count+1; else v_multistep_count:=v_multistep_count+1; end if;
      if v_input_count>=3 or v_data_form in ('TABLE_SERIES','MULTI_VALUE') then
        v_rich_data_count:=v_rich_data_count+1;
      end if;
      v_skills:=array_append(v_skills,v_skill);
    end if;
  end loop;

  if v_p3_count>0 then
    select count(*)::integer, max(c)
    into v_distinct_skills,v_max_skill_count
    from (
      select s,count(*)::integer c
      from unnest(v_skills) s
      group by s
    ) z;
  end if;

  if v_assessment_type='TOT_NGHIEP' and v_p3_count=6 then
    if v_simple_count>2 then
      return jsonb_build_object('valid',false,'code','quality_part3_too_many_single_step','single_step_count',v_simple_count,'max_allowed',2);
    end if;
    if v_multistep_count<4 then
      return jsonb_build_object('valid',false,'code','quality_part3_multistep_mix_invalid','multistep_count',v_multistep_count,'min_required',4);
    end if;
    if v_rich_data_count<3 then
      return jsonb_build_object('valid',false,'code','quality_part3_rich_data_mix_invalid','rich_data_count',v_rich_data_count,'min_required',3);
    end if;
    if coalesce(v_distinct_skills,0)<4 then
      return jsonb_build_object('valid',false,'code','quality_part3_skill_diversity_invalid','distinct_skills',coalesce(v_distinct_skills,0),'min_required',4);
    end if;
    if coalesce(v_max_skill_count,0)>2 then
      return jsonb_build_object('valid',false,'code','quality_part3_skill_repetition_invalid','max_skill_count',v_max_skill_count,'max_allowed',2);
    end if;
  end if;

  return jsonb_build_object(
    'valid',true,
    'applied',true,
    'assessment_standard','DIA_LI_TNTHPT_2025_PLUS_V1',
    'quality_gate_version','048',
    'warnings',v_warnings,
    'part3_quality',jsonb_build_object(
      'question_count',v_p3_count,
      'single_step_count',v_simple_count,
      'multistep_count',v_multistep_count,
      'rich_data_count',v_rich_data_count,
      'distinct_skills',coalesce(v_distinct_skills,0)
    )
  );
end;
$$;

revoke all on function public._ai_exam_quality_gate_037(uuid,jsonb) from public, anon, authenticated;

commit;
