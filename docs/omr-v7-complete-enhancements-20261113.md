# OMR V7: một đợt nâng cấp tổng hợp trên nền V6 (13/11/2026)

## Phạm vi
- Ảnh/camera: kiểm tra độ nét, vùng phản sáng, thiếu sáng; so sánh khung hình nhiều mẫu cùng kích thước; không phát động chụp khi chưa có cơ sở độ tin cậy.
- Giấy nhăn, biến dạng: hiệu chỉnh nhỏ theo từng vùng bằng các mốc in nội bộ, dùng median và loại bỏ marker ngoại lai; tuyệt đối không bỏ qua trạng thái geometry chưa đạt.
- Chiếu sáng/phản quang: đo nền độc lập 8 hướng, loại mẫu cực trị; chỉ dùng như nguồn chứng cứ thứ hai cho review do ánh sáng.
- Nét tô lệch: 3 khoảng dịch theo 4 hướng, cùng bộ measureBubble/classifyRow của bản sao V6.
- Tô nhiều ô, tẩy xóa: thêm phân tích rủi ro, không sửa hoặc hợp thức hóa hai ô tô; không tự bỏ cảnh báo dấu thứ hai.
- Phần III: thử lại ô số bất định với ba vị trí, kiểm tra nhãn ổn định, decode bằng ngữ pháp V6, không đoán 0, âm, phẩy hoặc bỏ trống.

## Cấu trúc
- V7 vẫn có một bản sao V6 nguyên vẹn, chỉ đổi tên export.
- Mặc định V7 vẫn trả kết quả V6; cải tiến chỉ kích hoạt khi gọi API nghiên cứu với experimentalRefinement:true.
- Không thay đổi PWA ghi điểm, RPC, cơ sở dữ liệu, CI pipeline hay trang chấm hiện hành. Không merge PR #184 trước nghiệm thu trên ảnh thật.
- Test 033 bao phủ các module mới, các test 024/031 giữ parity V6 khi chế độ thử nghiệm tắt.
- Không tuyên bố cải tiến chính xác trên ảnh thực khi chưa có bộ ảnh camera gốc được kiểm chứng thủ công.

## Kết nối thử nghiệm trong PWA (chỉ chế độ so sánh)
- Khi chọn đối chiếu V6/V7 (không lưu điểm), nhánh này gọi V7 với `experimentalRefinement:true`, so trực tiếp toàn bộ các cải tiến với V6 trên cùng ảnh.
- Khi chọn V7 để chấm và lưu, vẫn gọi V7 ở chế độ chuẩn không bật cải tiến, tiếp tục kết quả V6-copy. Không có nút/URL thử riêng; so sánh chỉ đọc.
- Nhánh chưa merge; muốn thử trên điện thoại thật cần xem xét phát hành có kiểm soát sau nghiệm thu bổ sung.
