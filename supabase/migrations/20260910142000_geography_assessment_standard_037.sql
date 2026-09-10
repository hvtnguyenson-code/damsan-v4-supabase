begin;

-- 037 — Geography TNTHPT 2025+ assessment profile.
-- The profile is injected server-side from the selected subject so browser clients cannot spoof it.

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '{
    "id":"DIA_LI_TNTHPT_2025_PLUS_V1",
    "version":"037",
    "authority_order":["BGDDT_FORMAT_RULE","BGDDT_REFERENCE_EXAM","BGDDT_OFFICIAL_EXAM","PROVINCIAL_MOCK_BENCHMARK"],
    "official_full_blueprint":{"p1":18,"p2":4,"p3":6,"minutes":50,"p1_points":4.5,"p2_points":4.0,"p3_points":1.5},
    "p2_scoring":{"1_correct":0.1,"2_correct":0.25,"3_correct":0.5,"4_correct":1.0},
    "benchmark_policy":"STYLE_ONLY_NO_COPY",
    "model_knowledge_policy":"FORBIDDEN",
    "part1":{"single_key":true,"homogeneous_options":true,"plausible_distractors":true,"avoid_answer_length_clues":true,"avoid_double_negative":true},
    "part2":{"shared_stimulus_required":true,"statement_count":4,"independent_statements":true,"mixed_cognitive_demand":true,"all_same_truth_pattern_forbidden":true},
    "part3":{"numeric_answer_required":true,"single_numeric_result":true,"source_sufficient_data":true,"unit_required":true,"rounding_instruction_required":true,"recompute_before_output":true},
    "metadata":{"muc_do_required":["NB","TH","VD"],"source_refs_required":true,"bai_hoc_required":true}
  }'::jsonb;
$$;

create or replace function public._ai_exam_apply_assessment_standard_037()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_profile text;
begin
  select lower(btrim(m.ten_mon)) into v_subject
  from public.mon_hoc m
  where m.id = new.mon_id;

  v_profile := upper(coalesce(new.exam_spec->>'assessment_type',''));

  if v_subject in ('địa lí','địa lý') and v_profile in ('TOT_NGHIEP','MCQ_ONLY','TRUE_FALSE_ONLY','SHORT_ONLY','CUSTOM') then
    new.exam_spec := coalesce(new.exam_spec,'{}'::jsonb)
      || jsonb_build_object('assessment_standard', public._ai_exam_geography_standard_037());
  else
    new.exam_spec := coalesce(new.exam_spec,'{}'::jsonb) - 'assessment_standard';
  end if;

  return new;
end;
$$;

revoke all on function public._ai_exam_geography_standard_037() from public, anon, authenticated;
revoke all on function public._ai_exam_apply_assessment_standard_037() from public, anon, authenticated;

drop trigger if exists trg_ai_exam_requests_assessment_standard_037 on public.ai_exam_requests;
create trigger trg_ai_exam_requests_assessment_standard_037
before insert or update of mon_id, exam_spec on public.ai_exam_requests
for each row execute function public._ai_exam_apply_assessment_standard_037();

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
begin
  select r.exam_spec #>> '{assessment_standard,id}' into v_standard_id
  from public.ai_exam_requests r
  where r.id = p_request_id;

  if v_standard_id is distinct from 'DIA_LI_TNTHPT_2025_PLUS_V1' then
    return jsonb_build_object('valid',true,'applied',false,'quality_gate_version','037');
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
      if btrim(coalesce(v_q->>'dap_an_dung','')) !~ '^-?[0-9]+([\.,][0-9]+)?$' then
        return jsonb_build_object('valid',false,'code','quality_part3_numeric_answer_invalid','question_no',v_idx);
      end if;
      if v_stem !~ '[0-9]' then
        return jsonb_build_object('valid',false,'code','quality_part3_numeric_data_invalid','question_no',v_idx);
      end if;
      if lower(v_stem) !~ '(làm tròn|lấy kết quả|kết quả đến|đến hàng|chữ số thập phân)' then
        return jsonb_build_object('valid',false,'code','quality_part3_rounding_invalid','question_no',v_idx);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'valid',true,
    'applied',true,
    'assessment_standard','DIA_LI_TNTHPT_2025_PLUS_V1',
    'quality_gate_version','037',
    'warnings',v_warnings
  );
