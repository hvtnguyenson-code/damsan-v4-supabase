begin;

-- 058 — Geography Part II cognitive depth.
-- 054 only verified declared level diversity. 058 requires a genuine TH + VD mix and
-- structured reasoning evidence so direct lookup / one-step arithmetic cannot be labelled VD.

alter function public._ai_exam_geography_standard_037()
  rename to _ai_exam_geography_standard_056_base;

revoke all on function public._ai_exam_geography_standard_056_base() from public, anon, authenticated;

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_set(
    jsonb_set(
      public._ai_exam_geography_standard_056_base(),
      '{version}',
      '"058"'::jsonb,
      true
    ),
    '{part2}',
    coalesce(public._ai_exam_geography_standard_056_base()->'part2','{}'::jsonb) || '{
      "required_levels_per_cluster":["TH","VD"],
      "statement_reasoning_required":true,
      "th_direct_lookup_forbidden":true,
      "vd_min_evidence_count":2,
      "vd_min_reasoning_steps":2,
      "vd_one_step_arithmetic_forbidden":true,
      "vd_requires_derived_or_transfer":true
    }'::jsonb,
    true
  );
$$;

revoke all on function public._ai_exam_geography_standard_037() from public, anon, authenticated;

update public.assessment_authority_profiles
set profile_version='058',
    profile=jsonb_set(
      jsonb_set(profile,'{version}','"058"'::jsonb,true),
      '{rules,part2}',
      coalesce(profile #> '{rules,part2}','{}'::jsonb) || '{
        "required_levels_per_cluster":["TH","VD"],
        "statement_reasoning_required":true,
        "th_direct_lookup_forbidden":true,
        "vd_min_evidence_count":2,
        "vd_min_reasoning_steps":2,
        "vd_one_step_arithmetic_forbidden":true,
        "vd_requires_derived_or_transfer":true,
        "vd_allowed_operations":["multi_step_calculation","rate_ratio_percent","index_normalization","evidence_synthesis","scenario_application","causal_application"]
      }'::jsonb,
      true
    ),
    updated_at=now()
where profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

alter function public._ai_exam_part2_blueprint_054(uuid,jsonb)
  rename to _ai_exam_part2_blueprint_054_base;

