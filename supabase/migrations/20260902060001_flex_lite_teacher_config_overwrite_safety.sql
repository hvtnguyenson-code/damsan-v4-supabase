-- =========================================================================
-- Migration: 20260902060001_flex_lite_teacher_config_overwrite_safety.sql
-- Description: Teacher config persistence, payload validation, and authoritative
--   room overwrite/deletion safety guards for FLEX-LITE.
-- =========================================================================

-- 1. SECURE & SAFE EXAM SAVE RPC WITH ATOMIC VALIDATION & OVERWRITE GUARD
create or replace function public.rpc_luu_de_thi_len_phong(
  p_staff_token text,
  p_ma_gv text,
  p_truong_id uuid,
  p_mon_id uuid,
  p_ma_phong text,
  p_de_thi jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_teacher_ma_gv text;
  v_teacher_truong_id uuid;
  v_teacher_mon_id uuid;
  v_quyen text;
  v_effective_truong_id uuid;
  v_effective_mon_id uuid;
  v_phong_id uuid;
  v_room public.phong_thi%rowtype;
  v_exam jsonb;
  v_count integer := 0;

  -- Metadata inspection
  v_first_variant jsonb;
  v_has_meta boolean := false;
  v_meta_assessment_type text;
  v_meta_scoring_config jsonb;
  v_effective_assessment_type text;
  v_effective_scoring_config jsonb;

  -- Duplicate check & variant consistency
  v_seen_ma_de text[] := array[]::text[];
  v_current_ma_de text;
  v_cau_so jsonb;
  v_question jsonb;
  v_part text;
  v_p1_count integer;
  v_p2_count integer;
  v_p3_count integer;
  v_total_count integer;

  v_expected_p1_count integer := null;
  v_expected_p2_count integer := null;
  v_expected_p3_count integer := null;
  v_expected_total_count integer := null;

  -- Custom weights validation
  v_p1_weight numeric;
  v_p2_weight numeric;
  v_p3_weight numeric;
begin
  -- 1. Staff Token Validation
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status', 'error', 'code', 'staff_session_invalid', 'message', 'Phiên làm việc không hợp lệ hoặc đã hết hạn.');
  end if;

  if nullif(trim(p_ma_phong), '') is null then
    return jsonb_build_object('status', 'error', 'message', 'Mã phòng không được để trống.');
  end if;

  if jsonb_typeof(p_de_thi) <> 'array' then
    return jsonb_build_object('status', 'error', 'message', 'Đề thi phải là một mảng JSON.');
  end if;

  if jsonb_array_length(p_de_thi) = 0 then
    return jsonb_build_object('status', 'error', 'message', 'Đề thi không được để trống.');
  end if;

  -- 2. Staff Authentication & Scope Binding
  select ma_gv, truong_id, mon_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen
  from public.giao_vien where id = v_gv_id limit 1;

  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv) then
    return jsonb_build_object('status', 'error', 'message', 'Không xác thực được giáo viên hoặc môn học.');
  end if;

  if v_quyen = 'Admin' then
    if p_truong_id is null or p_mon_id is null then
      return jsonb_build_object('status', 'error', 'message', 'Admin phải chọn trường và môn học đích.');
    end if;
    v_effective_truong_id := p_truong_id;
    v_effective_mon_id := p_mon_id;
  else
    if p_truong_id is distinct from v_teacher_truong_id or v_teacher_mon_id is null
       or (p_mon_id is not null and p_mon_id <> v_teacher_mon_id) then
      return jsonb_build_object('status', 'error', 'message', 'Không xác thực được giáo viên hoặc môn học.');
    end if;
    v_effective_truong_id := v_teacher_truong_id;
    v_effective_mon_id := v_teacher_mon_id;
  end if;

  -- 3. Room Lookup & Overwrite Guard
  select * into v_room from public.phong_thi
  where ma_phong = trim(p_ma_phong) and truong_id = v_effective_truong_id
  for update;

  if found then
    if v_room.mon_id is distinct from v_effective_mon_id then
      return jsonb_build_object('status', 'error', 'message', 'Mã phòng đã thuộc một môn học khác hoặc chưa được gán môn hợp lệ.');
    end if;

    -- Authoritative Lifecycle & History Overwrite Guard
    if v_room.trang_thai <> 'CHO_THI'
       or v_room.thoi_gian_mo is not null
       or exists (select 1 from public.exam_submissions where phong_id = v_room.id)
       or exists (select 1 from public.ket_qua where phong_id = v_room.id) then
      return jsonb_build_object(
        'status', 'error',
        'code', 'exam_replace_blocked',
        'message', 'Không thể thay đề vì phòng đã mở hoặc đã có lượt thi/kết quả. Hãy Reset/Xóa điểm phòng để đưa phòng về CHO_THI và kết thúc lượt thi hiện tại trước khi thay đề.'
      );
    end if;
  end if;

  -- 4. Metadata Mode Resolution
  v_first_variant := p_de_thi -> 0;
  if v_first_variant ? 'assessment_type' or v_first_variant ? 'scoring_config' then
    v_has_meta := true;
    v_meta_assessment_type := trim(coalesce(v_first_variant->>'assessment_type', ''));
    v_meta_scoring_config := v_first_variant->'scoring_config';
  else
    v_has_meta := false;
  end if;

  -- Check metadata consistency across ALL variants
  for v_exam in select value from jsonb_array_elements(p_de_thi) loop
    if jsonb_typeof(v_exam) <> 'object' then
      return jsonb_build_object('status', 'error', 'message', 'Mỗi mã đề phải là một JSON object.');
    end if;

    v_current_ma_de := trim(coalesce(v_exam->>'ma_de', ''));
    if v_current_ma_de = '' then
      return jsonb_build_object('status', 'error', 'message', 'Mã đề không được để trống.');
    end if;

    if v_current_ma_de = any(v_seen_ma_de) then
      return jsonb_build_object('status', 'error', 'message', 'Phát hiện trùng lặp mã đề trong cùng danh sách: ' || v_current_ma_de);
    end if;
    v_seen_ma_de := array_append(v_seen_ma_de, v_current_ma_de);

    if v_has_meta then
      if not (v_exam ? 'assessment_type') or not (v_exam ? 'scoring_config') then
        return jsonb_build_object('status', 'error', 'message', 'Tất cả các mã đề phải cùng có hoặc không có thông tin cấu hình thang điểm.');
      end if;
      if trim(coalesce(v_exam->>'assessment_type', '')) <> v_meta_assessment_type
         or (v_exam->'scoring_config') is distinct from v_meta_scoring_config then
        return jsonb_build_object('status', 'error', 'message', 'Cấu hình thang điểm không đồng nhất giữa các mã đề.');
      end if;
    else
      if (v_exam ? 'assessment_type') or (v_exam ? 'scoring_config') then
        return jsonb_build_object('status', 'error', 'message', 'Tất cả các mã đề phải cùng có hoặc không có thông tin cấu hình thang điểm.');
      end if;
    end if;
  end loop;

  -- Resolve Effective Profile
  if v_has_meta then
    if v_meta_assessment_type is null or v_meta_assessment_type = '' then
      return jsonb_build_object('status', 'error', 'message', 'assessment_type không được để trống khi có cấu hình thang điểm.');
    end if;

    if v_meta_scoring_config is null or jsonb_typeof(v_meta_scoring_config) <> 'object' then
      return jsonb_build_object('status', 'error', 'message', 'scoring_config phải là một JSON object hợp lệ.');
    end if;

    v_effective_assessment_type := v_meta_assessment_type;
    v_effective_scoring_config := v_meta_scoring_config;

    if v_effective_assessment_type not in ('LEGACY', 'TOT_NGHIEP', 'MCQ_ONLY', 'TRUE_FALSE_ONLY', 'SHORT_ONLY', 'CUSTOM') then
      return jsonb_build_object('status', 'error', 'message', 'Loại bài kiểm tra không hợp lệ: ' || coalesce(v_effective_assessment_type, 'NULL'));
    end if;

    if v_effective_assessment_type <> 'CUSTOM' and v_effective_scoring_config <> '{}'::jsonb then
      return jsonb_build_object('status', 'error', 'message', 'scoring_config phải là {} đối với loại bài kiểm tra ' || v_effective_assessment_type);
    end if;
  else
    if v_room.id is not null then
      v_effective_assessment_type := coalesce(v_room.assessment_type, 'LEGACY');
      v_effective_scoring_config := coalesce(v_room.scoring_config, '{}'::jsonb);
    else
      v_effective_assessment_type := 'LEGACY';
      v_effective_scoring_config := '{}'::jsonb;
    end if;
  end if;

  -- 5. Profile & Question Structure Validation Across All Variants
  for v_exam in select value from jsonb_array_elements(p_de_thi) loop
    v_cau_so := v_exam->'cau_so';
    if v_cau_so is null or jsonb_typeof(v_cau_so) <> 'array' then
      return jsonb_build_object('status', 'error', 'message', 'Dữ liệu cau_so của mã đề ' || (v_exam->>'ma_de') || ' phải là một mảng JSON.');
    end if;

    v_total_count := jsonb_array_length(v_cau_so);
    v_p1_count := 0;
    v_p2_count := 0;
    v_p3_count := 0;

    for v_question in select value from jsonb_array_elements(v_cau_so) loop
      if v_effective_assessment_type <> 'LEGACY' then
        if jsonb_typeof(v_question) <> 'object' then
          return jsonb_build_object('status', 'error', 'message', 'Mỗi câu hỏi trong mã đề ' || (v_exam->>'ma_de') || ' phải là một JSON object.');
        end if;

        v_part := coalesce(v_question->>'phan', v_question->>'Phan', '1');
        if v_part not in ('1', '2', '3') then
          return jsonb_build_object('status', 'error', 'message', 'Phát hiện phần câu hỏi không hợp lệ: ' || coalesce(v_part, 'NULL') || ' trong mã đề ' || (v_exam->>'ma_de'));
        end if;
      else
        if jsonb_typeof(v_question) = 'object' then
          v_part := coalesce(v_question->>'phan', v_question->>'Phan', '1');
        else
          v_part := '1';
        end if;
      end if;

      if v_part = '1' then v_p1_count := v_p1_count + 1;
      elsif v_part = '2' then v_p2_count := v_p2_count + 1;
      elsif v_part = '3' then v_p3_count := v_p3_count + 1;
      end if;
    end loop;

    -- For non-LEGACY profiles, cau_so must have at least 1 question
    if v_effective_assessment_type <> 'LEGACY' and v_total_count < 1 then
      return jsonb_build_object('status', 'error', 'message', 'Đề thi cấu hình ' || v_effective_assessment_type || ' phải có ít nhất 1 câu hỏi.');
    end if;

    -- Ensure all variants have identical part counts ONLY for non-LEGACY
    if v_effective_assessment_type <> 'LEGACY' then
      if v_expected_total_count is null then
        v_expected_p1_count := v_p1_count;
        v_expected_p2_count := v_p2_count;
        v_expected_p3_count := v_p3_count;
        v_expected_total_count := v_total_count;
      else
        if v_p1_count <> v_expected_p1_count or v_p2_count <> v_expected_p2_count
           or v_p3_count <> v_expected_p3_count or v_total_count <> v_expected_total_count then
          return jsonb_build_object('status', 'error', 'message', 'Các mã đề không đồng nhất số lượng câu hỏi hoặc cấu trúc phần.');
        end if;
      end if;
    end if;
  end loop;

  -- Profile specific rules validation
  if v_effective_assessment_type = 'MCQ_ONLY' then
    if v_expected_p1_count <> v_expected_total_count or v_expected_p1_count < 1 then
      return jsonb_build_object('status', 'error', 'message', 'Cấu hình MCQ_ONLY yêu cầu tất cả câu hỏi phải thuộc Phần 1 (tối thiểu 1 câu).');
    end if;
  elsif v_effective_assessment_type = 'TRUE_FALSE_ONLY' then
    if v_expected_p2_count <> v_expected_total_count or v_expected_p2_count < 1 then
      return jsonb_build_object('status', 'error', 'message', 'Cấu hình TRUE_FALSE_ONLY yêu cầu tất cả câu hỏi phải thuộc Phần 2 (tối thiểu 1 câu).');
    end if;
  elsif v_effective_assessment_type = 'SHORT_ONLY' then
    if v_expected_p3_count <> v_expected_total_count or v_expected_p3_count < 1 then
      return jsonb_build_object('status', 'error', 'message', 'Cấu hình SHORT_ONLY yêu cầu tất cả câu hỏi phải thuộc Phần 3 (tối thiểu 1 câu).');
    end if;
  elsif v_effective_assessment_type = 'TOT_NGHIEP' then
    if (v_expected_p1_count + v_expected_p2_count + v_expected_p3_count) <> v_expected_total_count or v_expected_total_count < 1 then
      return jsonb_build_object('status', 'error', 'message', 'Cấu hình TOT_NGHIEP yêu cầu các câu hỏi chỉ thuộc Phần 1, Phần 2, Phần 3 (tối thiểu 1 câu).');
    end if;
  elsif v_effective_assessment_type = 'CUSTOM' then
    if (v_expected_p1_count + v_expected_p2_count + v_expected_p3_count) <> v_expected_total_count or v_expected_total_count < 1 then
      return jsonb_build_object('status', 'error', 'message', 'Cấu hình CUSTOM yêu cầu các câu hỏi chỉ thuộc Phần 1, Phần 2, Phần 3 (tối thiểu 1 câu).');
    end if;

    if jsonb_typeof(v_effective_scoring_config) <> 'object'
       or not (v_effective_scoring_config ? 'p1_weight')
       or not (v_effective_scoring_config ? 'p2_weight')
       or not (v_effective_scoring_config ? 'p3_weight') then
      return jsonb_build_object('status', 'error', 'message', 'CUSTOM scoring_config phải là một object có đủ p1_weight, p2_weight, p3_weight.');
    end if;

    begin
      v_p1_weight := (v_effective_scoring_config->>'p1_weight')::numeric;
      v_p2_weight := (v_effective_scoring_config->>'p2_weight')::numeric;
      v_p3_weight := (v_effective_scoring_config->>'p3_weight')::numeric;
    exception when others then
      return jsonb_build_object('status', 'error', 'message', 'CUSTOM weights phải là các giá trị số hợp lệ.');
    end;

    if v_p1_weight is null or v_p2_weight is null or v_p3_weight is null then
      return jsonb_build_object('status', 'error', 'message', 'CUSTOM weights không được chứa giá trị null.');
    end if;

    if v_p1_weight < 0 or v_p1_weight > 10
       or v_p2_weight < 0 or v_p2_weight > 10
       or v_p3_weight < 0 or v_p3_weight > 10 then
      return jsonb_build_object('status', 'error', 'message', 'Mỗi trọng số CUSTOM phải nằm trong khoảng từ 0 đến 10.');
    end if;

    if (v_p1_weight + v_p2_weight + v_p3_weight) <> 10 then
      return jsonb_build_object('status', 'error', 'message', 'Tổng các trọng số CUSTOM phải bằng đúng 10.');
    end if;

    if v_expected_p1_count = 0 and v_p1_weight <> 0 then
      return jsonb_build_object('status', 'error', 'message', 'Trọng số p1_weight phải bằng 0 khi đề không có câu hỏi Phần 1.');
    end if;
    if v_expected_p2_count = 0 and v_p2_weight <> 0 then
      return jsonb_build_object('status', 'error', 'message', 'Trọng số p2_weight phải bằng 0 khi đề không có câu hỏi Phần 2.');
    end if;
    if v_expected_p3_count = 0 and v_p3_weight <> 0 then
      return jsonb_build_object('status', 'error', 'message', 'Trọng số p3_weight phải bằng 0 khi đề không có câu hỏi Phần 3.');
    end if;
  end if;

  -- 6. Atomic Mutation
  if v_room.id is not null then
    v_phong_id := v_room.id;
    update public.phong_thi
    set assessment_type = v_effective_assessment_type,
        scoring_config = v_effective_scoring_config
    where id = v_phong_id;

    delete from public.de_thi where phong_id = v_phong_id;
  else
    insert into public.phong_thi(
      ma_phong, truong_id, mon_id, ten_dot, doi_tuong, thoi_gian, trang_thai, assessment_type, scoring_config
    )
    values (
      trim(p_ma_phong), v_effective_truong_id, v_effective_mon_id, 'Bai kiem tra', 'TatCa', 45, 'CHO_THI',
      v_effective_assessment_type, v_effective_scoring_config
    )
    returning id into v_phong_id;
  end if;

  for v_exam in select value from jsonb_array_elements(p_de_thi) loop
    insert into public.de_thi(phong_id, ma_de, cau_so)
    values (
      v_phong_id,
      trim(v_exam->>'ma_de'),
      v_exam->'cau_so'
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('status', 'success', 'phong_id', v_phong_id, 'count', v_count);
end;
$function$;

-- 2. SECURE & SAFE EXAM DELETION RPC WITH LIFECYCLE GUARD & LEGACY RESET
create or replace function public.rpc_xoa_de_trong_phong(
  p_staff_token text,
  p_ma_gv text,
  p_truong_id uuid,
  p_phong_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_gv_id uuid;
  v_teacher_ma_gv text;
  v_teacher_truong_id uuid;
  v_teacher_mon_id uuid;
  v_quyen text;
  v_room public.phong_thi%rowtype;
  v_count integer := 0;
begin
  v_gv_id := public._staff_session_gv_id(p_staff_token);
  if v_gv_id is null then
    return jsonb_build_object('status', 'error', 'code', 'staff_session_invalid', 'message', 'Phiên làm việc không hợp lệ hoặc đã hết hạn.');
  end if;

  select ma_gv, truong_id, mon_id, quyen into v_teacher_ma_gv, v_teacher_truong_id, v_teacher_mon_id, v_quyen
  from public.giao_vien where id = v_gv_id limit 1;

  if not found or v_teacher_ma_gv is distinct from trim(p_ma_gv)
     or (v_quyen <> 'Admin' and p_truong_id is distinct from v_teacher_truong_id) then
    return jsonb_build_object('status', 'error', 'message', 'Không xác thực được giáo viên hoặc phòng thi.');
  end if;

  select * into v_room from public.phong_thi
  where id = p_phong_id and (v_quyen = 'Admin' or truong_id = p_truong_id)
  for update;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Không tìm thấy thông tin phòng thi trên máy chủ.');
  end if;

  -- Lifecycle & History Guard: Only allow delete when room is in CHO_THI with no start time and no submissions/results
  if v_room.trang_thai <> 'CHO_THI'
     or v_room.thoi_gian_mo is not null
     or exists (select 1 from public.exam_submissions where phong_id = p_phong_id)
     or exists (select 1 from public.ket_qua where phong_id = p_phong_id) then
    return jsonb_build_object(
      'status', 'error',
      'code', 'exam_delete_blocked',
      'message', 'Không thể xóa đề vì phòng đã mở hoặc đã có lượt thi/kết quả. Hãy Reset phòng về trạng thái chờ trước khi xóa đề.'
    );
  end if;

  delete from public.de_thi where phong_id = p_phong_id;
  get diagnostics v_count = row_count;

  -- Reset room profile back to LEGACY and empty scoring_config
  update public.phong_thi
  set assessment_type = 'LEGACY',
      scoring_config = '{}'::jsonb
  where id = p_phong_id;

  return jsonb_build_object('status', 'success', 'count', v_count);
end;
$function$;

-- 3. PERMISSIONS
grant execute on function public.rpc_luu_de_thi_len_phong(text, text, uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.rpc_xoa_de_trong_phong(text, text, uuid, uuid) to anon, authenticated;
