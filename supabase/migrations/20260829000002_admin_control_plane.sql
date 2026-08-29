-- P0-005 server-side admin control plane. This migration is additive.
-- Browser roles never receive write access to protected control-plane tables.

create table if not exists public.admin_sessions (
  token_hash text primary key,
  admin_id uuid not null references public.giao_vien(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null
);
alter table public.admin_sessions enable row level security;
revoke all on table public.admin_sessions from anon, authenticated;

create or replace function public._admin_session_admin_id(p_token text)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_admin_id uuid;
begin
  select s.admin_id into v_admin_id
  from public.admin_sessions s join public.giao_vien gv on gv.id = s.admin_id
  where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.revoked_at is null and s.expires_at > now() and gv.quyen = 'Admin'
  limit 1;
  return v_admin_id;
end;
$function$;
revoke all on function public._admin_session_admin_id(text) from public, anon, authenticated;

-- Keep the old login response shape and add an ephemeral admin token only when safe.
create or replace function public.rpc_login_giao_vien(p_ma_gv text, p_mat_khau text)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_gv record;
  v_default_hash constant text := '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
  v_raw_token text;
  v_expires_at timestamptz;
  v_response jsonb;
begin
  select gv.id, gv.ma_gv, gv.ho_ten, gv.quyen, gv.truong_id, gv.mon_id, gv.mat_khau, th.ten_truong
  into v_gv
  from public.giao_vien gv left join public.truong_hoc th on th.id = gv.truong_id
  where gv.ma_gv = trim(p_ma_gv) and gv.mat_khau = p_mat_khau
  limit 1;
  if v_gv.id is null then
    return jsonb_build_object('status', 'error', 'message', 'Sai tài khoản hoặc mật khẩu!');
  end if;
  v_response := jsonb_build_object('status', 'success', 'user', jsonb_build_object(
    'id', v_gv.id, 'ma_gv', v_gv.ma_gv, 'ho_ten', v_gv.ho_ten, 'quyen', v_gv.quyen,
    'truong_id', v_gv.truong_id, 'truong_ten', coalesce(v_gv.ten_truong, 'Hệ thống V4'),
    'mon_id', v_gv.mon_id, 'mat_khau', v_gv.mat_khau,
    'must_change_password', v_gv.mat_khau = v_default_hash
  ), 'must_change_password', v_gv.mat_khau = v_default_hash);
  if v_gv.quyen = 'Admin' and v_gv.mat_khau <> v_default_hash then
    v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_expires_at := now() + interval '24 hours';
    insert into public.admin_sessions(token_hash, admin_id, expires_at)
    values (encode(extensions.digest(v_raw_token, 'sha256'), 'hex'), v_gv.id, v_expires_at);
    v_response := v_response || jsonb_build_object('admin_token', v_raw_token, 'admin_expires_at', v_expires_at);
  end if;
  return v_response;
end;
$function$;

create or replace function public.rpc_admin_logout(p_admin_token text)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  update public.admin_sessions set revoked_at = coalesce(revoked_at, now())
  where token_hash = encode(extensions.digest(coalesce(p_admin_token, ''), 'sha256'), 'hex');
  return jsonb_build_object('status', 'success');
end;
$function$;

create or replace function public.rpc_change_giao_vien_password(
  p_gv_id uuid, p_truong_id uuid, p_current_password text, p_new_password text
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_count integer;
begin
  if coalesce(btrim(p_current_password), '') = '' or coalesce(btrim(p_new_password), '') = ''
     or p_current_password = p_new_password then
    return jsonb_build_object('status', 'error', 'message', 'Không thể cập nhật mật khẩu.');
  end if;
  update public.giao_vien set mat_khau = p_new_password
  where id = p_gv_id and truong_id = p_truong_id and mat_khau = p_current_password;
  get diagnostics v_count = row_count;
  return case when v_count = 1 then jsonb_build_object('status', 'success')
    else jsonb_build_object('status', 'error', 'message', 'Không thể cập nhật mật khẩu.') end;
end;
$function$;

create or replace function public.rpc_admin_control(
  p_admin_token text, p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_admin_id uuid; v_kind text; v_row jsonb; v_fields jsonb; v_count integer := 0;
  v_default_hash constant text := '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
begin
  v_admin_id := public._admin_session_admin_id(p_admin_token);
  if v_admin_id is null then return jsonb_build_object('status', 'error', 'message', 'Admin session không hợp lệ.'); end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'payload must be an object'; end if;
  case p_action
    when 'accounts_upsert' then
      v_kind := p_payload->>'kind';
      if v_kind not in ('HS', 'GV') or jsonb_typeof(p_payload->'rows') <> 'array' then raise exception 'Invalid account payload'; end if;
      for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
        if v_kind = 'HS' then
          insert into public.hoc_sinh(truong_id, ma_hs, ho_ten, lop, mat_khau, quyen)
          values ((v_row->>'truong_id')::uuid, upper(trim(v_row->>'ma_hs')), v_row->>'ho_ten', v_row->>'lop', v_row->>'mat_khau', coalesce(v_row->>'quyen', 'HocSinh'))
          on conflict (truong_id, ma_hs) do update set ho_ten=excluded.ho_ten, lop=excluded.lop, mat_khau=excluded.mat_khau, quyen=excluded.quyen;
        else
          insert into public.giao_vien(truong_id, ma_gv, ho_ten, mat_khau, quyen, mon_id)
          values ((v_row->>'truong_id')::uuid, trim(v_row->>'ma_gv'), v_row->>'ho_ten', v_row->>'mat_khau', coalesce(v_row->>'quyen', 'GiaoVien'), nullif(v_row->>'mon_id', '')::uuid)
          on conflict (truong_id, ma_gv) do update set ho_ten=excluded.ho_ten, mat_khau=excluded.mat_khau, quyen=excluded.quyen, mon_id=excluded.mon_id;
        end if; v_count := v_count + 1;
      end loop;
    when 'accounts_delete' then
      v_kind := p_payload->>'kind';
      if v_kind = 'HS' then delete from public.hoc_sinh where id in (select value::text::uuid from jsonb_array_elements(p_payload->'ids'));
      elsif v_kind = 'GV' then delete from public.giao_vien where id in (select value::text::uuid from jsonb_array_elements(p_payload->'ids'));
      else raise exception 'Invalid account kind'; end if;
      get diagnostics v_count = row_count;
    when 'accounts_reset_password' then
      v_kind := p_payload->>'kind';
      if v_kind = 'HS' then update public.hoc_sinh set mat_khau=v_default_hash where id in (select value::text::uuid from jsonb_array_elements(p_payload->'ids'));
      elsif v_kind = 'GV' then update public.giao_vien set mat_khau=v_default_hash where id in (select value::text::uuid from jsonb_array_elements(p_payload->'ids'));
      else raise exception 'Invalid account kind'; end if;
      get diagnostics v_count = row_count;
    when 'teacher_update_school' then
      update public.giao_vien set truong_id=(p_payload->>'truong_id')::uuid where id=(p_payload->>'id')::uuid; get diagnostics v_count = row_count;
    when 'teacher_update_subject' then
      update public.giao_vien set mon_id=nullif(p_payload->>'mon_id', '')::uuid where id=(p_payload->>'id')::uuid; get diagnostics v_count = row_count;
    when 'normalize_legacy_passwords' then
      v_kind := p_payload->>'kind';
      if v_kind = 'HS' then update public.hoc_sinh set mat_khau=encode(extensions.digest(mat_khau, 'sha256'), 'hex') where mat_khau !~ '^[0-9a-fA-F]{64}$' and ((p_payload->>'truong_id') is null or truong_id=(p_payload->>'truong_id')::uuid);
      elsif v_kind = 'GV' then update public.giao_vien set mat_khau=encode(extensions.digest(mat_khau, 'sha256'), 'hex') where mat_khau !~ '^[0-9a-fA-F]{64}$' and ((p_payload->>'truong_id') is null or truong_id=(p_payload->>'truong_id')::uuid);
      else raise exception 'Invalid account kind'; end if;
      get diagnostics v_count = row_count;
    when 'bank_insert' then
      if jsonb_typeof(p_payload->'rows') <> 'array' then raise exception 'rows must be an array'; end if;
      for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
        insert into public.ngan_hang(truong_id,mon_id,ma_cau_hoi,bai_hoc,phan,muc_do,noi_dung,a,b,c,d,dap_an_dung,loi_giai)
        values ((v_row->>'truong_id')::uuid,nullif(v_row->>'mon_id','')::uuid,v_row->>'ma_cau_hoi',v_row->>'bai_hoc',v_row->>'phan',v_row->>'muc_do',v_row->>'noi_dung',v_row->>'a',v_row->>'b',v_row->>'c',v_row->>'d',v_row->>'dap_an_dung',v_row->>'loi_giai');
        v_count := v_count + 1;
      end loop;
    when 'bank_update' then
      v_fields := p_payload->'fields'; if v_fields is null or jsonb_typeof(v_fields) <> 'object' then raise exception 'fields must be an object'; end if;
      update public.ngan_hang set
        truong_id=case when v_fields ? 'truong_id' then (v_fields->>'truong_id')::uuid else truong_id end,
        mon_id=case when v_fields ? 'mon_id' then nullif(v_fields->>'mon_id','')::uuid else mon_id end,
        ma_cau_hoi=case when v_fields ? 'ma_cau_hoi' then v_fields->>'ma_cau_hoi' else ma_cau_hoi end,
        bai_hoc=case when v_fields ? 'bai_hoc' then v_fields->>'bai_hoc' else bai_hoc end, phan=case when v_fields ? 'phan' then v_fields->>'phan' else phan end,
        muc_do=case when v_fields ? 'muc_do' then v_fields->>'muc_do' else muc_do end, noi_dung=case when v_fields ? 'noi_dung' then v_fields->>'noi_dung' else noi_dung end,
        a=case when v_fields ? 'a' then v_fields->>'a' else a end, b=case when v_fields ? 'b' then v_fields->>'b' else b end, c=case when v_fields ? 'c' then v_fields->>'c' else c end, d=case when v_fields ? 'd' then v_fields->>'d' else d end,
        dap_an_dung=case when v_fields ? 'dap_an_dung' then v_fields->>'dap_an_dung' else dap_an_dung end, loi_giai=case when v_fields ? 'loi_giai' then v_fields->>'loi_giai' else loi_giai end
      where id=(p_payload->>'id')::uuid; get diagnostics v_count = row_count;
    when 'bank_delete_ids' then delete from public.ngan_hang where id in (select value::text::uuid from jsonb_array_elements(p_payload->'ids')); get diagnostics v_count = row_count;
    when 'bank_delete_filter' then
      if not (p_payload ? 'mon_id' or p_payload ? 'bai_hoc' or p_payload ? 'phan' or p_payload ? 'muc_do') then raise exception 'A bank filter beyond truong_id is required'; end if;
      delete from public.ngan_hang where (not (p_payload ? 'truong_id') or truong_id=(p_payload->>'truong_id')::uuid)
        and (not (p_payload ? 'mon_id') or mon_id=(p_payload->>'mon_id')::uuid) and (not (p_payload ? 'bai_hoc') or bai_hoc=p_payload->>'bai_hoc')
        and (not (p_payload ? 'phan') or phan=p_payload->>'phan') and (not (p_payload ? 'muc_do') or muc_do=p_payload->>'muc_do'); get diagnostics v_count = row_count;
    when 'bank_delete_all' then delete from public.ngan_hang where truong_id=(p_payload->>'truong_id')::uuid; get diagnostics v_count = row_count;
    when 'exam_delete_only' then delete from public.de_thi where phong_id=(p_payload->>'phong_id')::uuid; get diagnostics v_count = row_count;
    when 'school_create' then insert into public.truong_hoc(ma_truong,ten_truong) values (upper(trim(p_payload->>'ma_truong')),trim(p_payload->>'ten_truong')); get diagnostics v_count = row_count;
    when 'school_delete' then delete from public.truong_hoc where id=(p_payload->>'id')::uuid; get diagnostics v_count = row_count;
    when 'subject_create' then insert into public.mon_hoc(ten_mon) values (trim(p_payload->>'ten_mon')); get diagnostics v_count = row_count;
    when 'subject_delete' then delete from public.mon_hoc where id=(p_payload->>'id')::uuid; get diagnostics v_count = row_count;
    else raise exception 'Unsupported admin action';
  end case;
  return jsonb_build_object('status', 'success', 'action', p_action, 'count', v_count);
end;
$function$;

create or replace function public.rpc_giao_vien_bank_write(p_ma_gv text, p_truong_id uuid, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_mon_id uuid; v_row jsonb; v_fields jsonb; v_count integer := 0;
begin
  select mon_id into v_mon_id from public.giao_vien where ma_gv=trim(p_ma_gv) and truong_id=p_truong_id limit 1;
  if v_mon_id is null then return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc môn học.'); end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'payload must be an object'; end if;
  case p_action
    when 'insert' then
      if jsonb_typeof(p_payload->'rows') <> 'array' then raise exception 'rows must be an array'; end if;
      for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
        insert into public.ngan_hang(truong_id,mon_id,ma_cau_hoi,bai_hoc,phan,muc_do,noi_dung,a,b,c,d,dap_an_dung,loi_giai)
        values (p_truong_id,v_mon_id,v_row->>'ma_cau_hoi',v_row->>'bai_hoc',v_row->>'phan',v_row->>'muc_do',v_row->>'noi_dung',v_row->>'a',v_row->>'b',v_row->>'c',v_row->>'d',v_row->>'dap_an_dung',v_row->>'loi_giai'); v_count:=v_count+1;
      end loop;
    when 'update' then
      v_fields:=p_payload->'fields'; if v_fields is null or jsonb_typeof(v_fields) <> 'object' then raise exception 'fields must be an object'; end if;
      update public.ngan_hang set ma_cau_hoi=case when v_fields ? 'ma_cau_hoi' then v_fields->>'ma_cau_hoi' else ma_cau_hoi end, bai_hoc=case when v_fields ? 'bai_hoc' then v_fields->>'bai_hoc' else bai_hoc end,
        phan=case when v_fields ? 'phan' then v_fields->>'phan' else phan end, muc_do=case when v_fields ? 'muc_do' then v_fields->>'muc_do' else muc_do end, noi_dung=case when v_fields ? 'noi_dung' then v_fields->>'noi_dung' else noi_dung end,
        a=case when v_fields ? 'a' then v_fields->>'a' else a end,b=case when v_fields ? 'b' then v_fields->>'b' else b end,c=case when v_fields ? 'c' then v_fields->>'c' else c end,d=case when v_fields ? 'd' then v_fields->>'d' else d end,
        dap_an_dung=case when v_fields ? 'dap_an_dung' then v_fields->>'dap_an_dung' else dap_an_dung end,loi_giai=case when v_fields ? 'loi_giai' then v_fields->>'loi_giai' else loi_giai end
      where id=(p_payload->>'id')::uuid and truong_id=p_truong_id and mon_id=v_mon_id; get diagnostics v_count=row_count;
    when 'delete_ids' then delete from public.ngan_hang where id in (select value::text::uuid from jsonb_array_elements(p_payload->'ids')) and truong_id=p_truong_id and mon_id=v_mon_id; get diagnostics v_count=row_count;
    when 'delete_filter' then
      if not (p_payload ? 'bai_hoc' or p_payload ? 'phan' or p_payload ? 'muc_do') then raise exception 'A teacher bank filter is required'; end if;
      delete from public.ngan_hang where truong_id=p_truong_id and mon_id=v_mon_id and (not (p_payload ? 'bai_hoc') or bai_hoc=p_payload->>'bai_hoc') and (not (p_payload ? 'phan') or phan=p_payload->>'phan') and (not (p_payload ? 'muc_do') or muc_do=p_payload->>'muc_do'); get diagnostics v_count=row_count;
    else raise exception 'Unsupported teacher bank action';
  end case;
  return jsonb_build_object('status','success','action',p_action,'count',v_count);
end;
$function$;

create or replace function public.rpc_xoa_de_trong_phong(p_ma_gv text, p_truong_id uuid, p_phong_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_count integer;
begin
  if not exists (select 1 from public.giao_vien where ma_gv=trim(p_ma_gv) and truong_id=p_truong_id)
     or not exists (select 1 from public.phong_thi where id=p_phong_id and truong_id=p_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  delete from public.de_thi where phong_id=p_phong_id; get diagnostics v_count=row_count;
  return jsonb_build_object('status','success','count',v_count);
end;
$function$;

do $block$
begin
  if exists (select 1 from public.exam_submissions es left join public.hoc_sinh hs on hs.id=es.hs_id where hs.id is null) then
    raise exception 'Cannot add exam_submissions_hs_id_fkey: orphan hs_id exists';
  end if;
  if not exists (select 1 from pg_constraint where conname='exam_submissions_hs_id_fkey') then
    alter table public.exam_submissions add constraint exam_submissions_hs_id_fkey foreign key(hs_id) references public.hoc_sinh(id) on delete cascade;
  end if;
end;
$block$;

revoke insert, update, delete on public.truong_hoc from anon, authenticated;
revoke insert, update, delete on public.mon_hoc from anon, authenticated;
revoke update on public.phong_thi from anon, authenticated;
drop policy if exists room_update_minimal on public.phong_thi;

revoke all on function public.rpc_login_giao_vien(text, text) from public;
revoke all on function public.rpc_admin_logout(text) from public;
revoke all on function public.rpc_change_giao_vien_password(uuid, uuid, text, text) from public;
revoke all on function public.rpc_admin_control(text, text, jsonb) from public;
revoke all on function public.rpc_giao_vien_bank_write(text, uuid, text, jsonb) from public;
revoke all on function public.rpc_xoa_de_trong_phong(text, uuid, uuid) from public;
grant execute on function public.rpc_login_giao_vien(text, text), public.rpc_admin_logout(text), public.rpc_change_giao_vien_password(uuid, uuid, text, text), public.rpc_admin_control(text, text, jsonb), public.rpc_giao_vien_bank_write(text, uuid, text, jsonb), public.rpc_xoa_de_trong_phong(text, uuid, uuid) to anon, authenticated;
