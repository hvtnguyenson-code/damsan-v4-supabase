begin;

-- 056 — JSON-safe Part III table marker.
-- 055 required semantic HTML tables inside a JSON string but its prompt showed a double-quoted
-- HTML attribute. Models can copy that literally and produce invalid JSON. 056 uses single quotes
-- in authored HTML and normalizes that marker only for validation. Persisted question HTML can keep
-- the single-quoted attribute; browsers/DOMPurify render it normally.

create or replace function public._ai_exam_geography_standard_037()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_set(
    jsonb_set(
      public._ai_exam_geography_standard_037_055_snapshot(),
      '{version}',
      '"056"'::jsonb,
      true
    ),
    '{part3,json_safe_html_attribute_quotes}',
    '"single"'::jsonb,
    true
  );
$$;

-- Snapshot the current 055 standard before replacing it above. If a database does not yet expose
-- the snapshot helper, define it from the authoritative profile instead of duplicating all rules.
-- The helper is created first through dynamic DDL below to keep this migration forward-only.

rollback;
