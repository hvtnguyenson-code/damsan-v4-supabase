begin;

-- 099a — permit official HTML authority captures in the private source bucket.
-- The teacher upload Edge Function still rejects text/html, so this does not widen
-- the user-facing upload surface.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html'
]::text[]
where id='knowledge-source';

commit;
