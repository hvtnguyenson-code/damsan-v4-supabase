begin;

-- 055 — Geography Part III presentation + compact-answer standard.
-- 1) Tabular quantitative data (>=3 raw inputs) must be shown as a real table in the student-visible stem.
-- 2) Final short answer is canonicalized to decimal comma and must fit in <=4 characters,
--    counting a leading minus sign and decimal comma.
-- 3) Validation remains server-canonical and aggregated; no room/submission path is changed.

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '{
    "id":"DIA_LI_TNTHPT_2025_PLUS_V1",
    "version":"055",
    "authority_order":["BGDDT_FORMAT_RULE","BGDDT_REFERENCE_EXAM","BGDDT_OFFICIAL_EXAM","PROVINCIAL_MOCK_BENCHMARK"],
    "official_full_blueprint":{"p1":18,"p2":4,"p3":6,"minutes":50,"p1_points":4.5,"p2_points":4.0,"p3_points":1.5},
    "p2_scoring":{"1_correct":0.1,"2_correct":0.25,"3_correct":0.5,"4_correct":1.0},
    "benchmark_policy":"STYLE_ONLY_NO_COPY",
    "model_knowledge_policy":"FORBIDDEN",
    "part2":{
      "statement_count":4,
      "shared_stimulus_required":true,
      "independent_statements":true,
      "statement_levels_required":true,
      "allowed_statement_levels":["NB","TH","VD"],
      "min_distinct_statement_levels":2,
      "max_distinct_statement_levels":3,
      "variable_statement_length_allowed":true,
      "part1_length_balance_rule_applies":false,
      "all_same_truth_pattern_forbidden":true
    },
    "part3":{
      "validation_mode":"SERVER_CANONICAL_V1",
      "aggregate_diagnostics":true,
      "hard_gate":"OBJECTIVE_CORRECTNESS_AND_PRESENTATION",
      "quantitative_core_required":["operation_code","inputs"],
      "server_derived":["operation_family","reasoning_steps","rich_data"],
      "ai_descriptive_metadata_trusted":false,
      "recompute_before_output":true,
      "source_sufficient_data":true,
      "quality_mix_is_advisory":true,
      "answer_max_characters":4,
      "answer_decimal_separator":",",
      "answer_minus_counts_as_character":true,
      "answer_decimal_separator_counts_as_character":true,
      "table_required_min_raw_inputs":3,
      "table_marker":"data-damsan-p3=1"
    },
    "metadata":{"source_refs_required":true}
  }'::jsonb;
$$;

revoke all on function public._ai_exam_geography_standard_037() from public, anon, authenticated;

update public.assessment_authority_profiles
set profile_version='055',
    profile=jsonb_set(
      jsonb_set(profile,'{version}','"055"'::jsonb,true),
      '{rules,part3}',
      coalesce(profile #> '{rules,part3}','{}'::jsonb) || '{
        "hard_gate":"OBJECTIVE_CORRECTNESS_AND_PRESENTATION",
        "answer_max_characters":4,
        "answer_decimal_separator":",",
        "answer_minus_counts_as_character":true,
        "answer_decimal_separator_counts_as_character":true,
        "table_required_min_raw_inputs":3,
        "table_marker":"data-damsan-p3=1"
      }'::jsonb,
      true
    ),
    updated_at=now()
where profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

-- Preserve the 053 quantitative/correctness gate as a callable base, then wrap it with 055 presentation rules.
alter function public._ai_exam_quality_gate_037(uuid,jsonb)
  rename to _ai_exam_quality_gate_053_base;

