begin;

-- 039B — When a subject/grade has exactly one active authority profile, a normalized
-- rule/benchmark source can be linked deterministically without asking the AI to know
-- internal profile IDs. If multiple profiles exist, no implicit link is made.
create or replace function public._assessment_auto_link_unique_profile_039()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id text;
  v_profile_count integer;
  v_rank smallint;
  v_manifest_ids jsonb;
begin
  if new.active_revision is null
     or new.mon_id is null
     or new.grade is null
     or new.source_role not in ('ASSESSMENT_RULE','ASSESSMENT_BENCHMARK') then
    return new;
  end if;

  v_manifest_ids:=coalesce(new.normalized_manifest->'assessment_profile_ids','[]'::jsonb);
  if jsonb_typeof(v_manifest_ids)='array' and jsonb_array_length(v_manifest_ids)>0 then
    return new;
  end if;

  select count(*)::integer,min(p.profile_id)
  into v_profile_count,v_profile_id
  from public.assessment_authority_profiles p
  where p.mon_id=new.mon_id
    and p.grade=new.grade
    and p.is_active=true
    and (p.effective_from is null or p.effective_from<=current_date)
    and (p.effective_to is null or p.effective_to>=current_date);

  if v_profile_count<>1 or v_profile_id is null then return new; end if;

  v_rank:=case when new.source_role='ASSESSMENT_RULE' then 1 else 2 end;
  insert into public.assessment_profile_sources(
    profile_id,document_id,source_kind,authority_rank,authority_code,is_required,notes
  ) values (
    v_profile_id,new.id,new.source_role,v_rank,
    nullif(btrim(new.normalized_manifest->>'authority_code'),''),
    true,
    'AUTO_LINK_UNIQUE_PROFILE_039B'
  )
  on conflict(profile_id,document_id) do update
  set source_kind=excluded.source_kind,
      authority_rank=excluded.authority_rank,
      authority_code=coalesce(excluded.authority_code,public.assessment_profile_sources.authority_code),
      is_required=true,
      notes='AUTO_LINK_UNIQUE_PROFILE_039B';

  return new;
end;
$$;

revoke all on function public._assessment_auto_link_unique_profile_039() from public,anon,authenticated;
drop trigger if exists trg_knowledge_documents_authority_autolink_039b on public.knowledge_documents;
create trigger trg_knowledge_documents_authority_autolink_039b
after insert or update of active_revision,source_role,grade,mon_id,normalized_manifest on public.knowledge_documents
for each row execute function public._assessment_auto_link_unique_profile_039();

commit;
