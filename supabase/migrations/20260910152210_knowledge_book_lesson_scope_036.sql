begin;

create or replace function public._knowledge_scope_key_036(
  p_lesson_code text,
  p_lesson_title text,
  p_hierarchy jsonb
) returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_root text;
begin
  if nullif(btrim(p_lesson_code),'') is not null then
    return 'CODE:' || lower(regexp_replace(btrim(p_lesson_code),'[[:space:]]+',' ','g'));
  end if;
  if nullif(btrim(p_lesson_title),'') is not null then
    return 'TITLE:' || lower(regexp_replace(btrim(p_lesson_title),'[[:space:]]+',' ','g'));
  end if;
  if jsonb_typeof(coalesce(p_hierarchy,'{}'::jsonb))='object'
     and jsonb_typeof(p_hierarchy->'path')='array' then
    select btrim(t.value) into v_root
    from jsonb_array_elements_text(p_hierarchy->'path') with ordinality as t(value,ord)
    where btrim(t.value) ~* '^bài[[:space:]]+[0-9ivxlcdm]+'
    order by t.ord
    limit 1;
    if nullif(v_root,'') is not null then
      return 'HIER:' || lower(regexp_replace(v_root,'[[:space:]]+',' ','g'));
    end if;
  end if;
  return '__DOCUMENT__';
end;
$$;

create or replace function public._knowledge_scope_title_036(
  p_lesson_code text,
  p_lesson_title text,
  p_hierarchy jsonb
) returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_root text;
begin
  if nullif(btrim(p_lesson_title),'') is not null then return regexp_replace(btrim(p_lesson_title),'[[:space:]]+',' ','g'); end if;
  if jsonb_typeof(coalesce(p_hierarchy,'{}'::jsonb))='object'
     and jsonb_typeof(p_hierarchy->'path')='array' then
    select btrim(t.value) into v_root
    from jsonb_array_elements_text(p_hierarchy->'path') with ordinality as t(value,ord)
    where btrim(t.value) ~* '^bài[[:space:]]+[0-9ivxlcdm]+'
    order by t.ord
    limit 1;
    if nullif(v_root,'') is not null then return regexp_replace(v_root,'[[:space:]]+',' ','g'); end if;
  end if;
  if nullif(btrim(p_lesson_code),'') is not null then return btrim(p_lesson_code); end if;
  return 'Nội dung toàn tài liệu';
end;
$$;

revoke all on function public._knowledge_scope_key_036(text,text,jsonb) from public, anon, authenticated;
revoke all on function public._knowledge_scope_title_036(text,text,jsonb) from public, anon, authenticated;

