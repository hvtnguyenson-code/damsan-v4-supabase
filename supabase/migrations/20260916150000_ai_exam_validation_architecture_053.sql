begin;

-- 053 — AI exam validation architecture reset.
-- Principle: hard-reject only objective correctness / safety failures.
-- AI-authored descriptive metadata (skill_code, data_form, reasoning_steps) is advisory only.
-- Server derives quantitative family, reasoning complexity and rich-data credit.
-- Part III diagnostics are aggregated in one validation pass instead of failing one item at a time.

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '{
    "id":"DIA_LI_TNTHPT_2025_PLUS_V1",
    "version":"053",
    "authority_order":["BGDDT_FORMAT_RULE","BGDDT_REFERENCE_EXAM","BGDDT_OFFICIAL_EXAM","PROVINCIAL_MOCK_BENCHMARK"],
    "official_full_blueprint":{"p1":18,"p2":4,"p3":6,"minutes":50,"p1_points":4.5,"p2_points":4.0,"p3_points":1.5},
    "p2_scoring":{"1_correct":0.1,"2_correct":0.25,"3_correct":0.5,"4_correct":1.0},
    "benchmark_policy":"STYLE_ONLY_NO_COPY",
    "model_knowledge_policy":"FORBIDDEN",
    "part3":{
      "validation_mode":"SERVER_CANONICAL_V1",
      "aggregate_diagnostics":true,
      "hard_gate":"OBJECTIVE_CORRECTNESS_ONLY",
      "quantitative_core_required":["operation_code","inputs"],
      "server_derived":["operation_family","reasoning_steps","rich_data"],
      "ai_descriptive_metadata_trusted":false,
      "recompute_before_output":true,
      "source_sufficient_data":true,
      "quality_mix_is_advisory":true
    },
    "metadata":{"source_refs_required":true}
  }'::jsonb;
$$;

revoke all on function public._ai_exam_geography_standard_037() from public, anon, authenticated;

update public.assessment_authority_profiles
set profile_version='053',
    profile=jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(profile,'{version}','"053"'::jsonb,true),
          '{rules,part3,validation_mode}','"SERVER_CANONICAL_V1"'::jsonb,true
        ),
        '{rules,part3,aggregate_diagnostics}','true'::jsonb,true
      ),
      '{rules,part3,quality_mix_is_advisory}','true'::jsonb,true
    ),
    updated_at=now()
where profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

