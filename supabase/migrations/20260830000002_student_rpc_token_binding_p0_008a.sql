-- =========================================================================
-- SECURE TOKEN-BOUND STUDENT RPC SECURITY LAYER (PHASE A)
-- P0-008A Migration
-- =========================================================================

-- =========================================================================
-- 1. SECURE SUBMISSION RECEIVE RPC (TOKEN-BOUND & SERVER-ASSIGNED EXAM)
-- =========================================================================

create or replace function public.rpc_hoc_sinh_receive_submission(
  p_student_token text,
  p_attempt_id uuid,
  p_phong_id uuid,
  p_ma_de text,
  p_raw_answers jsonb,
  p_client_submitted_at timestamptz default null,
  p_room_opened_at bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hs_id uuid;
  v_student record;
  v_submission public.exam_submissions%rowtype;
  v_room public.phong_thi%rowtype;
  v_exam_count integer;
  v_clean_ma_hs text;
  v_hash bigint := 0;
  v_char_code integer;
  v_exam_index integer;
  v_expected_ma_de text;
begin
  if p_student_token is null or btrim(p_student_token) = '' then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  if p_attempt_id is null or p_phong_id is null or p_raw_answers is null
     or jsonb_typeof(p_raw_answers) <> 'array' or coalesce(trim(p_ma_de), '') = '' then
    return jsonb_build_object('status', 'error', 'message', 'Dữ liệu nộp bài không hợp lệ.');
  end if;

  -- 1. Resolve token-bound student identity
  v_hs_id := public._student_session_hs_id(p_student_token);
  if v_hs_id is null then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  select id, truong_id, ma_hs, lop
  into v_student
  from public.hoc_sinh
  where id = v_hs_id;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Học sinh không tồn tại.');
  end if;

  -- 2. Fast idempotency check with CRITICAL OWNERSHIP enforcement
  select * into v_submission from public.exam_submissions where attempt_id = p_attempt_id;
  if found then
    if v_submission.hs_id = v_hs_id and v_submission.truong_id = v_student.truong_id and v_submission.phong_id = p_phong_id then
      return jsonb_build_object(
        'status', 'received',
        'submission_id', v_submission.id,
        'attempt_id', v_submission.attempt_id,
        'received_at', v_submission.received_at
      );
    else
      -- Foreign attempt collision: fail closed without metadata leakage
      return jsonb_build_object('status', 'error', 'message', 'Attempt ID không hợp lệ hoặc đã tồn tại.');
    end if;
  end if;

  -- 3. Room shared lock and validation
  select * into v_room from public.phong_thi
  where id = p_phong_id and truong_id = v_student.truong_id limit 1 for share;

  if not found or v_room.trang_thai not in ('MO_PHONG', 'THU_BAI', 'XEM_DAP_AN', 'CONG_BO_DIEM') then
    return jsonb_build_object('status', 'error', 'message', 'Phòng thi không nhận bài.');
  end if;

  if p_room_opened_at is null or v_room.thoi_gian_mo is distinct from p_room_opened_at then
    return jsonb_build_object('status', 'error', 'code', 'room_attempt_changed', 'message', 'Lượt thi đã được reset.');
  end if;

  -- 4. Exact Legacy Eligibility check (no historical override bypass)
  if v_room.doi_tuong is not null and v_room.doi_tuong <> 'TatCa'
     and not (v_student.lop = any(regexp_split_to_array(v_room.doi_tuong, '\s*,\s*'))
       or v_student.ma_hs = any(regexp_split_to_array(v_room.doi_tuong, '\s*,\s*'))) then
    return jsonb_build_object('status', 'error', 'message', 'Học sinh không thuộc phòng thi.');
  end if;

  -- 5. Deterministic Server-Assigned Exam Verification
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

  select ma_de into v_expected_ma_de
  from public.de_thi
  where phong_id = p_phong_id
  order by ma_de asc
  offset v_exam_index
  limit 1;

  if v_expected_ma_de is null or trim(p_ma_de) <> trim(v_expected_ma_de) then
    return jsonb_build_object('status', 'error', 'code', 'exam_assignment_mismatch', 'message', 'Mã đề thi không khớp với đề thi được phân công.');
  end if;

  -- 6. Insert durable submission receipt with safe conflict handling
  insert into public.exam_submissions (
    attempt_id, truong_id, phong_id, hs_id, ma_de, raw_answers, status, client_submitted_at
  ) values (
    p_attempt_id, v_student.truong_id, p_phong_id, v_hs_id, v_expected_ma_de, p_raw_answers, 'received', p_client_submitted_at
  ) on conflict do nothing
  returning * into v_submission;

  if not found then
    select * into v_submission from public.exam_submissions
    where phong_id = p_phong_id
      and hs_id = v_hs_id
      and truong_id = v_student.truong_id;
  end if;

  if v_submission.id is null then
    return jsonb_build_object('status', 'error', 'code', 'submission_conflict', 'message', 'Không thể hoàn tất nộp bài do xung đột dữ liệu.');
  end if;

  return jsonb_build_object(
    'status', 'received',
    'submission_id', v_submission.id,
    'attempt_id', v_submission.attempt_id,
    'received_at', v_submission.received_at
  );
end;
$function$;

revoke all on function public.rpc_hoc_sinh_receive_submission(text, uuid, uuid, text, jsonb, timestamptz, bigint) from public;
grant execute on function public.rpc_hoc_sinh_receive_submission(text, uuid, uuid, text, jsonb, timestamptz, bigint) to anon, authenticated;

-- =========================================================================
-- 2. SECURE SUBMISSION RECEIPT STATUS RPC (TOKEN-BOUND)
-- =========================================================================

create or replace function public.rpc_hoc_sinh_submission_receipt_status(
  p_student_token text,
  p_attempt_id uuid,
  p_phong_id uuid,
  p_room_opened_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hs_id uuid;
  v_student record;
  v_submission public.exam_submissions%rowtype;
  v_room public.phong_thi%rowtype;
begin
  if p_student_token is null or btrim(p_student_token) = '' then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  v_hs_id := public._student_session_hs_id(p_student_token);
  if v_hs_id is null then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  select id, truong_id into v_student from public.hoc_sinh where id = v_hs_id;
  if not found then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Học sinh không tồn tại.');
  end if;

  if p_attempt_id is not null then
    select * into v_submission from public.exam_submissions where attempt_id = p_attempt_id;
    if found and v_submission.hs_id = v_hs_id and v_submission.truong_id = v_student.truong_id and (p_phong_id is null or v_submission.phong_id = p_phong_id) then
      return jsonb_build_object(
        'status', v_submission.status,
        'submission_id', v_submission.id,
        'attempt_id', v_submission.attempt_id,
        'received_at', v_submission.received_at,
        'reset_confirmed', false
      );
    end if;
  end if;

  select * into v_room from public.phong_thi where id = p_phong_id and truong_id = v_student.truong_id;
  if not found then
    return jsonb_build_object('status', 'missing', 'reset_confirmed', true, 'room_exists', false);
  end if;

  if p_room_opened_at is not null and v_room.thoi_gian_mo is distinct from p_room_opened_at then
    return jsonb_build_object('status', 'missing', 'reset_confirmed', true, 'room_exists', true);
  end if;

  return jsonb_build_object('status', 'missing', 'reset_confirmed', false, 'room_exists', true);
end;
$function$;

revoke all on function public.rpc_hoc_sinh_submission_receipt_status(text, uuid, uuid, bigint) from public;
grant execute on function public.rpc_hoc_sinh_submission_receipt_status(text, uuid, uuid, bigint) to anon, authenticated;

-- =========================================================================
-- 3. SECURE ANTI-CHEAT VIOLATION UPDATE RPC (TOKEN-BOUND & MONOTONIC)
-- =========================================================================

create or replace function public.rpc_hoc_sinh_update_violation(
  p_student_token text,
  p_phong_id uuid,
  p_so_lan integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hs_id uuid;
begin
  if p_student_token is null or btrim(p_student_token) = '' then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  v_hs_id := public._student_session_hs_id(p_student_token);
  if v_hs_id is null then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  if p_phong_id is null or p_so_lan is null or p_so_lan < 0 then
    return jsonb_build_object('status', 'error', 'message', 'Tham số không hợp lệ.');
  end if;

  update public.ket_qua
  set so_lan_vi_pham = greatest(coalesce(so_lan_vi_pham, 0), p_so_lan)
  where phong_id = p_phong_id
    and hs_id = v_hs_id;

  return jsonb_build_object('status', 'success');
end;
$function$;

revoke all on function public.rpc_hoc_sinh_update_violation(text, uuid, integer) from public;
grant execute on function public.rpc_hoc_sinh_update_violation(text, uuid, integer) to anon, authenticated;

-- =========================================================================
-- 4. SECURE ROOM LOOKUP RPC (TOKEN-BOUND & EXACT LEGACY SHAPE)
-- =========================================================================

create or replace function public.rpc_hoc_sinh_room_info(
  p_student_token text,
  p_ma_phong text
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
begin
  if p_student_token is null or btrim(p_student_token) = '' or p_ma_phong is null or btrim(p_ma_phong) = '' then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Tham số không hợp lệ.');
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

  select
    pt.id,
    pt.trang_thai,
    pt.thoi_gian,
    pt.thoi_gian_mo,
    pt.doi_tuong,
    case when mh.id is not null then jsonb_build_object('ten_mon', mh.ten_mon) else null end as mon_hoc
  into v_room
  from public.phong_thi pt
  left join public.mon_hoc mh on mh.id = pt.mon_id
  where pt.truong_id = v_student.truong_id
    and pt.ma_phong = trim(p_ma_phong)
  limit 1;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Không tìm thấy phòng thi này.');
  end if;

  -- Exact Legacy Eligibility check (no historical override bypass)
  if v_room.doi_tuong is not null and v_room.doi_tuong <> 'TatCa'
     and not (v_student.lop = any(regexp_split_to_array(v_room.doi_tuong, '\s*,\s*'))
       or v_student.ma_hs = any(regexp_split_to_array(v_room.doi_tuong, '\s*,\s*'))) then
    return jsonb_build_object('status', 'error', 'message', 'Bạn không có quyền tham gia phòng thi này do không thuộc đối tượng được giao bài.');
  end if;

  return jsonb_build_object(
    'status', 'success',
    'room', jsonb_build_object(
      'id', v_room.id,
      'trang_thai', v_room.trang_thai,
      'thoi_gian', v_room.thoi_gian,
      'thoi_gian_mo', v_room.thoi_gian_mo,
      'doi_tuong', v_room.doi_tuong,
      'mon_hoc', v_room.mon_hoc
    )
  );
end;
$function$;

revoke all on function public.rpc_hoc_sinh_room_info(text, text) from public;
grant execute on function public.rpc_hoc_sinh_room_info(text, text) to anon, authenticated;

-- =========================================================================
-- 5. SECURE ROOM LIST RPC (TOKEN-BOUND & EXACT LEGACY SEMANTICS)
-- =========================================================================

create or replace function public.rpc_hoc_sinh_room_list(
  p_student_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hs_id uuid;
  v_student record;
  v_rooms jsonb := '[]'::jsonb;
  v_submitted_room_ids jsonb := '[]'::jsonb;
begin
  if p_student_token is null or btrim(p_student_token) = '' then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pt.id,
        'ma_phong', pt.ma_phong,
        'ten_dot', pt.ten_dot,
        'doi_tuong', pt.doi_tuong,
        'trang_thai', pt.trang_thai
      ) order by pt.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rooms
  from public.phong_thi pt
  where pt.truong_id = v_student.truong_id
    and pt.trang_thai <> 'CHO_THI'
    and (
      pt.doi_tuong is null
      or pt.doi_tuong = 'TatCa'
      or v_student.lop = any(regexp_split_to_array(pt.doi_tuong, '\s*,\s*'))
      or v_student.ma_hs = any(regexp_split_to_array(pt.doi_tuong, '\s*,\s*'))
    );

  select coalesce(jsonb_agg(distinct phong_id), '[]'::jsonb)
  into v_submitted_room_ids
  from public.ket_qua
  where hs_id = v_hs_id
    and diem is not null;

  return jsonb_build_object(
    'status', 'success',
    'rooms', v_rooms,
    'submitted_room_ids', v_submitted_room_ids
  );
end;
$function$;

revoke all on function public.rpc_hoc_sinh_room_list(text) from public;
grant execute on function public.rpc_hoc_sinh_room_list(text) to anon, authenticated;
