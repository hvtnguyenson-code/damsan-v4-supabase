-- AI-EXAM-031B2: preserve teacher-authored scoring configuration through the
-- web-AI draft boundary. AI may generate questions, but it may not silently alter
-- the authoritative scoring_config frozen in the request exam_spec.

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
as $function$
declare
  v_row record;
  v_revision integer;
  v_expected_profile text;
  v_actual_profile text;
  v_expected_scoring jsonb;
  v_actual_scoring jsonb;
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

  select h.id handoff_id,h.status handoff_status,h.expires_at,h.request_id,
         r.status request_status,r.exam_spec
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

  v_expected_profile := upper(btrim(coalesce(v_row.exam_spec->>'assessment_type','')));
  v_actual_profile := upper(btrim(coalesce(p_exam_payload->>'assessment_type','')));
  if v_expected_profile='' or v_actual_profile is distinct from v_expected_profile then
    return jsonb_build_object('status','error','code','assessment_type_mismatch');
  end if;

  if v_row.exam_spec ? 'scoring_config' then
    if jsonb_typeof(v_row.exam_spec->'scoring_config') <> 'object' then
      return jsonb_build_object('status','error','code','request_scoring_config_invalid');
    end if;
    v_expected_scoring := v_row.exam_spec->'scoring_config';
    v_actual_scoring := coalesce(p_exam_payload->'scoring_config','{}'::jsonb);
    if jsonb_typeof(v_actual_scoring) <> 'object' or v_actual_scoring is distinct from v_expected_scoring then
      return jsonb_build_object('status','error','code','scoring_config_mismatch');
    end if;
  end if;

  select coalesce(max(revision),0)+1 into v_revision
  from public.ai_exam_drafts where request_id=v_row.request_id;

  update public.ai_exam_drafts set status='SUPERSEDED'
  where request_id=v_row.request_id and status='VALIDATED';

  insert into public.ai_exam_drafts(
    request_id,revision,ai_provider,ai_model,exam_payload,variants_payload,validation_report,status
  ) values (
    v_row.request_id,v_revision,nullif(btrim(p_ai_provider),''),nullif(btrim(p_ai_model),''),
    p_exam_payload,p_variants_payload,p_validation_report,'VALIDATED'
  );

  update public.ai_exam_requests
  set status='READY_FOR_REVIEW',active_draft_revision=v_revision,ready_at=now(),processing_error=null,updated_at=now()
  where id=v_row.request_id;

  update public.ai_exam_handoffs
  set status='COMPLETED',ai_provider=nullif(btrim(p_ai_provider),''),ai_model=nullif(btrim(p_ai_model),''),completed_at=now(),updated_at=now()
  where id=v_row.handoff_id;

  return jsonb_build_object('status','success','request_id',v_row.request_id,'revision',v_revision,'request_status','READY_FOR_REVIEW');
end;
$function$;

revoke all on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) to service_role;
