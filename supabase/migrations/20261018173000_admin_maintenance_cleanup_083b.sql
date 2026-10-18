-- 083B: explicit admin maintenance cleanup with preview + strict allowlist
create or replace function public.rpc_admin_maintenance_083b(
  p_admin_token text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid;
  v_student integer := 0;
  v_staff integer := 0;
  v_admin integer := 0;
  v_ai integer := 0;
begin
  v_admin_id := public._admin_session_admin_id(p_admin_token);
  if v_admin_id is null then
    return jsonb_build_object(
      'status','error',
      'code','admin_session_invalid',
      'message','Phiên quản trị không hợp lệ hoặc đã hết hạn.'
    );
  end if;

  if p_action = 'preview' then
    select count(*) into v_student
    from public.student_sessions
    where
      (revoked_at is not null and revoked_at <= now() - interval '7 days')
      or expires_at <= now() - interval '7 days';

    select count(*) into v_staff
    from public.staff_sessions
    where
      (revoked_at is not null and revoked_at <= now() - interval '7 days')
      or expires_at <= now() - interval '7 days';

    select count(*) into v_admin
    from public.admin_sessions
    where
      (revoked_at is not null and revoked_at <= now() - interval '7 days')
      or expires_at <= now() - interval '7 days';

    select count(*) into v_ai
    from public.ai_exam_requests r
    where r.status in ('AI_WORKING','READY_FOR_REVIEW','REJECTED')
      and r.published_at is null
      and coalesce(r.publish_result,'{}'::jsonb)='{}'::jsonb
      and r.updated_at <= now() - interval '24 hours'
      and not exists (
        select 1
        from public.phong_thi p
        where upper(btrim(p.ma_phong)) = upper(btrim(r.ma_phong))
      );

    return jsonb_build_object(
      'status','success',
      'action','preview',
      'grace',jsonb_build_object('sessions_days',7,'ai_hours',24),
      'eligible',jsonb_build_object(
        'student_sessions',v_student,
        'staff_sessions',v_staff,
        'admin_sessions',v_admin,
        'ai_requests',v_ai
      )
    );
  elsif p_action = 'cleanup' then
    delete from public.student_sessions
    where
      (revoked_at is not null and revoked_at <= now() - interval '7 days')
      or expires_at <= now() - interval '7 days';
    get diagnostics v_student = row_count;

    delete from public.staff_sessions
    where
      (revoked_at is not null and revoked_at <= now() - interval '7 days')
      or expires_at <= now() - interval '7 days';
    get diagnostics v_staff = row_count;

    delete from public.admin_sessions
    where
      (revoked_at is not null and revoked_at <= now() - interval '7 days')
      or expires_at <= now() - interval '7 days';
    get diagnostics v_admin = row_count;

    delete from public.ai_exam_requests r
    where r.status in ('AI_WORKING','READY_FOR_REVIEW','REJECTED')
      and r.published_at is null
      and coalesce(r.publish_result,'{}'::jsonb)='{}'::jsonb
      and r.updated_at <= now() - interval '24 hours'
      and not exists (
        select 1
        from public.phong_thi p
        where upper(btrim(p.ma_phong)) = upper(btrim(r.ma_phong))
      );
    get diagnostics v_ai = row_count;

    return jsonb_build_object(
      'status','success',
      'action','cleanup',
      'deleted',jsonb_build_object(
        'student_sessions',v_student,
        'staff_sessions',v_staff,
        'admin_sessions',v_admin,
        'ai_requests',v_ai
      )
    );
  end if;

  return jsonb_build_object(
    'status','error',
    'code','unsupported_action',
    'message','Thao tác bảo trì không được hỗ trợ.'
  );
end;
$function$;

revoke all on function public.rpc_admin_maintenance_083b(text,text) from public;
grant execute on function public.rpc_admin_maintenance_083b(text,text) to anon, authenticated;
