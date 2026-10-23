-- 084: targeted student reset + secure room runtime sync
create table if not exists public.student_room_attempt_state (
  phong_id uuid not null references public.phong_thi(id) on delete cascade,
  hs_id uuid not null references public.hoc_sinh(id) on delete cascade,
  reset_version bigint not null default 0,
  reset_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (phong_id, hs_id)
);
alter table public.student_room_attempt_state enable row level security;
revoke all on public.student_room_attempt_state from anon, authenticated;

create or replace function public.rpc_hoc_sinh_runtime_sync(
  p_student_token text,
  p_phong_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hs_id uuid;
  v_student record;
  v_room record;
  v_reset_version bigint := 0;
begin
  v_hs_id := public._student_session_hs_id(p_student_token);
  if v_hs_id is null then
    return jsonb_build_object('status','error','code','invalid_session','message','Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;

  select id, truong_id into v_student from public.hoc_sinh where id=v_hs_id;
  if not found then return jsonb_build_object('status','error','message','Học sinh không tồn tại.'); end if;

  select id, trang_thai, thoi_gian_mo into v_room
  from public.phong_thi
  where id=p_phong_id and truong_id=v_student.truong_id;

  if not found then
    return jsonb_build_object('status','missing','room_exists',false);
  end if;

  select coalesce(reset_version,0) into v_reset_version
  from public.student_room_attempt_state
  where phong_id=p_phong_id and hs_id=v_hs_id;
  v_reset_version := coalesce(v_reset_version,0);

  return jsonb_build_object(
    'status','success',
    'room',jsonb_build_object(
      'id',v_room.id,
      'trang_thai',v_room.trang_thai,
      'thoi_gian_mo',v_room.thoi_gian_mo,
      'student_reset_version',v_reset_version
    )
  );
end;
$$;
revoke all on function public.rpc_hoc_sinh_runtime_sync(text,uuid) from public;
grant execute on function public.rpc_hoc_sinh_runtime_sync(text,uuid) to anon;

create or replace function public.rpc_reset_students_in_room(
  p_staff_token text,
  p_ma_gv text,
  p_truong_id uuid,
  p_phong_id uuid,
  p_hs_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_gv_id uuid;
  v_teacher record;
  v_valid_ids uuid[];
  v_results integer := 0;
  v_submissions integer := 0;
  v_targets integer := 0;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.');
  end if;

  select id, ma_gv, truong_id, quyen into v_teacher
  from public.giao_vien where id=v_gv_id;

  if not found or v_teacher.ma_gv is distinct from trim(p_ma_gv)
     or (v_teacher.quyen <> 'Admin' and p_truong_id is distinct from v_teacher.truong_id)
     or not exists(select 1 from public.phong_thi where id=p_phong_id and truong_id=p_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;

  if p_hs_ids is null or cardinality(p_hs_ids)=0 then
    return jsonb_build_object('status','error','message','Chưa chọn học sinh cần reset.');
  end if;

  select array_agg(h.id order by h.id) into v_valid_ids
  from public.hoc_sinh h
  where h.truong_id=p_truong_id and h.id=any(p_hs_ids);

  if v_valid_ids is null or cardinality(v_valid_ids) <> cardinality(array(select distinct unnest(p_hs_ids))) then
    return jsonb_build_object('status','error','message','Danh sách học sinh không hợp lệ hoặc không thuộc trường hiện tại.');
  end if;

  v_targets := cardinality(v_valid_ids);

  delete from public.ket_qua
  where phong_id=p_phong_id and hs_id=any(v_valid_ids);
  get diagnostics v_results = row_count;

  delete from public.exam_submissions
  where phong_id=p_phong_id and hs_id=any(v_valid_ids);
  get diagnostics v_submissions = row_count;

  insert into public.student_room_attempt_state(phong_id,hs_id,reset_version,reset_at,updated_at)
  select p_phong_id, x, 1, now(), now() from unnest(v_valid_ids) x
  on conflict (phong_id,hs_id) do update
  set reset_version=public.student_room_attempt_state.reset_version+1,
      reset_at=now(),
      updated_at=now();

  perform realtime.send(
    jsonb_build_object('reason','targeted_reset'),
    'room_sync',
    'room:' || p_phong_id::text,
    false
  );

  return jsonb_build_object(
    'status','success',
    'targets',v_targets,
    'ket_qua_deleted',v_results,
    'submissions_deleted',v_submissions
  );
end;
$$;
revoke all on function public.rpc_reset_students_in_room(text,text,uuid,uuid,uuid[]) from public;
grant execute on function public.rpc_reset_students_in_room(text,text,uuid,uuid,uuid[]) to anon;

create or replace function public.rpc_hoc_sinh_room_info(p_student_token text, p_ma_phong text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hs_id uuid;
  v_student record;
  v_room record;
  v_reset_version bigint := 0;
begin
  if p_student_token is null or btrim(p_student_token) = '' or p_ma_phong is null or btrim(p_ma_phong) = '' then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Tham số không hợp lệ.');
  end if;
  v_hs_id := public._student_session_hs_id(p_student_token);
  if v_hs_id is null then
    return jsonb_build_object('status', 'error', 'code', 'invalid_session', 'message', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;
  select id, truong_id, lop, ma_hs into v_student from public.hoc_sinh where id=v_hs_id;
  if not found then return jsonb_build_object('status','error','message','Học sinh không tồn tại.'); end if;

  select pt.id,pt.trang_thai,pt.thoi_gian,pt.thoi_gian_mo,pt.doi_tuong,
         case when mh.id is not null then jsonb_build_object('ten_mon',mh.ten_mon) else null end as mon_hoc
  into v_room
  from public.phong_thi pt
  left join public.mon_hoc mh on mh.id=pt.mon_id
  where pt.truong_id=v_student.truong_id and pt.ma_phong=trim(p_ma_phong)
  limit 1;
  if not found then return jsonb_build_object('status','error','message','Không tìm thấy phòng thi này.'); end if;

  if v_room.doi_tuong is not null and v_room.doi_tuong <> 'TatCa'
     and not (v_student.lop = any(regexp_split_to_array(v_room.doi_tuong,'\s*,\s*'))
       or v_student.ma_hs = any(regexp_split_to_array(v_room.doi_tuong,'\s*,\s*'))) then
    return jsonb_build_object('status','error','message','Bạn không có quyền tham gia phòng thi này do không thuộc đối tượng được giao bài.');
  end if;

  select coalesce(reset_version,0) into v_reset_version
  from public.student_room_attempt_state where phong_id=v_room.id and hs_id=v_hs_id;
  v_reset_version := coalesce(v_reset_version,0);

  return jsonb_build_object('status','success','room',jsonb_build_object(
    'id',v_room.id,'trang_thai',v_room.trang_thai,'thoi_gian',v_room.thoi_gian,
    'thoi_gian_mo',v_room.thoi_gian_mo,'doi_tuong',v_room.doi_tuong,'mon_hoc',v_room.mon_hoc,
    'student_reset_version',v_reset_version
  ));
end;
$$;

create or replace function public.rpc_hoc_sinh_receive_submission(
  p_student_token text,
  p_attempt_id uuid,
  p_phong_id uuid,
  p_ma_de text,
  p_raw_answers jsonb,
  p_client_submitted_at timestamptz,
  p_room_opened_at bigint,
  p_student_reset_version bigint
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
  v_server_reset_version bigint := 0;
begin
  if p_student_token is null or btrim(p_student_token)='' then
    return jsonb_build_object('status','error','code','invalid_session','message','Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  end if;
  if p_attempt_id is null or p_phong_id is null or p_raw_answers is null
     or jsonb_typeof(p_raw_answers)<>'array' or coalesce(trim(p_ma_de),'')='' then
    return jsonb_build_object('status','error','message','Dữ liệu nộp bài không hợp lệ.');
  end if;

  v_hs_id := public._student_session_hs_id(p_student_token);
  if v_hs_id is null then return jsonb_build_object('status','error','code','invalid_session','message','Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'); end if;
  select id,truong_id,ma_hs,lop into v_student from public.hoc_sinh where id=v_hs_id;
  if not found then return jsonb_build_object('status','error','message','Học sinh không tồn tại.'); end if;

  select * into v_submission from public.exam_submissions where attempt_id=p_attempt_id;
  if found then
    if v_submission.hs_id=v_hs_id and v_submission.truong_id=v_student.truong_id and v_submission.phong_id=p_phong_id then
      return jsonb_build_object('status','received','submission_id',v_submission.id,'attempt_id',v_submission.attempt_id,'received_at',v_submission.received_at);
    end if;
    return jsonb_build_object('status','error','message','Attempt ID không hợp lệ hoặc đã tồn tại.');
  end if;

  select * into v_room from public.phong_thi
  where id=p_phong_id and truong_id=v_student.truong_id limit 1 for share;
  if not found or v_room.trang_thai not in ('MO_PHONG','THU_BAI','XEM_DAP_AN','CONG_BO_DIEM') then
    return jsonb_build_object('status','error','message','Phòng thi không nhận bài.');
  end if;
  if p_room_opened_at is null or v_room.thoi_gian_mo is distinct from p_room_opened_at then
    return jsonb_build_object('status','error','code','room_attempt_changed','message','Lượt thi đã được reset.');
  end if;

  select coalesce(reset_version,0) into v_server_reset_version
  from public.student_room_attempt_state where phong_id=p_phong_id and hs_id=v_hs_id;
  v_server_reset_version := coalesce(v_server_reset_version,0);
  if coalesce(p_student_reset_version,0) <> v_server_reset_version then
    return jsonb_build_object('status','error','code','student_attempt_changed','message','Lượt làm bài của học sinh đã được giáo viên reset.');
  end if;

  if v_room.doi_tuong is not null and v_room.doi_tuong<>'TatCa'
     and not (v_student.lop=any(regexp_split_to_array(v_room.doi_tuong,'\s*,\s*'))
       or v_student.ma_hs=any(regexp_split_to_array(v_room.doi_tuong,'\s*,\s*'))) then
    return jsonb_build_object('status','error','message','Học sinh không thuộc phòng thi.');
  end if;

  select count(*) into v_exam_count from public.de_thi where phong_id=p_phong_id;
  if v_exam_count=0 then return jsonb_build_object('status','error','message','Phòng thi chưa có đề thi.'); end if;
  v_clean_ma_hs := trim(v_student.ma_hs);
  if v_clean_ma_hs ~ '^[0-9]+$' then
    v_exam_index := cast(v_clean_ma_hs as int) % v_exam_count;
  else
    for i in 1..length(v_clean_ma_hs) loop
      v_char_code := ascii(substr(v_clean_ma_hs,i,1));
      v_hash := ((v_hash*31)+v_char_code) % 2147483647;
    end loop;
    v_exam_index := v_hash % v_exam_count;
  end if;
  select ma_de into v_expected_ma_de from public.de_thi
  where phong_id=p_phong_id order by ma_de asc offset v_exam_index limit 1;
  if v_expected_ma_de is null or trim(p_ma_de)<>trim(v_expected_ma_de) then
    return jsonb_build_object('status','error','code','exam_assignment_mismatch','message','Mã đề thi không khớp với đề thi được phân công.');
  end if;

  insert into public.exam_submissions(attempt_id,truong_id,phong_id,hs_id,ma_de,raw_answers,status,client_submitted_at)
  values(p_attempt_id,v_student.truong_id,p_phong_id,v_hs_id,v_expected_ma_de,p_raw_answers,'received',p_client_submitted_at)
  on conflict do nothing returning * into v_submission;

  if not found then
    select * into v_submission from public.exam_submissions
    where phong_id=p_phong_id and hs_id=v_hs_id and truong_id=v_student.truong_id;
  end if;
  if v_submission.id is null then
    return jsonb_build_object('status','error','code','submission_conflict','message','Không thể hoàn tất nộp bài do xung đột dữ liệu.');
  end if;
  return jsonb_build_object('status','received','submission_id',v_submission.id,'attempt_id',v_submission.attempt_id,'received_at',v_submission.received_at);
end;
$$;
revoke all on function public.rpc_hoc_sinh_receive_submission(text,uuid,uuid,text,jsonb,timestamptz,bigint,bigint) from public;
grant execute on function public.rpc_hoc_sinh_receive_submission(text,uuid,uuid,text,jsonb,timestamptz,bigint,bigint) to anon;

-- Make room-wide reset broadcast a generic sync signal.
create or replace function public.rpc_reset_room_results(p_staff_token text, p_ma_gv text, p_truong_id uuid, p_phong_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_gv_id uuid; v_teacher_ma_gv text; v_teacher_truong_id uuid; v_quyen text;
  v_room public.phong_thi%rowtype; v_ket_qua integer; v_submissions integer;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select ma_gv,truong_id,quyen into v_teacher_ma_gv,v_teacher_truong_id,v_quyen from public.giao_vien where id=v_gv_id limit 1;
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv)
     or (v_quyen<>'Admin' and p_truong_id is distinct from v_teacher_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  select * into v_room from public.phong_thi where id=p_phong_id and truong_id=p_truong_id for update;
  if not found then return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.'); end if;
  delete from public.ket_qua where phong_id=p_phong_id; get diagnostics v_ket_qua=row_count;
  delete from public.exam_submissions where phong_id=p_phong_id; get diagnostics v_submissions=row_count;
  update public.phong_thi set trang_thai='CHO_THI',thoi_gian_mo=null where id=p_phong_id and truong_id=p_truong_id;
  perform realtime.send(jsonb_build_object('reason','room_reset'),'room_sync','room:'||p_phong_id::text,false);
  return jsonb_build_object('status','success','ket_qua_deleted',v_ket_qua,'submissions_deleted',v_submissions);
end;
$$;

-- Broadcast every teacher room-control update; clients securely re-read their own runtime state.
create or replace function public.rpc_dieu_khien_phong_thi(
  p_staff_token text,p_ma_gv text,p_truong_id uuid,p_room_id uuid,
  p_trang_thai text default null,p_doi_tuong text default null,p_ten_dot text default null,
  p_thoi_gian integer default null,p_set_open_time boolean default false
) returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_gv_id uuid; v_teacher_ma_gv text; v_teacher_truong_id uuid; v_quyen text;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc không hợp lệ hoặc đã hết hạn.'); end if;
  select ma_gv,truong_id,quyen into v_teacher_ma_gv,v_teacher_truong_id,v_quyen from public.giao_vien where id=v_gv_id limit 1;
  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv)
     or (v_quyen<>'Admin' and p_truong_id is distinct from v_teacher_truong_id)
     or not exists(select 1 from public.phong_thi where id=p_room_id and truong_id=p_truong_id) then
    return jsonb_build_object('status','error','message','Không xác thực được giáo viên hoặc phòng thi.');
  end if;
  update public.phong_thi
  set trang_thai=coalesce(p_trang_thai,trang_thai),
      doi_tuong=coalesce(p_doi_tuong,doi_tuong),
      ten_dot=coalesce(p_ten_dot,ten_dot),
      thoi_gian=coalesce(p_thoi_gian,thoi_gian),
      thoi_gian_mo=case when p_set_open_time then (extract(epoch from now())*1000)::bigint else thoi_gian_mo end
  where id=p_room_id and truong_id=p_truong_id;
  perform realtime.send(jsonb_build_object('reason','room_control'),'room_sync','room:'||p_room_id::text,false);
  return jsonb_build_object('status','success');
end;
$$;
