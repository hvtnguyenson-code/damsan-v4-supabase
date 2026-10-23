-- 084A: cover the reverse FK lookup used when a student account is removed.
create index if not exists idx_student_room_attempt_state_hs_id
  on public.student_room_attempt_state(hs_id);
