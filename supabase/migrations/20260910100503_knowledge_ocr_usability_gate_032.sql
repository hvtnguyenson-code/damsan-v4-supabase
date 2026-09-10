-- KNOWLEDGE-032: block unusable OCR/extraction from reaching AI analysis.

create or replace function public._knowledge_extraction_manifest_usable(p_manifest jsonb)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select
    p_manifest is not null
    and jsonb_typeof(p_manifest) = 'object'
    and p_manifest->>'schema_version' = 'DAMSAN_EXTRACT_V1'
    and coalesce(p_manifest->>'extracted_chars','') ~ '^[0-9]+$'
    and (p_manifest->>'extracted_chars')::bigint > 0
    and coalesce(p_manifest->>'page_count','') ~ '^[0-9]+$'
    and (p_manifest->>'page_count')::integer > 0
    and (
      upper(coalesce(p_manifest->>'boundary_mode','')) <> 'PDF_PAGE'
      or (
        jsonb_typeof(coalesce(p_manifest->'ocr_unresolved_pages','[]'::jsonb)) = 'array'
        and jsonb_array_length(coalesce(p_manifest->'ocr_unresolved_pages','[]'::jsonb)) < (p_manifest->>'page_count')::integer
      )
    );
$function$;

revoke all on function public._knowledge_extraction_manifest_usable(jsonb) from public, anon, authenticated;
grant execute on function public._knowledge_extraction_manifest_usable(jsonb) to service_role;

create or replace function public._knowledge_guard_extracted_document()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.pipeline_status in ('EXTRACTED','ANALYZING','READY')
     and not public._knowledge_extraction_manifest_usable(new.extraction_manifest) then
    raise exception 'knowledge extraction has no usable source text'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public._knowledge_guard_extracted_document() from public, anon, authenticated;

drop trigger if exists trg_knowledge_guard_extracted_document on public.knowledge_documents;
create trigger trg_knowledge_guard_extracted_document
before insert or update of pipeline_status, extraction_manifest
on public.knowledge_documents
for each row execute function public._knowledge_guard_extracted_document();

create or replace function public._knowledge_guard_ai_handoff_source()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_manifest jsonb;
begin
  select extraction_manifest into v_manifest
  from public.knowledge_documents
  where id = new.document_id;

  if not public._knowledge_extraction_manifest_usable(v_manifest) then
    raise exception 'knowledge source is not usable for AI analysis'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public._knowledge_guard_ai_handoff_source() from public, anon, authenticated;

drop trigger if exists trg_knowledge_guard_ai_handoff_source on public.knowledge_ai_handoffs;
create trigger trg_knowledge_guard_ai_handoff_source
before insert or update of document_id
on public.knowledge_ai_handoffs
for each row execute function public._knowledge_guard_ai_handoff_source();

-- Quarantine historical rows that were incorrectly advanced with zero usable text.
update public.knowledge_ai_handoffs h
set status = 'REVOKED', updated_at = now()
from public.knowledge_documents d
where h.document_id = d.id
  and h.status in ('PENDING','CLAIMED')
  and not public._knowledge_extraction_manifest_usable(d.extraction_manifest);

update public.knowledge_ingestion_jobs j
set status = 'FAILED',
    error_message = 'OCR/extraction produced no usable source text; retry document reading.',
    finished_at = now(),
    updated_at = now()
from public.knowledge_documents d
where j.document_id = d.id
  and j.status in ('QUEUED','RUNNING')
  and not public._knowledge_extraction_manifest_usable(d.extraction_manifest);

update public.knowledge_documents d
set pipeline_status = 'FAILED',
    processing_error = 'OCR/extraction produced no usable source text; retry document reading.',
    updated_at = now()
where d.pipeline_status in ('EXTRACTED','ANALYZING')
  and not public._knowledge_extraction_manifest_usable(d.extraction_manifest);
