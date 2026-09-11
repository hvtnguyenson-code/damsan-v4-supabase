begin;

-- 039A — deliver rule/benchmark sources as a separate authority pack.
-- These units influence HOW an exam is written, never WHAT factual content may be tested.
create or replace function public.rpc_ai_exam_authority_pack_service(
  p_request_id uuid,
  p_offset integer default 0,
  p_limit integer default 80
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_profile_id text;
  v_source_state text;
  v_offset integer;
  v_limit integer;
  v_total integer;
  v_units jsonb;
begin
  select r.id,
         r.mon_id,
         (r.exam_spec->>'grade')::smallint as grade,
         r.exam_spec #>> '{assessment_authority,profile_id}' as profile_id,
         r.exam_spec #>> '{assessment_authority,source_state}' as source_state
  into v_request
  from public.ai_exam_requests r
  where r.id=p_request_id;

  if v_request.id is null then raise exception 'exam request not found'; end if;
  v_profile_id:=nullif(btrim(coalesce(v_request.profile_id,'')),'');
  v_source_state:=coalesce(nullif(btrim(v_request.source_state),''),'NONE');
  v_offset:=greatest(coalesce(p_offset,0),0);
  v_limit:=least(greatest(coalesce(p_limit,80),1),120);

  if v_profile_id is null then
    return jsonb_build_object(
      'status','success','request_id',p_request_id,'profile_id',null,'source_state','NONE',
      'offset',v_offset,'limit',v_limit,'total_units',0,'units','[]'::jsonb,
      'has_more',false,'next_offset',null
    );
  end if;

  select count(*)::integer
  into v_total
  from public.assessment_profile_sources s
  join public.knowledge_documents d on d.id=s.document_id
  join public.knowledge_units u on u.document_id=d.id and u.revision=d.active_revision
  where s.profile_id=v_profile_id
    and d.active_revision is not null
    and d.mon_id is not distinct from v_request.mon_id
    and d.grade=v_request.grade
    and d.source_role=s.source_kind
    and u.is_usable=true
    and (
      (s.source_kind='ASSESSMENT_RULE' and u.unit_type='ASSESSMENT_RULE')
      or (s.source_kind='ASSESSMENT_BENCHMARK' and u.unit_type='BENCHMARK_PATTERN')
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id',x.profile_id,
    'source_kind',x.source_kind,
    'authority_rank',x.authority_rank,
    'authority_code',x.authority_code,
    'document_id',x.document_id,
    'document_title',x.document_title,
    'unit_key',x.unit_key,
    'unit_type',x.unit_type,
    'ordinal_no',x.ordinal_no,
    'page_start',x.page_start,
    'page_end',x.page_end,
    'content',x.content,
    'provenance',x.provenance,
    'confidence',x.confidence
  ) order by x.authority_rank,x.document_title,x.ordinal_no,x.unit_id),'[]'::jsonb)
  into v_units
  from (
    select s.profile_id,s.source_kind,s.authority_rank,s.authority_code,
           d.id document_id,d.title document_title,
           u.id unit_id,u.unit_key,u.unit_type,u.ordinal_no,u.page_start,u.page_end,u.content,u.provenance,u.confidence
    from public.assessment_profile_sources s
    join public.knowledge_documents d on d.id=s.document_id
    join public.knowledge_units u on u.document_id=d.id and u.revision=d.active_revision
    where s.profile_id=v_profile_id
      and d.active_revision is not null
      and d.mon_id is not distinct from v_request.mon_id
      and d.grade=v_request.grade
      and d.source_role=s.source_kind
      and u.is_usable=true
      and (
        (s.source_kind='ASSESSMENT_RULE' and u.unit_type='ASSESSMENT_RULE')
        or (s.source_kind='ASSESSMENT_BENCHMARK' and u.unit_type='BENCHMARK_PATTERN')
      )
    order by s.authority_rank,d.title,u.ordinal_no,u.id
    offset v_offset limit v_limit
  ) x;

  return jsonb_build_object(
    'status','success',
    'request_id',p_request_id,
    'profile_id',v_profile_id,
    'source_state',v_source_state,
    'offset',v_offset,
    'limit',v_limit,
    'total_units',v_total,
    'units',v_units,
    'has_more',(v_offset+jsonb_array_length(v_units))<v_total,
    'next_offset',case when (v_offset+jsonb_array_length(v_units))<v_total then v_offset+jsonb_array_length(v_units) else null end
  );
end;
$$;

revoke all on function public.rpc_ai_exam_authority_pack_service(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.rpc_ai_exam_authority_pack_service(uuid,integer,integer) to service_role;

commit;