create or replace function public.rpc_knowledge_scope_catalog_read(
  p_staff_token text,
  p_ma_gv text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_actor record;
  v_doc record;
  v_lessons jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_lesson_count integer;
  v_unscoped_count integer;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.');
  end if;

  select gv.id, gv.ma_gv, gv.quyen, gv.truong_id, gv.mon_id
  into v_actor
  from public.giao_vien gv
  where gv.id=v_gv_id
  limit 1;

  if v_actor.id is null or v_actor.ma_gv <> trim(p_ma_gv) then
    return jsonb_build_object('status','error','code','staff_identity_mismatch','message','Tài khoản không khớp phiên làm việc.');
  end if;

  for v_doc in
    select d.id,d.truong_id,d.mon_id,d.grade,d.title,d.original_filename,d.document_type,d.source_format,
           d.active_revision,d.page_count,d.created_at
    from public.knowledge_documents d
    where d.active_revision is not null
      and (v_actor.quyen='Admin' or d.owner_gv_id=v_gv_id)
    order by d.created_at desc,d.id desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'scope_key',q.scope_key,
      'lesson_title',q.scope_title,
      'page_start',q.page_start,
      'page_end',q.page_end,
      'unit_count',q.unit_count
    ) order by q.first_ordinal,q.scope_key),'[]'::jsonb), count(*)::integer
    into v_lessons,v_lesson_count
    from (
      select x.scope_key,
             min(x.scope_title) as scope_title,
             min(x.page_start) filter (where x.page_start is not null) as page_start,
             max(x.page_end) filter (where x.page_end is not null) as page_end,
             count(*)::integer as unit_count,
             min(x.ordinal_no) as first_ordinal
      from (
        select public._knowledge_scope_key_036(u.lesson_code,u.lesson_title,u.hierarchy) as scope_key,
               public._knowledge_scope_title_036(u.lesson_code,u.lesson_title,u.hierarchy) as scope_title,
               u.page_start,u.page_end,u.ordinal_no
        from public.knowledge_units u
        where u.document_id=v_doc.id
          and u.revision=v_doc.active_revision
          and u.is_usable=true
      ) x
      where x.scope_key <> '__DOCUMENT__'
      group by x.scope_key
    ) q;

    select count(*)::integer into v_unscoped_count
    from public.knowledge_units u
    where u.document_id=v_doc.id
      and u.revision=v_doc.active_revision
      and u.is_usable=true
      and public._knowledge_scope_key_036(u.lesson_code,u.lesson_title,u.hierarchy)='__DOCUMENT__';

    v_documents := v_documents || jsonb_build_array(jsonb_build_object(
      'id',v_doc.id,
      'truong_id',v_doc.truong_id,
      'mon_id',v_doc.mon_id,
      'grade',v_doc.grade,
      'title',v_doc.title,
      'original_filename',v_doc.original_filename,
      'document_type',v_doc.document_type,
      'source_format',v_doc.source_format,
      'active_revision',v_doc.active_revision,
      'page_count',v_doc.page_count,
      'lesson_count',coalesce(v_lesson_count,0),
      'lesson_scopes',coalesce(v_lessons,'[]'::jsonb),
      'unscoped_unit_count',coalesce(v_unscoped_count,0),
      'scope_mode',case when coalesce(v_lesson_count,0)>0 then 'LESSON_AWARE' else 'DOCUMENT_ONLY' end
    ));
  end loop;

  return jsonb_build_object('status','success','schema_version','DAMSAN_KNOWLEDGE_SCOPE_CATALOG_V1','documents',v_documents);
end;
$$;

revoke all on function public.rpc_knowledge_scope_catalog_read(text,text) from public;
grant execute on function public.rpc_knowledge_scope_catalog_read(text,text) to anon, authenticated;