create or replace function public._ai_exam_part3_recompute_053(
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
  v_op:=case v_op
    when 'MEAN' then 'AVERAGE'
    when 'ABS_DIFFERENCE' then 'DIFFERENCE'
    when 'PERCENT_SHARE' then 'SHARE_PERCENT'
    when 'GROWTH_RATE' then 'GROWTH_PERCENT'
    when 'GROWTH_RATE_PERCENT' then 'GROWTH_PERCENT'
    else v_op
  end;

  if nullif(btrim(coalesce(p_quant->>'scale_factor','')),'') is not null then
    if coalesce(p_quant->>'scale_factor','') !~ '^-?[0-9]+([.][0-9]+)?$' then return null; end if;
    v_scale:=(p_quant->>'scale_factor')::numeric;
  end if;

  if v_op='RANGE' then
    select max(v)-min(v) into v_result from unnest(v_inputs) v;
  elsif v_op='SUM' then
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

revoke all on function public._ai_exam_part3_recompute_053(jsonb) from public, anon, authenticated;

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
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_quant jsonb;
  v_op text;
  v_family text;
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
  v_distinct_families integer := 0;
  v_max_family_count integer := 0;
  v_families text[] := array[]::text[];
  v_has_answer boolean;
  v_quant_ok boolean;
begin
  select r.exam_spec #>> '{assessment_standard,id}',
         upper(coalesce(r.exam_spec->>'assessment_type',''))
  into v_standard_id,v_assessment_type
  from public.ai_exam_requests r
  where r.id = p_request_id;

  if v_standard_id is distinct from 'DIA_LI_TNTHPT_2025_PLUS_V1' then
    return jsonb_build_object('valid',true,'applied',false,'quality_gate_version','053');
  end if;

  if p_exam_payload is null or jsonb_typeof(p_exam_payload)<>'object'
     or jsonb_typeof(p_exam_payload->'questions')<>'array' then
    return jsonb_build_object('valid',false,'code','quality_questions_invalid','quality_gate_version','053');
  end if;

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx:=v_idx+1;
    v_part:=btrim(coalesce(v_q->>'phan',''));
    v_stem:=btrim(coalesce(v_q->>'noi_dung',''));
    v_answer:=upper(replace(btrim(coalesce(v_q->>'dap_an_dung','')),'D','Đ'));
    v_level:=upper(btrim(coalesce(v_q->>'muc_do','')));

    -- Descriptive metadata is useful for review but not a hard validity boundary.
    if v_level not in ('NB','TH','VD') then
      v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,'code','cognitive_level_missing_or_invalid'
      ));
    end if;
    if btrim(coalesce(v_q->>'bai_hoc',''))='' then
      v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,'code','lesson_label_missing'
      ));
    end if;
    if char_length(btrim(coalesce(v_q->>'loi_giai','')))<12 then
      v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,'code','explanation_too_short'
      ));
    end if;

    if v_part='1' then
      select count(distinct lower(regexp_replace(btrim(value),'\s+',' ','g'))),
             min(char_length(btrim(value))),max(char_length(btrim(value)))
      into v_distinct,v_min_len,v_max_len
      from jsonb_array_elements_text(jsonb_build_array(
        coalesce(v_q->>'A',''),coalesce(v_q->>'B',''),coalesce(v_q->>'C',''),coalesce(v_q->>'D','')
      )) as t(value);
      if v_distinct<>4 or coalesce(v_min_len,0)<1 then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part1_duplicate_options_invalid'
        ));
      elsif v_min_len>0 and v_max_len::numeric/v_min_len::numeric>3.0 then
        v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','part1_option_length_imbalance'
        ));
      end if;

    elsif v_part='2' then
      if char_length(regexp_replace(v_stem,'<[^>]+>','','g'))<40 then
        v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','part2_stimulus_short'
        ));
      end if;
      select count(distinct lower(regexp_replace(btrim(value),'\s+',' ','g'))),min(char_length(btrim(value)))
      into v_distinct,v_min_len
      from jsonb_array_elements_text(jsonb_build_array(
        coalesce(v_q->>'A',''),coalesce(v_q->>'B',''),coalesce(v_q->>'C',''),coalesce(v_q->>'D','')
      )) as t(value);
      if v_distinct<>4 or coalesce(v_min_len,0)<8 then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part2_statements_invalid'
        ));
      end if;
      if v_answer !~ '^(Đ|S)-(Đ|S)-(Đ|S)-(Đ|S)$' then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part2_truth_pattern_invalid'
        ));
      elsif v_answer in ('Đ-Đ-Đ-Đ','S-S-S-S') then
        v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','part2_all_same_truth_pattern'
        ));
      end if;

    elsif v_part='3' then
      v_p3_count:=v_p3_count+1;
      v_quant_ok:=true;
      v_has_answer:=btrim(coalesce(v_q->>'dap_an_dung','')) ~ '^-?[0-9]+([\,\.][0-9]+)?$';

      if not v_has_answer then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part3_numeric_answer_invalid'
        ));
      else
        v_answer_numeric:=replace(btrim(v_q->>'dap_an_dung'),',','.')::numeric;
      end if;

      if lower(v_stem) !~ '(làm tròn|lấy kết quả|kết quả đến|đến hàng|chữ số thập phân)' then
        v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','part3_rounding_instruction_missing'
        ));
      end if;

      v_quant:=v_q->'quantitative';
      if v_quant is null or jsonb_typeof(v_quant)<>'object' then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part3_quantitative_core_required'
        ));
        continue;
      end if;

      v_op:=upper(btrim(coalesce(v_quant->>'operation_code','')));
      v_op:=case v_op
        when 'MEAN' then 'AVERAGE'
        when 'ABS_DIFFERENCE' then 'DIFFERENCE'
        when 'PERCENT_SHARE' then 'SHARE_PERCENT'
        when 'GROWTH_RATE' then 'GROWTH_PERCENT'
        when 'GROWTH_RATE_PERCENT' then 'GROWTH_PERCENT'
        else v_op
      end;

      if v_op not in (
        'RANGE','SUM','AVERAGE','DIFFERENCE','SUM_DIFFERENCE_TWO_GROUPS',
        'AVERAGE_DIFFERENCE_TWO_GROUPS','SHARE_PERCENT','RATIO_SCALED','DENSITY',
        'YIELD','PER_CAPITA','COMPONENT_FROM_SHARE','TOTAL_FROM_COMPONENT_SHARE',
        'GROWTH_INDEX','GROWTH_PERCENT','BALANCE'
      ) then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part3_operation_invalid','operation_code',v_op
        ));
        v_quant_ok:=false;
      end if;

      if jsonb_typeof(v_quant->'inputs')<>'array' then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part3_inputs_invalid'
        ));
        v_quant_ok:=false;
      else
        v_input_count:=jsonb_array_length(v_quant->'inputs');
        if v_input_count<2 or v_input_count>30 or exists(
          select 1 from jsonb_array_elements(v_quant->'inputs') as t(value)
          where jsonb_typeof(value)<>'number'
        ) then
          v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
            'question_no',v_idx,'code','quality_part3_inputs_invalid'
          ));
          v_quant_ok:=false;
        end if;
      end if;

      -- rounding_digits is normalized server-side when AI omits or misstates it.
      if coalesce(v_quant->>'rounding_digits','') ~ '^[0-9]+$'
         and (v_quant->>'rounding_digits')::integer between 0 and 3 then
        v_rounding_digits:=(v_quant->>'rounding_digits')::integer;
      else
        if position('.' in replace(btrim(coalesce(v_q->>'dap_an_dung','')),',','.'))>0 then
          v_rounding_digits:=least(3,char_length(split_part(replace(btrim(v_q->>'dap_an_dung'),',','.'),'.',2)));
        else
          v_rounding_digits:=0;
        end if;
        v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','rounding_digits_server_derived','derived',v_rounding_digits
        ));
      end if;

      if nullif(btrim(coalesce(v_quant->>'unit','')),'') is null then
        v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','part3_unit_metadata_missing'
        ));
      end if;

      if not v_quant_ok then continue; end if;

      select count(*)::integer into v_numeric_tokens
      from regexp_matches(v_stem,'[-+]?[0-9]+([ .][0-9]{3})*([,.][0-9]+)?','g');
      if coalesce(v_numeric_tokens,0)<v_input_count then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part3_source_data_not_exposed',
          'numeric_tokens',coalesce(v_numeric_tokens,0),'input_count',v_input_count
        ));
      end if;

      v_recomputed:=public._ai_exam_part3_recompute_053(v_quant || jsonb_build_object('operation_code',v_op));
      if v_recomputed is null then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part3_recompute_unsupported','operation_code',v_op
        ));
        continue;
      end if;

      if v_has_answer and round(v_recomputed,v_rounding_digits) is distinct from round(v_answer_numeric,v_rounding_digits) then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','quality_part3_recompute_mismatch',
          'expected',round(v_recomputed,v_rounding_digits),'actual',round(v_answer_numeric,v_rounding_digits)
        ));
      end if;

      -- Canonical quality metadata is derived only from objective operation semantics.
      v_family:=case
        when v_op='RANGE' then 'RANGE'
        when v_op='SUM' then 'TOTAL'
        when v_op='AVERAGE' then 'AVERAGE'
        when v_op='DIFFERENCE' then 'DIFFERENCE'
        when v_op in ('SUM_DIFFERENCE_TWO_GROUPS','AVERAGE_DIFFERENCE_TWO_GROUPS') then 'GROUP_COMPARISON'
        when v_op='SHARE_PERCENT' then 'SHARE'
        when v_op='DENSITY' then 'DENSITY'
        when v_op='YIELD' then 'YIELD'
        when v_op='PER_CAPITA' then 'PER_CAPITA'
        when v_op='RATIO_SCALED' then 'RATIO'
        when v_op in ('COMPONENT_FROM_SHARE','TOTAL_FROM_COMPONENT_SHARE') then 'SHARE_RECONSTRUCTION'
        when v_op in ('GROWTH_INDEX','GROWTH_PERCENT') then 'GROWTH'
        when v_op='BALANCE' then 'BALANCE'
        else v_op
      end;

      v_reasoning_steps:=case
        when v_op in ('SUM_DIFFERENCE_TWO_GROUPS','AVERAGE_DIFFERENCE_TWO_GROUPS','GROWTH_PERCENT') then 3
        when v_op in (
          'RANGE','AVERAGE','SHARE_PERCENT','RATIO_SCALED','DENSITY','YIELD','PER_CAPITA',
          'COMPONENT_FROM_SHARE','TOTAL_FROM_COMPONENT_SHARE','GROWTH_INDEX'
        ) then 2
        else 1
      end;

      if v_reasoning_steps=1 then v_simple_count:=v_simple_count+1; else v_multistep_count:=v_multistep_count+1; end if;
      if v_input_count>=3 then v_rich_data_count:=v_rich_data_count+1; end if;
      v_families:=array_append(v_families,v_family);

      if v_op='SUM' and v_input_count=2 then
        v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,'code','part3_simple_two_value_sum'
        ));
      end if;
    end if;
  end loop;

  if v_p3_count>0 and cardinality(v_families)>0 then
    select count(*)::integer,max(c)
    into v_distinct_families,v_max_family_count
    from (
      select s,count(*)::integer c from unnest(v_families) s group by s
    ) z;
  end if;

  -- Full-exam quality mix is advisory. Correct, grounded, recomputable exams reach teacher review.
  if v_assessment_type='TOT_NGHIEP' and v_p3_count=6 then
    if v_simple_count>2 then
      v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
        'code','part3_too_many_single_step','single_step_count',v_simple_count,'recommended_max',2
      ));
    end if;
    if v_multistep_count<4 then
      v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
        'code','part3_multistep_mix_below_target','multistep_count',v_multistep_count,'recommended_min',4
      ));
    end if;
    if v_rich_data_count<3 then
      v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
        'code','part3_rich_data_mix_below_target','rich_data_count',v_rich_data_count,'recommended_min',3
      ));
    end if;
    if coalesce(v_distinct_families,0)<4 then
      v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
        'code','part3_operation_diversity_below_target','distinct_families',coalesce(v_distinct_families,0),'recommended_min',4
      ));
    end if;
    if coalesce(v_max_family_count,0)>2 then
      v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
        'code','part3_operation_family_repeated','max_family_count',v_max_family_count,'recommended_max',2
      ));
    end if;
  end if;

  if jsonb_array_length(v_errors)>0 then
    return jsonb_build_object(
      'valid',false,
      'applied',true,
      'code','quality_batch_invalid',
      'quality_gate_version','053',
      'errors',v_errors,
      'warnings',v_warnings,
      'part3_quality',jsonb_build_object(
        'question_count',v_p3_count,
        'single_step_count',v_simple_count,
        'multistep_count',v_multistep_count,
        'rich_data_count',v_rich_data_count,
        'distinct_operation_families',coalesce(v_distinct_families,0)
      )
    );
  end if;

  return jsonb_build_object(
    'valid',true,
    'applied',true,
    'assessment_standard','DIA_LI_TNTHPT_2025_PLUS_V1',
    'quality_gate_version','053',
    'warnings',v_warnings,
    'part3_quality',jsonb_build_object(
      'question_count',v_p3_count,
      'single_step_count',v_simple_count,
      'multistep_count',v_multistep_count,
      'rich_data_count',v_rich_data_count,
      'distinct_operation_families',coalesce(v_distinct_families,0)
    )
  );
