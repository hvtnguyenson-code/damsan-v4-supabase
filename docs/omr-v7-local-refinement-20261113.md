# OMR V7 – Local-offset refinement, experimental (13/11/2026)

- PR #184, nhánh độc lập. Không merge hay triển khai PWA.
- Giữ nguyên mã nhận dạng V6-copy trong omr-reliability-v7-baseline.js, không thay một dòng.
- Bổ sung omr-v7-local-refinement.js: thử lại tâm đo của một hàng tô theo 4 hướng, mỗi hướng ba mức 0,2/0,4/0,6 bán kính ô, cùng ngưỡng hiệu chuẩn của V6.
- CHỈ có thể đổi một V6 review do độ sáng nền biến đổi thành single khi 3 vị trí đo dọc cùng hướng đều có nét tô mạnh, nhất quán đúng lựa chọn V6 đã xếp cao nhất; không bao giờ sửa single, blank, multiple, review vết tẩy; phải có geometry.status=ok và calibration.reliable=true.
- Chế độ mặc định của V7 vẫn exact V6-copy. Phải bật tùy chọn phân tích riêng experimentalRefinement=true để thử cải tiến. Chưa tự kích hoạt trong PWA nên không tác động điểm thật.
- Phần III giữ nguyên toàn bộ V6-copy; không đoán số, dấu âm hoặc dấu phẩy. Hai ô tô rõ Phần I/II vẫn sai theo quy tắc hiện hành.
- Test 032 tạo trường hợp nét tô lệch + chói tại một điểm đo nền. V6 review P1.14, cải tiến 3 điểm đồng thuận phục hồi B, đồng thời giữ nguyên P2/P3 và bảo vệ tô nhiều ô/vết tẩy/mốc chưa đạt. Chỉ là minh họa tổng hợp, không phải đo chính xác trên 30+ ảnh thực.
- Chưa có bộ ảnh camera gốc và nhãn nét tô thủ công; không tuyên bố tốt hơn V6 thực địa, chưa merge cho đến khi nghiệm thu và có chấp thuận.
