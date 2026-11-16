-- Synthetic local-only extensions of tests/sql/omr_evidence_fixture.sql.
-- Run after omr_evidence_assertions.sql; NEVER against production.
do $$begin
 if not exists (select 1 from pg_roles where rolname='service_role')
 then create role service_role nologin; end if;
end$$;
alter table public.phong_thi add column if not exists truong_id uuid;
alter table public.giao_vien add column if not exists ma_gv text;
alter table public.giao_vien add column if not exists truong_id uuid;
alter table public.giao_vien add column if not exists quyen text;
alter table public.exam_submissions add column if not exists phong_id uuid;
update public.phong_thi
set truong_id='11111111-1111-4111-8111-111111111111';
update public.giao_vien set ma_gv='GV001',
 truong_id='11111111-1111-4111-8111-111111111111', quyen='Admin';
update public.exam_submissions
set phong_id='22222222-2222-4222-8222-222222222222';
create table if not exists public.ket_qua(phong_id uuid not null);
create table if not exists public.de_thi(phong_id uuid not null);
insert into public.ket_qua values('22222222-2222-4222-8222-222222222222');
insert into public.de_thi values('22222222-2222-4222-8222-222222222222');
create or replace function public._staff_session_gv_id(p_token text)
returns uuid language sql stable as $function$
select case when p_token='token-valid' then
 '55555555-5555-4555-8555-555555555555'::uuid else null::uuid end
$function$;
create table if not exists storage.objects(
 id uuid primary key, bucket_id text not null, name text not null, metadata jsonb
);
insert into public.phong_thi(id,truong_id)
values('66666666-6666-4666-8666-666666666666',
 '11111111-1111-4111-8111-111111111111');
insert into storage.objects values
('77777777-7777-4777-8777-777777777771','omr-evidence',
 'test/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/scan/1/annotated.webp','{"size":1234}'),
('77777777-7777-4777-8777-777777777772','omr-evidence',
 'test/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/orphan/1/capture.webp','{"size":2048}'),
('77777777-7777-4777-8777-777777777773','omr-evidence',
 'test/11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666/scan/1/annotated.webp','{"size":4096}');
