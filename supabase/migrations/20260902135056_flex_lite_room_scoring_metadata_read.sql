-- Migration: 20260902070001_flex_lite_room_scoring_metadata_read.sql
-- Description: Expose room scoring metadata (assessment_type, scoring_config) in rpc_lay_danh_sach_phong_thi_gv

create or replace function public.rpc_lay_danh_sach_phong_thi_gv(
  p_staff_token text,
  p_ma_gv text,
  p_truong_id uuid,
  p_mon_id uuid default null,
  p_xem_toan_bo boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_gv_id uuid;
  v_teacher_ma_gv text;
  v_teacher_truong_id uuid;
  v_quyen text;
  v_rooms jsonb;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.');
  end if;

  select ma_gv, truong_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_quyen
  from public.giao_vien
  where id = v_gv_id;

  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;

  if v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pt.id,
    'ma_phong', pt.ma_phong,
    'ten_dot', pt.ten_dot,
    'doi_tuong', pt.doi_tuong,
    'thoi_gian', pt.thoi_gian,
    'trang_thai', pt.trang_thai,
    'thoi_gian_mo', pt.thoi_gian_mo,
    'truong_id', pt.truong_id,
    'mon_id', pt.mon_id,
    'ten_truong', th.ten_truong,
    'assessment_type', pt.assessment_type,
    'scoring_config', pt.scoring_config
  ) order by pt.created_at desc), '[]'::jsonb) into v_rooms
  from public.phong_thi pt
  left join public.truong_hoc th on th.id = pt.truong_id
  where (p_mon_id is null or pt.mon_id = p_mon_id)
    and (
      (v_quyen = 'Admin' and p_xem_toan_bo = true)
      or (v_quyen = 'Admin' and p_xem_toan_bo = false and pt.truong_id = p_truong_id)
      or (v_quyen <> 'Admin' and pt.truong_id = v_teacher_truong_id)
    );

  return jsonb_build_object('status', 'success', 'rooms', v_rooms);
end;
$function$;

revoke all on function public.rpc_lay_danh_sach_phong_thi_gv(text, text, uuid, uuid, boolean) from public;
grant execute on function public.rpc_lay_danh_sach_phong_thi_gv(text, text, uuid, uuid, boolean) to anon, authenticated;
