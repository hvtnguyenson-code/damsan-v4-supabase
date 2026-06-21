-- Step 3 hardening: move room list reads for teacher/admin to SECURITY DEFINER RPC.

create or replace function public.rpc_lay_danh_sach_phong_thi_gv(
  p_ma_gv text,
  p_truong_id uuid,
  p_mon_id uuid default null,
  p_xem_toan_bo boolean default false
)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_quyen text;
  v_rooms jsonb := '[]'::jsonb;
begin
  select quyen into v_quyen
  from public.giao_vien
  where ma_gv = p_ma_gv
    and truong_id = p_truong_id
  limit 1;

  if v_quyen is null then
    return jsonb_build_object('status','error','message','Khong xac thuc duoc giao vien.');
  end if;

  if p_xem_toan_bo and v_quyen = 'Admin' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', pt.id,
          'ma_phong', pt.ma_phong,
          'ten_dot', pt.ten_dot,
          'doi_tuong', pt.doi_tuong,
          'thoi_gian', pt.thoi_gian,
          'trang_thai', pt.trang_thai,
          'thoi_gian_mo', pt.thoi_gian_mo,
          'truong_id', pt.truong_id,
          'mon_id', pt.mon_id,
          'ten_truong', th.ten_truong
        )
      ),
      '[]'::jsonb
    )
    into v_rooms
    from public.phong_thi pt
    left join public.truong_hoc th on th.id = pt.truong_id
    where (p_mon_id is null or pt.mon_id = p_mon_id)
    order by pt.created_at asc;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', pt.id,
          'ma_phong', pt.ma_phong,
          'ten_dot', pt.ten_dot,
          'doi_tuong', pt.doi_tuong,
          'thoi_gian', pt.thoi_gian,
          'trang_thai', pt.trang_thai,
          'thoi_gian_mo', pt.thoi_gian_mo,
          'truong_id', pt.truong_id,
          'mon_id', pt.mon_id,
          'ten_truong', th.ten_truong
        )
      ),
      '[]'::jsonb
    )
    into v_rooms
    from public.phong_thi pt
    left join public.truong_hoc th on th.id = pt.truong_id
    where pt.truong_id = p_truong_id
      and (p_mon_id is null or pt.mon_id = p_mon_id)
    order by pt.created_at asc;
  end if;

  return jsonb_build_object('status','success','rooms',v_rooms);
end;
$function$;

grant execute on function public.rpc_lay_danh_sach_phong_thi_gv(text, uuid, uuid, boolean) to anon, authenticated;
