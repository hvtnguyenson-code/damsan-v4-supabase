-- Step 1 hardening: move HS/GV login from direct table SELECT to SECURITY DEFINER RPC.

create or replace function public.rpc_login_hoc_sinh(
  p_ma_truong text,
  p_ma_hs text,
  p_mat_khau text
)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_truong_id uuid;
  v_hs record;
begin
  select id into v_truong_id
  from public.truong_hoc
  where ma_truong = upper(trim(p_ma_truong))
  limit 1;

  if v_truong_id is null then
    return jsonb_build_object('status','error','message','Mã trường không hợp lệ!');
  end if;

  select id, truong_id, ma_hs, ho_ten, lop, mat_khau
  into v_hs
  from public.hoc_sinh
  where truong_id = v_truong_id
    and ma_hs = upper(trim(p_ma_hs))
    and mat_khau = p_mat_khau
  limit 1;

  if v_hs.id is null then
    return jsonb_build_object('status','error','message','Thông tin tài khoản không chính xác!');
  end if;

  return jsonb_build_object(
    'status','success',
    'user', jsonb_build_object(
      'id', v_hs.id,
      'truong_id', v_hs.truong_id,
      'ma_hs', v_hs.ma_hs,
      'ho_ten', v_hs.ho_ten,
      'lop', v_hs.lop,
      'mat_khau', v_hs.mat_khau
    )
  );
end;
$function$;

create or replace function public.rpc_login_giao_vien(
  p_ma_gv text,
  p_mat_khau text
)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_gv record;
begin
  select
    gv.id,
    gv.ma_gv,
    gv.ho_ten,
    gv.quyen,
    gv.truong_id,
    gv.mon_id,
    gv.mat_khau,
    th.ten_truong
  into v_gv
  from public.giao_vien gv
  left join public.truong_hoc th on th.id = gv.truong_id
  where gv.ma_gv = trim(p_ma_gv)
    and gv.mat_khau = p_mat_khau
  limit 1;

  if v_gv.id is null then
    return jsonb_build_object('status','error','message','Sai tài khoản hoặc mật khẩu!');
  end if;

  return jsonb_build_object(
    'status','success',
    'user', jsonb_build_object(
      'id', v_gv.id,
      'ma_gv', v_gv.ma_gv,
      'ho_ten', v_gv.ho_ten,
      'quyen', v_gv.quyen,
      'truong_id', v_gv.truong_id,
      'truong_ten', coalesce(v_gv.ten_truong, 'Hệ thống V4'),
      'mon_id', v_gv.mon_id,
      'mat_khau', v_gv.mat_khau
    )
  );
end;
$function$;

grant execute on function public.rpc_login_hoc_sinh(text, text, text) to anon, authenticated;
grant execute on function public.rpc_login_giao_vien(text, text) to anon, authenticated;
