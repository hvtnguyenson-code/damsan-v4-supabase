# OMR 060 — tối ưu hóa độc lập (chưa merge / chưa phát hành)
Ngày lập: 18/11/2026.
Base commit: `41798e98eed6635fb585319d4aa7df49faddd9b8`; nhánh: `experiment/omr-v7-full-optimization-060`.

## Ranh giới an toàn
- Cấm nhập các mô-đun `*-060.js` vào `omr/omr-teacher-module.js`, `teacher/index.html`, `giaovien.html` hoặc bất kỳ writer/Edge Function nào trước nghiệm thu và phê duyệt riêng.
- **Không chỉnh sửa V7**, CSDL, điểm hoặc minh chứng. Không merge; draft PR chỉ chạy CI.
- `omr-v7-pipeline-060.js` trả kết quả `readOnly:true`, `validForSave:false`. Không có lời gọi lưu kết quả.

## Các cải tiến đã mã hóa
1. `omr-v7-geometry-060.js`: xử lý mốc nhỏ trong preview 16:9, không cố định điều kiện chiếm 42% chiều ngang; yêu cầu ít nhất hai mốc bên trong khớp mẫu, giới hạn kích thước/độ đặc, yêu cầu tứ giác lồi, kiểm tra diện tích & hình học. Bỏ các tứ giác không đủ mốc khống chế.
2. `omr-v7-pipeline-060.js`: một lần chuyển ảnh sang thang xám, một lần nắn phối cảnh, rồi dùng chung phiếu đã chuẩn hóa để đọc SBD, mã đề và V7 đầy đủ cả ba phần. Không chạy đọc đáp án V5 rồi lặp lại V7. Bảo toàn cảnh báo SBD/mã đề; cảnh báo hai dấu tô danh tính; từ chối đánh giá là an toàn nếu danh tính không chắc chắn.
3. `omr-v7-ink-060.js`: đặc trưng hình thái nét chì (độ phủ tâm, mức đậm, độ kết dính thành phần); quan sát riêng P1, P2 và P3; lưu **chỉ cảnh báo/nghiên cứu**, không thay đổi kết quả, không tự cho điểm hay hạ ngưỡng vết tẩy.

## Bộ thử và tiêu chí
- `tests/omr_v7_optimization_060_simulation.js`: camera ngang 1080x608, cả 4 mốc ngoài + mốc trong, SBD 00120601, mã đề 0103, đủ 18 lựa chọn P1, 16 ý P2 và 6 đáp án P3. Đối chiếu nhận dạng chính xác bằng V7 hiện tại trên cùng ảnh đã nắn, kiểm tra một lần warp, tránh đọc V5 trùng, cột danh tính tô đôi phải bị chặn.
- `tests/omr_v7_ink_060_simulation.js`: tô thật, tẩy mờ, để trống, tô hai ô; không được thay dữ liệu V7.
- Không có xác nhận sai số thực địa/tỷ lệ sửa đúng trên 25 ảnh gốc trong CI: ảnh gốc đang nằm ở Storage riêng tư, không được commit lên GitHub. Các bài benchmark 25 ảnh trước đây tham chiếu thư mục cục bộ hiện không ở runner; chỉ coi là lịch sử tham khảo.
- Tối ưu này **chưa chứng minh giảm sai điểm khi có vết tẩy thực tế**. Chỉ được phép đề xuất bật phiên bản thử khi có đối chứng ảnh thật, kiểm tra bảo toàn SBD/mã đề, double-mark và P3 thưa, không tăng chấm sai âm thầm.
