-- Test migration: kiểm tra Supabase GitHub Integration hoạt động.
-- File này chỉ thêm comment vào function, không thay đổi logic.
COMMENT ON FUNCTION public.rpc_xoa_phong_thi(text, uuid, uuid)
  IS 'Xóa phòng thi hoàn toàn (ket_qua + de_thi + phong_thi). Applied via GitHub Integration.';
