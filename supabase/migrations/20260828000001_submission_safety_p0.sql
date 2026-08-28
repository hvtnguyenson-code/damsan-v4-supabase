-- P0 submission safety: persist an immutable raw answer receipt before grading.
-- This migration is additive. It deliberately keeps public.nop_bai_va_cham_diem
-- for compatibility, but the new grading path never calls it.

create table public.exam_submissions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique,
  truong_id uuid not null,
  phong_id uuid not null,
  hs_id uuid not null,
  ma_de text not null,
  raw_answers jsonb not null,
  status text not null check (status in ('received', 'grading', 'graded', 'grading_error')),
  client_submitted_at timestamptz null,
  received_at timestamptz not null default now(),
  score numeric null,
  grading_details jsonb null,
  graded_at timestamptz null,
  grading_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_submissions_one_student_per_room unique (phong_id, hs_id),
  constraint exam_submissions_phong_id_fkey foreign key (phong_id)
    references public.phong_thi(id) on delete cascade
);

create index exam_submissions_phong_status_idx on public.exam_submissions (phong_id, status);
comment on table public.exam_submissions is 'Canonical durable student submission receipt. ket_qua remains the derived compatibility result.';

alter table public.exam_submissions enable row level security;
revoke all on table public.exam_submissions from anon, authenticated;

