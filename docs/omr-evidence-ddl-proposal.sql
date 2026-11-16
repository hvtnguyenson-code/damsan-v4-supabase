-- OMR Evidence 01 - reviewed SQL proposal; NOT applied to production.
-- Stage A: only OMR_V7_TEST. Create final migration with Supabase CLI after approval.
begin;
create table if not exists public.omr_artifacts (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  revision integer not null check (revision between 1 and 1000),
  school_id uuid not null references public.truong_hoc(id),
  room_id uuid not null references public.phong_thi(id),
  student_id uuid null references public.hoc_sinh(id),
  submission_id uuid null references public.exam_submissions(id),
  created_by_staff_id uuid not null references public.giao_vien(id),
  exam_code text not null default '',
  mode text not null check (mode in ('test','official')),
  status text not null check (status in ('TEST','EVIDENCE_PENDING','COMPLETE')),
  capture_path text not null,
  annotated_path text not null,
  sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_bytes integer not null check (file_bytes between 1 and 1500000),
  engine_version text not null,
  preview_score numeric not null,
  final_score numeric null,
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  constraint omr_artifacts_unique_revision unique (scan_id,revision),
  constraint omr_artifacts_mode_link check (
    (mode='test' and submission_id is null and status='TEST')
    or
    (mode='official' and submission_id is not null and status in ('EVIDENCE_PENDING','COMPLETE'))
  )
);
create unique index if not exists omr_artifacts_one_official_per_submission
  on public.omr_artifacts(submission_id) where mode='official';
create index if not exists omr_artifacts_room_time
  on public.omr_artifacts(room_id,created_at desc);
create index if not exists omr_artifacts_school_time
  on public.omr_artifacts(school_id,created_at desc);
alter table public.omr_artifacts enable row level security;
-- No anon/authenticated policies: only the Edge Function service role accesses
-- these artifacts after validating the school's opaque staff session and scope.
revoke all on public.omr_artifacts from public, anon, authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('omr-evidence','omr-evidence',false,1500000,
  array['image/webp','image/jpeg']::text[])
on conflict (id) do update set public=false, file_size_limit=1500000,
  allowed_mime_types=excluded.allowed_mime_types;
-- Do not add public storage.objects policies.
commit;