begin;

-- 056 — JSON-safe Part III table marker.
-- 055 correctly required semantic tables but showed a double-quoted HTML attribute inside a JSON
-- string. Models can copy that literally and emit invalid JSON. 056 authors the marker with single
-- quotes and normalizes that marker only for validation. Persisted HTML remains valid and safe.

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '{
    "id":"DIA_LI_TNTHPT_2025_PLUS_V1",
    "part2":{
      "statement_count":4,
      "independent_statements":true,
      "allowed_statement_levels":["NB","TH","VD"],
      "shared_stimulus_required":true,
      "statement_levels_required":true,
      "max_distinct_statement_levels":3,
      "min_distinct_statement_levels":2,
      "all_same_truth_pattern_forbidden":true,
      "part1_length_balance_rule_applies":false,
      "variable_statement_length_allowed":true
    },
    "part3":{
      "hard_gate":"OBJECTIVE_CORRECTNESS_AND_PRESENTATION",
      "table_marker":"data-damsan-p3=1",
      "json_safe_html_attribute_quotes":"single",
      "server_derived":["operation_family","reasoning_steps","rich_data"],
      "validation_mode":"SERVER_CANONICAL_V1",
      "aggregate_diagnostics":true,
      "answer_max_characters":4,
      "result_divisor_policy":"POWER_OF_TEN_1_TO_1E9",
      "result_divisor_allowed":true,
      "source_sufficient_data":true,
      "quality_mix_is_advisory":true,
      "recompute_before_output":true,
      "answer_decimal_separator":",",
      "quantitative_core_required":["operation_code","inputs"],
      "table_required_min_raw_inputs":3,
      "ai_descriptive_metadata_trusted":false,
      "answer_minus_counts_as_character":true,
      "answer_decimal_separator_counts_as_character":true
    },
    "version":"056",
    "metadata":{"source_refs_required":true},
    "p2_scoring":{"1_correct":0.1,"2_correct":0.25,"3_correct":0.5,"4_correct":1.0},
    "authority_order":["BGDDT_FORMAT_RULE","BGDDT_REFERENCE_EXAM","BGDDT_OFFICIAL_EXAM","PROVINCIAL_MOCK_BENCHMARK"],
    "benchmark_policy":"STYLE_ONLY_NO_COPY",
    "model_knowledge_policy":"FORBIDDEN",
    "official_full_blueprint":{"p1":18,"p2":4,"p3":6,"minutes":50,"p1_points":4.5,"p2_points":4.0,"p3_points":1.5}
  }'::jsonb;
$$;

revoke all on function public._ai_exam_geography_standard_037() from public, anon, authenticated;

update public.assessment_authority_profiles
set profile_version='056',
    profile=jsonb_set(
      jsonb_set(
        jsonb_set(profile,'{version}','"056"'::jsonb,true),
        '{rules,part3,json_safe_html_attribute_quotes}',
        '"single"'::jsonb,
        true
      ),
      '{rules,part3,table_marker}',
      to_jsonb('data-damsan-p3=1'::text),
      true
    ),
    updated_at=now()
where profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

-- Preserve the full 055 correctness/presentation gate. 056 only normalizes the JSON-safe authored
-- table marker before handing the payload to that gate.
alter function public._ai_exam_quality_gate_037(uuid,jsonb)
  rename to _ai_exam_quality_gate_055_base;

revoke all on function public._ai_exam_quality_gate_055_base(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_055_base(uuid,jsonb) to service_role;

create or replace function public._ai_exam_normalize_table_marker_056(p_payload jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_payload is null or jsonb_typeof(p_payload)<>'object'
      or jsonb_typeof(p_payload->'questions')<>'array' then p_payload
    else jsonb_set(
      p_payload,
      '{questions}',
      coalesce((
        select jsonb_agg(
          case
            when jsonb_typeof(q.value)='object' and q.value ? 'noi_dung' then
              jsonb_set(
                q.value,
                '{noi_dung}',
                to_jsonb(
                  regexp_replace(
                    q.value->>'noi_dung',
                    $$data-damsan-p3\s*=\s*'1'$$,
                    'data-damsan-p3="1"',
                    'gi'
                  )
                ),
                true
              )
            else q.value
          end
          order by q.ord
        )
        from jsonb_array_elements(p_payload->'questions') with ordinality q(value,ord)
      ),'[]'::jsonb),
      true
    )
  end;
$$;

revoke all on function public._ai_exam_normalize_table_marker_056(jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_normalize_table_marker_056(jsonb) to service_role;

create or replace function public._ai_exam_quality_gate_037(
  p_request_id uuid,
  p_exam_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result:=public._ai_exam_quality_gate_055_base(
    p_request_id,
    public._ai_exam_normalize_table_marker_056(p_exam_payload)
  );
  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object('quality_gate_version','056');
end;
$$;

revoke all on function public._ai_exam_quality_gate_037(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_037(uuid,jsonb) to service_role;

commit;
