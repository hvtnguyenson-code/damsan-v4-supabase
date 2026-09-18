begin;

-- 065A — provider/model control plane for server-side AI API execution.
-- API credentials are stored only in Supabase Vault. Browser-facing code never receives plaintext keys.

create table if not exists public.ai_provider_connections (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null check (owner_scope in ('PERSONAL','SCHOOL','SYSTEM')),
  owner_gv_id uuid null references public.giao_vien(id) on delete cascade,
  truong_id uuid null,
  created_by uuid not null references public.giao_vien(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  adapter_type text not null check (adapter_type in (
    'OPENAI_RESPONSES','OPENAI_CHAT','OPENAI_COMPAT',
    'ANTHROPIC_MESSAGES','GEMINI_GENERATE_CONTENT','CUSTOM_JSON_HTTP'
  )),
  base_url text not null check (char_length(btrim(base_url)) between 8 and 1000),
  auth_type text not null default 'BEARER' check (auth_type in ('BEARER','HEADER','QUERY','NONE')),
  auth_header text null,
  auth_prefix text not null default '',
  secret_id uuid null unique,
  secret_hint text null,
  discovery_mode text not null default 'HYBRID' check (discovery_mode in ('AUTO','MANUAL','HYBRID')),
  models_path text null,
  provider_options jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_options)='object'),
  enabled boolean not null default true,
  last_tested_at timestamptz null,
  last_test_status text null check (last_test_status is null or last_test_status in ('OK','FAILED','UNVERIFIED')),
  last_test_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_provider_owner_scope_ck check (
    (owner_scope='PERSONAL' and owner_gv_id is not null)
    or (owner_scope='SCHOOL' and truong_id is not null)
    or (owner_scope='SYSTEM' and owner_gv_id is null and truong_id is null)
  )
);

create index if not exists ai_provider_connections_owner_gv_idx
  on public.ai_provider_connections(owner_gv_id) where owner_scope='PERSONAL';
create index if not exists ai_provider_connections_school_idx
  on public.ai_provider_connections(truong_id) where owner_scope='SCHOOL';

create table if not exists public.ai_model_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_connection_id uuid not null references public.ai_provider_connections(id) on delete cascade,
  model_id text not null check (char_length(btrim(model_id)) between 1 and 300),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 300),
  capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities)='object'),
  default_parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(default_parameters)='object'),
  enabled boolean not null default true,
  discovered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_connection_id, model_id)
);

alter table public.ai_provider_connections enable row level security;
alter table public.ai_model_profiles enable row level security;
revoke all on table public.ai_provider_connections from public, anon, authenticated;
revoke all on table public.ai_model_profiles from public, anon, authenticated;
grant all on table public.ai_provider_connections to service_role;
grant all on table public.ai_model_profiles to service_role;

create or replace function public._ai_provider_vault_create_065a(
  p_provider_id uuid,
  p_secret text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_provider_id is null or nullif(btrim(coalesce(p_secret,'')),'') is null then
    raise exception 'provider_secret_invalid';
  end if;
  v_id:=vault.create_secret(
    p_secret,
    'ai-provider-' || p_provider_id::text,
    'Đam San AI provider credential. Never expose to browser.',
    null
  );
  return v_id;
end;
$$;

create or replace function public._ai_provider_vault_update_065a(
  p_secret_id uuid,
  p_provider_id uuid,
  p_secret text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_secret_id is null or p_provider_id is null or nullif(btrim(coalesce(p_secret,'')),'') is null then
    raise exception 'provider_secret_invalid';
  end if;
  perform vault.update_secret(
    p_secret_id,
    p_secret,
    'ai-provider-' || p_provider_id::text,
    'Đam San AI provider credential. Never expose to browser.',
    null
  );
end;
$$;

create or replace function public._ai_provider_vault_read_065a(
  p_secret_id uuid
) returns text
language sql
security definer
set search_path = public
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.id=p_secret_id
  limit 1
$$;

create or replace function public._ai_provider_vault_delete_065a(
  p_secret_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_secret_id is not null then
    delete from vault.secrets where id=p_secret_id;
  end if;
end;
$$;

revoke all on function public._ai_provider_vault_create_065a(uuid,text) from public, anon, authenticated;
revoke all on function public._ai_provider_vault_update_065a(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public._ai_provider_vault_read_065a(uuid) from public, anon, authenticated;
revoke all on function public._ai_provider_vault_delete_065a(uuid) from public, anon, authenticated;
grant execute on function public._ai_provider_vault_create_065a(uuid,text) to service_role;
grant execute on function public._ai_provider_vault_update_065a(uuid,uuid,text) to service_role;
grant execute on function public._ai_provider_vault_read_065a(uuid) to service_role;
grant execute on function public._ai_provider_vault_delete_065a(uuid) to service_role;

commit;