end;
$$;

revoke all on function public._ai_exam_quality_gate_037(uuid,jsonb) from public, anon, authenticated;

-- Refresh a capability for the SAME request. This removes the race against the one-hour handoff
-- without creating duplicate requests or changing exam scope. Owner-only and AI_WORKING/AWAITING_AI only.
create or replace function public.rpc_ai_exam_reissue_handoff(
  p_staff_token text,
  p_ma_gv text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_db_ma_gv text;
  v_request record;
  v_token text;
  v_hash text;
  v_expires timestamptz;
  v_issued jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;
  select ma_gv into v_db_ma_gv from public.giao_vien where id=v_gv_id;
  if v_db_ma_gv is distinct from btrim(p_ma_gv) then
    return jsonb_build_object('status','error','code','staff_identity_mismatch');
  end if;

  select id,requested_by,status into v_request
  from public.ai_exam_requests where id=p_request_id for update;
  if v_request.id is null then return jsonb_build_object('status','error','code','exam_request_not_found'); end if;
  if v_request.requested_by is distinct from v_gv_id then
    return jsonb_build_object('status','error','code','exam_request_owner_mismatch');
  end if;
  if v_request.status not in ('AWAITING_AI','AI_WORKING') then
    return jsonb_build_object('status','error','code','exam_request_unavailable');
  end if;

  v_token:=encode(gen_random_bytes(32),'hex');
  v_hash:=encode(digest(v_token,'sha256'),'hex');
  v_expires:=now()+interval '90 minutes';
  v_issued:=public.rpc_ai_exam_issue_handoff_service(p_request_id,v_gv_id,v_hash,v_expires);
  if coalesce(v_issued->>'status','')<>'success' then return v_issued; end if;

  return jsonb_build_object(
    'status','success','request_id',p_request_id,
    'capability_token',v_token,'expires_at',v_expires
  );
end;
$$;

revoke all on function public.rpc_ai_exam_reissue_handoff(text,text,uuid) from public;
grant execute on function public.rpc_ai_exam_reissue_handoff(text,text,uuid) to anon, authenticated;

commit;
