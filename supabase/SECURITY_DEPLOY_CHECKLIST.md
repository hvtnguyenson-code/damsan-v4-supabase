# Dam San V4 - Checklist bao mat truoc khi deploy

Tai lieu nay dung de trien khai phan Supabase thu cong. Khong chay production khi chua doc ket qua audit.

## Buoc 1 - Chay audit

Mo Supabase SQL Editor va chay:

```sql
-- copy noi dung file supabase/audit/00_security_audit.sql
```

Dan toan bo ket qua ve cho Codex de doi chieu truoc khi chay migration.

## Buoc 2 - Nguyen tac can dat

- Khong tin `x-admin-secret` tu frontend. Secret da bi bo khoi `giaovien.js`.
- Bang `de_thi`, `ngan_hang`, `ket_qua`, `hoc_sinh`, `giao_vien`, `phong_thi` phai bat RLS.
- Hoc sinh khong duoc doc truc tiep `de_thi` hoac dap an truoc khi cong bo.
- Giao vien khong duoc sua/xoa du lieu ngoai truong/mon duoc phan cong.
- Cac thao tac nhay cam phai qua RPC `SECURITY DEFINER` co kiem tra mat khau/hash va quyen.
- RPC nop bai phai idempotent: khong cho nop de, phong, hoc sinh, trang thai, thoi gian sai; khong ghi de diem da nop.
- Realtime chi nen bat cho bang/cot can thiet va filter o client theo phong dang xem.

## Buoc 3 - Sau khi audit

Chi chay migration hardening sau khi da kiem tra:

- Ten cot khoa ngoai dung voi migration.
- Cac RPC hien co khong bi mat logic cham diem.
- RLS policy khong khoa nham luong dang nhap hien tai.
- Da backup database hoac tao ban sao staging.

## Luu y quan trong

Frontend hien van dung custom auth bang bang `hoc_sinh`/`giao_vien`, khong phai Supabase Auth. Vi vay RLS khong tu biet ai dang dang nhap neu request di bang anon key. Bao mat production nen dua cac thao tac doc/ghi nhay cam vao RPC server-side, hoac chuyen sang Supabase Auth/custom JWT.
