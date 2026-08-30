-- =========================================================================
-- SECURE STUDENT SESSION, RESULT PUBLICATION STATUS & TABLE ACCESS HARDENING
-- P0-007 Migration
-- =========================================================================

-- =========================================================================
-- 1. STUDENT SESSION ARCHITECTURE
-- =========================================================================

create table if not exists public.student_sessions (
  token_hash text primary key,
  hs_id uuid not null references public.hoc_sinh(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null
);
alter table public.student_sessions enable row level security;
revoke all on table public.student_sessions from anon, authenticated;

create or replace function public._student_session_hs_id(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hs_id uuid;
begin
  if p_token is null or btrim(p_token) = '' then
    return null;
  end if;

  select s.hs_id into v_hs_id
  from public.student_sessions s
  join public.hoc_sinh hs on hs.id = s.hs_id
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now()
    and hs.mat_khau not in ('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', '123456')
  limit 1;

  return v_hs_id;
end;
$function$;

revoke all on function public._student_session_hs_id(text) from public, anon, authenticated;

-- =========================================================================
-- 2. STUDENT AUTHENTICATION & SESSION MANAGEMENT
-- =========================================================================

create or replace function public.rpc_login_hoc_sinh(
  p_ma_truong text,
  p_ma_hs text,
  p_mat_khau text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_truong_id uuid;
  v_hs record;
  v_default_hash constant text := '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
  v_student_token text;
  v_expires_at timestamptz;
  v_response jsonb;
begin
  select id into v_truong_id
  from public.truong_hoc
  where ma_truong = upper(trim(p_ma_truong))
  limit 1;

  if v_truong_id is null then
    return jsonb_build_object('status', 'error', 'message', 'Mã trường không hợp lệ!');
  end if;

  select id, truong_id, ma_hs, ho_ten, lop, mat_khau
  into v_hs
  from public.hoc_sinh
  where truong_id = v_truong_id
    and ma_hs = upper(trim(p_ma_hs))
    and (mat_khau = p_mat_khau or (mat_khau = '123456' and p_mat_khau = v_default_hash))
  limit 1;

  if v_hs.id is null then
    return jsonb_build_object('status', 'error', 'message', 'Thông tin tài khoản không chính xác!');
  end if;

  v_response := jsonb_build_object(
    'status', 'success',
    'user', jsonb_build_object(
      'id', v_hs.id,
      'truong_id', v_hs.truong_id,
      'ma_hs', v_hs.ma_hs,
      'ho_ten', v_hs.ho_ten,
      'lop', v_hs.lop,
      'must_change_password', v_hs.mat_khau in (v_default_hash, '123456')
    ),
    'must_change_password', v_hs.mat_khau in (v_default_hash, '123456')
  );

  if v_hs.mat_khau not in (v_default_hash, '123456') then
    v_student_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_expires_at := now() + interval '24 hours';
    insert into public.student_sessions(token_hash, hs_id, expires_at)
    values (encode(extensions.digest(v_student_token, 'sha256'), 'hex'), v_hs.id, v_expires_at);

    v_response := v_response || jsonb_build_object(
      'student_token', v_student_token,
      'student_expires_at', v_expires_at
    );
  end if;

  return v_response;
end;
$function$;

revoke all on function public.rpc_login_hoc_sinh(text, text, text) from public;
grant execute on function public.rpc_login_hoc_sinh(text, text, text) to anon, authenticated;

create or replace function public.rpc_student_logout(p_student_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.student_sessions
  set revoked_at = now()
  where token_hash = encode(extensions.digest(coalesce(p_student_token, ''), 'sha256'), 'hex')
    and revoked_at is null;
  return jsonb_build_object('status', 'success');
end;
$function$;

revoke all on function public.rpc_student_logout(text) from public;
grant execute on function public.rpc_student_logout(text) to anon, authenticated;

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

  update public.student_sessions
  set revoked_at = now()
  where hs_id = p_hs_id and revoked_at is null;

  return jsonb_build_object('status', 'success', 'message', 'Cập nhật mật khẩu thành công.');
end;
$function$;

revoke all on function public.rpc_change_hoc_sinh_password(uuid, uuid, text, text) from public;
grant execute on function public.rpc_change_hoc_sinh_password(uuid, uuid, text, text) to anon, authenticated;

-- =========================================================================
-- 3. TOKEN-BOUND STUDENT EXAM DELIVERY RPC (EXACT PRESERVED ASSIGNMENT)
-- =========================================================================

create or replace function public.rpc_hoc_sinh_get_exam(
  p_student_token text,
  p_phong_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hs_id uuid;
  v_student record;
  v_room record;
  v_class_list text[];
  v_allowed boolean := false;
  v_exam record;
  v_exam_count integer;
  v_clean_ma_hs text;
  v_hash bigint := 0;
  v_char_code integer;
  v_exam_index integer;
  v_cau_so jsonb;
  v_clean_cau_so jsonb;
begin
  if p_student_token is null or btrim(p_student_token) = '' or p_phong_id is null then
    return jsonb_build_object('status', 'error', 'message', 'Tham số không hợp lệ.');
  end if;

  -- 1. Resolve token-bound student identity
  v_hs_id := public._student_session_hs_id(p_student_token);
  if v_hs_id is null then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  select id, truong_id, lop, ma_hs into v_student
  from public.hoc_sinh
  where id = v_hs_id;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Học sinh không tồn tại.');
  end if;

  -- 2. Verify room exists and belongs to student's school
  select id, truong_id, trang_thai, thoi_gian_mo, doi_tuong
  into v_room
  from public.phong_thi
  where id = p_phong_id and truong_id = v_student.truong_id;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Phòng thi không tồn tại hoặc không thuộc trường của bạn.');
  end if;

  -- 3. Verify room state is MO_PHONG
  if v_room.trang_thai <> 'MO_PHONG' then
    return jsonb_build_object('status', 'error', 'code', 'room_not_open', 'message', 'Phòng thi hiện không mở để làm bài.');
  end if;

  -- 4. Verify student is assigned to this room
  if v_room.doi_tuong is null or v_room.doi_tuong = '' or v_room.doi_tuong = 'TatCa' then
    v_allowed := true;
  else
    select array_agg(btrim(val)) into v_class_list
    from unnest(string_to_array(v_room.doi_tuong, ',')) as val;
    if v_student.lop = any(v_class_list) or v_student.ma_hs = any(v_class_list) then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    if exists (select 1 from public.ket_qua where phong_id = p_phong_id and hs_id = v_hs_id)
       or exists (select 1 from public.exam_submissions where phong_id = p_phong_id and hs_id = v_hs_id) then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    return jsonb_build_object('status', 'error', 'message', 'Bạn không có quyền truy cập phòng thi này.');
  end if;

  -- 5. Deterministically select student's exam variant preserving exact legacy algorithm
  select count(*) into v_exam_count
  from public.de_thi
  where phong_id = p_phong_id;

  if v_exam_count = 0 then
    return jsonb_build_object('status', 'error', 'message', 'Phòng thi chưa có đề thi.');
  end if;

  v_clean_ma_hs := trim(v_student.ma_hs);

  if v_clean_ma_hs ~ '^[0-9]+$' then
    v_exam_index := cast(v_clean_ma_hs as int) % v_exam_count;
  else
    v_hash := 0;
    for i in 1..length(v_clean_ma_hs) loop
      v_char_code := ascii(substr(v_clean_ma_hs, i, 1));
      v_hash := ((v_hash * 31) + v_char_code) % 2147483647;
    end loop;
    v_exam_index := v_hash % v_exam_count;
  end if;

  select id, phong_id, ma_de, cau_so
  into v_exam
  from public.de_thi
  where phong_id = p_phong_id
  order by ma_de asc
  offset v_exam_index
  limit 1;

  if v_exam.id is null then
    return jsonb_build_object('status', 'error', 'message', 'Không tìm thấy đề thi phù hợp.');
  end if;

  v_cau_so := case when jsonb_typeof(v_exam.cau_so) = 'string' then (v_exam.cau_so #>> '{}')::jsonb else v_exam.cau_so end;

  -- 6. Strip all answer key fields
  if jsonb_typeof(v_cau_so) = 'array' then
    select coalesce(jsonb_agg(
      q - 'dap_an_dung' - 'DapAnDung' - 'dapAnDung' - 'DAP_AN_DUNG' - 'dung' - 'Dung' - 'DUNG'
    ), '[]'::jsonb)
    into v_clean_cau_so
    from jsonb_array_elements(v_cau_so) as q;
  else
    v_clean_cau_so := v_cau_so;
  end if;

  return jsonb_build_object(
    'status', 'success',
    'ma_de', v_exam.ma_de,
    'cau_so', v_clean_cau_so
  );
end;
$function$;

revoke all on function public.rpc_hoc_sinh_get_exam(text, uuid) from public;
grant execute on function public.rpc_hoc_sinh_get_exam(text, uuid) to anon, authenticated;

-- Retire legacy lay_de_thi_an_toan from browser access
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lay_de_thi_an_toan'
  ) then
    execute 'revoke all on function public.lay_de_thi_an_toan from public, anon, authenticated';
  end if;
end;
$$;

-- =========================================================================
-- 4. TOKEN-BOUND STUDENT GRADING WRAPPER (NO SCORE LEAKAGE)
-- =========================================================================

create or replace function public.rpc_hoc_sinh_grade_submission(
  p_student_token text,
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hs_id uuid;
  v_sub record;
  v_grade_res jsonb;
begin
  if p_student_token is null or btrim(p_student_token) = '' or p_submission_id is null then
    return jsonb_build_object('status', 'error', 'message', 'Tham số không hợp lệ.');
  end if;

  v_hs_id := public._student_session_hs_id(p_student_token);
  if v_hs_id is null then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  select id, hs_id, phong_id, status
  into v_sub
  from public.exam_submissions
  where id = p_submission_id;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Bài nộp không tồn tại.');
  end if;

  if v_sub.hs_id <> v_hs_id then
    return jsonb_build_object('status', 'error', 'message', 'Bạn không có quyền chấm bài nộp này.');
  end if;

  -- Call underlying canonical grading implementation
  v_grade_res := public.rpc_grade_submission(p_submission_id);

  if (v_grade_res->>'status') <> 'graded' then
    return v_grade_res;
  end if;

  -- Return sanitized response WITHOUT score, details, or answers
  return jsonb_build_object(
    'status', 'graded',
    'submission_id', p_submission_id,
    'graded_at', now()
  );
end;
$function$;

revoke all on function public.rpc_hoc_sinh_grade_submission(text, uuid) from public;
grant execute on function public.rpc_hoc_sinh_grade_submission(text, uuid) to anon, authenticated;

-- Revoke direct browser execute on legacy / direct grading functions
revoke all on function public.rpc_grade_submission(uuid) from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'nop_bai_va_cham_diem'
  ) then
    execute 'revoke all on function public.nop_bai_va_cham_diem from public, anon, authenticated';
  end if;
end;
$$;

-- =========================================================================
-- 5. STUDENT RESULT & PUBLICATION STATUS RPC
-- =========================================================================

create or replace function public.rpc_hoc_sinh_result_status(
  p_student_token text,
  p_phong_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hs_id uuid;
  v_student record;
  v_room record;
  v_result record;
  v_exam jsonb := null;
  v_result_payload jsonb := null;
  v_allowed boolean := false;
  v_class_list text[];
begin
  if p_student_token is null or btrim(p_student_token) = '' or p_phong_id is null then
    return jsonb_build_object('status', 'error', 'message', 'Tham số không hợp lệ.');
  end if;

  v_hs_id := public._student_session_hs_id(p_student_token);
  if v_hs_id is null then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  select id, truong_id, lop, ma_hs into v_student
  from public.hoc_sinh
  where id = v_hs_id;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Học sinh không tồn tại.');
  end if;

  select id, truong_id, trang_thai, thoi_gian_mo, doi_tuong
  into v_room
  from public.phong_thi
  where id = p_phong_id and truong_id = v_student.truong_id;

  if not found then
    return jsonb_build_object(
      'status', 'success',
      'room_exists', false,
      'phong_id', p_phong_id,
      'trang_thai', null,
      'thoi_gian_mo', null,
      'has_result', false,
      'result', null
    );
  end if;

  if v_room.doi_tuong is null or v_room.doi_tuong = '' or v_room.doi_tuong = 'TatCa' then
    v_allowed := true;
  else
    select array_agg(btrim(val)) into v_class_list
    from unnest(string_to_array(v_room.doi_tuong, ',')) as val;
    if v_student.lop = any(v_class_list) or v_student.ma_hs = any(v_class_list) then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    if exists (select 1 from public.ket_qua where phong_id = p_phong_id and hs_id = v_hs_id)
       or exists (select 1 from public.exam_submissions where phong_id = p_phong_id and hs_id = v_hs_id) then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    return jsonb_build_object('status', 'error', 'message', 'Bạn không có quyền truy cập phòng thi này.');
  end if;

  select * into v_result
  from public.ket_qua
  where phong_id = p_phong_id and hs_id = v_hs_id;

  if v_result is null then
    return jsonb_build_object(
      'status', 'success',
      'room_exists', true,
      'phong_id', v_room.id,
      'trang_thai', v_room.trang_thai,
      'thoi_gian_mo', v_room.thoi_gian_mo,
      'has_result', false,
      'result', null
    );
  end if;

  if v_room.trang_thai = 'CONG_BO_DIEM' then
    v_result_payload := jsonb_build_object(
      'diem', v_result.diem,
      'ma_de', v_result.ma_de,
      'so_lan_vi_pham', coalesce(v_result.so_lan_vi_pham, 0),
      'chi_tiet', null
    );
  elsif v_room.trang_thai = 'XEM_DAP_AN' then
    select case when jsonb_typeof(cau_so) = 'string' then (cau_so #>> '{}')::jsonb else cau_so end
    into v_exam
    from public.de_thi
    where phong_id = p_phong_id and ma_de = v_result.ma_de
    limit 1;

    v_result_payload := jsonb_build_object(
      'diem', v_result.diem,
      'ma_de', v_result.ma_de,
      'so_lan_vi_pham', coalesce(v_result.so_lan_vi_pham, 0),
      'chi_tiet', v_result.chi_tiet,
      'de_thi', v_exam
    );
  else
    v_result_payload := null;
  end if;

  return jsonb_build_object(
    'status', 'success',
    'room_exists', true,
    'phong_id', v_room.id,
    'trang_thai', v_room.trang_thai,
    'thoi_gian_mo', v_room.thoi_gian_mo,
    'has_result', true,
    'result', v_result_payload
  );
end;
$function$;

revoke all on function public.rpc_hoc_sinh_result_status(text, uuid) from public;
grant execute on function public.rpc_hoc_sinh_result_status(text, uuid) to anon, authenticated;

-- =========================================================================
-- 6. TEACHER STAFF-TOKEN-AUTHORIZED RPCS (WITH ADMIN CROSS-SCHOOL SUPPORT)
-- =========================================================================

-- 6.1 Teacher Room Results / Dashboard RPC
create or replace function public.rpc_lay_ket_qua_phong_gv(
  p_staff_token text,
  p_phong_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_gv record;
  v_room record;
  v_results jsonb;
begin
  if p_staff_token is null or p_phong_id is null then
    return jsonb_build_object('status', 'error', 'message', 'Tham số không hợp lệ.');
  end if;

  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status', 'error', 'code', 'staff_session_invalid', 'message', 'Phiên làm việc đã hết hạn.');
  end if;

  select id, truong_id, quyen into v_gv
  from public.giao_vien
  where id = v_gv_id;

  select id, truong_id into v_room
  from public.phong_thi
  where id = p_phong_id;

  if v_room.id is null then
    return jsonb_build_object('status', 'error', 'message', 'Phòng thi không tồn tại.');
  end if;

  if coalesce(v_gv.quyen, '') <> 'Admin' and v_room.truong_id <> v_gv.truong_id then
    return jsonb_build_object('status', 'error', 'message', 'Không có quyền truy cập phòng thi này.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', kq.id,
    'phong_id', kq.phong_id,
    'hs_id', kq.hs_id,
    'ma_de', kq.ma_de,
    'diem', kq.diem,
    'chi_tiet', kq.chi_tiet,
    'so_lan_vi_pham', coalesce(kq.so_lan_vi_pham, 0),
    'created_at', kq.created_at,
    'hoc_sinh', case when hs.id is not null then jsonb_build_object(
      'ma_hs', hs.ma_hs,
      'ho_ten', hs.ho_ten,
      'lop', hs.lop
    ) else null end
  ) order by kq.created_at desc), '[]'::jsonb)
  into v_results
  from public.ket_qua kq
  left join public.hoc_sinh hs on hs.id = kq.hs_id
  where kq.phong_id = p_phong_id;

  return jsonb_build_object('status', 'success', 'results', v_results);
end;
$function$;

revoke all on function public.rpc_lay_ket_qua_phong_gv(text, uuid) from public;
grant execute on function public.rpc_lay_ket_qua_phong_gv(text, uuid) to anon, authenticated;

-- 6.2 Teacher Exam Preview RPC
create or replace function public.rpc_staff_exam_preview(
  p_staff_token text,
  p_phong_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_gv record;
  v_room record;
  v_exams jsonb;
begin
  if p_staff_token is null or p_phong_id is null then
    return jsonb_build_object('status', 'error', 'message', 'Tham số không hợp lệ.');
  end if;

  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status', 'error', 'code', 'staff_session_invalid', 'message', 'Phiên làm việc đã hết hạn.');
  end if;

  select id, truong_id, quyen into v_gv
  from public.giao_vien
  where id = v_gv_id;

  select id, truong_id into v_room
  from public.phong_thi
  where id = p_phong_id;

  if v_room.id is null then
    return jsonb_build_object('status', 'error', 'message', 'Phòng thi không tồn tại.');
  end if;

  if coalesce(v_gv.quyen, '') <> 'Admin' and v_room.truong_id <> v_gv.truong_id then
    return jsonb_build_object('status', 'error', 'message', 'Không có quyền truy cập phòng thi này.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', dt.id,
    'phong_id', dt.phong_id,
    'ma_de', dt.ma_de,
    'cau_so', dt.cau_so,
    'created_at', dt.created_at
  ) order by dt.ma_de), '[]'::jsonb)
  into v_exams
  from public.de_thi dt
  where dt.phong_id = p_phong_id;

  return jsonb_build_object('status', 'success', 'exams', v_exams);
end;
$function$;

revoke all on function public.rpc_staff_exam_preview(text, uuid) from public;
grant execute on function public.rpc_staff_exam_preview(text, uuid) to anon, authenticated;

-- =========================================================================
-- 7. REVOKE DIRECT TABLE ACCESS & NEUTRALIZE PERMISSIVE RLS POLICIES
-- =========================================================================

revoke all on table public.ket_qua from anon, authenticated;
revoke all on table public.de_thi from anon, authenticated;

drop policy if exists result_read_minimal on public.ket_qua;
drop policy if exists "result_read_minimal" on public.ket_qua;
drop policy if exists exam_read_minimal on public.de_thi;
drop policy if exists "exam_read_minimal" on public.de_thi;
drop policy if exists "Cho phép đọc đề thi" on public.de_thi;
drop policy if exists "Cho phép đọc kết quả" on public.ket_qua;

alter table public.ket_qua enable row level security;
alter table public.de_thi enable row level security;