create or replace function public._ai_exam_normalize_scope_036(
  p_scope jsonb,
  p_docs uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_key_json jsonb;
  v_doc_id uuid;
  v_mode text;
  v_key text;
  v_keys jsonb;
  v_items jsonb := '[]'::jsonb;
  v_seen uuid[] := array[]::uuid[];
  v_exists boolean;
begin
  if p_docs is null or cardinality(p_docs)=0 then raise exception 'knowledge scope requires documents'; end if;

  if p_scope is null then
    select jsonb_build_object(
      'schema_version','DAMSAN_KNOWLEDGE_SCOPE_V1',
      'items',coalesce(jsonb_agg(jsonb_build_object('document_id',x.doc_id,'mode','ALL','scope_keys','[]'::jsonb) order by x.ord),'[]'::jsonb)
    )
    into v_items
    from unnest(p_docs) with ordinality as x(doc_id,ord);
    return v_items;
  end if;

  if jsonb_typeof(p_scope)<>'object' or p_scope->>'schema_version'<>'DAMSAN_KNOWLEDGE_SCOPE_V1'
     or jsonb_typeof(p_scope->'items')<>'array' or jsonb_array_length(p_scope->'items')<1 then
    raise exception 'knowledge_scope_invalid';
  end if;

  for v_item in select value from jsonb_array_elements(p_scope->'items') loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'knowledge_scope_item_invalid'; end if;
    begin
      v_doc_id := (v_item->>'document_id')::uuid;
    exception when others then
      raise exception 'knowledge_scope_document_invalid';
    end;
    if array_position(p_docs,v_doc_id) is null or array_position(v_seen,v_doc_id) is not null then
      raise exception 'knowledge_scope_document_invalid';
    end if;
    v_seen := array_append(v_seen,v_doc_id);
    v_mode := upper(coalesce(nullif(btrim(v_item->>'mode'),''),'ALL'));
    if v_mode not in ('ALL','LESSONS') then raise exception 'knowledge_scope_mode_invalid'; end if;

    v_keys := '[]'::jsonb;
    if v_mode='LESSONS' then
      if jsonb_typeof(v_item->'scope_keys')<>'array' or jsonb_array_length(v_item->'scope_keys')<1
         or jsonb_array_length(v_item->'scope_keys')>200 then
        raise exception 'knowledge_scope_keys_invalid';
      end if;
      for v_key_json in select value from jsonb_array_elements(v_item->'scope_keys') loop
        if jsonb_typeof(v_key_json)<>'string' then raise exception 'knowledge_scope_keys_invalid'; end if;
        v_key := btrim(v_key_json #>> '{}');
        if v_key='' or length(v_key)>700 then raise exception 'knowledge_scope_keys_invalid'; end if;
        if not (v_keys ? v_key) then v_keys := v_keys || jsonb_build_array(v_key); end if;
      end loop;

      for v_key in select value from jsonb_array_elements_text(v_keys) loop
        select exists(
          select 1
          from public.knowledge_units u
          join public.knowledge_documents d on d.id=u.document_id
          where u.document_id=v_doc_id
            and d.active_revision is not null
            and u.revision=d.active_revision
            and u.is_usable=true
            and public._knowledge_scope_key_036(u.lesson_code,u.lesson_title,u.hierarchy)=v_key
        ) into v_exists;
        if not v_exists then raise exception 'knowledge_scope_key_unavailable'; end if;
      end loop;
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'document_id',v_doc_id,
      'mode',v_mode,
      'scope_keys',v_keys
    ));
  end loop;

  if cardinality(v_seen)<>cardinality(p_docs) then raise exception 'knowledge_scope_document_mismatch'; end if;
  return jsonb_build_object('schema_version','DAMSAN_KNOWLEDGE_SCOPE_V1','items',v_items);
end;
$$;

create or replace function public._ai_exam_scope_allows_unit_036(
  p_scope jsonb,
  p_document_id uuid,
  p_lesson_code text,
  p_lesson_title text,
  p_hierarchy jsonb
) returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_item jsonb;
  v_key text;
begin
  if p_scope is null then return true; end if;
  if jsonb_typeof(p_scope)<>'object' or p_scope->>'schema_version'<>'DAMSAN_KNOWLEDGE_SCOPE_V1'
     or jsonb_typeof(p_scope->'items')<>'array' then return false; end if;
  v_key := public._knowledge_scope_key_036(p_lesson_code,p_lesson_title,p_hierarchy);
  for v_item in select value from jsonb_array_elements(p_scope->'items') loop
    if v_item->>'document_id'=p_document_id::text then
      if upper(coalesce(v_item->>'mode',''))='ALL' then return true; end if;
      if upper(coalesce(v_item->>'mode',''))='LESSONS'
         and jsonb_typeof(v_item->'scope_keys')='array'
         and (v_item->'scope_keys' ? v_key) then return true; end if;
      return false;
    end if;
  end loop;
  return false;
end;
$$;

revoke all on function public._ai_exam_normalize_scope_036(jsonb,uuid[]) from public, anon, authenticated;
revoke all on function public._ai_exam_scope_allows_unit_036(jsonb,uuid,text,text,jsonb) from public, anon, authenticated;

