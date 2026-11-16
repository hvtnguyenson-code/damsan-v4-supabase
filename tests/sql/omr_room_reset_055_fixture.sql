-- OMR 055 synthetic PostgreSQL fixture. Load after OMR 054 assertions.
-- All names and data in this file exist exclusively in disposable CI database.
alter table public.phong_thi add column if not exists trang_thai text;
alter table public.phong_thi add column if not exists thoi_gian_mo bigint;
alter table public.phong_thi add column if not exists scoring_config jsonb default '{}'::jsonb;
update public.phong_thi set trang_thai='MO_PHONG', thoi_gian_mo=1234567890,
 scoring_config='{"weights":[3,2,5]}'::jsonb
where id='66666666-6666-4666-8666-666666666666';
create table if not exists public.student_room_attempt_state(
 phong_id uuid not null,hs_id uuid not null,reset_version bigint not null default 0,
 primary key(phong_id,hs_id)
);
create schema if not exists realtime;
create or replace function realtime.send(p_payload jsonb,p_event text,p_topic text,p_private boolean)
returns void language plpgsql as $function$begin return;end;$function$;
insert into public.phong_thi(id,truong_id,trang_thai,thoi_gian_mo,scoring_config)
values('88888888-8888-4888-8888-888888888888',
 '11111111-1111-4111-8111-111111111111','CHO_THI',null,'{"untouched":true}');
insert into public.de_thi values('66666666-6666-4666-8666-666666666666'),
 ('88888888-8888-4888-8888-888888888888');
insert into public.ket_qua values('66666666-6666-4666-8666-666666666666');
insert into public.exam_submissions(id,phong_id)
values('99999999-9999-4999-8999-999999999999',
 '66666666-6666-4666-8666-666666666666');
insert into public.student_room_attempt_state values(
 '66666666-6666-4666-8666-666666666666',
 '33333333-3333-4333-8333-333333333333',3);
insert into public.omr_artifacts(
 scan_id,revision,school_id,room_id,student_id,created_by_staff_id,
 mode,status,capture_path,annotated_path,sha256,file_bytes,engine_version,
 preview_score,evidence
) values(
 'aaaaaaaa-bbbb-4bbb-8bbb-aaaaaaaaaaaa',1,
 '11111111-1111-4111-8111-111111111111',
 '66666666-6666-4666-8666-666666666666',
 '33333333-3333-4333-8333-333333333333',
 '55555555-5555-4555-8555-555555555555',
 'test','TEST',
 'test/11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666/x/1/capture.webp',
 'test/11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666/x/1/annotated.webp',
 repeat('f',64),3412,'OMR_V7_TEST',7.25,'{}'::jsonb
);
insert into storage.objects values (
 '77777777-7777-4777-8777-777777777774','omr-evidence',
 'test/11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666/x/1/capture.webp','{"size":3412}'
),(
 '77777777-7777-4777-8777-777777777775','omr-evidence',
 'test/11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666/x/1/annotated.webp','{"size":2412}'
),(
 '77777777-7777-4777-8777-777777777776','omr-evidence',
 'test/11111111-1111-4111-8111-111111111111/88888888-8888-4888-8888-888888888888/y/1/capture.webp','{"size":101}'
);