revoke all on function public._ai_exam_quality_gate_053_base(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_053_base(uuid,jsonb) to service_role;

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
  v_q jsonb;
  v_part text;
  v_idx integer := 0;
  v_stem text;
  v_visible_text text;
  v_visible_numeric_tokens integer;
  v_answer_raw text;
  v_answer_canonical text;
  v_quant jsonb;
  v_input_count integer;
  v_table_required boolean;
  v_table_marker boolean;
  v_table_rows integer;
  v_extra_errors jsonb := '[]'::jsonb;
  v_extra_warnings jsonb := '[]'::jsonb;
  v_errors jsonb;
  v_warnings jsonb;
  v_valid boolean;
begin
  v_base:=public._ai_exam_quality_gate_053_base(p_request_id,p_exam_payload);

  select r.exam_spec #>> '{assessment_standard,id}'
  into v_standard_id
  from public.ai_exam_requests r
  where r.id=p_request_id;

  if v_standard_id is distinct from 'DIA_LI_TNTHPT_2025_PLUS_V1' then
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('quality_gate_version','055');
  end if;

  if p_exam_payload is null or jsonb_typeof(p_exam_payload)<>'object'
     or jsonb_typeof(p_exam_payload->'questions')<>'array' then
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('quality_gate_version','055');
  end if;

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx:=v_idx+1;
    v_part:=btrim(coalesce(v_q->>'phan',''));
    if v_part<>'3' then continue; end if;

    v_stem:=coalesce(v_q->>'noi_dung','');
    v_answer_raw:=btrim(coalesce(v_q->>'dap_an_dung',''));
    v_answer_canonical:=replace(v_answer_raw,'.',',');

    -- Canonical short-answer alphabet: optional leading -, digits, optional decimal comma.
    -- Total character count includes '-' and ','.
    if v_answer_canonical !~ '^-?[0-9]+(,[0-9]+)?$'
       or char_length(v_answer_canonical)>4 then
      v_extra_errors:=v_extra_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_answer_compact_format_invalid',
        'message','Đáp án Phần III phải là số tối đa 4 kí tự, tính cả dấu âm và dấu phẩy.',
        'actual',v_answer_raw,
        'canonical',v_answer_canonical,
        'max_characters',4
      ));
    elsif position('.' in v_answer_raw)>0 then
      v_extra_warnings:=v_extra_warnings || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','part3_decimal_separator_server_normalized',
        'message','Server sẽ chuẩn hóa dấu chấm thập phân thành dấu phẩy.',
        'canonical',v_answer_canonical
      ));
    end if;

    v_quant:=v_q->'quantitative';
    if v_quant is not null and jsonb_typeof(v_quant)='object'
       and jsonb_typeof(v_quant->'inputs')='array' then
      v_input_count:=jsonb_array_length(v_quant->'inputs');
    else
      v_input_count:=0;
    end if;

    -- Count only text that a student can see. Numeric CSS/HTML attributes must not satisfy
    -- the raw-data exposure requirement.
    v_visible_text:=regexp_replace(v_stem,'<[^>]+>',' ','g');
    select count(*)::integer
    into v_visible_numeric_tokens
    from regexp_matches(v_visible_text,'[-+]?[0-9]+([ .][0-9]{3})*([,.][0-9]+)?','g');

    if v_input_count>0 and coalesce(v_visible_numeric_tokens,0)<v_input_count then
      v_extra_errors:=v_extra_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_visible_data_insufficient',
        'message','Chưa hiển thị đủ số liệu thô mà học sinh cần dùng để tính.',
        'visible_numeric_tokens',coalesce(v_visible_numeric_tokens,0),
        'input_count',v_input_count
      ));
    end if;

    v_table_required:=v_input_count>=3;
    v_table_marker:=position('data-damsan-p3="1"' in lower(v_stem))>0
      and lower(v_stem) like '%<table%'
      and lower(v_stem) like '%</table>%';

    if v_table_required and not v_table_marker then
      v_extra_errors:=v_extra_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_table_required',
        'message','Câu Phần III có từ 3 số liệu thô trở lên phải trình bày bằng bảng số liệu.',
        'input_count',v_input_count,
        'required_marker','data-damsan-p3="1"'
      ));
    elsif v_table_marker then
      select count(*)::integer
      into v_table_rows
      from regexp_matches(lower(v_stem),'<tr([ >])','g');

      if coalesce(v_table_rows,0)<2
         or lower(v_stem) not like '%<th%'
         or lower(v_stem) not like '%<td%' then
        v_extra_errors:=v_extra_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,
          'code','quality_part3_table_structure_invalid',
          'message','Bảng Phần III phải có hàng tiêu đề và dữ liệu bằng th/td.',
          'row_count',coalesce(v_table_rows,0)
        ));
      end if;
    end if;
  end loop;

  v_errors:=coalesce(v_base->'errors','[]'::jsonb) || v_extra_errors;
  v_warnings:=coalesce(v_base->'warnings','[]'::jsonb) || v_extra_warnings;
  v_valid:=coalesce((v_base->>'valid')::boolean,false) and jsonb_array_length(v_extra_errors)=0;

  return coalesce(v_base,'{}'::jsonb)
    || jsonb_build_object(
      'valid',v_valid,
      'code',case when jsonb_array_length(v_errors)>0 then 'quality_batch_invalid' else null end,
      'errors',v_errors,
      'warnings',v_warnings,
      'part3_presentation',jsonb_build_object(
        'answer_max_characters',4,
        'decimal_separator',',',
        'table_required_min_raw_inputs',3,
        'table_marker','data-damsan-p3="1"'
      ),
      'quality_gate_version','055'
    );
