# OMR V7 — nhánh nghiên cứu độc lập (12/11/2026)

## Trạng thái / nguyên tắc
- Baseline main: 8964a72543520b0824435398b05bb2f572e54b85; V6 vẫn là thuật toán chấm chính thức.
- V7 chỉ có trong omr/omr-v7-research.js và kiểm thử ngoại tuyến, không import vào giáo viên trên web/PWA, SW, scorer hoặc result writer.
- Không chỉnh sửa bảng dữ liệu, RPC, phân quyền, đường lưu điểm, kết quả học sinh hay cơ chế triển khai.
- KHÔNG được merge PR nghiên cứu để tự động kích hoạt V7; mọi tích hợp phải có PR riêng sau khi nghiệm thu.

## Hiện đã có
1. Đánh giá khung hình: đo biên Laplacian, tỷ lệ sáng bão hòa, vùng tối và biến thiên ánh sáng; chọn khung tốt nhất trong chuỗi cùng phiếu. Chỉ là chỉ số tương đối, chưa phải bảo đảm ảnh đủ chất lượng.
2. Hiệu chỉnh hình học nội bộ tùy chọn: đối chiếu mốc dự kiến và mốc quan sát trong ảnh đã nắn phối cảnh, lọc mốc lệch bất thường, đòi ít nhất ba mốc ở mỗi phần P1/P2/P3. Chỉ cho phép bù sai lệch nhỏ khi dữ liệu đủ.
3. Đọc ô tô P1/P2: đo mức tối tương đối so với nền giấy cục bộ tại 4 hướng, mật độ/độ phủ; hiệu chuẩn dấu tô theo 18 câu P1. Phân biệt single, blank, multiple, review. Tô hai ô rõ được đánh dấu multiple; vết thứ hai không chắc chắn phải review.
4. P3 chưa thay đổi: chỉ gọi bộ đọc P3 V6 từ mô phỏng khi được truyền tường minh. V7 không tự suy đoán phần III.
5. Đầu ra luôn đặt readOnly=true và validForSave=false; không có hàm gửi điểm.

## Kiểm thử
- Chạy: node tests/omr_v7_candidate_023_simulation.js
- Bao gồm kiểm tra không import vào production, đối chiếu ảnh nét/mờ cùng bố cục, mốc nội bộ đúng/sai, phiếu tổng hợp P1/P2 dưới điều kiện ngày/gradient/bóng đèn, vết tẩy nhạt, hai dấu tô P2.2d, không ngầm sinh P3.
- Sử dụng workflow OMR Camera Grading CI đã có, thêm duy nhất một bước test, không thêm cơ chế phát hành.

## Hạn chế đã biết
- Chưa có ảnh thực tế mới. Dữ liệu mô phỏng không chứng minh độ chính xác với than chì phản xạ, giấy gấp lớn, ảnh chụp rung thực tế, giấy đã tẩy nhiều lần hoặc nhiều cấu hình camera.
- Bộ chọn khung hình chưa gắn vào camera PWA; đo độ nét tương đối không đủ để phát hiện mọi nhiễu và chói sáng.
- Hiệu chỉnh hình học chỉ là ứng viên nghiên cứu; phải đối chiếu với mốc thật rồi đo sai số trên bộ phiếu độc lập.
- Không đo thời gian P50/P95 trên thiết bị Android cũ.

## Điều kiện cho phiên tiếp theo
- Thêm phép đo chất lượng ảnh theo ROI từng cụm, chuẩn hóa phân bố phơi sáng bằng nhiều khung và bộ từ chối ảnh thiếu thông tin.
- Kiểm thử V5/V6/V7 trên ảnh giấy thật, chia dữ liệu theo PHIẾU VẬT LÝ để tránh leakage.
- Chỉ xin phê duyệt tích hợp sau khi chứng minh không tăng lỗi chấm âm thầm và tốc độ đáp ứng.

## Phòng thử nghiệm độc lập V7 — 12/11/2026
- Bổ sung `omr/omr-v7-candidate.js`: tự đo Phần III, tự giải mã 4 vị trí, ngữ pháp số; không gọi bộ đọc P3 V6. Có hiệu chuẩn tham chiếu từ P1 cho phiếu P3 toàn bỏ trống hoặc chỉ vài vị trí tô.
- Trang `omr/v7-lab.html`: thử ngay 8 điều kiện mô phỏng; chọn ảnh từ tệp; lấy 3 khung hình camera và ưu tiên khung nét hơn; so sánh V6/V7 cùng ảnh; chỉ rõ vị trí cần kiểm tra, hoàn toàn không gửi ảnh, không đọc ghi DB, không lưu điểm.
- Mở từ checkout nhánh PR #180: chạy `python -m http.server 8769` tại gốc repo rồi vào `http://localhost:8769/omr/v7-lab.html`. Camera có thể đòi HTTPS/localhost và quyền thiết bị.
- Điều chỉnh kiểm tra ảnh sáng: không xem giấy trắng bão hòa là phản chiếu than chì; dấu hiệu phản sáng được phân tích cục bộ tại ô tô.
- Thêm regression test 024, 025 vào OMR Camera Grading CI hiện có; không tạo deploy và không thay đổi `main`.
- Đây là candidate đủ chức năng để thử nghiệm, KHÔNG phải nghiệm thu chính xác ngoài thực tế: chưa có bộ ảnh thật độc lập, chưa đo thời gian trên điện thoại Android cũ; biến dạng giấy gấp lớn và vết tẩy khó chưa chứng minh giải quyết.

## Rà soát cuối
- Mốc khống chế bên trong không đạt hoặc không đủ: V7 buộc yêu cầu chụp lại, ngay cả khi V7 vẫn hiển thị kết quả đọc thử. Giữ invariant `validForSave:false`.
- Trên ảnh nắn phối cảnh, các vị trí nghi vấn được viền khung đỏ theo mẫu tọa độ chuẩn; không phải bằng chứng đáp án.
- Có thể xuất báo cáo JSON không chứa ảnh gốc, tài khoản, token hay dữ liệu phòng thi để phục vụ đánh giá sau này.
