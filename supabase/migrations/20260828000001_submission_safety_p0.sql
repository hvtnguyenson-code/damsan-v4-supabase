-- P0 submission safety: persist an immutable raw answer receipt before grading.
-- This migration is additive. It deliberately keeps public.nop_bai_va_cham_diem
-- for compatibility and invokes it only from rpc_grade_submission.

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
  constraint exam_submissions_one_student_per_room unique (phong_id, hs_id)
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
  p_client_submitted_at timestamptz default null
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

  select * into v_room from public.phong_thi
  where id = p_phong_id and truong_id = p_truong_id limit 1;
  if not found or v_room.trang_thai not in ('MO_PHONG', 'THU_BAI', 'XEM_DAP_AN', 'CONG_BO_DIEM') then
    return jsonb_build_object('status', 'error', 'message', 'Phong thi khong nhan bai.');
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
  v_legacy jsonb;
  v_result record;
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

  -- Preserve the established score algorithm without moving it into receive.
  v_legacy := public.nop_bai_va_cham_diem(v_submission.truong_id, v_submission.phong_id,
    v_submission.hs_id, v_submission.ma_de, v_submission.raw_answers);
  if coalesce(v_legacy->>'status', '') <> 'success' then
    raise exception 'Legacy grader rejected submission: %', coalesce(v_legacy->>'message', 'unknown error');
  end if;

  select diem, chi_tiet into v_result from public.ket_qua
  where phong_id = v_submission.phong_id and hs_id = v_submission.hs_id;
  if not found then
    raise exception 'Legacy grader returned success without ket_qua';
  end if;

  update public.exam_submissions set status = 'graded', score = v_result.diem,
    grading_details = v_result.chi_tiet, graded_at = now(), grading_error = null, updated_at = now()
  where id = v_submission.id;
  return jsonb_build_object('status', 'graded', 'submission_id', v_submission.id,
    'score', v_result.diem, 'graded_at', now());
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

revoke all on function public.rpc_receive_submission(uuid, uuid, uuid, uuid, text, jsonb, timestamptz) from public;
revoke all on function public.rpc_grade_submission(uuid) from public;
revoke all on function public.rpc_submission_room_counts(uuid) from public;
grant execute on function public.rpc_receive_submission(uuid, uuid, uuid, uuid, text, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.rpc_grade_submission(uuid) to anon, authenticated;
grant execute on function public.rpc_submission_room_counts(uuid) to anon, authenticated;
