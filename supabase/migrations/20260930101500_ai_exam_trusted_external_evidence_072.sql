begin;

-- 072 — Flexible quantitative provenance without turning Supabase into a statistical warehouse.
-- Geography knowledge/skills remain grounded in the selected Knowledge Package. Part III raw numbers
-- may come from either selected knowledge_units or a small whitelist of authoritative external sources.
-- External datasets are NOT copied into Supabase; each draft stores only the tiny evidence capsule
-- actually used by that question (source id/url/dataset/retrieved_at/values).

create table if not exists public.ai_exam_trusted_external_sources (
  source_id text primary key,
  display_name text not null,
  organization text not null,
  homepage_url text not null,
  allowed_domains text[] not null,
  scope_tags text[] not null default '{}'::text[],
  verification_mode text not null default 'TRACEABLE_WEB'
    check (verification_mode in ('TRACEABLE_WEB','API_OR_TRACEABLE')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_id ~ '^[A-Z0-9_]{2,64}$'),
  check (cardinality(allowed_domains) > 0)
);

revoke all on table public.ai_exam_trusted_external_sources from public, anon, authenticated;
grant select on table public.ai_exam_trusted_external_sources to service_role;

insert into public.ai_exam_trusted_external_sources
  (source_id,display_name,organization,homepage_url,allowed_domains,scope_tags,verification_mode,enabled)
values
  ('WORLD_BANK','World Bank Open Data','World Bank','https://data.worldbank.org/',array['worldbank.org'],array['WORLD','POPULATION','ECONOMY','SOCIETY','AGRICULTURE','ENVIRONMENT'],'API_OR_TRACEABLE',true),
  ('FAOSTAT','FAOSTAT','Food and Agriculture Organization of the United Nations','https://www.fao.org/faostat/',array['fao.org','faostat.org'],array['WORLD','AGRICULTURE','FORESTRY','FISHERIES','LAND','FOOD'],'API_OR_TRACEABLE',true),
  ('UN_STATS','United Nations Statistics','United Nations Statistics Division','https://unstats.un.org/',array['un.org'],array['WORLD','POPULATION','ECONOMY','SOCIETY','ENVIRONMENT'],'TRACEABLE_WEB',true),
  ('NOAA_NCEI','NOAA National Centers for Environmental Information','National Oceanic and Atmospheric Administration','https://www.ncei.noaa.gov/',array['noaa.gov'],array['WORLD','CLIMATE','ATMOSPHERE','OCEAN','WEATHER'],'API_OR_TRACEABLE',true),
  ('NASA_EARTHDATA','NASA Earthdata','National Aeronautics and Space Administration','https://earthdata.nasa.gov/',array['nasa.gov'],array['WORLD','EARTH_OBSERVATION','CLIMATE','OCEAN','ICE','LAND'],'TRACEABLE_WEB',true),
  ('USGS','U.S. Geological Survey','U.S. Geological Survey','https://www.usgs.gov/',array['usgs.gov'],array['WORLD','GEOLOGY','EARTHQUAKE','VOLCANO','WATER','LAND'],'API_OR_TRACEABLE',true),
  ('VIETNAM_NSO','Cục Thống kê Việt Nam','Cục Thống kê - Bộ Tài chính','https://www.nso.gov.vn/so-lieu-thong-ke/',array['nso.gov.vn','gso.gov.vn'],array['VIETNAM','POPULATION','ECONOMY','SOCIETY','AGRICULTURE','INDUSTRY','SERVICES','LAND','CLIMATE'],'TRACEABLE_WEB',true)
on conflict (source_id) do update
set display_name=excluded.display_name,
    organization=excluded.organization,
    homepage_url=excluded.homepage_url,
    allowed_domains=excluded.allowed_domains,
    scope_tags=excluded.scope_tags,
    verification_mode=excluded.verification_mode,
    enabled=excluded.enabled,
    updated_at=now();

