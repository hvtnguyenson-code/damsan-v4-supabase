-- OMR-004: staff-confirmed paper answer submission through the canonical grader.
-- Branch-only migration until OMR-05 final acceptance. Do not apply to production early.

alter table public.exam_submissions
  add column if not exists source text not null default 'ONLINE',
  add column if not exists submitted_by_staff_id uuid null,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exam_submissions_source_check'
      and conrelid = 'public.exam_submissions'::regclass
  ) then
    alter table public.exam_submissions
      add constraint exam_submissions_source_check
      check (source in ('ONLINE','OMR'));
  end if;
end $$;

comment on column public.exam_submissions.source is
  'Submission origin. ONLINE is the existing student path; OMR is a teacher-confirmed paper scan.';
comment on column public.exam_submissions.submitted_by_staff_id is
  'Staff member who confirmed an OMR submission; null for normal student submissions.';
comment on column public.exam_submissions.source_metadata is
  'Non-authoritative audit metadata such as OMR confidence/uncertain review state.';

create or replace function public.rpc_staff_submit_omr(
  p_staff_token text,
  p_phong_id uuid,
  p_hs_id uuid,
  p_ma_de text,
  p_raw_answers jsonb,
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_gv record;
  v_room public.phong_thi%rowtype;
  v_student record;
  v_exam_code text;
  v_exam jsonb;
  v_submission public.exam_submissions%rowtype;
  v_grade jsonb;
begin
  if p_staff_token is null or p_phong_id is null or p_hs_id is null
     or coalesce(trim(p_ma_de),'') = ''
     or p_raw_answers is null or jsonb_typeof(p_raw_answers) <> 'array' then
    return jsonb_build_object('status','error','code','invalid_input','message','Dữ liệu OMR không hợp lệ.');
  end if;

  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status','error','code','staff_session_invalid','message','Phiên làm việc đã hết hạn.');
  end if;

  select id, truong_id, quyen, mon_id into v_gv
  from public.giao_vien
  where id = v_gv_id;

  select * into v_room
  from public.phong_thi
  where id = p_phong_id
  for share;

  if not found then
    return jsonb_build_object('status','error','code','room_not_found','message','Phòng thi không tồn tại.');
  end if;

  if coalesce(v_gv.quyen,'') <> 'Admin' and v_room.truong_id <> v_gv.truong_id then
    return jsonb_build_object('status','error','code','room_forbidden','message','Không có quyền truy cập phòng thi này.');
  end if;

  if coalesce(v_gv.quyen,'') <> 'Admin'
     and (v_gv.mon_id is null or v_room.mon_id is distinct from v_gv.mon_id) then
    return jsonb_build_object('status','error','code','subject_forbidden','message','Phòng thi không thuộc bộ môn được phân công.');
  end if;

  if p_source_metadata is not null and jsonb_typeof(p_source_metadata) <> 'object' then
    return jsonb_build_object('status','error','code','invalid_metadata','message','Metadata OMR không hợp lệ.');
  end if;

  select hs.id, hs.truong_id, hs.ma_hs, hs.lop into v_student
  from public.hoc_sinh hs
  where hs.id = p_hs_id and hs.truong_id = v_room.truong_id
  limit 1;

  if not found or (
    v_room.doi_tuong is not null and v_room.doi_tuong <> 'TatCa'
    and not (
      v_student.lop = any(regexp_split_to_array(v_room.doi_tuong, '\s*,\s*'))
      or v_student.ma_hs = any(regexp_split_to_array(v_room.doi_tuong, '\s*,\s*'))
    )
  ) then
    return jsonb_build_object('status','error','code','student_not_in_room','message','Học sinh không thuộc phòng thi.');
  end if;

  select dt.ma_de,
         case when jsonb_typeof(dt.cau_so)='string' then (dt.cau_so #>> '{}')::jsonb else dt.cau_so end
  into v_exam_code, v_exam
  from public.de_thi dt
  where dt.phong_id = p_phong_id and dt.ma_de = trim(p_ma_de)
  limit 1;

  if v_exam_code is null and trim(p_ma_de) ~ '^\d+$' then
    select dt.ma_de,
           case when jsonb_typeof(dt.cau_so)='string' then (dt.cau_so #>> '{}')::jsonb else dt.cau_so end
    into v_exam_code, v_exam
    from public.de_thi dt
    where dt.phong_id = p_phong_id
      and dt.ma_de ~ '^\d+$'
      and dt.ma_de::numeric = trim(p_ma_de)::numeric
    order by length(dt.ma_de), dt.ma_de
    limit 1;
  end if;

  if v_exam_code is null or v_exam is null or jsonb_typeof(v_exam) <> 'array' then
    return jsonb_build_object('status','error','code','exam_code_not_found','message','Mã đề không tồn tại trong phòng.');
  end if;

  if jsonb_array_length(p_raw_answers) <> jsonb_array_length(v_exam) then
    return jsonb_build_object(
      'status','error','code','answer_count_mismatch','message','Số câu trả lời không khớp đề trong phòng.',
      'expected',jsonb_array_length(v_exam),'received',jsonb_array_length(p_raw_answers)
    );
  end if;

  if exists(select 1 from public.exam_submissions where phong_id=p_phong_id and hs_id=p_hs_id)
     or exists(select 1 from public.ket_qua where phong_id=p_phong_id and hs_id=p_hs_id) then
    return jsonb_build_object(
      'status','conflict','code','existing_result',
      'message','Học sinh đã có bài hoặc kết quả trong phòng. OMR không tự ghi đè.'
    );
  end if;

  insert into public.exam_submissions(
    attempt_id, truong_id, phong_id, hs_id, ma_de, raw_answers, status,
    client_submitted_at, source, submitted_by_staff_id, source_metadata
  ) values (
    gen_random_uuid(), v_room.truong_id, p_phong_id, p_hs_id, v_exam_code, p_raw_answers, 'received',
    now(), 'OMR', v_gv_id, coalesce(p_source_metadata,'{}'::jsonb)
  )
  returning * into v_submission;

  v_grade := public.rpc_grade_submission(v_submission.id);

  if coalesce(v_grade->>'status','') <> 'graded' then
    return jsonb_build_object(
      'status','error','code','canonical_grading_failed','message','Máy chủ chưa chấm được bài OMR.',
      'submission_id',v_submission.id
    );
  end if;

  return jsonb_build_object(
    'status','success',
    'source','OMR',
    'submission_id',v_submission.id,
    'ma_de',v_exam_code,
    'score',v_grade->'score',
    'graded_at',v_grade->'graded_at'
  );
exception when unique_violation then
  return jsonb_build_object('status','conflict','code','existing_result','message','Học sinh đã có bài hoặc kết quả trong phòng.');
when others then
  return jsonb_build_object('status','error','code','omr_submit_failed','message','Không thể lưu kết quả OMR.');
end;
$function$;

revoke all on function public.rpc_staff_submit_omr(text,uuid,uuid,text,jsonb,jsonb) from public;
grant execute on function public.rpc_staff_submit_omr(text,uuid,uuid,text,jsonb,jsonb) to anon, authenticated;
