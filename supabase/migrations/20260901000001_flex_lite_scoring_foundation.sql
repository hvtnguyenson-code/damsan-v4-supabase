-- =========================================================================
-- Migration: 20260901000001_flex_lite_scoring_foundation.sql
-- Description: Server scoring foundation for FLEX-LITE assessment types
--   (LEGACY, TOT_NGHIEP, MCQ_ONLY, TRUE_FALSE_ONLY, SHORT_ONLY, CUSTOM).
-- =========================================================================

-- 1. ADDITIVE COLUMNS & CONSTRAINTS ON public.phong_thi
alter table public.phong_thi
  add column if not exists assessment_type text not null default 'LEGACY',
  add column if not exists scoring_config jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'phong_thi_assessment_type_check'
      and conrelid = 'public.phong_thi'::regclass
  ) then
    alter table public.phong_thi
      add constraint phong_thi_assessment_type_check
      check (assessment_type in ('LEGACY', 'TOT_NGHIEP', 'MCQ_ONLY', 'TRUE_FALSE_ONLY', 'SHORT_ONLY', 'CUSTOM'));
  end if;
end;
$$;

comment on column public.phong_thi.assessment_type is 'Loai bai kiem tra cho flex-lite scoring: LEGACY, TOT_NGHIEP, MCQ_ONLY, TRUE_FALSE_ONLY, SHORT_ONLY, CUSTOM';
comment on column public.phong_thi.scoring_config is 'Cau hinh trong so diem cho assessment_type CUSTOM (p1_weight, p2_weight, p3_weight)';

