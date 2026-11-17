# OMR 058 — Precision Capture (thử nghiệm, không thay đổi điểm)
Ngày: 17/11/2026. Nguồn: 25 ảnh gốc đã lưu trong phòng OMR_V7_TEST (mỗi học sinh 1 ảnh gốc), tải tạm về laptop NGUYENSON; không tải lên repository.
## Phạm vi
- Module mới `omr/omr-precision-capture-experiment.js` kiểm tra hình học bốn góc, 5 mốc kiểm tra bên trong, ánh sáng, độ nét và độ tương phản/chi tiết.
- Chỉ hoạt động khi mở giao diện với query `omrPrecision=1`; mặc định giữ nguyên quy trình cũ.
- Khi bật, yêu cầu 3 khung hình ổn định, thay vì 2; không đụng thuật toán tô, đáp án, điểm, RPC, DB, Storage hay bằng chứng.
- Các ngưỡng hiện tại là **ngưỡng thử nghiệm**, chưa được hiệu chuẩn bằng ảnh camera trực tiếp trên điện thoại.
## Kết quả đối chứng
Đã lấy 25 ảnh gốc từ Supabase private Storage thông qua URL ký ngắn hạn, giữ tại máy thử nghiệm; không sửa dữ liệu production.
Tất cả ảnh được đưa về chiều dài 720 px cho phép so sánh đúng với luồng tiền kiểm tự chụp.
| Nhóm | Số ảnh | Bộ hình học hiện tại chấp nhận | Precision Capture chấp nhận |
|---|---:|---:|---:|
| Ảnh gốc | 25 | 25 | 25 |
| Làm nhòe Gaussian radius=4 | 25 | 25 | 0 |
| Giảm độ sáng còn 24% | 25 | 25 | 0 |
| Cắt 8% mép trên và trái | 25 | 2 | 0 |
**Diễn giải:** 25 ảnh gốc không bị loại; 75 ảnh suy giảm có kiểm soát bị loại. Chưa thể suy ra tỷ lệ cải thiện nhận dạng/chấm đúng trên ảnh thực tế hoặc camera liên tục. Chưa kiểm thử khung hình động, độ trễ PWA trên iPhone/Android, độ nhạy với bóng đổ/giấy cong.
## An toàn
- Không xóa, ghi hay cập nhật bất kỳ bài nộp, điểm, ảnh hay bảng DB nào.
- Đã chạy unit test 058, regression 035 và 028; thử nghiệm ảnh thật 25 và 75 ảnh suy giảm.
- Không đưa ảnh học sinh, URL ký, token hoặc khóa vào git.
- Chưa bật cho giáo viên sử dụng chính thức. Chỉ mở opt-in để thử nghiệm thực địa; cần kiểm tra PWA cache/version trước khi phát hành.
## Cần tiếp tục
1. Nghiệm thu trên điện thoại thật: giữ camera 3–5 giây, đo tốc độ, tỷ lệ chụp thành công, tỷ lệ báo sai và rung/nhòe.
2. Tạo lớp overlay 4 mốc riêng biệt; xác minh ánh sáng vùng phiếu khi có bóng đổ.
3. So sánh nhận dạng/điểm của cùng 25 phiếu trước/sau, với nhãn đáp án do người kiểm tra xác minh. Dữ liệu chỉ gồm 25 ảnh đã chấm nên chưa chứng minh được tăng độ chính xác điểm.
