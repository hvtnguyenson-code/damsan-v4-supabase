# OMR V7 — độc lập từ bản sao V6 (13/11/2026)

- Nhánh: research/omr-v7-from-v6-baseline-20261113, tách từ main 9f261b71249b0a79f3083f568156ada049601334; CHƯA MERGE, không phát hành.
- omr/omr-reliability-v7-baseline.js là bản sao NGUYÊN VĂN omr-reliability-v6.js, chỉ đổi tên browser-global export. Không sửa một ngưỡng hoặc hàm phân loại nào.
- omr/omr-v7-candidate.js chỉ bọc bộ sao V6, để nguyên tất cả P1/P2/P3, cảnh báo, hiệu chuẩn, kiểm tra mốc, hai ô tô và vết tẩy. Không sử dụng bộ phân loại V7 viết lại trước đây.
- Chẩn đoán V7 thêm: đo độ nét tương đối/độ sáng và thống kê cảnh báo theo từng phần; CHỈ GHI NHẬN, không làm thay đổi đáp án, điều kiện chặn hay cách lưu điểm. Trường enhancements.answerChanges = 0.
- V6 production vẫn nguyên trạng. V7 độc lập, không require bộ V6 production ở runtime. PWA branch load V7-copy trước V7-wrapper; giữ một giao diện PWA và RPC hiện hữu; không có schema/DB/deploy mới.
- omr-v7-research.js cũ còn trong repo phục vụ truy vết, nhưng KHÔNG ĐƯỢC SỬ DỤNG để tạo kết quả V7 mới.
- Test 024 và 031 kiểm chứng toàn bộ đáp án 18–4–6, cảnh báo, hiệu chuẩn, hình học và dấu tô hai ô trùng V6 trên các phiếu tổng hợp (ánh sáng lệch, đèn, tẩy xóa, dấu số). Test 031 còn xác minh bản sao V6 chính xác 100% theo ký tự mã nguồn, chỉ khác export.
- Không đánh đồng parity với cải tiến độ chính xác. Các mô-đun nâng cấp tiếp theo phải được so trên ảnh gốc có ground truth, chỉ được thay câu/ý nếu chứng minh cải thiện; nếu không chắc phải trả lại kết quả V6 copy.
- Chưa bump phiên bản SW/bridge của PWA vì đây là NHÁNH NGHIÊN CỨU, chưa phát hành. Trước ngày triển khai (nếu được phê duyệt) phải xử lý cache phiên bản mới và kiểm thử trên điện thoại.
