begin;

-- 063 — repair same-request AI handoff reissue on Supabase.
-- The 053 SECURITY DEFINER function pins search_path=public for safety, but
-- pgcrypto lives in the extensions schema. Unqualified gen_random_bytes()/digest()
-- therefore fail at runtime when a browser tries to renew an expired capability.
-- Keep the restricted search_path and qualify pgcrypto explicitly.
create or replace function public.rpc_ai_exam_reissue_handoff(
  p_staff_token text,
  p_ma_gv text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gv_id uuid;
  v_db_ma_gv text;
  v_request record;
  v_token text;
  v_hash text;
  v_expires timestamptz;
  v_issued jsonb;
begin
  v_gv_id:=public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then return jsonb_build_object('status','error','code','staff_session_invalid'); end if;

  select ma_gv into v_db_ma_gv
  from public.giao_vien
  where id=v_gv_id;

  if v_db_ma_gv is distinct from btrim(p_ma_gv) then
    return jsonb_build_object('status','error','code','staff_identity_mismatch');
  end if;

  select id,requested_by,status into v_request
  from public.ai_exam_requests
  where id=p_request_id
  for update;

  if v_request.id is null then
    return jsonb_build_object('status','error','code','exam_request_not_found');
  end if;
  if v_request.requested_by is distinct from v_gv_id then
    return jsonb_build_object('status','error','code','exam_request_owner_mismatch');
  end if;
  if v_request.status not in ('AWAITING_AI','AI_WORKING') then
    return jsonb_build_object('status','error','code','exam_request_unavailable');
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  v_expires:=now()+interval '90 minutes';

  v_issued:=public.rpc_ai_exam_issue_handoff_service(
    p_request_id,
    v_gv_id,
    v_hash,
    v_expires
  );
  if coalesce(v_issued->>'status','')<>'success' then
    return v_issued;
  end if;

  return jsonb_build_object(
    'status','success',
    'request_id',p_request_id,
    'capability_token',v_token,
    'expires_at',v_expires
  );
end;
$$;

revoke all on function public.rpc_ai_exam_reissue_handoff(text,text,uuid) from public;
grant execute on function public.rpc_ai_exam_reissue_handoff(text,text,uuid) to anon, authenticated;

commit;
