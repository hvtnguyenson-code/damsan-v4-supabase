-- Dam San V4 security audit.
-- Chay trong Supabase SQL Editor, copy tat ca result tabs tra ve Codex.

-- 1. RLS status cua cac bang chinh.
select
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'truong_hoc',
    'mon_hoc',
    'hoc_sinh',
    'giao_vien',
    'phong_thi',
    'de_thi',
    'ngan_hang',
    'ket_qua'
  )
order by tablename;

-- 2. Policy hien co.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Grant truc tiep cho anon/authenticated.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 4. RPC/function lien quan thi va admin.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  case p.prosecdef when true then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode,
  l.lanname as language
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname in (
    'lay_de_thi_an_toan',
    'nop_bai_va_cham_diem',
    'rpc_admin_reset_pass',
    'rpc_admin_xoa_tk',
    'rpc_admin_xoa_kho'
  )
order by p.proname;

-- 5. Source cua RPC can review. Supabase co the an source neu quyen khong du.
select
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'lay_de_thi_an_toan',
    'nop_bai_va_cham_diem',
    'rpc_admin_reset_pass',
    'rpc_admin_xoa_tk',
    'rpc_admin_xoa_kho'
  )
order by p.proname;

-- 6. Constraint va index chinh de tranh nop trung/scan cham.
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
  and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public'
  and tc.table_name in ('hoc_sinh', 'giao_vien', 'phong_thi', 'de_thi', 'ket_qua', 'ngan_hang')
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('hoc_sinh', 'giao_vien', 'phong_thi', 'de_thi', 'ket_qua', 'ngan_hang')
order by tablename, indexname;

-- 7. Kiem tra tai khoan legacy/plain/default.
select
  'hoc_sinh' as table_name,
  count(*) as total,
  count(*) filter (where mat_khau = '123456') as plain_default,
  count(*) filter (where mat_khau = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92') as sha_default,
  count(*) filter (where mat_khau !~ '^[a-fA-F0-9]{64}$') as non_sha256
from public.hoc_sinh
union all
select
  'giao_vien' as table_name,
  count(*) as total,
  count(*) filter (where mat_khau = '123456') as plain_default,
  count(*) filter (where mat_khau = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92') as sha_default,
  count(*) filter (where mat_khau !~ '^[a-fA-F0-9]{64}$') as non_sha256
from public.giao_vien;

-- 8. Realtime publication hien tai.
select
  p.pubname,
  n.nspname as schema_name,
  c.relname as table_name
from pg_publication p
join pg_publication_rel pr on pr.prpubid = p.oid
join pg_class c on c.oid = pr.prrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by p.pubname, c.relname;
