-- Execute only on ephemeral PostgreSQL service in GitHub Actions.
do $$
declare
  bucket record;
  is_rls boolean;
  rejected boolean := false;
begin
  if to_regclass('public.omr_artifacts') is null then raise exception 'omr_artifacts missing'; end if;
  select relrowsecurity into is_rls from pg_class where oid='public.omr_artifacts'::regclass;
  if not is_rls then raise exception 'RLS not enabled'; end if;
  if has_table_privilege('anon','public.omr_artifacts','select')
    or has_table_privilege('authenticated','public.omr_artifacts','select')
    or has_table_privilege('anon','public.omr_artifacts','insert')
    or has_table_privilege('authenticated','public.omr_artifacts','insert')
  then raise exception 'untrusted role unexpectedly granted artifact access'; end if;
  select * into bucket from storage.buckets where id='omr-evidence';
  if not found or bucket.public is distinct from false
    or bucket.file_size_limit is distinct from 1500000
    or bucket.allowed_mime_types is distinct from array['image/webp','image/jpeg']::text[]
  then raise exception 'bucket configuration is unsafe'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='omr_artifacts')
  then raise exception 'Unexpected public artifact policy'; end if;
end $$;
insert into public.omr_artifacts(
 scan_id,revision,school_id,room_id,student_id,created_by_staff_id,
 mode,status,capture_path,annotated_path,sha256,file_bytes,engine_version,
 preview_score,evidence
) values (
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',
 '55555555-5555-4555-8555-555555555555',
 'test','TEST','test/capture.webp','test/annotated.webp',
 repeat('a',64),45123,'OMR_EVIDENCE_01',7.35,'{"ok":true}'::jsonb
);
do $$
begin
  if (select count(*) from public.omr_artifacts where mode='test')<>1
  then raise exception 'Expected a single synthetic artifact'; end if;
  begin
    insert into public.omr_artifacts(
      scan_id,revision,school_id,room_id,created_by_staff_id,
      mode,status,capture_path,annotated_path,sha256,file_bytes,engine_version,
      preview_score,evidence
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '55555555-5555-4555-8555-555555555555',
      'test','TEST','test/c2.webp','test/a2.webp',repeat('a',64),1,
      'OMR_EVIDENCE_01',7.35,'{}'::jsonb);
    raise exception 'Duplicate scan/revision accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.omr_artifacts(
      scan_id,revision,school_id,room_id,created_by_staff_id,
      mode,status,capture_path,annotated_path,sha256,file_bytes,engine_version,
      preview_score,evidence
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '55555555-5555-4555-8555-555555555555',
      'official','COMPLETE','test/c2.webp','test/a2.webp',repeat('a',64),1,
      'OMR_EVIDENCE_01',7.35,'{}'::jsonb);
    raise exception 'Official without submission accepted';
  exception when check_violation then null;
  end;
end $$;
-- A known-good official record may be stored without modifying submission rows.
insert into public.omr_artifacts(
 scan_id,revision,school_id,room_id,student_id,submission_id,created_by_staff_id,
 mode,status,capture_path,annotated_path,sha256,file_bytes,engine_version,
 preview_score,final_score,evidence
) values(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',
 '44444444-4444-4444-8444-444444444444',
 '55555555-5555-4555-8555-555555555555',
 'official','COMPLETE','official/capture.webp','official/annotated.webp',
 repeat('b',64),151234,'OMR_EVIDENCE_01',8.5,8.5,'{}'::jsonb
);
do $$
begin
  begin
    insert into public.omr_artifacts(
      scan_id,revision,school_id,room_id,submission_id,created_by_staff_id,
      mode,status,capture_path,annotated_path,sha256,file_bytes,engine_version,
      preview_score,evidence
    ) values(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      'official','COMPLETE','official/c2.webp','official/a2.webp',
      repeat('c',64),101,'OMR_EVIDENCE_01',8.5,'{}'::jsonb
    );
    raise exception 'Duplicate official submission accepted';
  exception when unique_violation then null;
  end;
end $$;
select 'PASS OMR EVIDENCE SQL: DDL idempotent, private bucket/RLS, test/official constraints' as outcome;
