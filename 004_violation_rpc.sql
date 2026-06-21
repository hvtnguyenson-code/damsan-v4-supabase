-- RPC cập nhật số lần vi phạm cho học sinh sau khi nộp bài.
-- Cần SECURITY DEFINER vì ket_qua có RLS block trực tiếp UPDATE từ anon role.

CREATE OR REPLACE FUNCTION public.rpc_cap_nhat_vi_pham(
  p_phong_id uuid,
  p_hs_id    uuid,
  p_so_lan   int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.ket_qua
  SET so_lan_vi_pham = p_so_lan
  WHERE phong_id = p_phong_id
    AND hs_id    = p_hs_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_cap_nhat_vi_pham(uuid, uuid, int) TO anon, authenticated;
