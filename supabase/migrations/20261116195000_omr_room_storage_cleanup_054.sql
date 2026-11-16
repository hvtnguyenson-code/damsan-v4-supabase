-- OMR 054: delete only files belonging to the selected room through Storage API
-- before the existing room-delete transaction. No Storage object is deleted by SQL.
-- No DDL on production data tables. This migration is safe before the new frontend.

create or replace function public.rpc_omr_room_delete_inventory(
 p_staff_token text, p_ma_gv text, p_truong_id uuid, p_phong_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = public
as $function$
declare
 v_gv_id uuid;
 v_teacher_ma_gv text;
 v_teacher_truong_id uuid;
 v_quyen text;
 v_room_id uuid;
 v_prefix_test text;
 v_prefix_official text;
 v_names jsonb;
 v_count bigint;
 v_bytes bigint;
begin
 v_gv_id := public._staff_session_gv_id(p_staff_token);
 if v_gv_id is null then
  return jsonb_build_object('status','error','code','staff_session_invalid');
 end if;
 select ma_gv, truong_id, quyen
   into v_teacher_ma_gv, v_teacher_truong_id, v_quyen
   from public.giao_vien where id=v_gv_id limit 1;
 if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv)
  or (v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id) then
  return jsonb_build_object('status','error','code','room_forbidden');
 end if;
 select id into v_room_id from public.phong_thi
  where id=p_phong_id and truong_id=p_truong_id for share;
 if not found then
  return jsonb_build_object('status','error','code','room_not_found');
 end if;

 v_prefix_test := 'test/' || p_truong_id::text || '/' || p_phong_id::text || '/';
 v_prefix_official := 'official/' || p_truong_id::text || '/' || p_phong_id::text || '/';
 -- Count all objects in the room prefixes, including interrupted uploads
 -- which have no omr_artifacts metadata.
 select count(*),
  coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,15}$'
   then (metadata->>'size')::bigint else 0 end),0),
  coalesce(jsonb_agg(name order by name),'[]'::jsonb)
  into v_count, v_bytes, v_names
 from storage.objects
 where bucket_id='omr-evidence'
  and (left(name,length(v_prefix_test))=v_prefix_test
       or left(name,length(v_prefix_official))=v_prefix_official);
 if v_count>1000 then
  return jsonb_build_object('status','error','code','room_storage_too_many_files');
 end if;
 return jsonb_build_object('status','success','paths',v_names,
  'file_count',v_count,'file_bytes',v_bytes);
end;
$function$;

revoke all on function public.rpc_omr_room_delete_inventory(text,text,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.rpc_omr_room_delete_inventory(text,text,uuid,uuid)
 to service_role;

-- Keep the established staff authorization and room FOR UPDATE lock.
-- If Storage still contains room files, fail without changing any DB record.
create or replace function public.rpc_xoa_phong_thi(
 p_staff_token text, p_ma_gv text, p_truong_id uuid, p_phong_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $function$
declare
 v_gv_id uuid;
 v_teacher_ma_gv text;
 v_teacher_truong_id uuid;
 v_quyen text;
 v_room public.phong_thi%rowtype;
 v_prefix_test text;
 v_prefix_official text;
begin
 v_gv_id := public._staff_session_gv_id(p_staff_token);
 if v_gv_id is null then
  return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc đã hết hạn.');
 end if;
 select ma_gv, truong_id, quyen into v_teacher_ma_gv,v_teacher_truong_id,v_quyen
 from public.giao_vien where id=v_gv_id limit 1;
 if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv)
  or (v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id) then
  return jsonb_build_object('status','error','code','room_forbidden',
   'message','Không xác thực được giáo viên hoặc phòng thi.');
 end if;
 select * into v_room from public.phong_thi where id=p_phong_id and truong_id=p_truong_id for update;
 if not found then
  return jsonb_build_object('status','error','code','room_not_found',
   'message','Không tìm thấy phòng thi.');
 end if;
 v_prefix_test := 'test/' || p_truong_id::text || '/' || p_phong_id::text || '/';
 v_prefix_official := 'official/' || p_truong_id::text || '/' || p_phong_id::text || '/';
 if exists(
  select 1 from storage.objects
  where bucket_id='omr-evidence'
   and (left(name,length(v_prefix_test))=v_prefix_test
        or left(name,length(v_prefix_official))=v_prefix_official)
 ) then
  return jsonb_build_object('status','error','code','omr_storage_not_empty',
   'message','Phòng vẫn còn ảnh minh chứng OMR trong Storage. Hãy thử xóa lại để dọn ảnh trước.');
 end if;
 -- All DB changes below occur in ONE PostgreSQL transaction.
 delete from public.omr_artifacts where room_id=p_phong_id;
 delete from public.ket_qua where phong_id=p_phong_id;
 delete from public.exam_submissions where phong_id=p_phong_id;
 delete from public.de_thi where phong_id=p_phong_id;
 delete from public.phong_thi where id=p_phong_id;
 return jsonb_build_object('status','success');
end;
$function$;
