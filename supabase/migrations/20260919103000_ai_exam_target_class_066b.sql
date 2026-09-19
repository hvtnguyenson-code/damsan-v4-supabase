begin;

-- 066B — carry one teacher-selected target class from AI authoring into the canonical room.
-- Class targeting remains room metadata; it does not alter the exam knowledge/validation contract.

create or replace function public.rpc_ai_exam_class_list(
  p_staff_token text,
  p_ma_gv text,
  p_truong_id uuid,
  p_grade integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_ma_gv text;
  v_truong_id uuid;
  v_quyen text;
  v_classes jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;

  select ma_gv,truong_id,quyen into v_ma_gv,v_truong_id,v_quyen
  from public.giao_vien where id=v_gv_id;
  if v_ma_gv is distinct from btrim(p_ma_gv) then
    return jsonb_build_object('status','error','code','staff_identity_mismatch');
  end if;
  if p_truong_id is null or (v_quyen<>'Admin' and p_truong_id is distinct from v_truong_id) then
    return jsonb_build_object('status','error','code','school_scope_forbidden');
  end if;
  if p_grade is not null and (p_grade < 1 or p_grade > 12) then
    return jsonb_build_object('status','error','code','grade_invalid');
  end if;

  select coalesce(jsonb_agg(x.lop order by x.sort_key,x.lop),'[]'::jsonb)
  into v_classes
  from (
    select distinct btrim(hs.lop) as lop,
      case when btrim(hs.lop) ~ '^[0-9]+' then substring(btrim(hs.lop) from '^[0-9]+')::int else 999 end as sort_key
    from public.hoc_sinh hs
    where hs.truong_id=p_truong_id
      and nullif(btrim(coalesce(hs.lop,'')),'') is not null
      and (p_grade is null or btrim(hs.lop) ~ ('^' || p_grade::text || '[^0-9]'))
  ) x;

  return jsonb_build_object('status','success','classes',v_classes);
end;
$function$;

revoke all on function public.rpc_ai_exam_class_list(text,text,uuid,integer) from public;
grant execute on function public.rpc_ai_exam_class_list(text,text,uuid,integer) to anon,authenticated;

create or replace function public.rpc_ai_exam_approve_and_publish(
  p_staff_token text,
  p_ma_gv text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_ma_gv text;
  v_quyen text;
  v_request record;
  v_draft record;
  v_result jsonb;
  v_target_class text;
  v_room_id uuid;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select ma_gv,quyen into v_ma_gv,v_quyen from public.giao_vien where id=v_gv_id;
  if v_ma_gv is distinct from btrim(p_ma_gv) then return jsonb_build_object('status','error','code','staff_identity_mismatch','message','Tài khoản không khớp phiên làm việc.'); end if;

  select * into v_request from public.ai_exam_requests where id=p_request_id for update;
  if not found or (v_quyen<>'Admin' and v_request.requested_by<>v_gv_id) then
    return jsonb_build_object('status','error','code','request_not_found','message','Không tìm thấy yêu cầu tạo đề.');
  end if;
  if v_request.status='PUBLISHED' then
    return jsonb_build_object('status','success','idempotent',true,'request_id',v_request.id,'publish_result',v_request.publish_result);
  end if;
  if v_request.status<>'READY_FOR_REVIEW' or v_request.active_draft_revision is null then
    return jsonb_build_object('status','error','code','request_not_ready','message','Đề chưa ở trạng thái sẵn sàng xác minh.');
  end if;

  select * into v_draft from public.ai_exam_drafts
  where request_id=v_request.id and revision=v_request.active_draft_revision and status='VALIDATED'
  for update;
  if not found then return jsonb_build_object('status','error','code','draft_not_found','message','Không tìm thấy bản đề đã xác minh kỹ thuật.'); end if;

  v_target_class:=coalesce(nullif(btrim(v_request.exam_spec->>'target_class'),''),'TatCa');
  if v_target_class<>'TatCa' and not exists (
    select 1 from public.hoc_sinh hs
    where hs.truong_id=v_request.truong_id and btrim(hs.lop)=v_target_class
  ) then
    return jsonb_build_object('status','error','code','target_class_invalid','message','Lớp được chọn không còn tồn tại trong trường.');
  end if;

  -- Canonical exam publication remains authoritative.
  v_result:=public.rpc_luu_de_thi_len_phong(
    p_staff_token,p_ma_gv,v_request.truong_id,v_request.mon_id,v_request.ma_phong,v_draft.variants_payload
  );
  if coalesce(v_result->>'status','')<>'success' then
    return v_result || jsonb_build_object('request_id',v_request.id,'code',coalesce(v_result->>'code','publish_failed'));
  end if;

  begin
    v_room_id:=nullif(v_result->>'phong_id','')::uuid;
  exception when others then
    v_room_id:=null;
  end;
  if v_room_id is null then
    select pt.id into v_room_id
    from public.phong_thi pt
    where pt.truong_id=v_request.truong_id and pt.mon_id=v_request.mon_id and pt.ma_phong=v_request.ma_phong
    order by pt.created_at desc limit 1;
  end if;
  if v_room_id is null then raise exception 'publish_room_target_not_found'; end if;

  update public.phong_thi
  set doi_tuong=v_target_class
  where id=v_room_id and truong_id=v_request.truong_id and mon_id=v_request.mon_id;
  if not found then raise exception 'publish_room_target_update_failed'; end if;

  update public.ai_exam_requests
  set status='PUBLISHED',publish_result=v_result || jsonb_build_object('doi_tuong',v_target_class),published_at=now(),updated_at=now()
  where id=v_request.id;
  update public.ai_exam_drafts set status='PUBLISHED',published_at=now()
  where id=v_draft.id;

  return v_result || jsonb_build_object('request_id',v_request.id,'request_status','PUBLISHED','doi_tuong',v_target_class);
end;
$function$;

revoke all on function public.rpc_ai_exam_approve_and_publish(text,text,uuid) from public;
grant execute on function public.rpc_ai_exam_approve_and_publish(text,text,uuid) to anon,authenticated;

commit;
