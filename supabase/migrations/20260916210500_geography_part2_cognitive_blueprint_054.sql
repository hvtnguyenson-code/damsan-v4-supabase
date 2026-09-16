begin;

-- 054 — Geography Part II cognitive blueprint.
-- Each 4-statement T/F cluster must declare at least two cognitive levels.
-- Statement length is intentionally NOT balanced like Part I.

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '{
    "id":"DIA_LI_TNTHPT_2025_PLUS_V1",
    "version":"054",
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
set profile_version='054',
    profile=jsonb_set(
      jsonb_set(
        profile,
        '{version}',
        '"054"'::jsonb,
        true
      ),
      '{rules,part2}',
      coalesce(profile #> '{rules,part2}','{}'::jsonb) || '{
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
      }'::jsonb,
      true
    ),
    updated_at=now()
where profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

create or replace function public._ai_exam_part2_blueprint_054(
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
  v_levels jsonb;
  v_idx integer := 0;
  v_p2_count integer := 0;
  v_level_a text;
  v_level_b text;
  v_level_c text;
  v_level_d text;
  v_distinct integer;
  v_highest text;
  v_question_level text;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  select r.exam_spec #>> '{assessment_standard,id}'
  into v_standard_id
  from public.ai_exam_requests r
  where r.id=p_request_id;

  if v_standard_id is distinct from 'DIA_LI_TNTHPT_2025_PLUS_V1' then
    return jsonb_build_object('valid',true,'applied',false,'quality_gate_version','054');
  end if;

  if p_exam_payload is null or jsonb_typeof(p_exam_payload)<>'object'
     or jsonb_typeof(p_exam_payload->'questions')<>'array' then
    return jsonb_build_object(
      'valid',false,'applied',true,'code','quality_questions_invalid',
      'errors',jsonb_build_array(jsonb_build_object('code','quality_questions_invalid')),
      'quality_gate_version','054'
    );
  end if;

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx:=v_idx+1;
    v_part:=btrim(coalesce(v_q->>'phan',''));
    if v_part<>'2' then continue; end if;
    v_p2_count:=v_p2_count+1;
    v_levels:=v_q->'statement_levels';

    if v_levels is null or jsonb_typeof(v_levels)<>'object' then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'part2_no',v_p2_count,
        'code','quality_part2_statement_levels_required',
        'message','Phần II phải khai báo statement_levels cho đủ A/B/C/D.'
      ));
      continue;
    end if;

    v_level_a:=upper(btrim(coalesce(v_levels->>'A','')));
    v_level_b:=upper(btrim(coalesce(v_levels->>'B','')));
    v_level_c:=upper(btrim(coalesce(v_levels->>'C','')));
    v_level_d:=upper(btrim(coalesce(v_levels->>'D','')));

    if v_level_a not in ('NB','TH','VD')
       or v_level_b not in ('NB','TH','VD')
       or v_level_c not in ('NB','TH','VD')
       or v_level_d not in ('NB','TH','VD') then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'part2_no',v_p2_count,
        'code','quality_part2_statement_level_invalid',
        'message','Mỗi mức của A/B/C/D chỉ được là NB, TH hoặc VD.',
        'statement_levels',v_levels
      ));
      continue;
    end if;

    select count(distinct x)
    into v_distinct
    from unnest(array[v_level_a,v_level_b,v_level_c,v_level_d]) x;

    if v_distinct<2 then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'part2_no',v_p2_count,
        'code','quality_part2_cognitive_mix_insufficient',
        'message','Bốn lệnh Phần II phải chứa ít nhất hai mức độ tư duy.',
        'statement_levels',v_levels
      ));
    end if;

    v_highest:=case
      when 'VD'=any(array[v_level_a,v_level_b,v_level_c,v_level_d]) then 'VD'
      when 'TH'=any(array[v_level_a,v_level_b,v_level_c,v_level_d]) then 'TH'
      else 'NB'
    end;
    v_question_level:=upper(btrim(coalesce(v_q->>'muc_do','')));
    if v_question_level<>v_highest then
      v_warnings:=v_warnings || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'part2_no',v_p2_count,
        'code','part2_question_level_not_highest_statement_level',
        'declared_question_level',v_question_level,
        'expected_question_level',v_highest
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'valid',jsonb_array_length(v_errors)=0,
    'applied',true,
    'code',case when jsonb_array_length(v_errors)>0 then 'quality_batch_invalid' else null end,
    'errors',v_errors,
    'warnings',v_warnings,
    'part2_question_count',v_p2_count,
    'quality_gate_version','054'
  );
end;
$$;

