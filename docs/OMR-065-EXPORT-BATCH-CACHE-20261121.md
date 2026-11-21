# OMR 065 — Khắc phục danh sách xuất phiếu 21–28 trên PWA

## Tình huống thật (21/11/2026)
Điện thoại cho thấy IndexedDB còn 28 lượt quét, nhưng lựa chọn xuất minh chứng chỉ có “Phiếu 1–20”. HTML đã có giao diện chọn nhóm, song bộ mã JavaScript có thể đến từ phiên bản cũ trong cache Service Worker. Bộ thử cũ chỉ dùng hai phiếu, không bắt được trường hợp 28 lượt.

## Biện pháp sửa và lý do
- Giữ nguyên IndexedDB và định danh origin (không xóa, không di chuyển dữ liệu).
- HTML mới gọi **field-app-065.js**, tên tệp chưa có trong cache của worker cũ. Khi mở URL có truy vấn mới lần đầu, HTML đi qua mạng và file JS 065 không thể bị worker v3 trả lại mã cũ vì không nằm trong danh sách asset được chặn cache.
- Cập nhật worker riêng của thư mục thử nghiệm lên v4, precache file JS 065, không nạp JS 060 cũ.
- Hiện nhãn “Phiên bản đang chạy: OMR060_FIELD_065” sau khi đọc IndexedDB và tạo danh sách lựa chọn. Nếu script không chạy, giao diện để “Đang xác minh phiên bản ứng dụng…” và ô chọn để “Đang tải nhóm phiếu…”, thay vì giả vờ danh sách chỉ có một nhóm.
- Không sửa OMR 060 pipeline, V7, người dùng, dữ liệu điểm, PostgreSQL/Supabase. Không thay đổi các khóa hoặc bản ghi IndexedDB.

## Kiểm thử hồi quy bắt buộc
- Static offline assets: HTML phải tham chiếu file JS 065, worker phải precache 065 và nâng cache version, không precache JS cũ.
- Chromium: quét hai phiếu tổng hợp và xác minh ghi nhận xét/ZIP/offline; bổ sung **26 phiếu cục bộ** để thành 28. Reload PWA, danh sách phải có hai lựa chọn, chọn **Phiếu 21–28**, xuất chính xác 8 JPG + 8 JSON, manifest tổng 28.
- Ba GitHub workflows OMR Field PWA CI, OMR Camera Grading CI, Submission Safety CI phải xanh trước merge.

## Nghiệm thu trên điện thoại
Mở URL có truy vấn build 065 một lần qua trình duyệt Chrome/Safari **bình thường**, cùng origin với PWA hiện tại. Xác minh “Phiên bản đang chạy: OMR060_FIELD_065” và cả hai nhóm 1–20, 21–28; chọn 21–28, tạo ZIP rồi tải về. Sau đó có thể tiếp tục mở qua biểu tượng PWA. Không gỡ app, không xóa dữ liệu duyệt web hoặc cache thủ công, không gửi ảnh học sinh lên GitHub.
