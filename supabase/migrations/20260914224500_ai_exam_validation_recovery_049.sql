begin;

-- 049 — AI exam validation reliability / observability.
-- Keep failed Web-AI submissions retryable; persist only compact diagnostic metadata.

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
  v_quality jsonb;
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
    update public.ai_exam_requests
    set processing_error=left(v_failure::text,12000),updated_at=now()
    where id=v_row.request_id;
    return jsonb_build_object(
      'status','error','code',coalesce(v_scope_quality->>'code','knowledge_scope_quality_invalid'),
      'quality',v_scope_quality,'recoverable',true,'request_id',v_row.request_id
    );
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
    update public.ai_exam_requests
    set processing_error=left(v_failure::text,12000),updated_at=now()
    where id=v_row.request_id;
    return jsonb_build_object(
      'status','error','code',coalesce(v_quality->>'code','assessment_quality_invalid'),
      'quality',v_quality,'recoverable',true,'request_id',v_row.request_id
    );
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
    update public.ai_exam_requests
    set processing_error=left(v_failure::text,12000),updated_at=now()
    where id=v_row.request_id;
    return jsonb_build_object(
      'status','error','code',coalesce(v_authority_quality->>'code','assessment_authority_invalid'),
      'quality',v_authority_quality,'recoverable',true,'request_id',v_row.request_id
    );
  end if;

  v_validation_report:=p_validation_report || jsonb_build_object(
    'assessment_quality',v_quality,
    'knowledge_scope_quality',v_scope_quality,
    'assessment_authority_quality',v_authority_quality
  );

  select coalesce(max(revision),0)+1 into v_revision
  from public.ai_exam_drafts where request_id=v_row.request_id;

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
    'knowledge_scope_quality',v_scope_quality,'assessment_authority_quality',v_authority_quality
  );
end;
$function$;

revoke all on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) to service_role;

-- Include the compact failure diagnostic in the protected teacher request reader.
create or replace function public.rpc_ai_exam_request_read(
  p_staff_token text,
  p_ma_gv text,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_ma_gv text;
  v_quyen text;
  v_rows jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;
  select ma_gv,quyen into v_ma_gv,v_quyen from public.giao_vien where id=v_gv_id;
  if v_ma_gv is distinct from btrim(p_ma_gv) then return jsonb_build_object('status','error','code','staff_identity_mismatch'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id',r.id,'ma_phong',r.ma_phong,'truong_id',r.truong_id,'mon_id',r.mon_id,
    'exam_spec',r.exam_spec,'knowledge_document_count',cardinality(r.knowledge_document_ids),
    'status',r.status,'active_draft_revision',r.active_draft_revision,'created_at',r.created_at,'ready_at',r.ready_at,
    'published_at',r.published_at,'rejected_at',r.rejected_at,'publish_result',r.publish_result,
    'processing_error',r.processing_error,
    'draft',case when d.id is null then null else jsonb_build_object(
      'revision',d.revision,'exam_payload',d.exam_payload,'variants_payload',d.variants_payload,
      'validation_report',d.validation_report,'ai_provider',d.ai_provider,'ai_model',d.ai_model,'status',d.status,'created_at',d.created_at
    ) end
  ) order by r.created_at desc),'[]'::jsonb)
  into v_rows
  from public.ai_exam_requests r
  left join public.ai_exam_drafts d on d.request_id=r.id and d.revision=r.active_draft_revision
  where (v_quyen='Admin' or r.requested_by=v_gv_id)
    and (p_request_id is null or r.id=p_request_id);

  return jsonb_build_object('status','success','requests',v_rows);
end;
$function$;

revoke all on function public.rpc_ai_exam_request_read(text,text,uuid) from public;
grant execute on function public.rpc_ai_exam_request_read(text,text,uuid) to anon,authenticated;

commit;
