-- Synthetic local-only deletion test, including Storage API emulation.
do $$
declare
 d jsonb; c jsonb;
begin
 d:=public.rpc_omr_room_delete_inventory('token-bad','GV001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222');
 if d->>'status'<>'error' then raise exception 'invalid session allowed'; end if;
 d:=public.rpc_omr_room_delete_inventory('token-valid','GV001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222');
 if d->>'status'<>'success' or (d->>'file_count')::integer<>2
    or (d->>'file_bytes')::integer<>3282
 then raise exception 'scoped inventory incorrect: %',d; end if;
 c:=public.rpc_xoa_phong_thi('token-valid','GV001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222');
 if c->>'code'<>'omr_storage_not_empty'
 then raise exception 'room deleted before storage cleanup: %',c; end if;
 if not exists(select 1 from public.phong_thi where id='22222222-2222-4222-8222-222222222222')
    or (select count(*) from public.omr_artifacts)<>2
 then raise exception 'room/artifacts changed on blocked attempt'; end if;
end $$;
-- ONLY IN THIS EPHEMERAL FIXTURE: emulate Storage API successful deletion.
-- Production must use supabase.storage.from(bucket).remove(...) exclusively.
delete from storage.objects where bucket_id='omr-evidence'
 and name like 'test/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/%';
do $$
declare d jsonb;
begin
 d:=public.rpc_xoa_phong_thi('token-valid','GV001',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222');
 if d->>'status'<>'success' then raise exception 'room deletion failed: %',d; end if;
 if exists(select 1 from public.phong_thi where id='22222222-2222-4222-8222-222222222222')
  or exists(select 1 from public.omr_artifacts where room_id='22222222-2222-4222-8222-222222222222')
  or exists(select 1 from public.exam_submissions where phong_id='22222222-2222-4222-8222-222222222222')
  or exists(select 1 from public.ket_qua where phong_id='22222222-2222-4222-8222-222222222222')
  or exists(select 1 from public.de_thi where phong_id='22222222-2222-4222-8222-222222222222')
 then raise exception 'room cascade incomplete'; end if;
 if not exists(select 1 from public.phong_thi where id='66666666-6666-4666-8666-666666666666')
  or (select count(*) from storage.objects where bucket_id='omr-evidence')<>1
 then raise exception 'another room was affected'; end if;
 if has_function_privilege('anon',
 'public.rpc_omr_room_delete_inventory(text,text,uuid,uuid)','execute')
 or has_function_privilege('authenticated',
 'public.rpc_omr_room_delete_inventory(text,text,uuid,uuid)','execute')
 or not has_function_privilege('service_role',
 'public.rpc_omr_room_delete_inventory(text,text,uuid,uuid)','execute')
 then raise exception 'private inventory permissions invalid'; end if;
end $$;
select 'PASS OMR 054: fail-closed storage guard, FK cascade, isolation' as result;
