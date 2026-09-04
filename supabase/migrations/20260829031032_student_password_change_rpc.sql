-- Change a student's password without granting direct table UPDATE to browser roles.
create or replace function public.rpc_change_hoc_sinh_password(
  p_truong_id uuid,
  p_hs_id uuid,
  p_current_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_updated_count integer;
begin
  if p_current_password is null
     or p_new_password is null
     or btrim(p_current_password) = ''
     or btrim(p_new_password) = ''
     or p_new_password = p_current_password then
    return jsonb_build_object('status', 'error', 'message', 'Không thể cập nhật mật khẩu.');
  end if;

  update public.hoc_sinh
  set mat_khau = p_new_password
  where id = p_hs_id
    and truong_id = p_truong_id
    and mat_khau = p_current_password;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    return jsonb_build_object('status', 'error', 'message', 'Không thể cập nhật mật khẩu.');
  end if;

  return jsonb_build_object('status', 'success', 'message', 'Cập nhật mật khẩu thành công.');
end;
$function$;

revoke all on function public.rpc_change_hoc_sinh_password(uuid, uuid, text, text) from public;
grant execute on function public.rpc_change_hoc_sinh_password(uuid, uuid, text, text) to anon, authenticated;
