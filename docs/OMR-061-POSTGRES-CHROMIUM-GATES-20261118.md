# OMR-061 — Cổng nghiệm thu mở rộng: PostgreSQL 17 và Chromium

Ngày: 18/11/2026. Nhánh: experiment/omr-v7-full-optimization-060. PR #205.

## Mục tiêu
Kiểm chứng thêm hai thành phần còn thiếu, không chạm môi trường Supabase thật và không thay V7 đang vận hành.

### 1. Giao diện lab qua Chromium
- Bài tests/run_omr_061_browser_lab.mjs mở omr/omr-060-integration-lab.html qua localhost và Chrome DevTools Protocol trong CI hiện có.
- Tự tạo ảnh PNG 18–4–6 với đầy đủ mốc và SBD/mã đề; nạp ảnh như File người dùng chọn, chạy JavaScript thật và đọc DOM.
- So sánh V7 với 060; xác nhận readOnly=true và validForSave=false.
- Kiểm tra SBD/mã đề sai, hai dấu tô cột SBD, không xuất hiện writer, không request mạng ngoài localhost.
- Kiểm tra viewport điện thoại 390px để loại trừ tràn ngang.
- Không phải nghiệm thu camera thật trên Android/iPhone.

### 2. PostgreSQL 17 thực, dữ liệu tổng hợp
- Job postgres_contract trong GitHub Actions tạo container PostgreSQL 17-alpine tạm thời; tự hủy sau job.
- Bài tests/sql/omr_061_postgres_contract.sql dựng schema tối thiểu, nạp đúng migration 20261105143000_omr_staff_submission_004.sql từ repository, rồi gọi rpc_staff_submit_omr thật trên PostgreSQL.
- Trường hợp kiểm tra: token sai, khác bộ môn, khác trường, mã đề không tồn tại, số câu sai, metadata lỗi, lưu hợp lệ với mã đề có số 0 đầu, receipt + điểm và ngăn ghi trùng.
- rpc_grade_submission và _staff_session_gv_id trong DB tạm là stub, không phải hàm xác thực/chấm điểm production. Chỉ chứng minh hợp đồng ghi điểm của RPC OMR trên schema thử nghiệm, liên kết receipt, và kiểm tra ràng buộc.
- DDL và dữ liệu giả lập nằm trong BEGIN ... ROLLBACK.

## Giới hạn
- CI xanh trên PostgreSQL 17 chỉ chứng minh thực thi được SQL writer OMR với schema/fixture xác định; KHÔNG chứng minh full migration stack, Supabase Auth/RLS, scoring production hoặc Edge Function Storage.
- Bài thử Storage 061 trước đó ghi bytes/checksum cục bộ với RPC giả; KHÔNG phải Supabase Storage thật.
- CI Chromium là trình duyệt thật trong GitHub runner, KHÔNG thay cho camera trên điện thoại thật.
- Không tạo Supabase development branch khi chưa có phê duyệt chi phí. Không chạy bất kỳ lệnh ghi nào trên project xcervjnwlchwfqvbeahy.

## Cổng nghiệm thu cuối
1. Đối chiếu job Chromium và PostgreSQL; chỉ sửa job lỗi và tránh rerun không cần thiết.
2. Trong môi trường Supabase độc lập đã được duyệt, thử một giao dịch end-to-end: đăng nhập GV -> rpc_staff_submit_omr -> canonical grader -> exam_submissions/ket_qua -> Edge omr-evidence -> Storage -> omr_artifacts.
3. Kiểm thử ảnh thật trên điện thoại và các ca tranh chấp.
4. Review độc lập và phê duyệt merge/phát hành.

**PR #205 = Draft / Merge Hold. V7 chính thức giữ nguyên.**
