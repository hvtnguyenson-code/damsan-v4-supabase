-- 083A: read-only admin system status
create or replace function public.rpc_admin_system_status_083a(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid;
begin
  v_admin_id := public._admin_session_admin_id(p_admin_token);
  if v_admin_id is null then
    return jsonb_build_object(
      'status','error',
      'code','admin_session_invalid',
      'message','Phiên quản trị không hợp lệ hoặc đã hết hạn.'
    );
  end if;

  return jsonb_build_object(
    'status','success',
    'server_time', now(),
    'sessions', jsonb_build_object(
      'student_active', (select count(*) from public.student_sessions where revoked_at is null and expires_at > now()),
      'student_expired', (select count(*) from public.student_sessions where revoked_at is not null or expires_at <= now()),
      'staff_active', (select count(*) from public.staff_sessions where revoked_at is null and expires_at > now()),
      'staff_expired', (select count(*) from public.staff_sessions where revoked_at is not null or expires_at <= now()),
      'admin_active', (select count(*) from public.admin_sessions where revoked_at is null and expires_at > now()),
      'admin_expired', (select count(*) from public.admin_sessions where revoked_at is not null or expires_at <= now())
    ),
    'submissions', jsonb_build_object(
      'pending', (select count(*) from public.exam_submissions where status='RECEIVED' and graded_at is null),
      'grading_errors', (select count(*) from public.exam_submissions where grading_error is not null and btrim(grading_error) <> '')
    ),
    'rooms', jsonb_build_object(
      'open', (select count(*) from public.phong_thi where trang_thai='MO_PHONG'),
      'collecting', (select count(*) from public.phong_thi where trang_thai='THU_BAI'),
      'total', (select count(*) from public.phong_thi)
    ),
    'ai', jsonb_build_object(
      'unfinished_unlinked', (
        select count(*)
        from public.ai_exam_requests r
        where r.status in ('AI_WORKING','READY_FOR_REVIEW','REJECTED')
          and r.published_at is null
          and coalesce(r.publish_result,'{}'::jsonb)='{}'::jsonb
          and not exists (
            select 1 from public.phong_thi p
            where p.ma_phong = r.ma_phong
          )
      )
    )
  );
end;
$function$;

revoke all on function public.rpc_admin_system_status_083a(text) from public;
grant execute on function public.rpc_admin_system_status_083a(text) to anon, authenticated;
