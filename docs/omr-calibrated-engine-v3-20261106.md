# Đam San V4 — OMR calibrated ink engine V3

## Mục tiêu và phạm vi
Đợt nghiệm thu ngày 06/11/2026 ghi nhận bài Yến An quét 10 lần: 1 lần 10 điểm, 9 lần 9 điểm vì Phần III câu 5 có đáp án `300` bị hiểu thành `3000`. Không ghi các lần thử nghiệm này vào DB. Đây là lỗi nhận dạng, không phải lỗi chấm điểm.

Thay đổi ở nhánh `fix/omr-calibrated-evidence-v3-20261106` chỉ thuộc engine OMR, bài kiểm thử, cache phát hành của giao diện giáo viên và workflow CI. Không sửa DB, RPC, dữ liệu phòng, mã đề, phiếu 18–4–6 hoặc runtime học sinh.

## Kiến trúc sau nâng cấp
1. Dò bốn mốc ngoài để khóa hình học và quyết định tự chụp sau hai frame ổn định, chu kỳ 240 ms; giữ sự đơn giản và phản hồi nhanh.
2. Nắn phối cảnh chính xác từ bốn góc; tối ưu phép chiếu theo từng dòng không cấp phát mảng trung gian cho từng pixel. Vẫn dùng phép lấy mẫu bilinear, độ phân giải 1800 pixel theo chiều dài.
3. Đo dấu tô bằng phép đo pixel cũ tương thích Phần I, II và SBD; bổ sung hai tín hiệu độc lập của tâm ô: **tỷ lệ pixel mực** và **độ tương phản với nền giấy**. Không thay đổi ngữ pháp các phần bắt buộc phải chọn một đáp án.
4. Ở Phần III, đo toàn bộ 24 cột của 6 câu **một lần**, học phân bố độ đậm nền và dấu tô từ chính phiếu. Từ đó lập các ngưỡng tham chiếu cho từng ảnh, không đoán từ đáp án đúng hay câu hỏi.
5. Ba trạng thái đối với mỗi cột số: **đã tô đủ bằng chứng**, **để trống rõ ràng**, **chưa đủ bằng chứng**. Trường hợp thứ ba **không tự chèn số** và tạo cảnh báo chính xác `P3.<câu>.<cột>`, yêu cầu giáo viên kiểm tra trước khi lưu.
6. Việc ghép số giữ nguyên dấu âm, dấu phẩy và chữ số như mẫu. Không có luật đặc biệt cho chuỗi `300`, cũng không loại bỏ số 0 ở cuối.

## Vì sao thiết kế này khác các bản vá trước
Phiên bản trước sử dụng mức đậm tương đối và độ chênh lệch ô cao nhất. Trường hợp ô trống có nhiễu đậm cục bộ có thể bị xem như chữ số chắc chắn. Engine mới yêu cầu **đồng thời** bằng chứng về độ đậm, mức tương phản ở giữa ô, và hiệu chuẩn toàn bộ phần trả lời số. Khi không chắc, engine chọn *abstain/review* thay vì đoán.

Không tích hợp thư viện OMR bên ngoài, OpenCV.js, mô hình nặng hay hệ thống nhận dạng học sâu. Không thực hiện phép hiệu chỉnh homography theo các mốc nhỏ vì cách đó từng làm lệch ROI; chỉ cân nhắc thêm sau khi có ảnh camera chứng minh vấn đề hình học.

## Kiểm thử
- `node tests/omr_core_001_simulation.js`: hình học, nhận diện 18–4–6, bài đủ số, câu 5 `300`, `3000`, nhiễu, phân loại cảnh báo.
- `node tests/omr_evidence_009_simulation.js`: 6 câu Phần III, nền sáng không đồng đều, vòng tròn in, nhiễu xác định, số 0/9 thực, chấm mờ và vệt mực ở cột thứ tư.
- Các kiểm thử cũ OMR 002–005 và Teacher PWA 006–008 tiếp tục chạy qua workflow OMR chuyên biệt.
- Đo thử độc lập trên máy chạy JavaScript: phép warp từ 1590 ms xuống 894 ms với 2.230.200 pixel đầu ra giống nhau tuyệt đối. Chỉ là benchmark mô phỏng, không đại diện cho điện thoại.

## Điều kiện nghiệm thu thực địa
CI xanh xác nhận tính nhất quán mã và mô phỏng, **không** chứng minh đọc đúng mọi ảnh điện thoại. Sau phát hành, thử lại chính phiếu Yến An tối thiểu 10 lần liên tiếp, gồm thay đổi góc/ánh sáng, đối chiếu tất cả vị trí và cảnh báo; thử thêm phiếu thật với `3000`, `3009`, nét chì nhạt, ô bỏ trắng và vùng nhoè. Mục tiêu là không còn chấm sai **mà không cảnh báo**; số lần phải xử lý thủ công cũng cần được ghi nhận để đánh giá tiện lợi.

Trong thử nghiệm không bấm **Xác nhận & Lưu**, nên không có bản ghi OMR được gửi tới DB.

## Rollback
Revert PR engine V3 trên `main` nếu thử thực tế không đạt. Phiên bản PWA 016 đổi khóa cache để tải đúng bundle mới; bản rollback phải đi kèm khóa cache mới, tránh tái sử dụng cache lỗi. Không có migration database cần hoàn tác.
