# Teacher PWA 021 — Hiện mật khẩu và ghi nhớ thông tin đăng nhập

Ngày triển khai: 07/11/2026.

## Yêu cầu
1. Giáo viên có thể hiện/ẩn chữ khi gõ mật khẩu. Áp dụng cho đăng nhập, mật khẩu mới và xác nhận mật khẩu khi buộc đổi.
2. Sau khi đăng nhập thành công, giáo viên có thể chủ động chọn ghi nhớ tài khoản và lưu mật khẩu để lần sau không phải gõ lại.

## Kiến trúc bảo mật và khả năng tương thích
- Tên giáo viên/mã đăng nhập được lưu trong localStorage **chỉ khi giáo viên chọn ghi nhớ và đăng nhập thành công**. Cờ đồng ý có thể gỡ bất cứ lúc nào, khi bỏ chọn sẽ xóa hai giá trị này ngay.
- PWA **không lưu mật khẩu dạng rõ, mật khẩu đã mã hóa tự chế hoặc token phiên vào localStorage/IndexedDB/cookie**. Trình duyệt có hỗ trợ `PasswordCredential` sẽ gọi `navigator.credentials.store(new PasswordCredential({id,password,name}))` sau khi đăng nhập được backend xác minh. Trình quản lý mật khẩu của hệ điều hành/trình duyệt kiểm soát việc lưu và có thể hỏi ý kiến người dùng.
- Nút **Dùng mật khẩu đã lưu** (chỉ hiện ở thiết bị có API tương ứng) gọi `navigator.credentials.get({password:true,mediation:'optional'})` sau thao tác chạm của giáo viên. Chỉ điền biểu mẫu; không tự động đăng nhập.
- Trình duyệt không có `PasswordCredential` tiếp tục dùng `autocomplete="username"` và `autocomplete="current-password"` để lấy mật khẩu từ cơ chế autofill chuẩn, nếu hệ điều hành/trình duyệt hỗ trợ.
- Không yêu cầu ghi nhớ theo mặc định; **mặc định tắt** trên thiết bị mới hoặc khi dùng chung. Chọn ghi nhớ và mật khẩu lưu ở trình quản lý thiết bị là hai cấp đồng ý riêng: PWA không thể tự bỏ qua quyết định của trình quản lý mật khẩu.
- Khi đăng nhập sai, không lưu gì. Khi yêu cầu đổi mật khẩu mặc định, mật khẩu cũ không được đề nghị lưu; chỉ lưu **mật khẩu mới sau khi thay đổi và đăng nhập thành công**.
- Khi chọn Đăng xuất, token hiện hành vẫn bị thu hồi qua RPC như cũ và bị xóa khỏi sessionStorage. Tên tài khoản lưu có thể giữ lại theo tùy chọn ghi nhớ; xóa mật khẩu đã lưu thực hiện tại quản lý mật khẩu của thiết bị, PWA không thể tự xóa mọi mật khẩu mà người dùng đã lưu ở đó.

## Phạm vi kỹ thuật
- `teacher/index.html`: nhãn input, name/autocomplete, nút hiện mật khẩu, checkbox ghi nhớ, nút dùng mật khẩu đã lưu.
- `teacher/app.css`: bố cục và touch target thân thiện điện thoại.
- `teacher/app.js`: logic điều khiển trường mật khẩu và cầu nối Credential Management, đồng bộ tùy chọn nhớ tài khoản.
- `teacher/sw.js` + cache-busting trong HTML/app: PWA 021.
- Không thay đổi runtime học sinh, DB, Supabase RPC, phiên bản OMR V5 hoặc cơ chế Back PWA 020.

## Kiểm thử
- `tests/teacher_password_012_simulation.js`: các nút hiện/ẩn, mặc định không ghi nhớ, sai mật khẩu không lưu, lưu sau đăng nhập đúng, gọi browser vault, gọi browser credential chooser, opt-out, fallback không có API.
- `tests/teacher_pwa_006_simulation.js`: không lưu staff token vào localStorage, cấu trúc PWA và cache/version.
- OMR 001–011, Chromium installability 008 và Submission Safety CI theo workflow hiện hữu.
- Kiểm thử điện thoại sau phát hành: đăng nhập có/không tích nhớ, dùng Google Password Manager, tắt/mở PWA, đổi mật khẩu, đăng xuất, Back về màn trước.

## Giới hạn và đường lui
Trên các trình duyệt không hỗ trợ API PasswordCredential, PWA chỉ có thể chuẩn bị form cho auto-fill gốc; không thể cam kết lưu mật khẩu trong chính trình quản lý nếu người dùng đã tắt tính năng hoặc thiết bị không hỗ trợ. Cơ chế sessionStorage cũ vẫn áp dụng, nên Back nội bộ không đăng xuất nhưng khởi động PWA mới có thể cần đăng nhập lại (đã được điền sẵn nếu thiết bị lưu mật khẩu).

Rollback bằng cách revert PR và tăng khóa cache PWA. Không có migration DB.
