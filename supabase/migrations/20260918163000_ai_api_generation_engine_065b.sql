begin;

-- 065B — audit/control tables for server-side AI API exam generation.
-- Provider credentials remain in Supabase Vault; these tables never persist plaintext secrets,
-- full prompts, or raw provider responses.

create table if not exists public.ai_generation_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ai_exam_requests(id) on delete cascade,
  requested_by uuid not null references public.giao_vien(id),
  provider_connection_id uuid not null references public.ai_provider_connections(id),
  model_profile_id uuid not null references public.ai_model_profiles(id),
  provider_name_snapshot text not null,
  adapter_type_snapshot text not null,
  model_id_snapshot text not null,
  prompt_sha256 text not null check (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  parameters_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters_snapshot)='object'),
  status text not null default 'RUNNING' check (status in ('RUNNING','PROVIDER_SUCCEEDED','VALIDATED','FAILED')),
  provider_request_id text null,
  input_tokens bigint null check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint null check (output_tokens is null or output_tokens >= 0),
  finish_reason text null,
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  error_code text null,
  error_detail_safe text null,
  result_request_status text null,
  result_revision integer null,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz null
);

create index if not exists ai_generation_runs_request_idx
  on public.ai_generation_runs(request_id, created_at desc);
create index if not exists ai_generation_runs_actor_idx
  on public.ai_generation_runs(requested_by, created_at desc);

create table if not exists public.ai_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_generation_runs(id) on delete cascade,
  attempt_no integer not null check (attempt_no between 1 and 20),
  provider_connection_id uuid not null references public.ai_provider_connections(id),
  model_profile_id uuid not null references public.ai_model_profiles(id),
  status text not null check (status in ('STARTED','SUCCEEDED','FAILED')),
  http_status integer null,
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  provider_request_id text null,
  error_class text null,
  created_at timestamptz not null default now(),
  finished_at timestamptz null,
  unique(run_id, attempt_no)
);

alter table public.ai_generation_runs enable row level security;
alter table public.ai_generation_attempts enable row level security;
revoke all on table public.ai_generation_runs from public, anon, authenticated;
revoke all on table public.ai_generation_attempts from public, anon, authenticated;
grant all on table public.ai_generation_runs to service_role;
grant all on table public.ai_generation_attempts to service_role;

commit;
