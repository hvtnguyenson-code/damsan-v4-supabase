# V7 sparse P3 — đồng thuận ô trống trong câu ít dấu tô (15/11/2026)

## Nền đã có trên main
- PWA 035 (`d263ddd`) đã gỡ yêu cầu V6 cần ít nhất 8 dấu tô rõ toàn Phần III; kiểm thử 036 (0–6 câu) và 037 (ảnh phiếu mã 103, 2 câu được tô và 4 câu trống) đã tồn tại.
- Vì vậy, không viết lại bộ nhận dạng Phần III; chỉ khép một trường hợp còn sót sau bộ hiệu chuẩn sparse: 3 cột BLANK + 1 cột REVIEW do nhiễu viền in, toàn bộ câu trống.

## Cải tiến
- Tận dụng **nguyên hàm** `DamSanOmrV7Numeric.tryRecoverUniformBlank` hiện hữu sau khi sparse calibration thành công; không bổ sung ngưỡng tùy tiện hoặc một bộ phân loại độc lập.
- Sparse module chỉ đề nghị nếu 3 BLANK + 1 REVIEW; hàm đồng thuận kiểm chứng riêng 4 cột cùng có tín hiệu yếu tương đương và không có nét tô phân biệt. Kết quả được xác nhận lại bằng `decodeP3Positions` bản sao V6 trước khi chấp nhận.
- Nếu có một ký tự rõ, tô 2 ô, dấu tẩy nổi bật, nhiều vị trí REVIEW hoặc mốc nội bộ không đạt thì **không sửa**.
- V6 production và `omr-reliability-v7-baseline.js` sao chép nguyên V6, hai phần P1/P2, mẫu phiếu, DB, RPC, PWA và đường lưu điểm **giữ nguyên**.
- Chỉ chạy khi V7 được chọn ở chế độ **Đối chiếu V6/V7 — không lưu điểm**. Luồng V7 chấm/lưu không cấp `experimentalRefinement`.

## Kiểm thử và giới hạn
- Test 038: mô phỏng hai cột tô rõ trong một câu khác, bốn cột trống có một viền in hơi tối; V7 phiên bản cũ còn `?`, phiên bản mới xác nhận bỏ trống khi đủ chứng cứ.
- Bảo toàn V6 và thử chặn tô mờ, tẩy xóa, tô hai ô, ký tự hợp lệ và hình học không đạt.
- Các test 036–037 trên dữ liệu phiếu mã 103 tiếp tục bắt buộc xanh.
- Kiểm thử trên số liệu mô phỏng KHÔNG chứng minh tỷ lệ chính xác trên ảnh mới; cần thử trên ảnh camera gốc và xác minh thủ công trước khi phát hành rộng.
- PR chỉ là nhánh nghiên cứu, không merge/triển khai tự động từ nhánh.

## Phát hành cho thử nghiệm di động (15/11/2026)

- Sau khi PR được merge và hai CI xanh, cập nhật PWA sang `20261115-teacher-pwa-036`, tệp phục hồi mới `teacher/omr-v7-runtime-20261115-036.js` để tránh tải module cũ trong các service worker đã cài. Tệp `035` cũ vẫn tồn tại cho ứng dụng đã tải trước đó.
- Phiên bản mới chỉ bật cải tiến ở **Đối chiếu V6/V7 (chỉ xem, không lưu điểm)**. Chế độ chấm và lưu V6 tiếp tục mặc định; V7 dùng để lưu không chạy `experimentalRefinement`.
- Thử bằng camera hoặc chọn JPG/PNG **ảnh tờ phiếu**, không chọn ảnh chụp màn hình ứng dụng. Chụp kết quả đối chiếu + ảnh giấy riêng và đối chiếu từng ô; không xem ít cảnh báo hơn là bằng chứng chính xác hơn.
