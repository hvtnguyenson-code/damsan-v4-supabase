begin;

-- 064 — suppress false-positive Part III rounding warnings for exact results.
-- 062 intentionally tells the model not to declare rounding_digits when no rounding is needed.
-- The older 053 base gate warned on every Part III stem without an explicit rounding phrase and
-- also warned whenever rounding_digits was omitted. For exact results (for example 4.8 - 3.1 = 1.7),
-- those warnings are noise rather than useful review signals.

alter function public._ai_exam_quality_gate_037(uuid,jsonb)
  rename to _ai_exam_quality_gate_056_base;

revoke all on function public._ai_exam_quality_gate_056_base(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_056_base(uuid,jsonb) to service_role;

create or replace function public._ai_exam_rounding_warning_needed_064(p_question jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_quant jsonb;
  v_result numeric;
  v_answer_text text;
  v_answer numeric;
begin
  if p_question is null or jsonb_typeof(p_question)<>'object' then return true; end if;
  if btrim(coalesce(p_question->>'phan',''))<>'3' then return true; end if;

  v_quant:=p_question->'quantitative';
  if v_quant is null or jsonb_typeof(v_quant)<>'object' then return true; end if;

  -- If the author explicitly requested a rounding precision, keep the legacy warnings.
  if v_quant ? 'rounding_digits' then return true; end if;

  v_answer_text:=replace(btrim(coalesce(p_question->>'dap_an_dung','')),',','.');
  if v_answer_text !~ '^-?[0-9]+([.][0-9]+)?$' then return true; end if;

  v_result:=public._ai_exam_part3_recompute_053(v_quant);
  if v_result is null then return true; end if;

  v_answer:=v_answer_text::numeric;

  -- Exact canonical result: no rounding instruction or rounding_digits metadata is necessary.
  return v_result is distinct from v_answer;
end;
$$;

revoke all on function public._ai_exam_rounding_warning_needed_064(jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_rounding_warning_needed_064(jsonb) to service_role;

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
  v_standard_id text;
  v_warnings jsonb;
begin
  v_result:=public._ai_exam_quality_gate_056_base(p_request_id,p_exam_payload);

  select r.exam_spec #>> '{assessment_standard,id}'
  into v_standard_id
  from public.ai_exam_requests r
  where r.id=p_request_id;

  if v_standard_id is distinct from 'DIA_LI_TNTHPT_2025_PLUS_V1'
     or p_exam_payload is null
     or jsonb_typeof(p_exam_payload)<>'object'
     or jsonb_typeof(p_exam_payload->'questions')<>'array' then
    return coalesce(v_result,'{}'::jsonb) || jsonb_build_object('quality_gate_version','064');
  end if;

  select coalesce(jsonb_agg(w.value order by w.ord),'[]'::jsonb)
  into v_warnings
  from jsonb_array_elements(coalesce(v_result->'warnings','[]'::jsonb)) with ordinality w(value,ord)
  where not (
    coalesce(w.value->>'code','') in ('part3_rounding_instruction_missing','rounding_digits_server_derived')
    and coalesce(w.value->>'question_no','') ~ '^[0-9]+$'
    and (w.value->>'question_no')::integer between 1 and jsonb_array_length(p_exam_payload->'questions')
    and not public._ai_exam_rounding_warning_needed_064(
      p_exam_payload->'questions'->((w.value->>'question_no')::integer-1)
    )
  );

  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object(
      'warnings',v_warnings,
      'quality_gate_version','064'
    );
end;
$$;

revoke all on function public._ai_exam_quality_gate_037(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_037(uuid,jsonb) to service_role;

commit;
