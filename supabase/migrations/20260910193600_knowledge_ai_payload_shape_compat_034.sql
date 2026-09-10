-- KNOWLEDGE-034: tolerate common Web-AI DAMSAN_KNOWLEDGE_V1 shapes at the bridge boundary.
-- The persistent knowledge_units contract remains canonical:
--   hierarchy: JSON object
--   content: JSON object/array
-- Web AI frequently returns hierarchy as an array path and content as a string.
-- Normalize those shapes before the canonical commit RPC so valid source-grounded
-- analysis is not rejected with an opaque 500 error.

create or replace function public._knowledge_normalize_ai_units(p_units jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_unit jsonb;
  v_out jsonb := '[]'::jsonb;
  v_hierarchy jsonb;
  v_content jsonb;
  v_provenance jsonb;
  v_page_start integer;
  v_page_end integer;
begin
  if p_units is null or jsonb_typeof(p_units) <> 'array' then
    return p_units;
  end if;

  for v_unit in select value from jsonb_array_elements(p_units)
  loop
    if jsonb_typeof(v_unit) <> 'object' then
      v_out := v_out || jsonb_build_array(v_unit);
      continue;
    end if;

    v_hierarchy := case jsonb_typeof(v_unit->'hierarchy')
      when 'object' then v_unit->'hierarchy'
      when 'array' then jsonb_build_object('path', v_unit->'hierarchy')
      when null then '{}'::jsonb
      else '{}'::jsonb
    end;

    v_content := case jsonb_typeof(v_unit->'content')
      when 'object' then v_unit->'content'
      when 'array' then v_unit->'content'
      when 'string' then jsonb_build_object('text', v_unit->>'content')
      else null
    end;

    v_provenance := case jsonb_typeof(v_unit->'provenance')
      when 'object' then v_unit->'provenance'
      else '{}'::jsonb
    end;

    v_page_start := null;
    v_page_end := null;

    if coalesce(v_unit->>'page_start','') ~ '^[0-9]+$' then
      v_page_start := (v_unit->>'page_start')::integer;
    elsif coalesce(v_provenance->>'page_start','') ~ '^[0-9]+$' then
      v_page_start := (v_provenance->>'page_start')::integer;
    elsif coalesce(v_provenance->>'page_number','') ~ '^[0-9]+$' then
      v_page_start := (v_provenance->>'page_number')::integer;
    end if;

    if coalesce(v_unit->>'page_end','') ~ '^[0-9]+$' then
      v_page_end := (v_unit->>'page_end')::integer;
    elsif coalesce(v_provenance->>'page_end','') ~ '^[0-9]+$' then
      v_page_end := (v_provenance->>'page_end')::integer;
    elsif coalesce(v_provenance->>'page_number','') ~ '^[0-9]+$' then
      v_page_end := (v_provenance->>'page_number')::integer;
    elsif v_page_start is not null then
      v_page_end := v_page_start;
    end if;

    v_unit := v_unit || jsonb_build_object(
      'hierarchy', v_hierarchy,
      'provenance', v_provenance
    );

    if v_content is not null then
      v_unit := v_unit || jsonb_build_object('content', v_content);
    end if;
    if v_page_start is not null then
      v_unit := v_unit || jsonb_build_object('page_start', v_page_start);
    end if;
    if v_page_end is not null then
      v_unit := v_unit || jsonb_build_object('page_end', v_page_end);
    end if;

    v_out := v_out || jsonb_build_array(v_unit);
  end loop;

  return v_out;
end;
$function$;

create or replace function public.rpc_knowledge_complete_analysis_handoff_service(
  p_capability_hash text,
  p_pipeline_version text,
  p_ai_provider text,
  p_ai_model text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row record;
  v_units jsonb;
  v_manifest jsonb;
  v_unit jsonb;
  v_unit_count integer := 0;
  v_low_confidence integer := 0;
  v_missing_provenance integer := 0;
  v_confidence numeric;
  v_extraction_quality text;
  v_unresolved_count integer := 0;
  v_quality_status text;
  v_report jsonb;
  v_commit jsonb;
begin
  if coalesce(p_capability_hash, '') !~ '^[0-9A-Fa-f]{64}$' then
    return jsonb_build_object('status','error','code','capability_invalid');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('status','error','code','payload_invalid');
  end if;
  if p_payload->>'schema_version' <> 'DAMSAN_KNOWLEDGE_V1' then
    return jsonb_build_object('status','error','code','schema_unsupported');
  end if;

  v_units := public._knowledge_normalize_ai_units(p_payload->'units');
  if v_units is null or jsonb_typeof(v_units) <> 'array' then
    return jsonb_build_object('status','error','code','units_invalid');
  end if;
  v_unit_count := jsonb_array_length(v_units);
  if v_unit_count < 1 or v_unit_count > 5000 then
    return jsonb_build_object('status','error','code','units_invalid');
  end if;

  select h.id as handoff_id, h.status as handoff_status, h.expires_at,
         h.document_id, h.job_id,
         j.status as job_status, j.current_stage,
         d.extraction_manifest
  into v_row
  from public.knowledge_ai_handoffs h
  join public.knowledge_ingestion_jobs j on j.id=h.job_id
  join public.knowledge_documents d on d.id=h.document_id
  where h.capability_hash=lower(p_capability_hash)
  for update of h, j, d;

  if v_row.handoff_id is null then
    return jsonb_build_object('status','error','code','capability_invalid');
  end if;
  if v_row.expires_at <= now() then
    update public.knowledge_ai_handoffs
    set status='EXPIRED', updated_at=now()
    where id=v_row.handoff_id and status in ('PENDING','CLAIMED');
    return jsonb_build_object('status','error','code','capability_expired');
  end if;
  if v_row.handoff_status <> 'CLAIMED' then
    return jsonb_build_object('status','error','code','capability_not_claimed');
  end if;
  if v_row.job_status <> 'RUNNING' or v_row.current_stage <> 'ANALYZE' then
    return jsonb_build_object('status','error','code','analysis_job_unavailable');
  end if;

  for v_unit in select value from jsonb_array_elements(v_units)
  loop
    if jsonb_typeof(v_unit) <> 'object' then
      return jsonb_build_object('status','error','code','unit_invalid');
    end if;

    if coalesce(btrim(v_unit->>'unit_key'),'') = '' then
      return jsonb_build_object('status','error','code','unit_key_invalid');
    end if;
    if v_unit->'content' is null or jsonb_typeof(v_unit->'content') not in ('object','array') then
      return jsonb_build_object('status','error','code','unit_content_invalid');
    end if;
    if v_unit->'hierarchy' is null or jsonb_typeof(v_unit->'hierarchy') <> 'object' then
      return jsonb_build_object('status','error','code','unit_hierarchy_invalid');
    end if;

    v_confidence := null;
    if coalesce(v_unit->>'confidence','') ~ '^[0-9]+([.][0-9]+)?$' then
      v_confidence := (v_unit->>'confidence')::numeric;
    end if;
    if v_confidence is null or v_confidence < 0.70 then
      v_low_confidence := v_low_confidence + 1;
    end if;

    if v_unit->'provenance' is null
       or jsonb_typeof(v_unit->'provenance') <> 'object'
       or v_unit->'provenance' = '{}'::jsonb then
      v_missing_provenance := v_missing_provenance + 1;
    end if;
  end loop;

  v_extraction_quality := upper(coalesce(v_row.extraction_manifest->>'quality','UNKNOWN'));
  if jsonb_typeof(coalesce(v_row.extraction_manifest->'ocr_unresolved_pages','[]'::jsonb))='array' then
    v_unresolved_count := jsonb_array_length(coalesce(v_row.extraction_manifest->'ocr_unresolved_pages','[]'::jsonb));
  end if;

  v_quality_status := case
    when v_extraction_quality='COMPLETE'
      and v_unresolved_count=0
      and v_unit_count >= 3
      and v_low_confidence * 5 <= v_unit_count
      and v_missing_provenance * 10 <= v_unit_count
    then 'AUTO_ACCEPTED'
    else 'NEEDS_REVIEW'
  end;

  v_report := jsonb_build_object(
    'validator_version','034',
    'quality_status',v_quality_status,
    'unit_count',v_unit_count,
    'low_confidence_units',v_low_confidence,
    'missing_provenance_units',v_missing_provenance,
    'extraction_quality',v_extraction_quality,
    'unresolved_ocr_pages',v_unresolved_count,
    'shape_normalization','WEB_AI_COMPAT'
  );

  v_manifest := (p_payload - 'units') || jsonb_build_object('validation',v_report);

  v_commit := public.rpc_knowledge_commit_analysis_service(
    v_row.job_id,
    coalesce(nullif(btrim(p_pipeline_version),''),'DAMSAN_KNOWLEDGE_V1'),
    nullif(btrim(p_ai_provider),''),
    nullif(btrim(p_ai_model),''),
    v_manifest,
    v_units,
    v_quality_status
  );

  if coalesce(v_commit->>'status','') <> 'success' then
    raise exception 'knowledge analysis commit failed';
  end if;

  update public.knowledge_ai_handoffs
  set status='COMPLETED', ai_provider=nullif(btrim(p_ai_provider),''),
      ai_model=nullif(btrim(p_ai_model),''), validation_report=v_report,
      completed_at=now(), updated_at=now()
  where id=v_row.handoff_id;

  return v_commit || jsonb_build_object(
    'handoff_id',v_row.handoff_id,
    'validation',v_report
  );
end;
$function$;

revoke all on function public._knowledge_normalize_ai_units(jsonb) from public, anon, authenticated;
grant execute on function public._knowledge_normalize_ai_units(jsonb) to service_role;

revoke all on function public.rpc_knowledge_complete_analysis_handoff_service(text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.rpc_knowledge_complete_analysis_handoff_service(text,text,text,text,jsonb) to service_role;
