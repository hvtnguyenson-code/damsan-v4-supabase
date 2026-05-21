-- Step 2 hardening: move room control from direct UPDATE phong_thi to SECURITY DEFINER RPC.

create or replace function public.rpc_dieu_khien_phong_thi(
  p_ma_gv text,
  p_truong_id uuid,
  p_room_id uuid,
  p_trang_thai text default null,
  p_doi_tuong text default null,
  p_ten_dot text default null,
  p_thoi_gian int default null,
  p_set_open_time boolean default false
)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_quyen text;
  v_room_exists boolean := false;
begin
  select quyen into v_quyen
  from public.giao_vien
  where ma_gv = p_ma_gv
    and truong_id = p_truong_id
  limit 1;

  if v_quyen is null then
    return jsonb_build_object('status','error','message','Khong xac thuc duoc giao vien.');
  end if;

  select exists(
    select 1
    from public.phong_thi
    where id = p_room_id
      and truong_id = p_truong_id
  ) into v_room_exists;

  if not v_room_exists then
    return jsonb_build_object('status','error','message','Phong thi khong thuoc truong hien tai.');
  end if;

  update public.phong_thi
  set
    trang_thai = coalesce(p_trang_thai, trang_thai),
    doi_tuong = coalesce(p_doi_tuong, doi_tuong),
    ten_dot = coalesce(p_ten_dot, ten_dot),
    thoi_gian = coalesce(p_thoi_gian, thoi_gian),
    thoi_gian_mo = case when p_set_open_time then (extract(epoch from now()) * 1000)::bigint else thoi_gian_mo end
  where id = p_room_id
    and truong_id = p_truong_id;

  return jsonb_build_object('status','success');
end;
$function$;

grant execute on function public.rpc_dieu_khien_phong_thi(text, uuid, uuid, text, text, text, int, boolean) to anon, authenticated;