end;
$$;

revoke all on function public._ai_exam_quality_gate_037(uuid,jsonb) from public, anon, authenticated;

create or replace function public.rpc_ai_exam_store_draft_service(
  p_capability_hash text,
  p_ai_provider text,
  p_ai_model text,
  p_exam_payload jsonb,
  p_variants_payload jsonb,
  p_validation_report jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_revision integer;
  v_quality jsonb;
  v_validation_report jsonb;
begin
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then
    return jsonb_build_object('status','error','code','capability_invalid');
  end if;
  if p_exam_payload is null or jsonb_typeof(p_exam_payload)<>'object' or p_exam_payload->>'schema_version'<>'DAMSAN_EXAM_V1' then
    return jsonb_build_object('status','error','code','exam_payload_invalid');
  end if;
  if p_variants_payload is null or jsonb_typeof(p_variants_payload)<>'array' or jsonb_array_length(p_variants_payload)<1 then
    return jsonb_build_object('status','error','code','variants_payload_invalid');
  end if;
  if p_validation_report is null or jsonb_typeof(p_validation_report)<>'object' then
    return jsonb_build_object('status','error','code','validation_report_invalid');
  end if;
  if coalesce((p_validation_report->>'valid')::boolean,false) is not true then
    return jsonb_build_object('status','error','code','draft_not_validated');
  end if;

  select h.id handoff_id,h.status handoff_status,h.expires_at,h.request_id,r.status request_status
  into v_row
  from public.ai_exam_handoffs h
  join public.ai_exam_requests r on r.id=h.request_id
  where h.capability_hash=lower(p_capability_hash)
  for update of h,r;

  if v_row.handoff_id is null then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if v_row.expires_at<=now() then
    update public.ai_exam_handoffs set status='EXPIRED',updated_at=now() where id=v_row.handoff_id;
    return jsonb_build_object('status','error','code','capability_expired');
  end if;
  if v_row.handoff_status<>'CLAIMED' then return jsonb_build_object('status','error','code','capability_not_claimed'); end if;
  if v_row.request_status<>'AI_WORKING' then return jsonb_build_object('status','error','code','exam_request_unavailable'); end if;

  v_quality := public._ai_exam_quality_gate_037(v_row.request_id,p_exam_payload);
  if coalesce((v_quality->>'valid')::boolean,false) is not true then
    return jsonb_build_object(
      'status','error',
      'code',coalesce(v_quality->>'code','assessment_quality_invalid'),
      'quality',v_quality
    );
  end if;
  v_validation_report := p_validation_report || jsonb_build_object('assessment_quality',v_quality);

  select coalesce(max(revision),0)+1 into v_revision from public.ai_exam_drafts where request_id=v_row.request_id;
  update public.ai_exam_drafts set status='SUPERSEDED'
  where request_id=v_row.request_id and status='VALIDATED';

  insert into public.ai_exam_drafts(
    request_id,revision,ai_provider,ai_model,exam_payload,variants_payload,validation_report,status
  ) values (
    v_row.request_id,v_revision,nullif(btrim(p_ai_provider),''),nullif(btrim(p_ai_model),''),
    p_exam_payload,p_variants_payload,v_validation_report,'VALIDATED'
  );

  update public.ai_exam_requests
  set status='READY_FOR_REVIEW',active_draft_revision=v_revision,ready_at=now(),processing_error=null,updated_at=now()
  where id=v_row.request_id;
  update public.ai_exam_handoffs
  set status='COMPLETED',ai_provider=nullif(btrim(p_ai_provider),''),ai_model=nullif(btrim(p_ai_model),''),completed_at=now(),updated_at=now()
  where id=v_row.handoff_id;

  return jsonb_build_object(
    'status','success','request_id',v_row.request_id,'revision',v_revision,
    'request_status','READY_FOR_REVIEW','quality',v_quality
  );
end;
$$;

revoke all on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) to service_role;

commit;