revoke all on function public._ai_exam_part2_blueprint_054(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_part2_blueprint_054(uuid,jsonb) to service_role;

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
  v_p2_quality jsonb;
  v_scope_quality jsonb;
  v_authority_quality jsonb;
  v_validation_report jsonb;
  v_failure jsonb;
begin
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if p_exam_payload is null or jsonb_typeof(p_exam_payload)<>'object' or p_exam_payload->>'schema_version'<>'DAMSAN_EXAM_V1' then return jsonb_build_object('status','error','code','exam_payload_invalid'); end if;
  if p_variants_payload is null or jsonb_typeof(p_variants_payload)<>'array' or jsonb_array_length(p_variants_payload)<1 then return jsonb_build_object('status','error','code','variants_payload_invalid'); end if;
  if p_validation_report is null or jsonb_typeof(p_validation_report)<>'object' then return jsonb_build_object('status','error','code','validation_report_invalid'); end if;
  if coalesce((p_validation_report->>'valid')::boolean,false) is not true then return jsonb_build_object('status','error','code','draft_not_validated'); end if;

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

  v_scope_quality:=public._ai_exam_scope_quality_gate_036(v_row.request_id,p_exam_payload);
  if coalesce((v_scope_quality->>'valid')::boolean,false) is not true then
    v_failure:=jsonb_build_object(
      'schema_version','DAMSAN_AI_VALIDATION_FAILURE_V1',
      'stage','KNOWLEDGE_SCOPE',
      'code',coalesce(v_scope_quality->>'code','knowledge_scope_quality_invalid'),
      'quality',v_scope_quality,
      'recoverable',true,
      'recorded_at',now()
    );
    update public.ai_exam_requests set processing_error=left(v_failure::text,12000),updated_at=now() where id=v_row.request_id;
    return jsonb_build_object('status','error','code',coalesce(v_scope_quality->>'code','knowledge_scope_quality_invalid'),'quality',v_scope_quality,'recoverable',true,'request_id',v_row.request_id);
  end if;

  v_quality:=public._ai_exam_quality_gate_037(v_row.request_id,p_exam_payload);
  if coalesce((v_quality->>'valid')::boolean,false) is not true then
    v_failure:=jsonb_build_object(
      'schema_version','DAMSAN_AI_VALIDATION_FAILURE_V1',
      'stage','ASSESSMENT_QUALITY',
      'code',coalesce(v_quality->>'code','assessment_quality_invalid'),
      'quality',v_quality,
      'recoverable',true,
      'recorded_at',now()
    );
    update public.ai_exam_requests set processing_error=left(v_failure::text,12000),updated_at=now() where id=v_row.request_id;
    return jsonb_build_object('status','error','code',coalesce(v_quality->>'code','assessment_quality_invalid'),'quality',v_quality,'recoverable',true,'request_id',v_row.request_id);
  end if;

  v_p2_quality:=public._ai_exam_part2_blueprint_054(v_row.request_id,p_exam_payload);
  if coalesce((v_p2_quality->>'valid')::boolean,false) is not true then
    v_failure:=jsonb_build_object(
      'schema_version','DAMSAN_AI_VALIDATION_FAILURE_V1',
      'stage','ASSESSMENT_BLUEPRINT',
      'code',coalesce(v_p2_quality->>'code','part2_blueprint_invalid'),
      'quality',v_p2_quality,
      'recoverable',true,
      'recorded_at',now()
    );
    update public.ai_exam_requests set processing_error=left(v_failure::text,12000),updated_at=now() where id=v_row.request_id;
    return jsonb_build_object('status','error','code',coalesce(v_p2_quality->>'code','part2_blueprint_invalid'),'quality',v_p2_quality,'recoverable',true,'request_id',v_row.request_id);
  end if;

  v_authority_quality:=public._ai_exam_authority_gate_039(v_row.request_id,p_exam_payload);
  if coalesce((v_authority_quality->>'valid')::boolean,false) is not true then
    v_failure:=jsonb_build_object(
      'schema_version','DAMSAN_AI_VALIDATION_FAILURE_V1',
      'stage','ASSESSMENT_AUTHORITY',
      'code',coalesce(v_authority_quality->>'code','assessment_authority_invalid'),
      'quality',v_authority_quality,
      'recoverable',true,
      'recorded_at',now()
    );
    update public.ai_exam_requests set processing_error=left(v_failure::text,12000),updated_at=now() where id=v_row.request_id;
    return jsonb_build_object('status','error','code',coalesce(v_authority_quality->>'code','assessment_authority_invalid'),'quality',v_authority_quality,'recoverable',true,'request_id',v_row.request_id);
  end if;

  v_validation_report:=p_validation_report || jsonb_build_object(
    'assessment_quality',v_quality,
    'part2_blueprint_quality',v_p2_quality,
    'knowledge_scope_quality',v_scope_quality,
    'assessment_authority_quality',v_authority_quality
  );

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
    'request_status','READY_FOR_REVIEW','quality',v_quality,
    'part2_blueprint_quality',v_p2_quality,
    'knowledge_scope_quality',v_scope_quality,'assessment_authority_quality',v_authority_quality
  );
end;
$$;

revoke all on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) to service_role;

commit;
