-- =========================================================================
-- STUDENT RPC CLIENT CUTOVER & LEGACY BROWSER ACCESS CLEANUP (PHASE B)
-- P0-008B Migration
-- =========================================================================

-- Revoke browser execution permissions from legacy caller-controlled student RPCs.
-- Functions are preserved for backend/internal compatibility, but direct
-- anonymous and authenticated browser execution is revoked.

revoke execute on function public.rpc_receive_submission(uuid, uuid, uuid, uuid, text, jsonb, timestamptz, bigint) from public, anon, authenticated;
revoke execute on function public.rpc_submission_receipt_status(uuid, uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.rpc_cap_nhat_vi_pham(uuid, uuid, integer) from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rpc_lay_thong_tin_phong_hs'
  ) then
    execute 'revoke execute on function public.rpc_lay_thong_tin_phong_hs(uuid, uuid, text) from public, anon, authenticated';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rpc_lay_danh_sach_phong_thi_hs'
  ) then
    execute 'revoke execute on function public.rpc_lay_danh_sach_phong_thi_hs(uuid, uuid) from public, anon, authenticated';
  end if;
end;
$$;
