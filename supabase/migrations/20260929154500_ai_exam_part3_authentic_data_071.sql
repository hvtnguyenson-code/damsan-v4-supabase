begin;

-- 071 — Geography Part III must use authentic quantitative evidence from cited source units.
-- The official 2025-style short-answer task is evidence/data -> geographic operation -> numeric answer.
-- Arithmetic correctness alone is not enough: model-invented/hypothetical numbers are rejected.

alter function public._ai_exam_geography_standard_037()
  rename to _ai_exam_geography_standard_071_base;

revoke all on function public._ai_exam_geography_standard_071_base() from public, anon, authenticated;

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_set(
    jsonb_set(
      public._ai_exam_geography_standard_071_base(),
      '{version}',
      '"071"'::jsonb,
      true
    ),
    '{part3}',
    coalesce(public._ai_exam_geography_standard_071_base()->'part3','{}'::jsonb) || '{
      "authentic_source_data_required":true,
      "inputs_must_exist_in_cited_units":true,
      "hypothetical_numeric_data_forbidden":true,
      "trusted_external_data_policy":"KNOWLEDGE_PACKAGE_ONLY",
      "insufficient_authentic_data_policy":"BLOCK_GENERATION_DO_NOT_INVENT",
      "preferred_table_command":"Căn cứ vào bảng số liệu trên, hãy cho biết ...",
      "preferred_inline_command":"Hãy cho biết ...",
      "source_attribution_preferred_when_available":true
    }'::jsonb,
    true
  );
$$;

revoke all on function public._ai_exam_geography_standard_037() from public, anon, authenticated;

-- Keep the Grade-12 authority profile aligned with the same Part-III authenticity contract.
update public.assessment_authority_profiles
set profile_version='071',
    profile=jsonb_set(
      jsonb_set(profile,'{version}','"071"'::jsonb,true),
      '{rules,part3}',
      coalesce(profile #> '{rules,part3}','{}'::jsonb) || '{
        "authentic_source_data_required":true,
        "inputs_must_exist_in_cited_units":true,
        "hypothetical_numeric_data_forbidden":true,
        "trusted_external_data_policy":"KNOWLEDGE_PACKAGE_ONLY",
        "insufficient_authentic_data_policy":"BLOCK_GENERATION_DO_NOT_INVENT",
        "preferred_table_command":"Căn cứ vào bảng số liệu trên, hãy cho biết ...",
        "preferred_inline_command":"Hãy cho biết ..."
      }'::jsonb,
      true
    ),
    updated_at=now()
where profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

-- Return true only when the raw numeric value actually occurs in a cited, usable unit
-- belonging to an active revision of a document bound to this generation request.
create or replace function public._ai_exam_number_grounded_071(
  p_request_id uuid,
  p_source_refs jsonb,
  p_value numeric
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ai_exam_requests r
    join public.knowledge_documents kd
      on kd.id=any(r.knowledge_document_ids)
     and kd.active_revision is not null
    join public.knowledge_units ku
      on ku.document_id=kd.id
     and ku.revision=kd.active_revision
     and ku.is_usable is true
    join lateral jsonb_array_elements_text(
      case when jsonb_typeof(p_source_refs)='array' then p_source_refs else '[]'::jsonb end
    ) ref(unit_key) on ref.unit_key=ku.unit_key
    cross join lateral regexp_matches(
      regexp_replace(replace(coalesce(ku.content::text,''),',','.'),'[[:space:]]+','','g'),
      '-?[0-9]+(?:[.][0-9]+)?',
      'g'
    ) matched
    where r.id=p_request_id
      and (matched[1])::numeric=p_value
  );
$$;

revoke all on function public._ai_exam_number_grounded_071(uuid,jsonb,numeric) from public, anon, authenticated;
grant execute on function public._ai_exam_number_grounded_071(uuid,jsonb,numeric) to service_role;

-- Preserve the complete 064 gate (including exact-result rounding-noise suppression)
-- and add authenticity checks after all existing correctness/presentation checks.
alter function public._ai_exam_quality_gate_037(uuid,jsonb)
  rename to _ai_exam_quality_gate_071_base;

revoke all on function public._ai_exam_quality_gate_071_base(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_071_base(uuid,jsonb) to service_role;

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
  v_q jsonb;
  v_part text;
  v_stem text;
  v_quant jsonb;
  v_refs jsonb;
  v_input jsonb;
  v_value numeric;
  v_missing jsonb;
  v_idx integer:=0;
  v_code text;
begin
  v_base:=public._ai_exam_quality_gate_071_base(p_request_id,p_exam_payload);

  select r.exam_spec #>> '{assessment_standard,id}'
  into v_standard_id
  from public.ai_exam_requests r
  where r.id=p_request_id;

  if v_standard_id is distinct from 'DIA_LI_TNTHPT_2025_PLUS_V1'
     or p_exam_payload is null
     or jsonb_typeof(p_exam_payload)<>'object'
     or jsonb_typeof(p_exam_payload->'questions')<>'array' then
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('quality_gate_version','071');
  end if;

  v_errors:=coalesce(v_base->'errors','[]'::jsonb);

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx:=v_idx+1;
    v_part:=btrim(coalesce(v_q->>'phan',''));
    if v_part<>'3' then continue; end if;

    v_stem:=lower(btrim(coalesce(v_q->>'noi_dung','')));

    if v_stem ~ '(giả[[:space:]]*định|mô[[:space:]]*phỏng|số[[:space:]]*liệu[[:space:]]*(giả|minh[[:space:]]*họa)|dữ[[:space:]]*liệu[[:space:]]*(giả|minh[[:space:]]*họa)|giá[[:space:]]*trị[[:space:]]*giả[[:space:]]*định|lãnh[[:space:]]*thổ[[:space:]]*giả[[:space:]]*định)' then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_hypothetical_data_forbidden',
        'message','Phần III không được dùng số liệu giả định/mô phỏng do AI tự đặt; phải dùng dữ liệu thật từ nguồn được dẫn.'
      ));
    end if;

    v_quant:=v_q->'quantitative';
    v_refs:=v_q->'source_refs';
    v_missing:='[]'::jsonb;

    if v_quant is not null
       and jsonb_typeof(v_quant)='object'
       and jsonb_typeof(v_quant->'inputs')='array' then
      for v_input in select value from jsonb_array_elements(v_quant->'inputs') loop
        if jsonb_typeof(v_input)<>'number' then continue; end if;
        begin
          v_value:=(v_input #>> '{}')::numeric;
        exception when others then
          continue;
        end;

        if not public._ai_exam_number_grounded_071(p_request_id,v_refs,v_value) then
          v_missing:=v_missing || jsonb_build_array(v_input);
        end if;
      end loop;
    end if;

    if jsonb_array_length(v_missing)>0 then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_input_not_grounded_in_source',
        'message','Một hoặc nhiều số liệu thô trong quantitative.inputs không tồn tại trong các knowledge_unit được source_refs dẫn.',
        'ungrounded_inputs',v_missing
      ));
    end if;
  end loop;

  if jsonb_array_length(v_errors)>0 then
    v_code:=coalesce(v_errors->0->>'code',v_base->>'code','quality_failed');
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object(
      'valid',false,
      'code',v_code,
      'errors',v_errors,
      'quality_gate_version','071'
    );
  end if;

  return coalesce(v_base,'{}'::jsonb) || jsonb_build_object(
    'valid',true,
    'code',null,
    'errors','[]'::jsonb,
    'quality_gate_version','071'
  );
end;
$$;

revoke all on function public._ai_exam_quality_gate_037(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_037(uuid,jsonb) to service_role;

commit;
