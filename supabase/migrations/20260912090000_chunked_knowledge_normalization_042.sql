-- 042 — Chunked normalization staging for long knowledge sources.
-- The canonical knowledge_units revision is still committed only through
-- rpc_knowledge_import_normalized_source_service after server-side assembly.

create table if not exists public.knowledge_normalization_plans (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  requested_by uuid not null references public.giao_vien(id),
  mon_id uuid null references public.mon_hoc(id),
  subject_name text not null,
  grade smallint not null check (grade in (10,11,12)),
  source_role text not null default 'KNOWLEDGE_SOURCE' check (source_role='KNOWLEDGE_SOURCE'),
  schema_version text not null default 'DAMSAN_SOURCE_PLAN_V1' check (schema_version='DAMSAN_SOURCE_PLAN_V1'),
  source_page_count integer not null check (source_page_count>0),
  plan_status text not null default 'ACTIVE' check (plan_status in ('ACTIVE','NEEDS_REVIEW','ASSEMBLED','SUPERSEDED')),
  plan_json jsonb not null default '{}'::jsonb check (jsonb_typeof(plan_json)='object'),
  plan_storage_path text null,
  payload_sha256 text null,
  ai_provider text null,
  ai_model text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assembled_at timestamptz null
);

create index if not exists idx_knowledge_normalization_plans_document
  on public.knowledge_normalization_plans(document_id,created_at desc);
create index if not exists idx_knowledge_normalization_plans_status
  on public.knowledge_normalization_plans(plan_status,updated_at desc);

create table if not exists public.knowledge_normalization_chunks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.knowledge_normalization_plans(id) on delete cascade,
  chunk_key text not null,
  chunk_no integer not null check (chunk_no>0),
  chunk_type text not null check (chunk_type in ('LESSON','NON_LESSON','UNRESOLVED')),
  lesson_code text null,
  lesson_no integer null check (lesson_no is null or lesson_no>0),
  lesson_title text null,
  lesson_page_start integer null check (lesson_page_start is null or lesson_page_start>0),
  lesson_page_end integer null check (lesson_page_end is null or lesson_page_end>0),
  part_no integer null check (part_no is null or part_no>0),
  part_count integer null check (part_count is null or part_count>0),
  page_start integer not null check (page_start>0),
  page_end integer not null check (page_end>=page_start),
  range_label text null,
  status text not null default 'PENDING' check (status in ('PENDING','ACCOUNTED','IMPORTED','NEEDS_REVIEW','INCOMPLETE')),
  processed_pages integer[] not null default '{}'::integer[],
  missing_pages integer[] not null default '{}'::integer[],
  uncertain_pages integer[] not null default '{}'::integer[],
  records jsonb not null default '[]'::jsonb check (jsonb_typeof(records)='array'),
  payload_storage_path text null,
  payload_sha256 text null,
  ai_provider text null,
  ai_model text null,
  attempt_no integer not null default 0 check (attempt_no>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id,chunk_key),
  unique(plan_id,chunk_no),
  check (
    (chunk_type='LESSON' and lesson_code is not null and lesson_no is not null and lesson_title is not null and lesson_page_start is not null and lesson_page_end is not null and part_no is not null and part_count is not null)
    or chunk_type in ('NON_LESSON','UNRESOLVED')
  )
);

create index if not exists idx_knowledge_normalization_chunks_plan
  on public.knowledge_normalization_chunks(plan_id,chunk_no);
create index if not exists idx_knowledge_normalization_chunks_status
  on public.knowledge_normalization_chunks(plan_id,status,chunk_no);

alter table public.knowledge_normalization_plans enable row level security;
alter table public.knowledge_normalization_chunks enable row level security;

revoke all on table public.knowledge_normalization_plans from public, anon, authenticated;
revoke all on table public.knowledge_normalization_chunks from public, anon, authenticated;
grant all on table public.knowledge_normalization_plans to service_role;
grant all on table public.knowledge_normalization_chunks to service_role;

comment on table public.knowledge_normalization_plans is
  '042 server-validated structure plans for long KNOWLEDGE_SOURCE normalization. Browser access is only through an authenticated Edge function.';
comment on table public.knowledge_normalization_chunks is
  '042 staged lesson chunks. No row becomes canonical knowledge until assembler calls rpc_knowledge_import_normalized_source_service.';

-- Fail closed on the canonical document update as well as in browser UX.
-- A >40-page KNOWLEDGE_SOURCE may only commit a new DAMSAN_SOURCE_V2 revision
-- when the final manifest proves that it came from the server-side 042 assembler.
create or replace function public._knowledge_long_source_chunk_guard_042()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.source_role,'KNOWLEDGE_SOURCE')='KNOWLEDGE_SOURCE'
     and coalesce(new.page_count,0)>40
     and new.normalization_schema='DAMSAN_SOURCE_V2'
     and (
       new.analysis_revision is distinct from old.analysis_revision
       or new.normalized_storage_path is distinct from old.normalized_storage_path
     )
     and not (
       jsonb_typeof(coalesce(new.normalized_manifest->'notes','[]'::jsonb))='array'
       and coalesce(new.normalized_manifest->'notes','[]'::jsonb) @> '["CHUNKED_NORMALIZATION_042"]'::jsonb
     ) then
    raise exception 'long_knowledge_source_requires_chunked_normalization';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_knowledge_long_source_chunk_guard_042 on public.knowledge_documents;
create trigger trg_knowledge_long_source_chunk_guard_042
before update on public.knowledge_documents
for each row execute function public._knowledge_long_source_chunk_guard_042();

-- An assembled revision with uncertain pages is intentionally kept non-active by
-- the canonical 038 quality gate. Keep the plan editable as NEEDS_REVIEW so the
-- teacher can re-run only uncertain chunks and assemble again; do not strand the
-- workflow in ASSEMBLED with no route to repair.
create or replace function public._knowledge_chunk_plan_review_guard_042()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plan_status='ASSEMBLED'
     and exists(
       select 1
       from public.knowledge_normalization_chunks c
       where c.plan_id=new.id
         and c.chunk_type='LESSON'
         and c.status<>'IMPORTED'
     ) then
    new.plan_status:='NEEDS_REVIEW';
    new.assembled_at:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_knowledge_chunk_plan_review_guard_042 on public.knowledge_normalization_plans;
create trigger trg_knowledge_chunk_plan_review_guard_042
before update of plan_status,assembled_at on public.knowledge_normalization_plans
for each row execute function public._knowledge_chunk_plan_review_guard_042();
