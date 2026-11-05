begin;

-- 099 — Authority web-source capture support.
-- Narrow schema extension for server-seeded official authority pages.
-- Teacher upload UI/API remains PDF/DOC/DOCX only.

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_mime_type_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_mime_type_check
  check (mime_type = any (array[
    'application/pdf'::text,
    'application/msword'::text,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text,
    'text/html'::text
  ]));

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_source_format_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_source_format_check
  check (source_format = any (array['PDF'::text,'DOC'::text,'DOCX'::text,'HTML'::text]));

commit;