create or replace function public._ai_exam_trusted_sources_snapshot_072()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_id',s.source_id,
        'display_name',s.display_name,
        'organization',s.organization,
        'homepage_url',s.homepage_url,
        'allowed_domains',to_jsonb(s.allowed_domains),
        'scope_tags',to_jsonb(s.scope_tags),
        'verification_mode',s.verification_mode
      ) order by s.source_id
    ),
    '[]'::jsonb
  )
  from public.ai_exam_trusted_external_sources s
  where s.enabled is true;
$$;

revoke all on function public._ai_exam_trusted_sources_snapshot_072() from public, anon, authenticated;
grant execute on function public._ai_exam_trusted_sources_snapshot_072() to service_role;

create or replace function public._ai_exam_url_host_072(p_url text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(btrim(coalesce(p_url,''))) ~ '^https://[^/:?#]+(?::[0-9]+)?(?:[/?#].*)?$'
      then lower((regexp_match(lower(btrim(p_url)),'^https://([^/:?#]+)'))[1])
    else null
  end;
$$;

revoke all on function public._ai_exam_url_host_072(text) from public, anon, authenticated;
grant execute on function public._ai_exam_url_host_072(text) to service_role;

create or replace function public._ai_exam_host_allowed_072(p_host text,p_domains text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(exists(
    select 1
    from unnest(coalesce(p_domains,'{}'::text[])) d(domain_name)
    where lower(btrim(p_host))=lower(btrim(d.domain_name))
       or lower(btrim(p_host)) like '%.' || lower(btrim(d.domain_name))
  ),false);
$$;

revoke all on function public._ai_exam_host_allowed_072(text,text[]) from public, anon, authenticated;
grant execute on function public._ai_exam_host_allowed_072(text,text[]) to service_role;

-- Upgrade the shared Geography item-writing standard. Keep the stable standard id while snapshotting
-- the currently enabled source registry into each new request's assessment_standard.
alter function public._ai_exam_geography_standard_037()
  rename to _ai_exam_geography_standard_072_base;

revoke all on function public._ai_exam_geography_standard_072_base() from public, anon, authenticated;

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_set(
    jsonb_set(
      public._ai_exam_geography_standard_072_base(),
      '{version}',
      '"072"'::jsonb,
      true
    ),
    '{part3}',
    coalesce(public._ai_exam_geography_standard_072_base()->'part3','{}'::jsonb)
      || jsonb_build_object(
        'accepted_data_origins',jsonb_build_array('LOCAL_GROUNDED','TRUSTED_EXTERNAL'),
        'authentic_source_data_required',true,
        'local_inputs_must_exist_in_cited_units',true,
        'trusted_external_data_policy','REGISTRY_WHITELIST_WITH_EVIDENCE_CAPSULE',
        'external_source_must_be_registry_whitelisted',true,
        'external_url_domain_must_match_registry',true,
        'external_inputs_must_match_evidence_values',true,
        'external_evidence_required_fields',jsonb_build_array('source_id','source_url','dataset','retrieved_at','values'),
        'insufficient_authentic_data_policy','USE_TRUSTED_EXTERNAL_OR_BLOCK_DO_NOT_INVENT',
        'trusted_external_sources',public._ai_exam_trusted_sources_snapshot_072()
      ),
    true
  );
$$;

revoke all on function public._ai_exam_geography_standard_037() from public, anon, authenticated;

update public.assessment_authority_profiles
set profile_version='072',
    profile=jsonb_set(
      jsonb_set(profile,'{version}','"072"'::jsonb,true),
      '{rules,part3}',
      coalesce(profile #> '{rules,part3}','{}'::jsonb) || '{
        "accepted_data_origins":["LOCAL_GROUNDED","TRUSTED_EXTERNAL"],
        "authentic_source_data_required":true,
        "local_inputs_must_exist_in_cited_units":true,
        "trusted_external_data_policy":"REGISTRY_WHITELIST_WITH_EVIDENCE_CAPSULE",
        "external_source_must_be_registry_whitelisted":true,
        "external_url_domain_must_match_registry":true,
        "external_inputs_must_match_evidence_values":true,
        "insufficient_authentic_data_policy":"USE_TRUSTED_EXTERNAL_OR_BLOCK_DO_NOT_INVENT"
      }'::jsonb,
      true
    ),
    updated_at=now()
where profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

-- 071 rejects every input that is absent from cited local knowledge units. 072 preserves that
-- protection for LOCAL_GROUNDED questions, but permits TRUSTED_EXTERNAL only after validating a
-- compact evidence capsule against the live authoritative-source registry.
alter function public._ai_exam_quality_gate_037(uuid,jsonb)
  rename to _ai_exam_quality_gate_072_base;

revoke all on function public._ai_exam_quality_gate_072_base(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_072_base(uuid,jsonb) to service_role;

create or replace function public._ai_exam_quality_gate_037(
  p_request_id uuid,
  p_exam_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_standard_id text;
  v_errors jsonb;
  v_q jsonb;
  v_quant jsonb;
  v_evidence jsonb;
  v_values jsonb;
  v_input jsonb;
  v_ev jsonb;
  v_missing jsonb;
  v_idx integer:=0;
  v_part text;
  v_origin text;
  v_source_id text;
  v_source_url text;
  v_dataset text;
  v_retrieved_at text;
  v_host text;
  v_allowed_domains text[];
  v_source_found boolean;
  v_values_valid boolean;
  v_value numeric;
  v_value_found boolean;
  v_external_valid boolean;
  v_local_count integer:=0;
  v_external_count integer:=0;
  v_code text;
begin
  v_base:=public._ai_exam_quality_gate_072_base(p_request_id,p_exam_payload);

  select r.exam_spec #>> '{assessment_standard,id}'
  into v_standard_id
  from public.ai_exam_requests r
  where r.id=p_request_id;

  if v_standard_id is distinct from 'DIA_LI_TNTHPT_2025_PLUS_V1'
     or p_exam_payload is null
     or jsonb_typeof(p_exam_payload)<>'object'
     or jsonb_typeof(p_exam_payload->'questions')<>'array' then
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('quality_gate_version','072');
  end if;

  v_errors:=coalesce(v_base->'errors','[]'::jsonb);

  for v_q in select value from jsonb_array_elements(p_exam_payload->'questions') loop
    v_idx:=v_idx+1;
    v_part:=btrim(coalesce(v_q->>'phan',''));
    if v_part<>'3' then continue; end if;

    v_quant:=v_q->'quantitative';
    if v_quant is null or jsonb_typeof(v_quant)<>'object' then
      continue;
    end if;

    v_origin:=upper(btrim(coalesce(nullif(v_quant->>'data_origin',''),'LOCAL_GROUNDED')));

    if v_origin in ('LOCAL_GROUNDED','KNOWLEDGE_UNIT') then
      v_local_count:=v_local_count+1;
      continue;
    end if;

    if v_origin<>'TRUSTED_EXTERNAL' then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_data_origin_invalid',
        'message','data_origin Phần III chỉ được là LOCAL_GROUNDED hoặc TRUSTED_EXTERNAL.'
      ));
      continue;
    end if;

    v_external_count:=v_external_count+1;
    v_external_valid:=true;
    v_evidence:=v_quant->'external_evidence';

    if v_evidence is null or jsonb_typeof(v_evidence)<>'object' then
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_external_evidence_invalid',
        'message','TRUSTED_EXTERNAL phải có external_evidence để truy nguyên dữ liệu.'
      ));
      continue;
    end if;

    v_source_id:=upper(btrim(coalesce(v_evidence->>'source_id','')));
    v_source_url:=btrim(coalesce(v_evidence->>'source_url',''));
    v_dataset:=btrim(coalesce(v_evidence->>'dataset',''));
    v_retrieved_at:=btrim(coalesce(v_evidence->>'retrieved_at',''));
    v_values:=v_evidence->'values';

    select s.allowed_domains into v_allowed_domains
    from public.ai_exam_trusted_external_sources s
    where s.source_id=v_source_id and s.enabled is true;
    v_source_found:=found;

    if not v_source_found then
      v_external_valid:=false;
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_external_source_untrusted',
        'message','Nguồn dữ liệu ngoài không nằm trong whitelist đang được hệ thống cho phép.',
        'source_id',v_source_id
      ));
    end if;

    v_host:=public._ai_exam_url_host_072(v_source_url);
    if v_host is null or not v_source_found or not public._ai_exam_host_allowed_072(v_host,v_allowed_domains) then
      v_external_valid:=false;
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_external_url_invalid',
        'message','source_url phải là HTTPS và thuộc domain chính thức của source_id đã khai báo.',
        'source_url',v_source_url
      ));
    end if;

    if char_length(v_dataset)<3 or char_length(v_retrieved_at)<8 then
      v_external_valid:=false;
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_external_evidence_invalid',
        'message','external_evidence phải ghi rõ dataset và retrieved_at.'
      ));
    end if;

    if v_values is null or jsonb_typeof(v_values)<>'array' or jsonb_array_length(v_values)=0 then
      v_external_valid:=false;
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_external_values_invalid',
        'message','external_evidence.values phải là mảng số liệu thô có thật đã lấy từ nguồn.'
      ));
    else
      select coalesce(bool_and(jsonb_typeof(value)='number'),false)
      into v_values_valid
      from jsonb_array_elements(v_values);
      if not v_values_valid then
        v_external_valid:=false;
        v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
          'question_no',v_idx,
          'code','quality_part3_external_values_invalid',
          'message','external_evidence.values chỉ được chứa số.'
        ));
      end if;
    end if;

    v_missing:='[]'::jsonb;
    if v_values is not null and jsonb_typeof(v_values)='array'
       and v_quant ? 'inputs' and jsonb_typeof(v_quant->'inputs')='array' then
      for v_input in select value from jsonb_array_elements(v_quant->'inputs') loop
        if jsonb_typeof(v_input)<>'number' then continue; end if;
        begin
          v_value:=(v_input #>> '{}')::numeric;
        exception when others then
          continue;
        end;
        v_value_found:=false;
        for v_ev in select value from jsonb_array_elements(v_values) loop
          if jsonb_typeof(v_ev)<>'number' then continue; end if;
          begin
            if (v_ev #>> '{}')::numeric=v_value then
              v_value_found:=true;
              exit;
            end if;
          exception when others then
            continue;
          end;
        end loop;
        if not v_value_found then
          v_missing:=v_missing || jsonb_build_array(v_input);
        end if;
      end loop;
    end if;

    if jsonb_array_length(v_missing)>0 then
      v_external_valid:=false;
      v_errors:=v_errors || jsonb_build_array(jsonb_build_object(
        'question_no',v_idx,
        'code','quality_part3_external_values_mismatch',
        'message','Mọi quantitative.inputs phải xuất hiện nguyên giá trị trong external_evidence.values.',
        'missing_inputs',v_missing
      ));
    end if;

    -- 071's local-only error is intentionally removed only after the complete external evidence
    -- contract succeeds. Every other 053-071 correctness/presentation/authenticity error is kept.
    if v_external_valid then
      select coalesce(jsonb_agg(e.value order by e.ord),'[]'::jsonb)
      into v_errors
      from jsonb_array_elements(v_errors) with ordinality e(value,ord)
      where not (
        coalesce(e.value->>'code','')='quality_part3_input_not_grounded_in_source'
        and coalesce(e.value->>'question_no','') ~ '^[0-9]+$'
        and (e.value->>'question_no')::integer=v_idx
      );
    end if;
  end loop;

  if jsonb_array_length(v_errors)>0 then
    v_code:=coalesce(v_errors->0->>'code',v_base->>'code','quality_failed');
    return coalesce(v_base,'{}'::jsonb) || jsonb_build_object(
      'valid',false,
      'code',v_code,
      'errors',v_errors,
      'quality_gate_version','072',
      'part3_evidence',jsonb_build_object('local_count',v_local_count,'trusted_external_count',v_external_count)
    );
  end if;

  return coalesce(v_base,'{}'::jsonb) || jsonb_build_object(
    'valid',true,
    'code',null,
    'errors','[]'::jsonb,
    'quality_gate_version','072',
    'part3_evidence',jsonb_build_object('local_count',v_local_count,'trusted_external_count',v_external_count)
  );
end;
$$;

revoke all on function public._ai_exam_quality_gate_037(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._ai_exam_quality_gate_037(uuid,jsonb) to service_role;

commit;