-- 2. CANONICAL SERVER GRADER (REPLACE ONLY public.rpc_grade_submission)
create or replace function public.rpc_grade_submission(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_submission public.exam_submissions%rowtype;
  v_assessment_type text;
  v_scoring_config jsonb;
  v_exam jsonb;
  v_question jsonb;
  v_answer text;
  v_correct text;
  v_part text;
  v_part2_correct text;
  v_part2_answer text;
  v_part2_matches integer;
  v_part2_index integer;
  v_part2_answer_slots text[];
  v_part2_correct_slots text[];
  v_points numeric := 0;
  v_raw_sum numeric := 0;
  v_final_score numeric := 0;
  v_details jsonb := '[]'::jsonb;
  v_index integer;
  v_total_questions integer := 0;

  v_p1_count integer := 0;
  v_p2_count integer := 0;
  v_p3_count integer := 0;
  v_p1_earned numeric := 0;
  v_p2_earned numeric := 0;
  v_p3_earned numeric := 0;
  v_p1_max numeric := 0;
  v_p2_max numeric := 0;
  v_p3_max numeric := 0;

  v_p1_weight numeric := 0;
  v_p2_weight numeric := 0;
  v_p3_weight numeric := 0;
  v_p1_score numeric := 0;
  v_p2_score numeric := 0;
  v_p3_score numeric := 0;
begin
  select * into v_submission from public.exam_submissions where id = p_submission_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Khong tim thay submission.');
  end if;
  if v_submission.status = 'graded' then
    return jsonb_build_object('status', 'graded', 'submission_id', v_submission.id,
      'score', v_submission.score, 'graded_at', v_submission.graded_at);
  end if;

  update public.exam_submissions set status = 'grading', grading_error = null, updated_at = now()
  where id = v_submission.id;

  select assessment_type, scoring_config
  into v_assessment_type, v_scoring_config
  from public.phong_thi
  where id = v_submission.phong_id;

  if not found then
    raise exception 'Room not found for stored submission';
  end if;

  v_assessment_type := coalesce(v_assessment_type, 'LEGACY');
  v_scoring_config := coalesce(v_scoring_config, '{}'::jsonb);

  select case when jsonb_typeof(cau_so) = 'string' then (cau_so #>> '{}')::jsonb else cau_so end
  into v_exam from public.de_thi
  where phong_id = v_submission.phong_id and ma_de = v_submission.ma_de limit 1;
  if v_exam is null or jsonb_typeof(v_exam) <> 'array' then
    raise exception 'Exam data not found for stored room and exam code';
  end if;

  v_total_questions := jsonb_array_length(v_exam);

  for v_question, v_index in select value, ordinality::integer
    from jsonb_array_elements(v_exam) with ordinality
  loop
    v_part := coalesce(v_question->>'phan', v_question->>'Phan', '1');
    v_answer := coalesce(v_submission.raw_answers -> (v_index - 1) ->> 'chon', '');
    v_correct := coalesce(v_question->>'dap_an_dung', v_question->>'DapAnDung', '');
    v_points := 0;

    if v_part = '1' then
      v_p1_count := v_p1_count + 1;
      if upper(trim(v_answer)) = upper(trim(v_correct)) and trim(v_answer) <> '' then
        v_points := 0.25;
      end if;
      v_p1_earned := v_p1_earned + v_points;
    elsif v_part = '2' then
      v_p2_count := v_p2_count + 1;
      -- Keep the four a/b/c/d positions. Empty slots must never shift a later answer.
      v_part2_answer_slots := string_to_array(v_answer, '-');
      v_part2_correct_slots := string_to_array(v_correct, '-');
      v_part2_matches := 0;
      for v_part2_index in 1..4 loop
        v_part2_answer := translate(upper(trim(coalesce(v_part2_answer_slots[v_part2_index], ''))), 'Đ', 'D');
        v_part2_correct := translate(upper(trim(coalesce(v_part2_correct_slots[v_part2_index], ''))), 'Đ', 'D');
        if v_part2_answer <> '' and v_part2_answer = v_part2_correct then
          v_part2_matches := v_part2_matches + 1;
        end if;
      end loop;
      v_points := case v_part2_matches when 1 then 0.1 when 2 then 0.25 when 3 then 0.5 when 4 then 1.0 else 0 end;
      v_p2_earned := v_p2_earned + v_points;
    elsif v_part = '3' then
      v_p3_count := v_p3_count + 1;
      if regexp_replace(lower(replace(replace(v_answer, ',', '.'), '''', '')), '\s', '', 'g') <> ''
        and regexp_replace(lower(replace(replace(v_answer, ',', '.'), '''', '')), '\s', '', 'g') = regexp_replace(lower(replace(replace(v_correct, ',', '.'), '''', '')), '\s', '', 'g') then
        v_points := 0.25;
      end if;
      v_p3_earned := v_p3_earned + v_points;
    else
      if v_assessment_type = 'LEGACY' then
        -- In legacy algorithm, non-1, non-2 parts used the normalized P3 logic
        if regexp_replace(lower(replace(replace(v_answer, ',', '.'), '''', '')), '\s', '', 'g') <> ''
          and regexp_replace(lower(replace(replace(v_answer, ',', '.'), '''', '')), '\s', '', 'g') = regexp_replace(lower(replace(replace(v_correct, ',', '.'), '''', '')), '\s', '', 'g') then
          v_points := 0.25;
        end if;
      else
        raise exception 'Unknown question part % in assessment type %', v_part, v_assessment_type;
      end if;
    end if;

    v_raw_sum := v_raw_sum + v_points;
    v_details := v_details || jsonb_build_array(jsonb_build_object('q', v_index, 'phan', v_part, 'chon', v_answer, 'dung', v_correct, 'diem', v_points));
  end loop;

  v_p1_max := v_p1_count * 0.25;
  v_p2_max := v_p2_count * 1.0;
  v_p3_max := v_p3_count * 0.25;

  if v_assessment_type = 'LEGACY' then
    v_final_score := v_raw_sum;
  elsif v_assessment_type = 'TOT_NGHIEP' then
    if (v_p1_count + v_p2_count + v_p3_count) <> v_total_questions then
      raise exception 'TOT_NGHIEP exam contains invalid question parts';
    end if;
    v_final_score := v_p1_earned + v_p2_earned + v_p3_earned;
  elsif v_assessment_type = 'MCQ_ONLY' then
    if v_p1_count <> v_total_questions or v_p1_count < 1 or v_p1_max <= 0 then
      raise exception 'MCQ_ONLY requires all questions to be Part 1 (at least 1 question)';
    end if;
    v_final_score := round((v_p1_earned / v_p1_max) * 10, 2);
  elsif v_assessment_type = 'TRUE_FALSE_ONLY' then
    if v_p2_count <> v_total_questions or v_p2_count < 1 or v_p2_max <= 0 then
      raise exception 'TRUE_FALSE_ONLY requires all questions to be Part 2 (at least 1 question)';
    end if;
    v_final_score := round((v_p2_earned / v_p2_max) * 10, 2);
  elsif v_assessment_type = 'SHORT_ONLY' then
    if v_p3_count <> v_total_questions or v_p3_count < 1 or v_p3_max <= 0 then
      raise exception 'SHORT_ONLY requires all questions to be Part 3 (at least 1 question)';
    end if;
    v_final_score := round((v_p3_earned / v_p3_max) * 10, 2);
  elsif v_assessment_type = 'CUSTOM' then
    if (v_p1_count + v_p2_count + v_p3_count) <> v_total_questions or v_total_questions < 1 then
      raise exception 'CUSTOM exam contains invalid question parts or no questions';
    end if;
    if jsonb_typeof(v_scoring_config) <> 'object'
      or not (v_scoring_config ? 'p1_weight')
      or not (v_scoring_config ? 'p2_weight')
      or not (v_scoring_config ? 'p3_weight') then
      raise exception 'CUSTOM scoring_config must be an object with p1_weight, p2_weight, p3_weight';
    end if;

    begin
      v_p1_weight := (v_scoring_config->>'p1_weight')::numeric;
      v_p2_weight := (v_scoring_config->>'p2_weight')::numeric;
      v_p3_weight := (v_scoring_config->>'p3_weight')::numeric;
    exception when others then
      raise exception 'CUSTOM weights must be valid numeric values';
    end;

    if v_p1_weight is null
       or v_p2_weight is null
       or v_p3_weight is null then
      raise exception 'CUSTOM weights must be valid numeric values';
    end if;

    if v_p1_weight < 0 or v_p1_weight > 10
      or v_p2_weight < 0 or v_p2_weight > 10
      or v_p3_weight < 0 or v_p3_weight > 10 then
      raise exception 'CUSTOM weights must each be between 0 and 10';
    end if;

    if (v_p1_weight + v_p2_weight + v_p3_weight) <> 10 then
      raise exception 'CUSTOM weights must sum to exactly 10';
    end if;

    if v_p1_count = 0 and v_p1_weight <> 0 then
      raise exception 'CUSTOM p1_weight must be 0 when Part 1 has no questions';
    end if;
    if v_p2_count = 0 and v_p2_weight <> 0 then
      raise exception 'CUSTOM p2_weight must be 0 when Part 2 has no questions';
    end if;
    if v_p3_count = 0 and v_p3_weight <> 0 then
      raise exception 'CUSTOM p3_weight must be 0 when Part 3 has no questions';
    end if;

    v_p1_score := case when v_p1_max > 0 then (v_p1_earned / v_p1_max) * v_p1_weight else 0 end;
    v_p2_score := case when v_p2_max > 0 then (v_p2_earned / v_p2_max) * v_p2_weight else 0 end;
    v_p3_score := case when v_p3_max > 0 then (v_p3_earned / v_p3_max) * v_p3_weight else 0 end;

    v_final_score := round(v_p1_score + v_p2_score + v_p3_score, 2);
  else
    raise exception 'Unsupported assessment_type: %', v_assessment_type;
  end if;

  insert into public.ket_qua (truong_id, phong_id, hs_id, ma_de, diem, chi_tiet)
  values (v_submission.truong_id, v_submission.phong_id, v_submission.hs_id, v_submission.ma_de, v_final_score, v_details)
  on conflict (phong_id, hs_id) do update set truong_id = excluded.truong_id,
    ma_de = excluded.ma_de, diem = excluded.diem, chi_tiet = excluded.chi_tiet;

  update public.exam_submissions set status = 'graded', score = v_final_score,
    grading_details = v_details, graded_at = now(), grading_error = null, updated_at = now()
  where id = v_submission.id;
  return jsonb_build_object('status', 'graded', 'submission_id', v_submission.id,
    'score', v_final_score, 'graded_at', now());
exception when others then
  update public.exam_submissions set status = 'grading_error', grading_error = left(sqlerrm, 1000), updated_at = now()
  where id = p_submission_id;
  return jsonb_build_object('status', 'error', 'submission_id', p_submission_id, 'message', 'Grading pending.');
end;
$function$;

-- 3. REVOKE DIRECT BROWSER EXECUTE PRIVILEGES
revoke all on function public.rpc_grade_submission(uuid) from public, anon, authenticated;
