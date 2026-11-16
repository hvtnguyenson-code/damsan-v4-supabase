-- OMR 056: PostgreSQL 17 synthetic unique-final-evidence tests ONLY.
do $test$
declare v_name text;
begin
 if not exists (
  select 1 from pg_indexes where schemaname='public' and tablename='omr_artifacts'
    and indexname='omr_artifacts_one_final_per_student'
 ) then raise exception 'OMR 056 single-artifact index missing'; end if;
end;$test$;

insert into public.omr_artifacts(
 id,scan_id,revision,school_id,room_id,student_id,created_by_staff_id,
 mode,status,capture_path,annotated_path,sha256,file_bytes,
 engine_version,preview_score,evidence
)
values(
 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa',1,
 '11111111-1111-4111-8111-111111111111',
 '88888888-8888-4888-8888-888888888888',
 '33333333-3333-4333-8333-333333333333',
 '55555555-5555-4555-8555-555555555555',
 'test','TEST','test/school/room/scan1/capture.webp','test/school/room/scan1/annotated.webp',
 repeat('a',64),3500,'OMR_EVIDENCE_01',7.5,'{}'::jsonb
);

do $test$
declare v_name text;
begin
 begin
  insert into public.omr_artifacts(
   id,scan_id,revision,school_id,room_id,student_id,created_by_staff_id,
   mode,status,capture_path,annotated_path,sha256,file_bytes,
   engine_version,preview_score,evidence
  ) values(
   'aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa','aaaaaaaa-4444-4444-8444-aaaaaaaaaaaa',1,
   '11111111-1111-4111-8111-111111111111',
   '88888888-8888-4888-8888-888888888888',
   '33333333-3333-4333-8333-333333333333',
   '55555555-5555-4555-8555-555555555555',
   'test','TEST','test/school/room/scan2/capture.webp','test/school/room/scan2/annotated.webp',
   repeat('b',64),3600,'OMR_EVIDENCE_01',7.25,'{}'::jsonb
  );
  raise exception 'Duplicate evidence per student was accepted';
 exception when unique_violation then
  get stacked diagnostics v_name=constraint_name;
  if v_name<>'omr_artifacts_one_final_per_student'
   then raise exception 'Wrong unique violation: %',v_name;
  end if;
 end;
end;$test$;
select 'PASS OMR 056: a second test evidence for same student and room is rejected' result;
