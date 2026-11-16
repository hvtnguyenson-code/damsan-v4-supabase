-- OMR 055: all tests synthetic, no production writes.
do $test$
declare v jsonb; w jsonb;
begin
 v:=public.rpc_reset_room_results('wrong-token','GV001',
  '11111111-1111-4111-8111-111111111111',
  '66666666-6666-4666-8666-666666666666');
 if v->>'code'<>'staff_session_invalid' then
  raise exception 'Invalid staff was allowed';
 end if;
 v:=public.rpc_reset_room_results('token-valid','WRONG',
  '11111111-1111-4111-8111-111111111111',
  '66666666-6666-4666-8666-666666666666');
 if v->>'status'<>'error' then raise exception 'Incorrect staff scope was allowed';end if;
 v:=public.rpc_reset_room_results('token-valid','GV001',
  '11111111-1111-4111-8111-111111111111',
  '66666666-6666-4666-8666-666666666666');
 if v->>'code'<>'omr_storage_not_empty' then
  raise exception 'Reset ignored nonempty Storage: %',v;
 end if;
 if (select count(*) from public.omr_artifacts where room_id='66666666-6666-4666-8666-666666666666')<>1
 or (select count(*) from public.ket_qua where phong_id='66666666-6666-4666-8666-666666666666')<>1
 or (select count(*) from public.exam_submissions where phong_id='66666666-6666-4666-8666-666666666666')<>1
 then raise exception 'Reset modified data despite Storage failure';end if;
end;
$test$;

-- Emulate successful Storage API removal exclusively in disposable CI.
delete from storage.objects where bucket_id='omr-evidence' and
name like 'test/11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666/%';

do $test$
declare v jsonb;
begin
 v:=public.rpc_reset_room_results('token-valid','GV001',
  '11111111-1111-4111-8111-111111111111',
  '66666666-6666-4666-8666-666666666666');
 if v->>'status'<>'success' or (v->>'ket_qua_deleted')::int<>1
 or (v->>'submissions_deleted')::int<>1 or (v->>'artifacts_deleted')::int<>1
 or (v->>'attempt_states_deleted')::int<>1 then
  raise exception 'Reset count mismatch: %',v;
 end if;

 if exists (select 1 from public.ket_qua where phong_id='66666666-6666-4666-8666-666666666666')
 or exists (select 1 from public.exam_submissions where phong_id='66666666-6666-4666-8666-666666666666')
 or exists (select 1 from public.omr_artifacts where room_id='66666666-6666-4666-8666-666666666666')
 or exists (select 1 from public.student_room_attempt_state where phong_id='66666666-6666-4666-8666-666666666666')
 then raise exception 'Reset left old grade, receipt, OMR or attempt metadata';end if;

 if not exists(select 1 from public.phong_thi where id='66666666-6666-4666-8666-666666666666'
 and trang_thai='CHO_THI' and thoi_gian_mo is null
 and scoring_config='{"weights":[3,2,5]}'::jsonb)
 or (select count(*) from public.de_thi where phong_id='66666666-6666-4666-8666-666666666666')<>1
 then raise exception 'Reset changed room/exam/scoring configuration';end if;

 if not exists (select 1 from public.phong_thi where id='88888888-8888-4888-8888-888888888888')
 or (select count(*) from public.de_thi where phong_id='88888888-8888-4888-8888-888888888888')<>1
 or (select count(*) from storage.objects where name like '%88888888-8888-4888-8888-888888888888%')<>1
 then raise exception 'Reset affected unrelated room';end if;

 v:=public.rpc_reset_room_results('token-valid','GV001',
  '11111111-1111-4111-8111-111111111111',
  '66666666-6666-4666-8666-666666666666');
 if v->>'status'<>'success' or (v->>'ket_qua_deleted')::int<>0
 or (v->>'artifacts_deleted')::int<>0 then
  raise exception 'Idempotent retry failed: %',v;
 end if;
end;
$test$;
select 'PASS OMR 055: scoped fail-closed full reset preserves exam/room' as result;
