# OMR V7 — hiển thị bản đồ cố định và sửa tràn khung SBD (16/11/2026)

## Nguồn yêu cầu
Hai ảnh chụp PWA giáo viên: (1) bản đồ mốc nội bộ và vị trí tô bị thu gọn và phải nhấn mũi tên; (2) ô nhập SBD, mã đề bị kéo vượt chiều rộng điện thoại.

## Điều chỉnh
- Đổi `#omrV7OverlayPanel` từ `details/summary` thành `section` có tiêu đề `h3` và vùng `canvas` luôn hiển thị trong kết quả quét V7, không yêu cầu thao tác mở rộng. Chỉ ẩn khi chưa có kết quả hoặc khi quét phiếu mới.
- Giữ nguyên `DamSanOmrV7Overlay.draw`, màu và mốc nhận dạng. Không điều chỉnh thuật toán V7 hoặc logic lưu điểm.
- `#omrV7OverlayStatus` thông báo khi không vẽ được bản đồ, thay vì chỉ ghi console.
- SBD và Mã đề dùng grid 2 cột `minmax(0,1fr)`; Học sinh chiếm nguyên một hàng. Với viewport <=340px, grid chuyển 1 cột.
- Giới hạn ô nhập, select, canvas và card theo khung hiển thị; `box-sizing:border-box`, `min-width:0`, `max-width:100%`; font nhập 16px hạn chế zoom tự động trên mobile.
- Phạm vi CSS được khóa trong `#omrTeacherOverlay` để không làm thay đổi form của các chức năng khác.
- Phiên bản PWA `20261116-teacher-pwa-041`, recovery bridge mới `teacher/omr-v7-runtime-20261116-041.js` bảo vệ thiết bị đã cài PWA khỏi dùng lẫn cache cũ và mới. Giữ các phiên bản bridge cũ, không ép tải lại phiên đang chấm.

## Kiểm thử
- `tests/omr_v7_mobile_ui_043_simulation.js`: cấu trúc giao diện, hiển thị card/canvas, các ô SBD/mã đề, bất biến chấm-lưu và đồng bộ runtime PWA.
- `tests/run_teacher_omr_mobile_layout_probe_043.mjs`: kiểm tra giao diện Chromium bằng máy giả lập Android ở 320, 360, 390, 430, 768 px, bảo đảm không tràn ngang và đúng số cột.
- Các kiểm thử OMR 001–042 và Submission Safety CI tiếp tục được thực hiện.
- Không có migration, RPC, thay đổi quyền hay dữ liệu điểm. Triển khai GitHub Pages theo pipeline hiện hữu.

### Phát hiện trong kiểm thử Chromium
Tại viewport 390px, SBD/Mã đề đã khớp khung nhưng input trong grid Phần I/II/III có kích thước nội tại lớn hơn track, gây `scrollWidth` của shell 417px dù viewport chỉ 390px. Đã bổ sung CSS giới hạn `omr-answer input` theo track, kiểm chứng lại bằng cùng bài kiểm thử Chromium.
