-- Synthetic, isolated PostgreSQL 17 fixture for OMR-EVIDENCE-01 CI.
-- No user data, no Supabase cloud connection and no production credentials.
begin;
do $$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists storage;
create table public.truong_hoc(id uuid primary key);
create table public.phong_thi(id uuid primary key);
create table public.hoc_sinh(id uuid primary key);
create table public.exam_submissions(id uuid primary key);
create table public.giao_vien(id uuid primary key);
create table storage.buckets(
 id text primary key,
 name text not null,
 public boolean not null default false,
 file_size_limit bigint,
 allowed_mime_types text[]
);
insert into public.truong_hoc values ('11111111-1111-4111-8111-111111111111');
insert into public.phong_thi values ('22222222-2222-4222-8222-222222222222');
insert into public.hoc_sinh values ('33333333-3333-4333-8333-333333333333');
insert into public.exam_submissions values ('44444444-4444-4444-8444-444444444444');
insert into public.giao_vien values ('55555555-5555-4555-8555-555555555555');
commit;