create or replace function public.rpc_receive_submission(
  p_attempt_id uuid,
  p_truong_id uuid,
  p_phong_id uuid,
  p_hs_id uuid,
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
  v_submission public.exam_submissions%rowtype;
  v_room public.phong_thi%rowtype;
  v_student record;
begin
  if p_attempt_id is null or p_raw_answers is null or jsonb_typeof(p_raw_answers) <> 'array'
     or coalesce(trim(p_ma_de), '') = '' then
    return jsonb_build_object('status', 'error', 'message', 'Du lieu nop bai khong hop le.');
  end if;

  -- Fast idempotency path: no exam/de_thi reads and no grading work.
  select * into v_submission from public.exam_submissions where attempt_id = p_attempt_id;
  if found then
    return jsonb_build_object('status', 'received', 'submission_id', v_submission.id,
      'attempt_id', v_submission.attempt_id, 'received_at', v_submission.received_at);
  end if;

  -- Shared room locks permit all student receives concurrently, but conflict
  -- with reset/delete's FOR UPDATE lock so validation and insert stay ordered.
  select * into v_room from public.phong_thi
  where id = p_phong_id and truong_id = p_truong_id limit 1 for share;
  if not found or v_room.trang_thai not in ('MO_PHONG', 'THU_BAI', 'XEM_DAP_AN', 'CONG_BO_DIEM') then
    return jsonb_build_object('status', 'error', 'message', 'Phong thi khong nhan bai.');
  end if;
  if p_room_opened_at is null or v_room.thoi_gian_mo is distinct from p_room_opened_at then
    return jsonb_build_object('status', 'error', 'code', 'room_attempt_changed', 'message', 'Luot thi da duoc reset.');
  end if;

  select hs.lop, hs.ma_hs into v_student from public.hoc_sinh hs
  where hs.id = p_hs_id and hs.truong_id = p_truong_id limit 1;
  if not found or (v_room.doi_tuong is not null and v_room.doi_tuong <> 'TatCa'
    and not (v_student.lop = any(regexp_split_to_array(v_room.doi_tuong, '\s*,\s*'))
      or v_student.ma_hs = any(regexp_split_to_array(v_room.doi_tuong, '\s*,\s*')))) then
    return jsonb_build_object('status', 'error', 'message', 'Hoc sinh khong thuoc phong thi.');
  end if;

  insert into public.exam_submissions (
    attempt_id, truong_id, phong_id, hs_id, ma_de, raw_answers, status, client_submitted_at
  ) values (
    p_attempt_id, p_truong_id, p_phong_id, p_hs_id, p_ma_de, p_raw_answers, 'received', p_client_submitted_at
  ) on conflict do nothing
  returning * into v_submission;

  -- A second attempt id for the same official room/student returns the existing
  -- receipt rather than creating a second answer record.
  if not found then
    select * into v_submission from public.exam_submissions
    where phong_id = p_phong_id and hs_id = p_hs_id;
  end if;

  return jsonb_build_object('status', 'received', 'submission_id', v_submission.id,
    'attempt_id', v_submission.attempt_id, 'received_at', v_submission.received_at);
end;
$function$;

create or replace function public.rpc_grade_submission(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_submission public.exam_submissions%rowtype;
  v_exam jsonb;
  v_question jsonb;
  v_answer text;
  v_correct text;
  v_part text;
  v_part2_correct text;
  v_part2_answer text;
  v_part2_matches integer;
  v_part2_index integer;
  v_part2_answer_slots text[];
  v_part2_correct_slots text[];
  v_points numeric := 0;
  v_score numeric := 0;
  v_details jsonb := '[]'::jsonb;
  v_index integer;
begin
  select * into v_submission from public.exam_submissions where id = p_submission_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Khong tim thay submission.');
  end if;
  if v_submission.status = 'graded' then
    return jsonb_build_object('status', 'graded', 'submission_id', v_submission.id,
      'score', v_submission.score, 'graded_at', v_submission.graded_at);
  end if;

  update public.exam_submissions set status = 'grading', grading_error = null, updated_at = now()
  where id = v_submission.id;

  select case when jsonb_typeof(cau_so) = 'string' then (cau_so #>> '{}')::jsonb else cau_so end
  into v_exam from public.de_thi
  where phong_id = v_submission.phong_id and ma_de = v_submission.ma_de limit 1;
  if v_exam is null or jsonb_typeof(v_exam) <> 'array' then
    raise exception 'Exam data not found for stored room and exam code';
  end if;

  for v_question, v_index in select value, ordinality::integer
    from jsonb_array_elements(v_exam) with ordinality
  loop
    v_part := coalesce(v_question->>'phan', v_question->>'Phan', '1');
    v_answer := coalesce(v_submission.raw_answers -> (v_index - 1) ->> 'chon', '');
    v_correct := coalesce(v_question->>'dap_an_dung', v_question->>'DapAnDung', '');
    v_points := 0;

    if v_part = '1' then
      if upper(trim(v_answer)) = upper(trim(v_correct)) and trim(v_answer) <> '' then v_points := 0.25; end if;
    elsif v_part = '2' then
      -- Keep the four a/b/c/d positions. Empty slots must never shift a later
      -- answer into an earlier statement.
      v_part2_answer_slots := string_to_array(v_answer, '-');
      v_part2_correct_slots := string_to_array(v_correct, '-');
      v_part2_matches := 0;
      for v_part2_index in 1..4 loop
        v_part2_answer := translate(upper(trim(coalesce(v_part2_answer_slots[v_part2_index], ''))), 'Đ', 'D');
        v_part2_correct := translate(upper(trim(coalesce(v_part2_correct_slots[v_part2_index], ''))), 'Đ', 'D');
        if v_part2_answer <> '' and v_part2_answer = v_part2_correct then v_part2_matches := v_part2_matches + 1; end if;
      end loop;
      v_points := case v_part2_matches when 1 then 0.1 when 2 then 0.25 when 3 then 0.5 when 4 then 1.0 else 0 end;
    else
      if regexp_replace(lower(replace(replace(v_answer, ',', '.'), '''', '')), '\s', '', 'g') <> ''
        and regexp_replace(lower(replace(replace(v_answer, ',', '.'), '''', '')), '\s', '', 'g') = regexp_replace(lower(replace(replace(v_correct, ',', '.'), '''', '')), '\s', '', 'g') then v_points := 0.25; end if;
    end if;
    v_score := v_score + v_points;
    v_details := v_details || jsonb_build_array(jsonb_build_object('q', v_index, 'phan', v_part, 'chon', v_answer, 'dung', v_correct, 'diem', v_points));
  end loop;

  insert into public.ket_qua (truong_id, phong_id, hs_id, ma_de, diem, chi_tiet)
  values (v_submission.truong_id, v_submission.phong_id, v_submission.hs_id, v_submission.ma_de, v_score, v_details)
  on conflict (phong_id, hs_id) do update set truong_id = excluded.truong_id,
    ma_de = excluded.ma_de, diem = excluded.diem, chi_tiet = excluded.chi_tiet;

  update public.exam_submissions set status = 'graded', score = v_score,
    grading_details = v_details, graded_at = now(), grading_error = null, updated_at = now()
  where id = v_submission.id;
  return jsonb_build_object('status', 'graded', 'submission_id', v_submission.id,
    'score', v_score, 'graded_at', now());
exception when others then
  update public.exam_submissions set status = 'grading_error', grading_error = left(sqlerrm, 1000), updated_at = now()
  where id = p_submission_id;
  return jsonb_build_object('status', 'error', 'submission_id', p_submission_id, 'message', 'Grading pending.');
end;
$function$;

-- Dashboard-ready aggregate. This lets teacher UI distinguish receipt from grade
-- without inferring receipt status from the derived ket_qua table.
create or replace function public.rpc_submission_room_counts(p_phong_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'received', count(*) filter (where status in ('received', 'grading', 'graded', 'grading_error')),
    'graded', count(*) filter (where status = 'graded'),
    'grading_error', count(*) filter (where status = 'grading_error')
  )
  from public.exam_submissions
  where phong_id = p_phong_id;
$function$;

create or replace function public.rpc_submission_receipt_status(
  p_attempt_id uuid,
  p_truong_id uuid,
  p_phong_id uuid,
  p_room_opened_at bigint
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_submission public.exam_submissions%rowtype; v_room public.phong_thi%rowtype;
begin
  select * into v_submission from public.exam_submissions where attempt_id = p_attempt_id;
  if found then
    return jsonb_build_object('status', v_submission.status, 'submission_id', v_submission.id,
      'attempt_id', v_submission.attempt_id, 'received_at', v_submission.received_at, 'reset_confirmed', false);
  end if;
  select * into v_room from public.phong_thi where id = p_phong_id and truong_id = p_truong_id;
  if not found then
    return jsonb_build_object('status', 'missing', 'reset_confirmed', true, 'room_exists', false);
  end if;
  if v_room.thoi_gian_mo is distinct from p_room_opened_at then
    return jsonb_build_object('status', 'missing', 'reset_confirmed', true, 'room_exists', true);
  end if;
  return jsonb_build_object('status', 'missing', 'reset_confirmed', false, 'room_exists', true);
end;
$function$;

create or replace function public.rpc_reset_room_results(p_ma_gv text, p_truong_id uuid, p_phong_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_ket_qua integer; v_submissions integer; v_room public.phong_thi%rowtype;
begin
  if not exists (select 1 from public.giao_vien where ma_gv = p_ma_gv and truong_id = p_truong_id) then
    return jsonb_build_object('status', 'error', 'message', 'Khong xac thuc duoc giao vien hoac phong thi.');
  end if;
  select * into v_room from public.phong_thi where id = p_phong_id and truong_id = p_truong_id for update;
  if not found then return jsonb_build_object('status', 'error', 'message', 'Khong xac thuc duoc giao vien hoac phong thi.'); end if;
  delete from public.ket_qua where phong_id = p_phong_id; get diagnostics v_ket_qua = row_count;
  delete from public.exam_submissions where phong_id = p_phong_id; get diagnostics v_submissions = row_count;
  -- Existing opening timestamp is the room-attempt generation. A stale local FINAL_PENDING
  -- snapshot will be rejected after reset rather than being silently re-submitted.
  update public.phong_thi set thoi_gian_mo = null where id = p_phong_id;
  return jsonb_build_object('status', 'success', 'ket_qua_deleted', v_ket_qua, 'submissions_deleted', v_submissions);
end;
$function$;

create or replace function public.rpc_xoa_phong_thi(p_ma_gv text, p_truong_id uuid, p_phong_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_quyen text; v_room public.phong_thi%rowtype;
begin
  select quyen into v_quyen from public.giao_vien where ma_gv = p_ma_gv and truong_id = p_truong_id limit 1;
  if v_quyen is null then return jsonb_build_object('status','error','message','Khong xac thuc duoc giao vien.'); end if;
  select * into v_room from public.phong_thi where id = p_phong_id and truong_id = p_truong_id for update;
  if not found then
    return jsonb_build_object('status','error','message','Phong thi khong thuoc truong hien tai.');
  end if;
  delete from public.ket_qua where phong_id = p_phong_id;
  delete from public.exam_submissions where phong_id = p_phong_id;
  delete from public.de_thi where phong_id = p_phong_id;
  delete from public.phong_thi where id = p_phong_id;
  return jsonb_build_object('status','success');
end;
$function$;

create or replace function public.rpc_grade_pending_room(p_ma_gv text, p_truong_id uuid, p_phong_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_submission_id uuid; v_response jsonb; v_attempted integer := 0; v_graded integer := 0; v_failed integer := 0;
begin
  if not exists (select 1 from public.giao_vien where ma_gv = p_ma_gv and truong_id = p_truong_id)
    or not exists (select 1 from public.phong_thi where id = p_phong_id and truong_id = p_truong_id) then
    return jsonb_build_object('status', 'error', 'message', 'Khong xac thuc duoc giao vien hoac phong thi.');
  end if;
  for v_submission_id in select id from public.exam_submissions
    where phong_id = p_phong_id and status in ('received', 'grading_error') order by received_at
  loop
    v_attempted := v_attempted + 1;
    v_response := public.rpc_grade_submission(v_submission_id);
    if v_response->>'status' = 'graded' then v_graded := v_graded + 1; else v_failed := v_failed + 1; end if;
  end loop;
  return jsonb_build_object('status', 'success', 'attempted', v_attempted, 'graded', v_graded, 'failed', v_failed);
end;
$function$;

revoke all on function public.rpc_receive_submission(uuid, uuid, uuid, uuid, text, jsonb, timestamptz, bigint) from public;
revoke all on function public.rpc_grade_submission(uuid) from public;
revoke all on function public.rpc_submission_room_counts(uuid) from public;
revoke all on function public.rpc_submission_receipt_status(uuid, uuid, uuid, bigint) from public;
revoke all on function public.rpc_reset_room_results(text, uuid, uuid) from public;
revoke all on function public.rpc_xoa_phong_thi(text, uuid, uuid) from public;
revoke all on function public.rpc_grade_pending_room(text, uuid, uuid) from public;
grant execute on function public.rpc_receive_submission(uuid, uuid, uuid, uuid, text, jsonb, timestamptz, bigint) to anon, authenticated;
grant execute on function public.rpc_grade_submission(uuid) to anon, authenticated;
grant execute on function public.rpc_submission_room_counts(uuid) to anon, authenticated;
grant execute on function public.rpc_submission_receipt_status(uuid, uuid, uuid, bigint) to anon, authenticated;
grant execute on function public.rpc_reset_room_results(text, uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_xoa_phong_thi(text, uuid, uuid) to anon, authenticated;
grant execute on function public.rpc_grade_pending_room(text, uuid, uuid) to anon, authenticated;