create or replace function public.rpc_ai_exam_create_request_service(
  p_requested_by uuid,
  p_truong_id uuid,
  p_mon_id uuid,
  p_ma_phong text,
  p_exam_spec jsonb,
  p_knowledge_document_ids uuid[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_effective_truong_id uuid;
  v_effective_mon_id uuid;
  v_docs uuid[];
  v_requested_count integer := 0;
  v_valid_count integer := 0;
  v_request_id uuid;
  v_profile text;
  v_variant_count integer;
  v_scope jsonb;
begin
  if p_exam_spec is null or jsonb_typeof(p_exam_spec)<>'object' then raise exception 'exam_spec must be an object'; end if;
  if nullif(btrim(p_ma_phong),'') is null then raise exception 'room code is required'; end if;

  select id,truong_id,mon_id,quyen into v_actor from public.giao_vien where id=p_requested_by limit 1;
  if v_actor.id is null or v_actor.truong_id is null then raise exception 'teacher not found'; end if;

  if v_actor.quyen='Admin' then
    if p_truong_id is null or p_mon_id is null then raise exception 'admin target scope is required'; end if;
    v_effective_truong_id:=p_truong_id; v_effective_mon_id:=p_mon_id;
  else
    if p_truong_id is distinct from v_actor.truong_id or v_actor.mon_id is null or p_mon_id is distinct from v_actor.mon_id then
      raise exception 'teacher target scope mismatch';
    end if;
    v_effective_truong_id:=v_actor.truong_id; v_effective_mon_id:=v_actor.mon_id;
  end if;

  v_profile:=upper(coalesce(nullif(btrim(p_exam_spec->>'assessment_type'),''),'TOT_NGHIEP'));
  if v_profile not in ('LEGACY','TOT_NGHIEP','MCQ_ONLY','TRUE_FALSE_ONLY','SHORT_ONLY','CUSTOM') then raise exception 'unsupported assessment_type'; end if;
  begin v_variant_count:=coalesce((p_exam_spec->>'variant_count')::integer,4);
  exception when others then raise exception 'variant_count must be an integer'; end;
  if v_variant_count<1 or v_variant_count>8 then raise exception 'variant_count must be between 1 and 8'; end if;

  if p_knowledge_document_ids is null or cardinality(p_knowledge_document_ids)=0 then
    select coalesce(array_agg(d.id order by d.created_at,d.id),array[]::uuid[]) into v_docs
    from public.knowledge_documents d
    where d.truong_id=v_effective_truong_id and (d.mon_id=v_effective_mon_id or d.mon_id is null) and d.active_revision is not null;
  else
    v_requested_count:=cardinality(p_knowledge_document_ids);
    select coalesce(array_agg(d.id order by d.created_at,d.id),array[]::uuid[]),count(*)::integer into v_docs,v_valid_count
    from public.knowledge_documents d
    where d.id=any(p_knowledge_document_ids) and d.truong_id=v_effective_truong_id
      and (d.mon_id=v_effective_mon_id or d.mon_id is null) and d.active_revision is not null;
    if v_valid_count<>v_requested_count then raise exception 'one or more knowledge documents are unavailable for this scope'; end if;
  end if;
  if v_docs is null or cardinality(v_docs)=0 then raise exception 'no active knowledge documents are available'; end if;

  v_scope:=public._ai_exam_normalize_scope_036(p_exam_spec->'knowledge_scope',v_docs);

  insert into public.ai_exam_requests(requested_by,truong_id,mon_id,ma_phong,exam_spec,knowledge_document_ids,status)
  values(
    p_requested_by,v_effective_truong_id,v_effective_mon_id,btrim(p_ma_phong),
    (p_exam_spec-'knowledge_scope') || jsonb_build_object(
      'assessment_type',v_profile,'variant_count',v_variant_count,'knowledge_scope',v_scope
    ),
    v_docs,'AWAITING_AI'
  ) returning id into v_request_id;

  return jsonb_build_object(
    'status','success','request_id',v_request_id,'truong_id',v_effective_truong_id,
    'mon_id',v_effective_mon_id,'ma_phong',btrim(p_ma_phong),'knowledge_document_count',cardinality(v_docs),
    'assessment_type',v_profile,'variant_count',v_variant_count,'knowledge_scope',v_scope
  );
end;
$$;

create or replace function public.rpc_ai_exam_knowledge_pack_service(
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
  v_scope jsonb;
  v_offset integer;
  v_limit integer;
  v_total integer;
  v_units jsonb;
begin
  select id,knowledge_document_ids,exam_spec->'knowledge_scope' as knowledge_scope into v_request
  from public.ai_exam_requests where id=p_request_id;
  if v_request.id is null then raise exception 'exam request not found'; end if;
  v_scope:=v_request.knowledge_scope;
  v_offset:=greatest(coalesce(p_offset,0),0);
  v_limit:=least(greatest(coalesce(p_limit,80),1),120);

  select count(*)::integer into v_total
  from public.knowledge_units u
  join public.knowledge_documents d on d.id=u.document_id
  where d.id=any(v_request.knowledge_document_ids)
    and d.active_revision is not null and u.revision=d.active_revision and u.is_usable=true
    and public._ai_exam_scope_allows_unit_036(v_scope,u.document_id,u.lesson_code,u.lesson_title,u.hierarchy);

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id',s.document_id,'document_title',s.document_title,'document_type',s.document_type,
    'grade',s.grade,'unit_key',s.unit_key,'unit_type',s.unit_type,'ordinal_no',s.ordinal_no,
    'hierarchy',s.hierarchy,'lesson_code',s.lesson_code,'lesson_title',s.lesson_title,
    'section_title',s.section_title,'page_start',s.page_start,'page_end',s.page_end,
    'content',s.content,'provenance',s.provenance,'confidence',s.confidence,
    'scope_key',s.scope_key
  ) order by s.doc_order,s.ordinal_no,s.unit_id),'[]'::jsonb)
  into v_units
  from (
    select u.id unit_id,u.document_id,d.title document_title,d.document_type,d.grade,
           u.unit_key,u.unit_type,u.ordinal_no,u.hierarchy,u.lesson_code,u.lesson_title,u.section_title,
           u.page_start,u.page_end,u.content,u.provenance,u.confidence,d.created_at doc_order,
           public._knowledge_scope_key_036(u.lesson_code,u.lesson_title,u.hierarchy) as scope_key
    from public.knowledge_units u
    join public.knowledge_documents d on d.id=u.document_id
    where d.id=any(v_request.knowledge_document_ids)
      and d.active_revision is not null and u.revision=d.active_revision and u.is_usable=true
      and public._ai_exam_scope_allows_unit_036(v_scope,u.document_id,u.lesson_code,u.lesson_title,u.hierarchy)
    order by d.created_at,d.id,u.ordinal_no,u.id
    offset v_offset limit v_limit
  ) s;

  return jsonb_build_object(
    'status','success','request_id',p_request_id,'offset',v_offset,'limit',v_limit,
    'total_units',v_total,'units',v_units,'knowledge_scope',v_scope,
    'has_more',(v_offset+jsonb_array_length(v_units))<v_total,
    'next_offset',case when (v_offset+jsonb_array_length(v_units))<v_total then v_offset+jsonb_array_length(v_units) else null end
  );
