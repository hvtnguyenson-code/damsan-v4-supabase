-- OMR 055: One-click room reset also removes all OMR evidence metadata.
-- Private Storage files must be removed FIRST through the Storage API;
-- the SQL transaction refuses to reset while room Storage is non-empty.
-- No schema changes. The room, exam codes and scoring config are preserved.

create or replace function public.rpc_reset_room_results(
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
 v_ket_qua integer := 0;
 v_submissions integer := 0;
 v_artifacts integer := 0;
 v_attempt_states integer := 0;
begin
 v_gv_id := public._staff_session_gv_id(p_staff_token);
 if v_gv_id is null then
  return jsonb_build_object('status','error','code','staff_session_invalid',
   'message','Phiên làm việc không hợp lệ hoặc đã hết hạn.');
 end if;

 select ma_gv,truong_id,quyen into v_teacher_ma_gv,v_teacher_truong_id,v_quyen
 from public.giao_vien where id=v_gv_id limit 1;
 if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv)
   or (v_quyen<>'Admin' and p_truong_id is distinct from v_teacher_truong_id) then
  return jsonb_build_object('status','error','code','room_forbidden',
   'message','Không xác thực được giáo viên hoặc phòng thi.');
 end if;

 -- Serializes against live exam receipt FOR SHARE and room state changes.
 select * into v_room from public.phong_thi
 where id=p_phong_id and truong_id=p_truong_id for update;
 if not found then
  return jsonb_build_object('status','error','code','room_not_found',
   'message','Không tìm thấy phòng thi.');
 end if;

 v_prefix_test := 'test/' || p_truong_id::text || '/' || p_phong_id::text || '/';
 v_prefix_official := 'official/' || p_truong_id::text || '/' || p_phong_id::text || '/';
 if exists (
  select 1 from storage.objects
  where bucket_id='omr-evidence'
    and (left(name,length(v_prefix_test))=v_prefix_test
         or left(name,length(v_prefix_official))=v_prefix_official)
 ) then
  return jsonb_build_object('status','error','code','omr_storage_not_empty',
   'message','Phòng còn ảnh minh chứng OMR trên Storage. Hãy thử xóa điểm lại để dọn hết ảnh.');
 end if;

 -- This entire section is one PostgreSQL transaction. Drop OMR evidence
 -- before its submission FK; preserve exam definitions and room settings.
 delete from public.omr_artifacts where room_id=p_phong_id;
 get diagnostics v_artifacts=row_count;

 delete from public.ket_qua where phong_id=p_phong_id;
 get diagnostics v_ket_qua=row_count;

 delete from public.exam_submissions where phong_id=p_phong_id;
 get diagnostics v_submissions=row_count;

 -- Full-room reset: discard per-student targeted reset state too.
 -- Stale receipts remain blocked by the room generation (thoi_gian_mo)
 -- being cleared and replaced when the room is opened next time.
 delete from public.student_room_attempt_state where phong_id=p_phong_id;
 get diagnostics v_attempt_states=row_count;

 update public.phong_thi
 set trang_thai='CHO_THI',thoi_gian_mo=null
 where id=p_phong_id and truong_id=p_truong_id;

 perform realtime.send(jsonb_build_object('reason','room_reset'),
  'room_sync','room:'||p_phong_id::text,false);

 return jsonb_build_object('status','success',
  'ket_qua_deleted',v_ket_qua,
  'submissions_deleted',v_submissions,
  'artifacts_deleted',v_artifacts,
  'attempt_states_deleted',v_attempt_states);
end;
$function$;
