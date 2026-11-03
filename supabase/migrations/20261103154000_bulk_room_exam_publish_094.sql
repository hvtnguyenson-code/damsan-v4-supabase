-- 094 — Publish one canonical exam payload to multiple rooms atomically.
-- Reuses rpc_luu_de_thi_len_phong() for every target room.
-- No schema change. Any target failure rolls back every room mutation in this call.

create or replace function public.rpc_luu_de_thi_vao_nhieu_phong(
  p_staff_token text,
  p_ma_gv text,
  p_truong_id uuid,
  p_mon_id uuid,
  p_ma_phong_list text[],
  p_de_thi jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_raw text;
  v_room_code text;
  v_room_codes text[] := array[]::text[];
  v_room_codes_norm text[] := array[]::text[];
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_error_detail text;
  v_error_message text;
begin
  if p_ma_phong_list is null or cardinality(p_ma_phong_list) = 0 then
    return jsonb_build_object('status','error','code','room_list_empty','message','Danh sách phòng không được để trống.');
  end if;

  if cardinality(p_ma_phong_list) > 30 then
    return jsonb_build_object('status','error','code','room_list_too_large','message','Mỗi lần chỉ cho phép tối đa 30 phòng.');
  end if;

  foreach v_raw in array p_ma_phong_list loop
    v_room_code := trim(coalesce(v_raw, ''));
    if v_room_code = '' then
      return jsonb_build_object('status','error','code','room_code_empty','message','Danh sách phòng có mã trống.');
    end if;
    if lower(v_room_code) = any(v_room_codes_norm) then
      return jsonb_build_object('status','error','code','room_code_duplicate','message','Phát hiện mã phòng trùng: ' || v_room_code);
    end if;
    v_room_codes := array_append(v_room_codes, v_room_code);
    v_room_codes_norm := array_append(v_room_codes_norm, lower(v_room_code));
  end loop;

  begin
    foreach v_room_code in array v_room_codes loop
      v_result := public.rpc_luu_de_thi_len_phong(
        p_staff_token,
        p_ma_gv,
        p_truong_id,
        p_mon_id,
        v_room_code,
        p_de_thi
      );

      if coalesce(v_result->>'status','') <> 'success' then
        raise exception using
          errcode = 'P0001',
          message = 'bulk_room_publish_failed',
          detail = jsonb_build_object(
            'room', v_room_code,
            'code', v_result->>'code',
            'message', coalesce(v_result->>'message','Không thể lưu đề vào phòng.')
          )::text;
      end if;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'ma_phong', v_room_code,
          'phong_id', v_result->'phong_id',
          'count', v_result->'count'
        )
      );
      v_count := v_count + 1;
    end loop;
  exception when others then
    get stacked diagnostics
      v_error_detail = PG_EXCEPTION_DETAIL,
      v_error_message = MESSAGE_TEXT;
    return jsonb_build_object(
      'status','error',
      'code','bulk_room_publish_failed',
      'message','Đẩy đồng loạt thất bại; toàn bộ thay đổi trong lần này đã được rollback.',
      'detail', coalesce(nullif(v_error_detail,''), v_error_message)
    );
  end;

  return jsonb_build_object(
    'status','success',
    'room_count',v_count,
    'rooms',v_results
  );
end;
$function$;

revoke all on function public.rpc_luu_de_thi_vao_nhieu_phong(text,text,uuid,uuid,text[],jsonb) from public;
grant execute on function public.rpc_luu_de_thi_vao_nhieu_phong(text,text,uuid,uuid,text[],jsonb) to anon, authenticated;