end;
$$;

create or replace function public._ai_exam_scope_quality_gate_036(
  p_request_id uuid,
  p_exam_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_q jsonb;
  v_ref_json jsonb;
  v_ref text;
  v_idx integer:=0;
  v_allowed boolean;
begin
  select r.knowledge_document_ids,r.exam_spec->'knowledge_scope' as knowledge_scope into v_request
  from public.ai_exam_requests r where r.id=p_request_id;
  if v_request.knowledge_document_ids is null then return jsonb_build_object('valid',false,'code','knowledge_scope_request_missing'); end if;
  if p_exam_payload is null or jsonb_typeof(p_exam_payload)<>'object' or jsonb_typeof(p_exam_payload->'questions')<>'array' then
    return jsonb_build_object('valid',false,'code','knowledge_scope_questions_invalid');
  end if;

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx:=v_idx+1;
    if jsonb_typeof(v_q->'source_refs')<>'array' or jsonb_array_length(v_q->'source_refs')<1 then
      return jsonb_build_object('valid',false,'code','knowledge_scope_source_refs_invalid','question_no',v_idx);
    end if;
    for v_ref_json in select value from jsonb_array_elements(v_q->'source_refs') loop
      if jsonb_typeof(v_ref_json)='string' then v_ref:=btrim(v_ref_json #>> '{}');
      elsif jsonb_typeof(v_ref_json)='object' then v_ref:=btrim(coalesce(v_ref_json->>'unit_key',''));
      else return jsonb_build_object('valid',false,'code','knowledge_scope_source_ref_invalid','question_no',v_idx); end if;
      if v_ref='' then return jsonb_build_object('valid',false,'code','knowledge_scope_source_ref_invalid','question_no',v_idx); end if;

      select exists(
        select 1
        from public.knowledge_units u
        join public.knowledge_documents d on d.id=u.document_id
        where u.unit_key=v_ref
          and d.id=any(v_request.knowledge_document_ids)
          and d.active_revision is not null and u.revision=d.active_revision and u.is_usable=true
          and public._ai_exam_scope_allows_unit_036(v_request.knowledge_scope,u.document_id,u.lesson_code,u.lesson_title,u.hierarchy)
      ) into v_allowed;
      if not v_allowed then
        return jsonb_build_object('valid',false,'code','knowledge_source_ref_outside_scope','question_no',v_idx,'source_ref',v_ref);
      end if;
    end loop;
  end loop;

  return jsonb_build_object('valid',true,'applied',true,'quality_gate_version','036','knowledge_scope',v_request.knowledge_scope);
end;
$$;

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
  v_scope_quality jsonb;
  v_validation_report jsonb;
begin
  if coalesce(p_capability_hash,'') !~ '^[0-9A-Fa-f]{64}$' then return jsonb_build_object('status','error','code','capability_invalid'); end if;
  if p_exam_payload is null or jsonb_typeof(p_exam_payload)<>'object' or p_exam_payload->>'schema_version'<>'DAMSAN_EXAM_V1' then
    return jsonb_build_object('status','error','code','exam_payload_invalid');
  end if;
  if p_variants_payload is null or jsonb_typeof(p_variants_payload)<>'array' or jsonb_array_length(p_variants_payload)<1 then
    return jsonb_build_object('status','error','code','variants_payload_invalid');
  end if;
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
    return jsonb_build_object('status','error','code',coalesce(v_scope_quality->>'code','knowledge_scope_quality_invalid'),'quality',v_scope_quality);
  end if;

  v_quality:=public._ai_exam_quality_gate_037(v_row.request_id,p_exam_payload);
  if coalesce((v_quality->>'valid')::boolean,false) is not true then
    return jsonb_build_object('status','error','code',coalesce(v_quality->>'code','assessment_quality_invalid'),'quality',v_quality);
  end if;
  v_validation_report:=p_validation_report || jsonb_build_object('assessment_quality',v_quality,'knowledge_scope_quality',v_scope_quality);

  select coalesce(max(revision),0)+1 into v_revision from public.ai_exam_drafts where request_id=v_row.request_id;
  update public.ai_exam_drafts set status='SUPERSEDED' where request_id=v_row.request_id and status='VALIDATED';
  insert into public.ai_exam_drafts(request_id,revision,ai_provider,ai_model,exam_payload,variants_payload,validation_report,status)
  values(v_row.request_id,v_revision,nullif(btrim(p_ai_provider),''),nullif(btrim(p_ai_model),''),p_exam_payload,p_variants_payload,v_validation_report,'VALIDATED');

  update public.ai_exam_requests set status='READY_FOR_REVIEW',active_draft_revision=v_revision,ready_at=now(),processing_error=null,updated_at=now()
  where id=v_row.request_id;
  update public.ai_exam_handoffs set status='COMPLETED',ai_provider=nullif(btrim(p_ai_provider),''),ai_model=nullif(btrim(p_ai_model),''),completed_at=now(),updated_at=now()
  where id=v_row.handoff_id;

  return jsonb_build_object('status','success','request_id',v_row.request_id,'revision',v_revision,'request_status','READY_FOR_REVIEW','quality',v_quality,'knowledge_scope_quality',v_scope_quality);
end;
$$;

revoke all on function public.rpc_ai_exam_create_request_service(uuid,uuid,uuid,text,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.rpc_ai_exam_create_request_service(uuid,uuid,uuid,text,jsonb,uuid[]) to service_role;
revoke all on function public.rpc_ai_exam_knowledge_pack_service(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.rpc_ai_exam_knowledge_pack_service(uuid,integer,integer) to service_role;
revoke all on function public._ai_exam_scope_quality_gate_036(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.rpc_ai_exam_store_draft_service(text,text,text,jsonb,jsonb,jsonb) to service_role;

commit;