end;
$$;

revoke all on function public._ai_exam_quality_gate_037(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_037(uuid,jsonb) to service_role;

-- Server-canonical answer formatting. The AI may return a dot; persisted drafts/variants use comma.
create or replace function public._ai_exam_normalize_questions_055(p_questions jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_questions is null or jsonb_typeof(p_questions)<>'array' then p_questions
    else coalesce((
      select jsonb_agg(
        case
          when btrim(coalesce(q.value->>'phan',q.value->>'Phan',''))='3'
               and nullif(btrim(coalesce(q.value->>'dap_an_dung',q.value->>'DapAnDung','')),'') is not null
          then jsonb_set(
            q.value,
            '{dap_an_dung}',
            to_jsonb(replace(btrim(coalesce(q.value->>'dap_an_dung',q.value->>'DapAnDung','')),'.',',')),
            true
          ) - 'DapAnDung'
          else q.value
        end
        order by q.ord
      )
      from jsonb_array_elements(p_questions) with ordinality q(value,ord)
    ),'[]'::jsonb)
  end;
$$;

create or replace function public._ai_exam_normalize_exam_payload_055(p_payload jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_payload is null or jsonb_typeof(p_payload)<>'object'
         or jsonb_typeof(p_payload->'questions')<>'array' then p_payload
    else jsonb_set(p_payload,'{questions}',public._ai_exam_normalize_questions_055(p_payload->'questions'),true)
  end;
$$;

create or replace function public._ai_exam_normalize_variants_055(p_variants jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_variants is null or jsonb_typeof(p_variants)<>'array' then p_variants
    else coalesce((
      select jsonb_agg(
        case
          when jsonb_typeof(v.value)='object' and jsonb_typeof(v.value->'cau_so')='array'
          then jsonb_set(v.value,'{cau_so}',public._ai_exam_normalize_questions_055(v.value->'cau_so'),true)
          else v.value
        end
        order by v.ord
      )
      from jsonb_array_elements(p_variants) with ordinality v(value,ord)
    ),'[]'::jsonb)
  end;
$$;

revoke all on function public._ai_exam_normalize_questions_055(jsonb) from public, anon, authenticated;
revoke all on function public._ai_exam_normalize_exam_payload_055(jsonb) from public, anon, authenticated;
revoke all on function public._ai_exam_normalize_variants_055(jsonb) from public, anon, authenticated;

grant execute on function public._ai_exam_normalize_questions_055(jsonb) to service_role;
grant execute on function public._ai_exam_normalize_exam_payload_055(jsonb) to service_role;
grant execute on function public._ai_exam_normalize_variants_055(jsonb) to service_role;

create or replace function public._ai_exam_draft_normalize_055()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.exam_payload:=public._ai_exam_normalize_exam_payload_055(new.exam_payload);
  new.variants_payload:=public._ai_exam_normalize_variants_055(new.variants_payload);
  return new;
end;
$$;

revoke all on function public._ai_exam_draft_normalize_055() from public, anon, authenticated;

drop trigger if exists trg_ai_exam_draft_normalize_055 on public.ai_exam_drafts;
create trigger trg_ai_exam_draft_normalize_055
before insert or update of exam_payload,variants_payload on public.ai_exam_drafts
for each row execute function public._ai_exam_draft_normalize_055();

commit;
