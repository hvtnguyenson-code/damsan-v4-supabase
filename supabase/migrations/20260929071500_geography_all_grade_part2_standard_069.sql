begin;

-- 069 — Geography item-writing standard applies to grades 10/11/12.
-- Assessment STANDARD (style/quality) is intentionally separate from assessment AUTHORITY.
-- Grade 10/11 may use the same TNTHPT-style item-writing contract without inheriting
-- the official Grade-12 blueprint/count lock. Official blueprint authority remains
-- resolved independently by _ai_exam_apply_authority_039().

create or replace function public._ai_exam_apply_assessment_standard_037()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_profile text;
  v_grade integer;
begin
  select lower(btrim(m.ten_mon)) into v_subject
  from public.mon_hoc m
  where m.id=new.mon_id;

  v_profile:=upper(coalesce(new.exam_spec->>'assessment_type',''));
  begin
    v_grade:=(new.exam_spec->>'grade')::integer;
  exception when others then
    v_grade:=null;
  end;

  if v_subject in ('địa lí','địa lý')
     and v_grade in (10,11,12)
     and v_profile in ('TOT_NGHIEP','MCQ_ONLY','TRUE_FALSE_ONLY','SHORT_ONLY','CUSTOM') then
    new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)
      || jsonb_build_object('assessment_standard',public._ai_exam_geography_standard_037());
  else
    new.exam_spec:=coalesce(new.exam_spec,'{}'::jsonb)-'assessment_standard';
  end if;

  return new;
end;
$$;

revoke all on function public._ai_exam_apply_assessment_standard_037() from public, anon, authenticated;

-- Keep the stable public standard id, but make the all-grade scope explicit and
-- strengthen the shared-stimulus contract for Part II.
alter function public._ai_exam_geography_standard_037()
  rename to _ai_exam_geography_standard_069_base;

revoke all on function public._ai_exam_geography_standard_069_base() from public, anon, authenticated;

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_set(
    jsonb_set(
      jsonb_set(
        public._ai_exam_geography_standard_069_base(),
        '{version}',
        '"069"'::jsonb,
        true
      ),
      '{application_scope}',
      '{
        "grades":[10,11,12],
        "style_and_quality_only":true,
        "counts_source":"authoritative_exam_spec.counts",
        "official_blueprint_lock_requires_assessment_authority":true
      }'::jsonb,
      true
    ),
    '{part2}',
    coalesce(public._ai_exam_geography_standard_069_base()->'part2','{}'::jsonb) || '{
      "shared_stimulus_required":true,
      "evidence_bearing_stimulus_required":true,
      "instruction_only_stimulus_forbidden":true,
      "statements_must_materially_use_stimulus":true,
      "text_stimulus_min_plain_chars":100,
      "text_stimulus_expected_factual_clauses":2,
      "table_stimulus_min_rows":2,
      "table_stimulus_min_cells":4,
      "preferred_text_lead":"Cho thông tin sau:",
      "preferred_table_lead":"Cho bảng số liệu sau:",
      "forbidden_meta_stem_patterns":[
        "một học sinh đưa ra các nhận định sau",
        "hãy xác định tính đúng sai",
        "hãy xác định tính đúng, sai",
        "các nhận định sau"
      ]
    }'::jsonb,
    true
  );
$$;

revoke all on function public._ai_exam_geography_standard_037() from public, anon, authenticated;

-- Keep the Grade-12 authority profile aligned with the same Part-II stimulus contract.
-- This does not create Grade-10/11 authority profiles and therefore does not lock
-- Grade-10/11 counts to 18/4/6.
update public.assessment_authority_profiles
set profile_version='069',
    profile=jsonb_set(
      jsonb_set(
        profile,
        '{version}',
        '"069"'::jsonb,
        true
      ),
      '{rules,part2}',
      coalesce(profile #> '{rules,part2}','{}'::jsonb) || '{
        "evidence_bearing_stimulus_required":true,
        "instruction_only_stimulus_forbidden":true,
        "statements_must_materially_use_stimulus":true,
        "text_stimulus_min_plain_chars":100,
        "text_stimulus_expected_factual_clauses":2,
        "table_stimulus_min_rows":2,
        "table_stimulus_min_cells":4,
        "preferred_text_lead":"Cho thông tin sau:",
        "preferred_table_lead":"Cho bảng số liệu sau:"
      }'::jsonb,
      true
    ),
    updated_at=now()
where profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

-- 058 already enforces TH/VD depth. 069 adds a semantic-structure gate so a generic
-- instruction such as "một học sinh đưa ra các nhận định sau" cannot masquerade as
-- the common stimulus required by the Geography Part-II format.
alter function public._ai_exam_part2_blueprint_054(uuid,jsonb)
  rename to _ai_exam_part2_blueprint_069_base;

revoke all on function public._ai_exam_part2_blueprint_069_base(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_part2_blueprint_069_base(uuid,jsonb) to service_role;

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
  v_stem text;
  v_plain text;
  v_idx integer:=0;
  v_p2_count integer:=0;
  v_has_table boolean;
  v_table_rows integer;
  v_table_cells integer;
  v_errors jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
begin
  v_base:=public._ai_exam_part2_blueprint_069_base(p_request_id,p_exam_payload);

  if coalesce((v_base->>'applied')::boolean,false) is not true then
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('quality_gate_version','069');
  end if;

  if coalesce((v_base->>'valid')::boolean,false) is not true then
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('quality_gate_version','069');
  end if;

  v_errors:=coalesce(v_base->'errors','[]'::jsonb);
  v_warnings:=coalesce(v_base->'warnings','[]'::jsonb);

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx:=v_idx+1;
    v_part:=btrim(coalesce(v_q->>'phan',''));
    if v_part<>'2' then continue; end if;

    v_p2_count:=v_p2_count+1;
    v_stem:=btrim(coalesce(v_q->>'noi_dung',''));
    v_plain:=btrim(regexp_replace(regexp_replace(v_stem,'<[^>]+>',' ','gi'),'[[:space:]]+',' ','g'));
    v_has_table:=v_stem ~* '<table[[:space:]>]';

    -- Section-level instructions already tell students to choose Đ/S. The question
    -- stem itself must therefore carry evidence, not repeat an instruction/meta-story.
    if lower(v_plain) ~ 'một học sinh.*(nhận định|ý kiến)'
       or lower(v_plain) ~ 'hãy xác định.*(đúng|sai)'
       or lower(v_plain) ~ '(các|những)[[:space:]]+nhận định[[:space:]]+sau' then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'part2_no',v_p2_count,
        'code','quality_part2_stimulus_meta_only',
        'message','Phần II cần tư liệu chung có dữ kiện thực chất; không dùng câu dẫn/meta như “một học sinh đưa ra các nhận định sau” hoặc “hãy xác định đúng/sai” thay cho tư liệu.'
      ));
    end if;

    if not v_has_table and char_length(v_plain)<100 then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'part2_no',v_p2_count,
        'code','quality_part2_stimulus_too_thin',
        'message','Tư liệu chữ của Phần II phải là đoạn thông tin có dữ kiện đủ dùng, không phải một câu chủ đề ngắn.',
        'plain_char_count',char_length(v_plain)
      ));
    end if;

    if v_has_table then
      v_table_rows:=regexp_count(lower(v_stem),'<tr[[:space:]>]');
      v_table_cells:=regexp_count(lower(v_stem),'<(td|th)[[:space:]>]');
      if v_table_rows<2 or v_table_cells<4 then
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,
          'part2_no',v_p2_count,
          'code','quality_part2_stimulus_table_too_thin',
          'message','Bảng tư liệu Phần II phải có đủ hàng/cột dữ liệu để bốn lệnh khai thác chung.',
          'table_rows',v_table_rows,
          'table_cells',v_table_cells
        ));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'valid',jsonb_array_length(v_errors)=0,
    'applied',true,
    'code',case when jsonb_array_length(v_errors)>0 then 'quality_batch_invalid' else null end,
    'errors',v_errors,
    'warnings',v_warnings,
    'part2_question_count',v_p2_count,
    'quality_gate_version','069'
  );
end;
$$;

revoke all on function public._ai_exam_part2_blueprint_054(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_part2_blueprint_054(uuid,jsonb) to service_role;

commit;