revoke all on function public._ai_exam_part2_blueprint_054_base(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_part2_blueprint_054_base(uuid,jsonb) to service_role;

create or replace function public._ai_exam_part2_blueprint_054(
  p_request_id uuid,
  p_exam_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_q jsonb;
  v_part text;
  v_levels jsonb;
  v_reasoning jsonb;
  v_entry jsonb;
  v_key text;
  v_level text;
  v_operation text;
  v_evidence integer;
  v_steps integer;
  v_derived boolean;
  v_transfer boolean;
  v_idx integer := 0;
  v_p2_count integer := 0;
  v_th_count integer;
  v_vd_count integer;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  v_base:=public._ai_exam_part2_blueprint_054_base(p_request_id,p_exam_payload);

  if coalesce((v_base->>'applied')::boolean,false) is not true then
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('quality_gate_version','058');
  end if;

  if coalesce((v_base->>'valid')::boolean,false) is not true then
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('quality_gate_version','058');
  end if;

  v_warnings:=coalesce(v_base->'warnings','[]'::jsonb);

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx:=v_idx+1;
    v_part:=btrim(coalesce(v_q->>'phan',''));
    if v_part<>'2' then continue; end if;

    v_p2_count:=v_p2_count+1;
    v_levels:=v_q->'statement_levels';
    v_reasoning:=v_q->'statement_reasoning';

    select count(*) filter (where upper(value)='TH'),
           count(*) filter (where upper(value)='VD')
    into v_th_count,v_vd_count
    from jsonb_each_text(v_levels);

    if v_th_count<1 then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'part2_no',v_p2_count,
        'code','quality_part2_th_required',
        'message','Mỗi cụm Phần II phải có ít nhất một lệnh Thông hiểu thực chất.'
      ));
    end if;

    if v_vd_count<1 then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'part2_no',v_p2_count,
        'code','quality_part2_vd_required',
        'message','Mỗi cụm Phần II phải có ít nhất một lệnh Vận dụng thực chất.'
      ));
    end if;

    if v_reasoning is null or jsonb_typeof(v_reasoning)<>'object' then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'part2_no',v_p2_count,
        'code','quality_part2_statement_reasoning_required',
        'message','Phần II phải khai báo statement_reasoning cho đủ A/B/C/D.'
      ));
      continue;
    end if;

    foreach v_key in array array['A','B','C','D'] loop
      v_level:=upper(btrim(coalesce(v_levels->>v_key,'')));
      v_entry:=v_reasoning->v_key;

      if v_entry is null or jsonb_typeof(v_entry)<>'object' then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,
          'part2_no',v_p2_count,
          'statement',v_key,
          'code','quality_part2_reasoning_entry_missing',
          'message','Thiếu statement_reasoning cho lệnh '||v_key||'.'
        ));
        continue;
      end if;

      v_operation:=lower(btrim(coalesce(v_entry->>'operation','')));
      v_evidence:=case
        when coalesce(v_entry->>'evidence_count','') ~ '^[0-9]+$' then (v_entry->>'evidence_count')::integer
        else -1
      end;
      v_steps:=case
        when coalesce(v_entry->>'reasoning_steps','') ~ '^[0-9]+$' then (v_entry->>'reasoning_steps')::integer
        else -1
      end;
      v_derived:=lower(coalesce(v_entry->>'derived_quantity','false'))='true';
      v_transfer:=lower(coalesce(v_entry->>'transfer_context','false'))='true';

      if v_operation not in (
        'direct_lookup','comparison','trend_interpretation','simple_calculation','causal_explanation',
        'multi_step_calculation','rate_ratio_percent','index_normalization','evidence_synthesis',
        'scenario_application','causal_application'
      ) or v_evidence<1 or v_steps<1 then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,
          'part2_no',v_p2_count,
          'statement',v_key,
          'code','quality_part2_reasoning_metadata_invalid',
          'message','Metadata tư duy của lệnh '||v_key||' không hợp lệ.'
        ));
        continue;
      end if;

      if v_level='TH' and (v_operation='direct_lookup' or (v_evidence<2 and v_steps<2)) then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,
          'part2_no',v_p2_count,
          'statement',v_key,
          'code','quality_part2_th_too_shallow',
          'message','Lệnh TH không được là đọc trực tiếp; phải xử lí ít nhất hai dữ kiện hoặc hai bước suy luận.',
          'operation',v_operation,
          'evidence_count',v_evidence,
          'reasoning_steps',v_steps
        ));
      end if;

      if v_level='VD' then
        if v_operation not in (
          'multi_step_calculation','rate_ratio_percent','index_normalization','evidence_synthesis',
          'scenario_application','causal_application'
        ) or v_evidence<2 or v_steps<2 or (not v_derived and not v_transfer) then
          v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
            'question_no',v_idx,
            'part2_no',v_p2_count,
            'statement',v_key,
            'code','quality_part2_vd_too_shallow',
            'message','Lệnh VD phải có ít nhất hai bước xử lí, dùng ít nhất hai dữ kiện và tạo kết quả dẫn xuất hoặc vận dụng sang tình huống.',
            'operation',v_operation,
            'evidence_count',v_evidence,
            'reasoning_steps',v_steps,
            'derived_quantity',v_derived,
            'transfer_context',v_transfer
          ));
        end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'valid',jsonb_array_length(v_errors)=0,
    'applied',true,
    'code',case when jsonb_array_length(v_errors)>0 then 'quality_batch_invalid' else null end,
    'errors',v_errors,
    'warnings',v_warnings,
    'part2_question_count',v_p2_count,
    'quality_gate_version','058'
  );
end;
$$;

revoke all on function public._ai_exam_part2_blueprint_054(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_part2_blueprint_054(uuid,jsonb) to service_role;

commit;
