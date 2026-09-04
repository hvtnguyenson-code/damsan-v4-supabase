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
    and gv.mat_khau not in ('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', '123456')
  limit 1;
  return v_admin_id;
end;
$function$;
revoke all on function public._admin_session_admin_id(text) from public, anon, authenticated;

create table if not exists public.staff_sessions (
  token_hash text primary key,
  gv_id uuid not null references public.giao_vien(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null
);
alter table public.staff_sessions enable row level security;
revoke all on table public.staff_sessions from anon, authenticated;

create or replace function public._staff_session_gv_id(p_token text)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_gv_id uuid;
begin
  select s.gv_id into v_gv_id
  from public.staff_sessions s join public.giao_vien gv on gv.id = s.gv_id
  where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.revoked_at is null and s.expires_at > now()
    and gv.mat_khau not in ('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', '123456')
  limit 1;
  return v_gv_id;
end;
$function$;
revoke all on function public._staff_session_gv_id(text) from public, anon, authenticated;

-- Keep the old login response shape and add an ephemeral admin token only when safe.
create or replace function public.rpc_login_giao_vien(p_ma_gv text, p_mat_khau text)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_gv record;
  v_default_hash constant text := '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
  v_raw_token text;
  v_staff_token text;
  v_expires_at timestamptz;
  v_response jsonb;
begin
  select gv.id, gv.ma_gv, gv.ho_ten, gv.quyen, gv.truong_id, gv.mon_id, gv.mat_khau, th.ten_truong
  into v_gv
  from public.giao_vien gv left join public.truong_hoc th on th.id = gv.truong_id
  where gv.ma_gv = trim(p_ma_gv)
    and (gv.mat_khau = p_mat_khau or (gv.mat_khau = '123456' and p_mat_khau = v_default_hash))
  limit 1;
  if v_gv.id is null then
    return jsonb_build_object('status', 'error', 'message', 'Sai tài khoản hoặc mật khẩu!');
  end if;
  v_response := jsonb_build_object('status', 'success', 'user', jsonb_build_object(
    'id', v_gv.id, 'ma_gv', v_gv.ma_gv, 'ho_ten', v_gv.ho_ten, 'quyen', v_gv.quyen,
    'truong_id', v_gv.truong_id, 'truong_ten', coalesce(v_gv.ten_truong, 'Hệ thống V4'),
    'mon_id', v_gv.mon_id,
    'must_change_password', v_gv.mat_khau in (v_default_hash, '123456')
  ), 'must_change_password', v_gv.mat_khau in (v_default_hash, '123456'));
  if v_gv.mat_khau not in (v_default_hash, '123456') then
    v_staff_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_expires_at := now() + interval '24 hours';
    insert into public.staff_sessions(token_hash, gv_id, expires_at)
    values (encode(extensions.digest(v_staff_token, 'sha256'), 'hex'), v_gv.id, v_expires_at);
    v_response := v_response || jsonb_build_object('staff_token', v_staff_token, 'staff_expires_at', v_expires_at);
  end if;
  if v_gv.quyen = 'Admin' and v_gv.mat_khau not in (v_default_hash, '123456') then
    v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_expires_at := now() + interval '24 hours';
    insert into public.admin_sessions(token_hash, admin_id, expires_at)
    values (encode(extensions.digest(v_raw_token, 'sha256'), 'hex'), v_gv.id, v_expires_at);
    v_response := v_response || jsonb_build_object('admin_token', v_raw_token, 'admin_expires_at', v_expires_at);
  end if;
  return v_response;
end;
$function$;

create or replace function public.rpc_staff_logout(p_staff_token text)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  update public.staff_sessions set revoked_at = coalesce(revoked_at, now())
  where token_hash = encode(extensions.digest(coalesce(p_staff_token, ''), 'sha256'), 'hex');
  return jsonb_build_object('status', 'success');
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
  where id = p_gv_id and truong_id = p_truong_id
    and (mat_khau = p_current_password or (mat_khau = '123456' and p_current_password = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'));
  get diagnostics v_count = row_count;
  if v_count = 1 then
    update public.staff_sessions set revoked_at = coalesce(revoked_at, now())
    where gv_id = p_gv_id and revoked_at is null;
    update public.admin_sessions set revoked_at = coalesce(revoked_at, now())
    where admin_id = p_gv_id and revoked_at is null;
    return jsonb_build_object('status', 'success');
  end if;
  return jsonb_build_object('status', 'error', 'message', 'Không thể cập nhật mật khẩu.');
end;
$function$;

create or replace function public.rpc_admin_control(
  p_admin_token text, p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_admin_id uuid; v_kind text; v_row jsonb; v_fields jsonb; v_target_gv_id uuid; v_changed_gv_ids uuid[]; v_count integer := 0;
  v_default_hash constant text := '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
begin
  v_admin_id := public._admin_session_admin_id(p_admin_token);
  if v_admin_id is null then return jsonb_build_object('status', 'error', 'code', 'admin_session_invalid', 'message', 'Phiên quản trị không hợp lệ hoặc đã hết hạn.'); end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'payload must be an object'; end if;
  case p_action
    when 'accounts_upsert' then
      v_kind := p_payload->>'kind';
      if v_kind is null or v_kind not in ('HS', 'GV') or jsonb_typeof(p_payload->'rows') <> 'array' then raise exception 'Invalid account payload'; end if;
      for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
        if v_kind = 'HS' then
          insert into public.hoc_sinh(truong_id, ma_hs, ho_ten, lop, mat_khau, quyen)
          values ((v_row->>'truong_id')::uuid, upper(trim(v_row->>'ma_hs')), v_row->>'ho_ten', v_row->>'lop', v_row->>'mat_khau', coalesce(v_row->>'quyen', 'HocSinh'))
          on conflict (truong_id, ma_hs) do update set ho_ten=excluded.ho_ten, lop=excluded.lop, mat_khau=excluded.mat_khau, quyen=excluded.quyen;
        else
          insert into public.giao_vien(truong_id, ma_gv, ho_ten, mat_khau, quyen, mon_id)
          values ((v_row->>'truong_id')::uuid, trim(v_row->>'ma_gv'), v_row->>'ho_ten', v_row->>'mat_khau', coalesce(v_row->>'quyen', 'GiaoVien'), nullif(v_row->>'mon_id', '')::uuid)
          on conflict (truong_id, ma_gv) do update set ho_ten=excluded.ho_ten, mat_khau=excluded.mat_khau, quyen=excluded.quyen, mon_id=case when v_row ? 'mon_id' then excluded.mon_id else public.giao_vien.mon_id end
          returning id into v_target_gv_id;
          update public.staff_sessions set revoked_at=coalesce(revoked_at, now()) where gv_id=v_target_gv_id;
          update public.admin_sessions set revoked_at=coalesce(revoked_at, now()) where admin_id=v_target_gv_id;
        end if; v_count := v_count + 1;
      end loop;
    when 'accounts_list' then
      v_kind := p_payload->>'kind';
      if v_kind is null or v_kind not in ('HS','GV') then raise exception 'Invalid account kind'; end if;
      if v_kind = 'HS' then
        return jsonb_build_object('status','success','action',p_action,'rows',coalesce((select jsonb_agg(jsonb_build_object('id',hs.id,'truong_id',hs.truong_id,'ma_hs',hs.ma_hs,'ho_ten',hs.ho_ten,'lop',hs.lop,'quyen',hs.quyen,'ten_truong',th.ten_truong,'must_change_password',hs.mat_khau in (v_default_hash,'123456')) order by hs.ma_hs) from public.hoc_sinh hs left join public.truong_hoc th on th.id=hs.truong_id where nullif(p_payload->>'truong_id','') is null or hs.truong_id=(p_payload->>'truong_id')::uuid),'[]'::jsonb));
      end if;
      return jsonb_build_object('status','success','action',p_action,'rows',coalesce((select jsonb_agg(jsonb_build_object('id',gv.id,'truong_id',gv.truong_id,'ma_gv',gv.ma_gv,'ho_ten',gv.ho_ten,'quyen',gv.quyen,'mon_id',gv.mon_id,'ten_truong',th.ten_truong,'must_change_password',gv.mat_khau in (v_default_hash,'123456')) order by gv.ma_gv) from public.giao_vien gv left join public.truong_hoc th on th.id=gv.truong_id where nullif(p_payload->>'truong_id','') is null or gv.truong_id=(p_payload->>'truong_id')::uuid),'[]'::jsonb));
    when 'accounts_delete' then
      v_kind := p_payload->>'kind';
      if v_kind = 'HS' then delete from public.hoc_sinh where id in (select value::uuid from jsonb_array_elements_text(p_payload->'ids') as t(value));
      elsif v_kind = 'GV' then delete from public.giao_vien where id in (select value::uuid from jsonb_array_elements_text(p_payload->'ids') as t(value));
      else raise exception 'Invalid account kind'; end if;
      get diagnostics v_count = row_count;
    when 'accounts_reset_password' then
      v_kind := p_payload->>'kind';
      if v_kind = 'HS' then update public.hoc_sinh set mat_khau=v_default_hash where id in (select value::uuid from jsonb_array_elements_text(p_payload->'ids') as t(value));
      elsif v_kind = 'GV' then
        update public.giao_vien set mat_khau=v_default_hash where id in (select value::uuid from jsonb_array_elements_text(p_payload->'ids') as t(value));
        get diagnostics v_count = row_count;
        update public.staff_sessions set revoked_at=coalesce(revoked_at, now()) where gv_id in (select value::uuid from jsonb_array_elements_text(p_payload->'ids') as t(value));
        update public.admin_sessions set revoked_at=coalesce(revoked_at, now()) where admin_id in (select value::uuid from jsonb_array_elements_text(p_payload->'ids') as t(value));
        return jsonb_build_object('status', 'success', 'action', p_action, 'count', v_count);
      else raise exception 'Invalid account kind'; end if;
      get diagnostics v_count = row_count;
    when 'teacher_update_school' then
      select quyen into v_kind from public.giao_vien where id=(p_payload->>'id')::uuid;
      update public.giao_vien set truong_id=(p_payload->>'truong_id')::uuid where id=(p_payload->>'id')::uuid; get diagnostics v_count = row_count;
      if v_count=1 and v_kind <> 'Admin' then update public.staff_sessions set revoked_at=coalesce(revoked_at,now()) where gv_id=(p_payload->>'id')::uuid; update public.admin_sessions set revoked_at=coalesce(revoked_at,now()) where admin_id=(p_payload->>'id')::uuid; end if;
    when 'teacher_update_subject' then
      select quyen into v_kind from public.giao_vien where id=(p_payload->>'id')::uuid;
      update public.giao_vien set mon_id=nullif(p_payload->>'mon_id', '')::uuid where id=(p_payload->>'id')::uuid; get diagnostics v_count = row_count;
      if v_count=1 and v_kind <> 'Admin' then update public.staff_sessions set revoked_at=coalesce(revoked_at,now()) where gv_id=(p_payload->>'id')::uuid; update public.admin_sessions set revoked_at=coalesce(revoked_at,now()) where admin_id=(p_payload->>'id')::uuid; end if;
    when 'normalize_legacy_passwords' then
      v_kind := p_payload->>'kind';
      if v_kind = 'HS' then update public.hoc_sinh set mat_khau=encode(extensions.digest(mat_khau, 'sha256'), 'hex') where mat_khau !~ '^[0-9a-fA-F]{64}$' and ((p_payload->>'truong_id') is null or truong_id=(p_payload->>'truong_id')::uuid);
      elsif v_kind = 'GV' then
        select array_agg(id) into v_changed_gv_ids from public.giao_vien where mat_khau !~ '^[0-9a-fA-F]{64}$' and (nullif(p_payload->>'truong_id','') is null or truong_id=(p_payload->>'truong_id')::uuid);
        update public.giao_vien set mat_khau=encode(extensions.digest(mat_khau, 'sha256'), 'hex') where id=any(coalesce(v_changed_gv_ids,'{}'::uuid[])); get diagnostics v_count=row_count;
        update public.staff_sessions set revoked_at=coalesce(revoked_at,now()) where gv_id=any(coalesce(v_changed_gv_ids,'{}'::uuid[]));
        update public.admin_sessions set revoked_at=coalesce(revoked_at,now()) where admin_id=any(coalesce(v_changed_gv_ids,'{}'::uuid[]));
        return jsonb_build_object('status','success','action',p_action,'count',v_count);
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
    when 'bank_delete_ids' then delete from public.ngan_hang where id in (select value::uuid from jsonb_array_elements_text(p_payload->'ids') as t(value)); get diagnostics v_count = row_count;
    when 'bank_delete_filter' then
      if not (p_payload ? 'truong_id') or nullif(p_payload->>'truong_id', '') is null then raise exception 'bank_delete_filter requires truong_id'; end if;
      if not (nullif(p_payload->>'mon_id', '') is not null or nullif(btrim(p_payload->>'bai_hoc'), '') is not null or nullif(btrim(p_payload->>'phan'), '') is not null or nullif(btrim(p_payload->>'muc_do'), '') is not null) then raise exception 'A non-empty bank filter beyond truong_id is required'; end if;
      delete from public.ngan_hang where truong_id=(p_payload->>'truong_id')::uuid
        and (nullif(p_payload->>'mon_id', '') is null or mon_id=(p_payload->>'mon_id')::uuid) and (nullif(btrim(p_payload->>'bai_hoc'), '') is null or bai_hoc=p_payload->>'bai_hoc')
        and (nullif(btrim(p_payload->>'phan'), '') is null or phan=p_payload->>'phan') and (nullif(btrim(p_payload->>'muc_do'), '') is null or muc_do=p_payload->>'muc_do'); get diagnostics v_count = row_count;
    when 'bank_delete_all' then
      if not (p_payload ? 'truong_id') or nullif(p_payload->>'truong_id', '') is null then
        raise exception 'bank_delete_all requires truong_id';
      end if;
      delete from public.ngan_hang where truong_id=(p_payload->>'truong_id')::uuid;
      get diagnostics v_count = row_count;
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

create or replace function public.rpc_giao_vien_bank_write(p_staff_token text, p_ma_gv text, p_truong_id uuid, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_gv_id uuid; v_mon_id uuid; v_row jsonb; v_fields jsonb; v_count integer := 0;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select mon_id into v_mon_id from public.giao_vien where id=v_gv_id and ma_gv=trim(p_ma_gv) and truong_id=p_truong_id limit 1;
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
    when 'delete_ids' then delete from public.ngan_hang where id in (select value::uuid from jsonb_array_elements_text(p_payload->'ids') as t(value)) and truong_id=p_truong_id and mon_id=v_mon_id; get diagnostics v_count=row_count;
    when 'delete_filter' then
      if not (p_payload ? 'bai_hoc' or p_payload ? 'phan' or p_payload ? 'muc_do') then raise exception 'A teacher bank filter is required'; end if;
      delete from public.ngan_hang where truong_id=p_truong_id and mon_id=v_mon_id and (not (p_payload ? 'bai_hoc') or bai_hoc=p_payload->>'bai_hoc') and (not (p_payload ? 'phan') or phan=p_payload->>'phan') and (not (p_payload ? 'muc_do') or muc_do=p_payload->>'muc_do'); get diagnostics v_count=row_count;
    else raise exception 'Unsupported teacher bank action';
  end case;
  return jsonb_build_object('status','success','action',p_action,'count',v_count);
end;
$function$;

create or replace function public.rpc_giao_vien_bank_read(
  p_staff_token text,
  p_ma_gv text,
  p_truong_id uuid,
  p_mon_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_gv_id uuid;
  v_teacher_ma_gv text;
  v_teacher_truong_id uuid;
  v_teacher_mon_id uuid;
  v_quyen text;
  v_effective_truong_id uuid;
  v_effective_mon_id uuid;
  v_rows jsonb;
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
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc môn học.');
  end if;
  if v_quyen = 'Admin' then
    if p_truong_id is null or p_mon_id is null then
      return jsonb_build_object('status','error','message','Admin phải chọn trường và môn học đích.');
    end if;
    v_effective_truong_id := p_truong_id;
    v_effective_mon_id := p_mon_id;
  else
    if p_truong_id is distinct from v_teacher_truong_id or v_teacher_mon_id is null
       or p_mon_id is distinct from v_teacher_mon_id then
      return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc môn học.');
    end if;
    v_effective_truong_id := v_teacher_truong_id;
    v_effective_mon_id := v_teacher_mon_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', nh.id,
    'truong_id', nh.truong_id,
    'mon_id', nh.mon_id,
    'ma_cau_hoi', nh.ma_cau_hoi,
    'bai_hoc', nh.bai_hoc,
    'phan', nh.phan,
    'muc_do', nh.muc_do,
    'noi_dung', nh.noi_dung,
    'a', nh.a,
    'b', nh.b,
    'c', nh.c,
    'd', nh.d,
    'dap_an_dung', nh.dap_an_dung,
    'loi_giai', nh.loi_giai
  ) order by nh.created_at asc, nh.id asc), '[]'::jsonb)
  into v_rows
  from public.ngan_hang nh
  where nh.truong_id = v_effective_truong_id
    and nh.mon_id = v_effective_mon_id;
  return jsonb_build_object('status','success','rows',v_rows);
end;
$function$;

create or replace function public.rpc_xoa_de_trong_phong(p_staff_token text, p_ma_gv text, p_truong_id uuid, p_phong_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_gv_id uuid; v_teacher_ma_gv text; v_teacher_truong_id uuid; v_teacher_mon_id uuid; v_quyen text; v_count integer;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select ma_gv, truong_id, mon_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen
  from public.giao_vien where id=v_gv_id limit 1;
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) or (v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id)
     or not exists (select 1 from public.phong_thi where id=p_phong_id and truong_id=p_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  delete from public.de_thi where phong_id=p_phong_id; get diagnostics v_count=row_count;
  return jsonb_build_object('status','success','count',v_count);
end;
$function$;

-- Secure overloads replace browser access to the earlier ma_gv + truong_id-only RPCs.
create or replace function public.rpc_dieu_khien_phong_thi(
  p_staff_token text, p_ma_gv text, p_truong_id uuid, p_room_id uuid,
  p_trang_thai text default null, p_doi_tuong text default null, p_ten_dot text default null,
  p_thoi_gian int default null, p_set_open_time boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_gv_id uuid; v_teacher_ma_gv text; v_teacher_truong_id uuid; v_teacher_mon_id uuid; v_quyen text;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select ma_gv, truong_id, mon_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen
  from public.giao_vien where id=v_gv_id limit 1;
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) or (v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id)
     or not exists (select 1 from public.phong_thi where id=p_room_id and truong_id=p_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  update public.phong_thi set trang_thai=coalesce(p_trang_thai,trang_thai), doi_tuong=coalesce(p_doi_tuong,doi_tuong),
    ten_dot=coalesce(p_ten_dot,ten_dot), thoi_gian=coalesce(p_thoi_gian,thoi_gian),
    thoi_gian_mo=case when p_set_open_time then (extract(epoch from now()) * 1000)::bigint else thoi_gian_mo end
  where id=p_room_id and truong_id=p_truong_id;
  return jsonb_build_object('status','success');
end;
$function$;

create or replace function public.rpc_xoa_phong_thi(p_staff_token text, p_ma_gv text, p_truong_id uuid, p_phong_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_gv_id uuid; v_teacher_ma_gv text; v_teacher_truong_id uuid; v_teacher_mon_id uuid; v_quyen text; v_room public.phong_thi%rowtype;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select ma_gv, truong_id, mon_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen
  from public.giao_vien where id=v_gv_id limit 1;
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) or (v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  select * into v_room from public.phong_thi where id=p_phong_id and truong_id=p_truong_id for update;
  if not found then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  delete from public.ket_qua where phong_id=p_phong_id;
  delete from public.exam_submissions where phong_id=p_phong_id;
  delete from public.de_thi where phong_id=p_phong_id;
  delete from public.phong_thi where id=p_phong_id;
  return jsonb_build_object('status','success');
end;
$function$;

create or replace function public.rpc_reset_room_results(p_staff_token text, p_ma_gv text, p_truong_id uuid, p_phong_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_gv_id uuid; v_teacher_ma_gv text; v_teacher_truong_id uuid; v_teacher_mon_id uuid; v_quyen text; v_ket_qua integer; v_submissions integer; v_room public.phong_thi%rowtype;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select ma_gv, truong_id, mon_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen
  from public.giao_vien where id=v_gv_id limit 1;
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) or (v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  select * into v_room from public.phong_thi where id=p_phong_id and truong_id=p_truong_id for update;
  if not found then return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.'); end if;
  delete from public.ket_qua where phong_id=p_phong_id; get diagnostics v_ket_qua=row_count;
  delete from public.exam_submissions where phong_id=p_phong_id; get diagnostics v_submissions=row_count;
  update public.phong_thi set thoi_gian_mo=null where id=p_phong_id;
  return jsonb_build_object('status','success','ket_qua_deleted',v_ket_qua,'submissions_deleted',v_submissions);
end;
$function$;

create or replace function public.rpc_grade_pending_room(p_staff_token text, p_ma_gv text, p_truong_id uuid, p_phong_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_gv_id uuid; v_teacher_ma_gv text; v_teacher_truong_id uuid; v_teacher_mon_id uuid; v_quyen text; v_submission_id uuid; v_response jsonb; v_attempted integer:=0; v_graded integer:=0; v_failed integer:=0;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select ma_gv, truong_id, mon_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen
  from public.giao_vien where id=v_gv_id limit 1;
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) or (v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id)
     or not exists (select 1 from public.phong_thi where id=p_phong_id and truong_id=p_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  for v_submission_id in select id from public.exam_submissions where phong_id=p_phong_id and status in ('received','grading_error') order by received_at loop
    v_attempted:=v_attempted+1; v_response:=public.rpc_grade_submission(v_submission_id);
    if v_response->>'status'='graded' then v_graded:=v_graded+1; else v_failed:=v_failed+1; end if;
  end loop;
  return jsonb_build_object('status','success','attempted',v_attempted,'graded',v_graded,'failed',v_failed);
end;
$function$;

create or replace function public.rpc_luu_de_thi_len_phong(
  p_staff_token text, p_ma_gv text, p_truong_id uuid, p_mon_id uuid, p_ma_phong text, p_de_thi jsonb
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_gv_id uuid; v_teacher_ma_gv text; v_teacher_truong_id uuid; v_teacher_mon_id uuid; v_quyen text; v_effective_truong_id uuid; v_effective_mon_id uuid; v_phong_id uuid; v_room_mon_id uuid; v_exam jsonb; v_count integer:=0;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  if nullif(trim(p_ma_phong), '') is null then
    return jsonb_build_object('status','error','message','Mã phòng không được để trống.');
  end if;
  if jsonb_typeof(p_de_thi) <> 'array' then
    return jsonb_build_object('status','error','message','Đề thi phải là một mảng JSON.');
  end if;
  if jsonb_array_length(p_de_thi) = 0 then
    return jsonb_build_object('status','error','message','Đề thi không được để trống.');
  end if;
  select ma_gv, truong_id, mon_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen
  from public.giao_vien where id=v_gv_id limit 1;
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc môn học.');
  end if;
  if v_quyen = 'Admin' then
    if p_truong_id is null or p_mon_id is null then
      return jsonb_build_object('status','error','message','Admin phải chọn trường và môn học đích.');
    end if;
    v_effective_truong_id := p_truong_id;
    v_effective_mon_id := p_mon_id;
  else
    if p_truong_id is distinct from v_teacher_truong_id or v_teacher_mon_id is null
       or (p_mon_id is not null and p_mon_id <> v_teacher_mon_id) then
      return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc môn học.');
    end if;
    v_effective_truong_id := v_teacher_truong_id;
    v_effective_mon_id := v_teacher_mon_id;
  end if;
  select id, mon_id into v_phong_id, v_room_mon_id from public.phong_thi
  where ma_phong=trim(p_ma_phong) and truong_id=v_effective_truong_id limit 1;
  if found and v_room_mon_id is distinct from v_effective_mon_id then
    return jsonb_build_object('status','error','message','Mã phòng đã thuộc một môn học khác hoặc chưa được gán môn hợp lệ.');
  end if;
  if v_phong_id is null then
    insert into public.phong_thi(ma_phong, truong_id, mon_id, ten_dot, doi_tuong, thoi_gian, trang_thai)
    values (trim(p_ma_phong), v_effective_truong_id, v_effective_mon_id, 'Bai kiem tra', 'TatCa', 45, 'CHO_THI')
    returning id into v_phong_id;
  end if;
  delete from public.de_thi where phong_id=v_phong_id;
  for v_exam in select value from jsonb_array_elements(p_de_thi) loop
    insert into public.de_thi(phong_id,ma_de,cau_so) values (v_phong_id,v_exam->>'ma_de',v_exam->'cau_so'); v_count:=v_count+1;
  end loop;
  return jsonb_build_object('status','success','phong_id',v_phong_id,'count',v_count);
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

do $block$
begin
  if exists (
    select 1 from public.giao_vien gv
    left join public.mon_hoc mh on mh.id=gv.mon_id
    where gv.mon_id is not null and mh.id is null
  ) then
    raise exception 'Cannot add giao_vien_mon_id_fkey: orphan mon_id exists';
  end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and c.conrelid='public.giao_vien'::regclass
      and c.confrelid='public.mon_hoc'::regclass and a.attname='mon_id'
  ) then
    alter table public.giao_vien add constraint giao_vien_mon_id_fkey
      foreign key(mon_id) references public.mon_hoc(id) on delete set null;
  end if;
end;
$block$;

revoke insert, update, delete on public.truong_hoc from anon, authenticated;
revoke insert, update, delete on public.mon_hoc from anon, authenticated;
revoke insert, update, delete, truncate on table public.hoc_sinh, public.giao_vien, public.truong_hoc, public.mon_hoc, public.ngan_hang, public.phong_thi, public.de_thi from anon, authenticated;
revoke select on table public.ngan_hang from anon, authenticated;
revoke update on public.phong_thi from anon, authenticated;
drop policy if exists room_update_minimal on public.phong_thi;
revoke select on table public.giao_vien from anon, authenticated;
grant select (id, truong_id, ma_gv, ho_ten, quyen, created_at, mon_id) on table public.giao_vien to anon, authenticated;
revoke select on table public.hoc_sinh from anon, authenticated;
grant select (id, truong_id, ma_hs, ho_ten, lop, quyen, created_at) on table public.hoc_sinh to anon, authenticated;

create or replace function public.rpc_lay_danh_sach_phong_thi_gv(
  p_staff_token text, p_ma_gv text, p_truong_id uuid, p_mon_id uuid default null, p_xem_toan_bo boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_gv_id uuid; v_teacher_ma_gv text; v_teacher_truong_id uuid; v_quyen text; v_rooms jsonb;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.');
  end if;
  select ma_gv, truong_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_quyen from public.giao_vien where id=v_gv_id;
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  if v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pt.id,'ma_phong',pt.ma_phong,'ten_dot',pt.ten_dot,'doi_tuong',pt.doi_tuong,'thoi_gian',pt.thoi_gian,
    'trang_thai',pt.trang_thai,'thoi_gian_mo',pt.thoi_gian_mo,'truong_id',pt.truong_id,'mon_id',pt.mon_id,'ten_truong',th.ten_truong
  ) order by pt.created_at desc), '[]'::jsonb) into v_rooms
  from public.phong_thi pt left join public.truong_hoc th on th.id=pt.truong_id
  where (p_mon_id is null or pt.mon_id=p_mon_id)
    and (v_quyen = 'Admin' and p_xem_toan_bo = true or (v_quyen = 'Admin' and p_xem_toan_bo = false and pt.truong_id=p_truong_id) or (v_quyen <> 'Admin' and pt.truong_id=v_teacher_truong_id));
  return jsonb_build_object('status','success','rooms',v_rooms);
end;
$function$;

revoke all on function public.rpc_login_giao_vien(text, text) from public;
revoke all on function public.rpc_admin_logout(text) from public;
revoke all on function public.rpc_staff_logout(text) from public;
revoke all on function public.rpc_change_giao_vien_password(uuid, uuid, text, text) from public;
revoke all on function public.rpc_admin_control(text, text, jsonb) from public;
revoke all on function public.rpc_giao_vien_bank_read(text, text, uuid, uuid) from public;
revoke all on function public.rpc_dieu_khien_phong_thi(text, uuid, uuid, text, text, text, int, boolean) from public, anon, authenticated;
revoke all on function public.rpc_xoa_phong_thi(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.rpc_reset_room_results(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.rpc_grade_pending_room(text, uuid, uuid) from public, anon, authenticated;
do $block$
begin
  if to_regprocedure('public.rpc_lay_danh_sach_phong_thi_gv(text,uuid,uuid,boolean)') is not null then
    execute 'revoke all on function public.rpc_lay_danh_sach_phong_thi_gv(text, uuid, uuid, boolean) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.rpc_giao_vien_bank_write(text,uuid,text,jsonb)') is not null then
    execute 'revoke all on function public.rpc_giao_vien_bank_write(text, uuid, text, jsonb) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.rpc_xoa_de_trong_phong(text,uuid,uuid)') is not null then
    execute 'revoke all on function public.rpc_xoa_de_trong_phong(text, uuid, uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.rpc_luu_de_thi_len_phong(text,uuid,uuid,text,jsonb)') is not null then
    execute 'revoke all on function public.rpc_luu_de_thi_len_phong(text, uuid, uuid, text, jsonb) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.rpc_admin_reset_pass(text,text,uuid,text,uuid[],text)') is not null then
    execute 'revoke all on function public.rpc_admin_reset_pass(text, text, uuid, text, uuid[], text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.rpc_admin_xoa_tk(text,text,uuid,text,uuid[])') is not null then
    execute 'revoke all on function public.rpc_admin_xoa_tk(text, text, uuid, text, uuid[]) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.rpc_admin_xoa_kho(text,text,uuid)') is not null then
    execute 'revoke all on function public.rpc_admin_xoa_kho(text, text, uuid) from public, anon, authenticated';
  end if;
end;
$block$;
grant execute on function public.rpc_login_giao_vien(text, text), public.rpc_admin_logout(text), public.rpc_staff_logout(text), public.rpc_change_giao_vien_password(uuid, uuid, text, text), public.rpc_admin_control(text, text, jsonb), public.rpc_giao_vien_bank_read(text, text, uuid, uuid), public.rpc_giao_vien_bank_write(text, text, uuid, text, jsonb), public.rpc_xoa_de_trong_phong(text, text, uuid, uuid), public.rpc_dieu_khien_phong_thi(text, text, uuid, uuid, text, text, text, int, boolean), public.rpc_xoa_phong_thi(text, text, uuid, uuid), public.rpc_reset_room_results(text, text, uuid, uuid), public.rpc_grade_pending_room(text, text, uuid, uuid), public.rpc_luu_de_thi_len_phong(text, text, uuid, uuid, text, jsonb), public.rpc_lay_danh_sach_phong_thi_gv(text, text, uuid, uuid, boolean) to anon, authenticated;
