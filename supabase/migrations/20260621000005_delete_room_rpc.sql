-- RPC xóa phòng thi hoàn toàn (phong_thi + de_thi + ket_qua).
-- SECURITY DEFINER để bypass RLS — chỉ GV thuộc trường mới xóa được.

CREATE OR REPLACE FUNCTION public.rpc_xoa_phong_thi(
  p_ma_gv    text,
  p_truong_id uuid,
  p_phong_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_quyen text;
BEGIN
  -- Xác thực GV thuộc trường
  SELECT quyen INTO v_quyen
  FROM public.giao_vien
  WHERE ma_gv = p_ma_gv AND truong_id = p_truong_id
  LIMIT 1;

  IF v_quyen IS NULL THEN
    RETURN jsonb_build_object('status','error','message','Khong xac thuc duoc giao vien.');
  END IF;

  -- Xác nhận phòng thuộc trường
  IF NOT EXISTS (
    SELECT 1 FROM public.phong_thi
    WHERE id = p_phong_id AND truong_id = p_truong_id
  ) THEN
    RETURN jsonb_build_object('status','error','message','Phong thi khong thuoc truong hien tai.');
  END IF;

  -- Xóa theo thứ tự FK: ket_qua → de_thi → phong_thi
  DELETE FROM public.ket_qua  WHERE phong_id = p_phong_id;
  DELETE FROM public.de_thi   WHERE phong_id = p_phong_id;
  DELETE FROM public.phong_thi WHERE id = p_phong_id;

  RETURN jsonb_build_object('status','success');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_xoa_phong_thi(text, uuid, uuid) TO anon, authenticated;
