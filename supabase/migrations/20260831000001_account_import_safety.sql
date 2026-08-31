-- Dedicated server import RPC for hardened HS/GV account import workflow.
-- This migration is additive. Existing RPCs remain untouched.

create or replace function public.rpc_admin_import_accounts(
  p_admin_token text,
  p_kind text,
  p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_admin_id uuid;
  v_row jsonb;
  v_default_hash constant text := '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
  v_truong_id uuid;
  v_ma_hs text;
  v_ma_gv text;
  v_ho_ten text;
  v_lop text;
  v_mon_id uuid;
  v_existing_id uuid;
  v_target_gv_id uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  v_admin_id := public._admin_session_admin_id(p_admin_token);
  if v_admin_id is null then
    return jsonb_build_object('status', 'error', 'code', 'admin_session_invalid', 'message', 'Phiên quản trị không hợp lệ hoặc đã hết hạn.');
  end if;

  if p_kind is null or p_kind not in ('HS', 'GV') then
    raise exception 'Invalid account kind. Only HS and GV are supported.';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'rows must be a non-empty array';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if p_kind = 'HS' then
      v_truong_id := (v_row->>'truong_id')::uuid;
      if v_truong_id is null then
        raise exception 'truong_id is required';
      end if;
      if not exists (select 1 from public.truong_hoc where id = v_truong_id) then
        raise exception 'School not found: %', v_truong_id;
      end if;

      v_ma_hs := upper(trim(coalesce(v_row->>'ma_hs', '')));
      if v_ma_hs = '' then
        raise exception 'ma_hs is required';
      end if;

      v_ho_ten := trim(coalesce(v_row->>'ho_ten', ''));
      if v_ho_ten = '' then
        raise exception 'ho_ten is required';
      end if;

      v_lop := trim(coalesce(v_row->>'lop', ''));
      if v_lop = '' then
        raise exception 'lop is required';
      end if;

      select id into v_existing_id from public.hoc_sinh
      where truong_id = v_truong_id and ma_hs = v_ma_hs
      limit 1;

      if v_existing_id is null then
        insert into public.hoc_sinh(truong_id, ma_hs, ho_ten, lop, mat_khau, quyen)
        values (v_truong_id, v_ma_hs, v_ho_ten, v_lop, v_default_hash, 'HocSinh');
        v_inserted := v_inserted + 1;
      else
        update public.hoc_sinh
        set ho_ten = v_ho_ten,
            lop = v_lop
        where id = v_existing_id;
        v_updated := v_updated + 1;
      end if;

    else -- GV
      v_truong_id := (v_row->>'truong_id')::uuid;
      if v_truong_id is null then
        raise exception 'truong_id is required';
      end if;
      if not exists (select 1 from public.truong_hoc where id = v_truong_id) then
        raise exception 'School not found: %', v_truong_id;
      end if;

      v_ma_gv := trim(coalesce(v_row->>'ma_gv', ''));
      if v_ma_gv = '' then
        raise exception 'ma_gv is required';
      end if;

      v_ho_ten := trim(coalesce(v_row->>'ho_ten', ''));
      if v_ho_ten = '' then
        raise exception 'ho_ten is required';
      end if;

      if v_row ? 'quyen' and (v_row->>'quyen' is null or v_row->>'quyen' not in ('GiaoVien', 'Admin')) then
        raise exception 'Invalid teacher role: %', v_row->>'quyen';
      end if;

      v_mon_id := nullif(v_row->>'mon_id', '')::uuid;
      if v_mon_id is not null and not exists (select 1 from public.mon_hoc where id = v_mon_id) then
        raise exception 'Subject not found: %', v_mon_id;
      end if;

      select id into v_existing_id from public.giao_vien
      where truong_id = v_truong_id and ma_gv = v_ma_gv
      limit 1;

      if v_existing_id is null then
        insert into public.giao_vien(truong_id, ma_gv, ho_ten, mat_khau, quyen, mon_id)
        values (v_truong_id, v_ma_gv, v_ho_ten, v_default_hash, coalesce(v_row->>'quyen', 'GiaoVien'), v_mon_id)
        returning id into v_target_gv_id;
        v_inserted := v_inserted + 1;
      else
        v_target_gv_id := v_existing_id;
        update public.giao_vien
        set ho_ten = v_ho_ten,
            quyen = case when v_row ? 'quyen' then coalesce(v_row->>'quyen', quyen) else quyen end,
            mon_id = case when v_row ? 'mon_id' then v_mon_id else mon_id end
        where id = v_existing_id;
        v_updated := v_updated + 1;
      end if;

      update public.staff_sessions set revoked_at = coalesce(revoked_at, now()) where gv_id = v_target_gv_id;
      update public.admin_sessions set revoked_at = coalesce(revoked_at, now()) where admin_id = v_target_gv_id;

    end if;
  end loop;

  return jsonb_build_object(
    'status', 'success',
    'kind', p_kind,
    'count', v_inserted + v_updated,
    'inserted', v_inserted,
    'updated', v_updated
  );
end;
$function$;

revoke all on function public.rpc_admin_import_accounts(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_admin_import_accounts(text, text, jsonb) to anon, authenticated;
