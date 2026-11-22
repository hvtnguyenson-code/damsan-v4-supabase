# OMR 068 mặc định, V7 dự phòng — 22/11/2026

**Đích:** Khi giáo viên mở chức năng chấm OMR trên PWA hoặc trình duyệt máy tính, `068` được chọn mặc định; có thể tự chuyển sang `V7` khi cần. Không thay đổi nhánh mặc định của Git, không thay đổi DB, điểm hoặc các thuật toán đang được nghiệm thu.

- `omr-teacher-module-068.js`: giá trị ban đầu `officialEngine='v7_068'`; giao diện đặt 068 ở đầu và nêu rõ là mặc định. Hàm `open()` chọn 068 cho phiên mới.
- **Bảo vệ phiên dở dang:** Nếu tồn tại bản nháp V7 đã có ảnh được xác nhận và đầy đủ điều kiện khôi phục, tiếp tục V7 thay vì tự đọc lại bằng 068. Chuyển thủ công giữa hai thuật toán luôn xóa kết quả chưa lưu và yêu cầu quét lại.
- Mọi ràng buộc an toàn 068 như xác minh SBD/mã đề, phòng thi, dấu tô hai ô, duyệt cảnh báo và lưu qua canonical writer được giữ nguyên. V7 vẫn là phương án dự phòng hoạt động.
- Đóng gói lại chính xác runtime 068 với tên mới `omr-runtime-068-default-20261122.js`. File bundle 068 cũ vẫn tồn tại trong repository để PWA đã cài không mất tài nguyên giữa phiên. PWA SW dùng cache version mới, không tự reload trang đang chấm.
- Kiểm thử bộ browser Chromium: mặc định 068, quét và chấm, V7 hoạt động khi chọn, bắt đầu phiên mới trở lại 068, bản nháp V7 chưa xong vẫn khôi phục bằng V7.
- Đây là thay đổi mặc định do giáo viên yêu cầu, không phải tuyên bố OMR 068 đã được chứng minh chính xác hơn V7 về mọi điều kiện chụp thực tế.

Không merge nếu bất kỳ CI nào đỏ; không ghi dữ liệu sản xuất để kiểm thử.
- **Bảo vệ công việc đang mở:** nếu đã có phiếu chưa lưu đang xử lý trong bộ nhớ (V7 hoặc 068), tiếp tục chính thuật toán của phiếu đó khi quay lại màn hình; nếu điểm đã ghi và ảnh minh chứng còn chờ, giữ nguyên phiên bản cùng mã receipt. Chỉ sau khi hoàn tất/xóa phiếu dở dang, phiên mới sử dụng 068 mặc định.
