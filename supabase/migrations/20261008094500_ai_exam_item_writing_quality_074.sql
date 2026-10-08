begin;

-- 074 — Part I item-writing quality guard.
-- Keep the 053/072 architecture principle: only objectively invalid authoring artifacts are hard errors.
-- Pedagogical style signals remain teacher-facing warnings.

alter function public._ai_exam_quality_gate_037(uuid,jsonb)
  rename to _ai_exam_quality_gate_074_base;

revoke all on function public._ai_exam_quality_gate_074_base(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_074_base(uuid,jsonb) to service_role;

create or replace function public._ai_exam_quality_gate_037(
  p_request_id uuid,
  p_exam_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_standard_id text;
  v_errors jsonb;
  v_warnings jsonb;
  v_q jsonb;
  v_idx integer := 0;
  v_part text;
  v_stem text;
  v_norm text;
  v_level text;
  v_base_valid boolean;
  v_added_error boolean := false;
  v_code text;
begin
  v_base := public._ai_exam_quality_gate_074_base(p_request_id,p_exam_payload);

  select r.exam_spec #>> '{assessment_standard,id}'
  into v_standard_id
  from public.ai_exam_requests r
  where r.id = p_request_id;

  if v_standard_id is distinct from 'DIA_LI_TNTHPT_2025_PLUS_V1'
     or p_exam_payload is null
     or jsonb_typeof(p_exam_payload) <> 'object'
     or jsonb_typeof(p_exam_payload->'questions') <> 'array' then
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('quality_gate_version','074');
  end if;

  v_errors := coalesce(v_base->'errors','[]'::jsonb);
  v_warnings := coalesce(v_base->'warnings','[]'::jsonb);
  v_base_valid := coalesce((v_base->>'valid')::boolean,true);

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx := v_idx + 1;
    v_part := btrim(coalesce(v_q->>'phan',''));
    if v_part <> '1' then
      continue;
    end if;

    v_stem := btrim(coalesce(v_q->>'noi_dung',''));
    v_norm := lower(regexp_replace(v_stem,'\s+',' ','g'));
    v_level := upper(btrim(coalesce(v_q->>'muc_do','')));

    -- These are not stylistic preferences: they expose authoring/source internals to students.
    if v_norm ~ '(trong bài học|được nêu trong bài|được trình bày trong bài|quy luật trong bài|nguồn nêu|knowledge[ _-]?package|knowledge_units|source_refs|unit_key)' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part1_meta_stem_invalid'
      ));
      v_added_error := true;
    end if;

    -- Generic judgement shells are not always wrong, so keep them advisory.
    if v_norm ~ '(nhận định nào phù hợp nhất|dự đoán nào phù hợp nhất|kết luận phù hợp nhất)' then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','part1_generic_judgement_shell'
      ));
    end if;

    -- A long NB stem can be legitimate, but it deserves teacher review rather than a hard rejection.
    if v_level = 'NB' and char_length(v_stem) > 180 then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','part1_nb_stem_overlong',
        'characters',char_length(v_stem)
      ));
    end if;
  end loop;

  v_code := case
    when v_base_valid is false then coalesce(nullif(v_base->>'code',''),'assessment_quality_invalid')
    when v_added_error then 'quality_part1_meta_stem_invalid'
    else null
  end;

  return coalesce(v_base,'{}'::jsonb) || jsonb_build_object(
    'valid', v_base_valid and not v_added_error,
    'code', v_code,
    'errors', v_errors,
    'warnings', v_warnings,
    'quality_gate_version','074'
  );
end;
$$;

revoke all on function public._ai_exam_quality_gate_037(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_037(uuid,jsonb) to service_role;

commit;
