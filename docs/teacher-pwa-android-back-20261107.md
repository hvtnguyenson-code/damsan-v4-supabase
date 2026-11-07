# Teacher PWA — Android Back navigation (07/11/2026)

## Bối cảnh
Trong PWA giáo viên, các tab Home/Bảng điểm/Thêm và các lớp phủ OMR trước đây chỉ chuyển qua CSS, không tạo bản ghi lịch sử. Vì vậy Back phần cứng của Android có thể thoát thẳng ứng dụng. Bearer token chỉ lưu trong `sessionStorage`, nên khi ngữ cảnh PWA thực sự bị đóng, phiên đăng nhập có thể mất.

## Thiết kế: một lịch sử điều hướng, không đổi xác thực
- Dùng `window.history.pushState`, `replaceState`, `popstate` để quản lý **một stack màn hình** phía PWA giáo viên. Không mở đường dẫn mới, không tạo router/framework khác.
- Các tab **Trang chính → Bảng điểm → Thêm** tạo trạng thái lịch sử. Nút Back quay về tab trước, không gọi đăng xuất.
- Trong OMR, bốn trạng thái: **danh sách phòng** (`main`), **camera**, **kết quả quét**, **ảnh phóng to**. Chụp xong ghi bước kết quả; mở ảnh phóng to ghi bước xem ảnh.
- Back hoặc nút **Đóng** từ xem ảnh trở về kết quả; từ kết quả trở về camera; từ camera về danh sách phòng; từ danh sách phòng về tab trước. Đóng OMR bằng nút trên cùng sẽ quay về tab xuất phát.
- Sau khi lưu phiếu, **Quét tiếp** dùng lại bản ghi camera trước đó; không tạo thêm bản ghi kết quả đã lưu vào history. Nếu chấm bằng ảnh tải lên, kết quả sẽ được thay bằng camera mới khi quét tiếp.
- Nếu đang chờ quyền camera, yêu cầu mở camera cũ bị vô hiệu khi người dùng Back, tránh camera tự bật trở lại sau khi quay về.
- Khi thực sự chọn **Đăng xuất**, ứng dụng vẫn gọi RPC hủy phiên và xóa token như trước. Back không kích hoạt logout. Token giữ nguyên trong `sessionStorage`, không chuyển sang `localStorage`.

## Ranh giới
- Back ở **màn hình gốc**, khi không còn lịch sử nội bộ để quay về, có thể đóng PWA theo hành vi chuẩn Android. Việc đóng hẳn PWA hoặc hệ điều hành hủy phiên trình duyệt có thể xóa `sessionStorage`; phiên đó cần đăng nhập lại, không nên cam kết giữ token vĩnh viễn.
- Không sửa backend, DB, RPC, camera sampling, nhận diện OMR, điểm số hay dữ liệu bài làm.
- URL cài PWA/scope/manifest không đổi; version cache **020** để thiết bị tải mới.
- Khi bản cập nhật được áp dụng, kiểm tra lại trên Android với nút Back hệ thống thực, không chỉ Back trong Chrome DevTools.

## Kiểm thử
- `tests/teacher_navigation_011_simulation.js`: mô phỏng History API, popstate, các màn hình/tầng OMR, quay lại camera, đóng OMR, xác minh token giữ nguyên.
- `tests/omr_batch_ux_005_simulation.js`: bảo đảm ảnh, camera và kết quả liên kết navigation bridge, sau lưu trở lại camera.
- Toàn bộ OMR 001–010 và Teacher PWA 006–008 tiếp tục chạy trong workflow hiện có. Không thêm cơ chế CI/CD hay deploy mới.

## Đường lui
Revert PR và bump khóa cache PWA mới nếu hành vi Back trên điện thoại có vấn đề. Không có migration DB cần rollback.
