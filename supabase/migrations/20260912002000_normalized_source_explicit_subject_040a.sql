begin;

-- 040A — Explicit subject identity for normalized sources.
-- Long-document normalization must never fall back to a generic "Môn học" label.
-- Subject is selected by the teacher and persisted before prompt generation/import.

create or replace function public.rpc_knowledge_subject_catalog(
  p_staff_token text,
  p_ma_gv text
) returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_actor record;
  v_subjects jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;

  select id,ma_gv,quyen,truong_id,mon_id
  into v_actor
  from public.giao_vien
  where id=v_gv_id
  limit 1;

  if v_actor.id is null or v_actor.ma_gv<>btrim(p_ma_gv) then
    return jsonb_build_object('status','error','code','staff_identity_mismatch');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'ten_mon',m.ten_mon) order by m.ten_mon),'[]'::jsonb)
  into v_subjects
  from public.mon_hoc m
  where v_actor.quyen='Admin'
     or v_actor.mon_id is null
     or m.id=v_actor.mon_id;

  return jsonb_build_object('status','success','subjects',coalesce(v_subjects,'[]'::jsonb));
end;
$$;

revoke all on function public.rpc_knowledge_subject_catalog(text,text) from public;
grant execute on function public.rpc_knowledge_subject_catalog(text,text) to anon,authenticated;

create or replace function public.rpc_knowledge_set_subject_grade(
  p_staff_token text,
  p_ma_gv text,
  p_document_id uuid,
  p_mon_id uuid,
  p_grade smallint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_actor record;
  v_doc record;
  v_subject record;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;

  select id,ma_gv,quyen,truong_id,mon_id
  into v_actor
  from public.giao_vien
  where id=v_gv_id
  limit 1;
  if v_actor.id is null or v_actor.ma_gv<>btrim(p_ma_gv) then
    return jsonb_build_object('status','error','code','staff_identity_mismatch');
  end if;
  if p_mon_id is null then return jsonb_build_object('status','error','code','subject_required'); end if;
  if p_grade not between 10 and 12 then return jsonb_build_object('status','error','code','grade_invalid'); end if;
  if v_actor.quyen<>'Admin' and v_actor.mon_id is not null and v_actor.mon_id is distinct from p_mon_id then
    return jsonb_build_object('status','error','code','subject_scope_mismatch');
  end if;

  select id,ten_mon into v_subject
  from public.mon_hoc where id=p_mon_id limit 1;
  if v_subject.id is null then return jsonb_build_object('status','error','code','subject_invalid'); end if;

  select id,owner_gv_id,truong_id,mon_id,grade,source_role,authority_profile_id,authority_code
  into v_doc
  from public.knowledge_documents
  where id=p_document_id
  for update;
  if v_doc.id is null then return jsonb_build_object('status','error','code','document_unavailable'); end if;
  if v_actor.quyen<>'Admin' and (v_doc.owner_gv_id is distinct from v_actor.id or v_doc.truong_id is distinct from v_actor.truong_id) then
    return jsonb_build_object('status','error','code','document_unavailable');
  end if;

  -- Changing subject or grade invalidates any prior authority binding. Demote to the
  -- neutral knowledge role first so the 039C authority guard cannot preserve a stale slot.
  if v_doc.mon_id is distinct from p_mon_id or v_doc.grade is distinct from p_grade then
    delete from public.assessment_profile_sources where document_id=p_document_id;
    update public.knowledge_documents
    set source_role='KNOWLEDGE_SOURCE',
        authority_profile_id=null,
        authority_code=null,
        mon_id=p_mon_id,
        grade=p_grade,
        updated_at=now()
    where id=p_document_id;
  else
    update public.knowledge_documents
    set mon_id=p_mon_id,grade=p_grade,updated_at=now()
    where id=p_document_id;
  end if;

  return jsonb_build_object(
    'status','success',
    'document_id',p_document_id,
    'mon_id',p_mon_id,
    'subject_name',v_subject.ten_mon,
    'grade',p_grade
  );
end;
$$;

revoke all on function public.rpc_knowledge_set_subject_grade(text,text,uuid,uuid,smallint) from public;
grant execute on function public.rpc_knowledge_set_subject_grade(text,text,uuid,uuid,smallint) to anon,authenticated;

commit;
