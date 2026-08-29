-- P0-006: Student recovery lifecycle and room reset generation contract.
-- Room reset terminates the active attempt generation:
-- 1. Deletes ket_qua and exam_submissions for the room.
-- 2. Sets trang_thai = 'CHO_THI' and thoi_gian_mo = null.
-- Re-opening via rpc_dieu_khien_phong_thi (p_set_open_time = true) creates a fresh attempt generation.

create or replace function public.rpc_reset_room_results(
  p_staff_token text,
  p_ma_gv text,
  p_truong_id uuid,
  p_phong_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_teacher_ma_gv text;
  v_teacher_truong_id uuid;
  v_teacher_mon_id uuid;
  v_quyen text;
  v_room public.phong_thi%rowtype;
  v_ket_qua integer;
  v_submissions integer;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.');
  end if;

  select ma_gv, truong_id, mon_id, quyen
  into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen
  from public.giao_vien
  where id = v_gv_id
  limit 1;

  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv)
     or (v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;

  select * into v_room
  from public.phong_thi
  where id = p_phong_id and truong_id = p_truong_id
  for update;

  if not found then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;

  delete from public.ket_qua where phong_id = p_phong_id;
  get diagnostics v_ket_qua = row_count;

  delete from public.exam_submissions where phong_id = p_phong_id;
  get diagnostics v_submissions = row_count;

  -- P0-006: Reset transitions room back to CHO_THI and clears thoi_gian_mo to invalidate old generation attempts
  update public.phong_thi
  set trang_thai = 'CHO_THI', thoi_gian_mo = null
  where id = p_phong_id and truong_id = p_truong_id;

  return jsonb_build_object(
    'status', 'success',
    'ket_qua_deleted', v_ket_qua,
    'submissions_deleted', v_submissions
  );
end;
$function$;

revoke all on function public.rpc_reset_room_results(text, text, uuid, uuid) from public;
grant execute on function public.rpc_reset_room_results(text, text, uuid, uuid) to anon, authenticated;
