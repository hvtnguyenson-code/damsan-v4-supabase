-- OMR 056: exactly one final evidence artifact per room/student.
-- SAFETY: Apply only AFTER removing redundant historical artifact metadata and
-- corresponding physical files through the Storage API.
-- Do not delete from storage.objects using SQL.
-- Existing official and test evidence obey the same single-artifact rule.
create unique index if not exists omr_artifacts_one_final_per_student
 on public.omr_artifacts(room_id,student_id)
 where student_id is not null;
