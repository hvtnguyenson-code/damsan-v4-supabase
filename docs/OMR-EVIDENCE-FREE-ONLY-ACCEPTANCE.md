# OMR-EVIDENCE-01 — Quy tắc vận hành Supabase Free duy nhất

Ngày: 16/11/2026 · PR #193 · Không có chi phí trả phí.

## Quy tắc bắt buộc

1. Chỉ sử dụng tổ chức/dự án Supabase **Free** hiện có; không nâng cấp lên Pro, không mua add-on, không tạo nhánh Supabase tốn phí, không bật overage/billing.
2. Không dùng PostgreSQL để chứa ảnh hoặc ảnh mã hóa base64. PostgreSQL chỉ chứa metadata và điểm; ảnh qua Storage riêng tư.
3. Giữ **chế độ lưu minh chứng chính thức tắt** (`OMR_EVIDENCE_OFFICIAL_ENABLED` không đặt thành `true`) cho đến khi qua nghiệm thu và có chính sách lưu trữ thay thế.
4. Thử nghiệm `OMR_V7_TEST`: tối đa **200 bản ghi** cloud, mỗi bản ghi hai ảnh tối đa 1,5 MB/ảnh. Giới hạn lý thuyết 600 MB ảnh thử nghiệm, chưa kể Storage cũ (~60,7 MB tại thời điểm khảo sát). Giới hạn API đồng thời và kích cỡ toàn project vẫn cần kiểm chứng thực tế.
5. **Không giữ ảnh toàn trường vô hạn trên Free**. Với hàng nghìn phiếu, muốn bảo tồn đầy đủ cần xuất ZIP có Excel, ảnh và manifest về thiết bị/lưu trữ do trường quản lý. Chỉ lưu một tập mẫu/thời gian ngắn trong cloud, chưa tự xóa phiếu chính thức.
6. Không tự dọn dữ liệu cloud trước khi đã xuất và kiểm chứng toàn vẹn ZIP/bản sao an toàn. Không tự tạo cơ chế upload trả phí sang nơi khác.
7. Mọi lúc phải ưu tiên nghiệp vụ chấm hiện hành: tạo minh chứng lỗi không được làm mất bài đã chấm, tạo bản ghi điểm trùng hoặc gọi lưu điểm lại.

## Môi trường kiểm thử không mất phí

- SQL đề xuất ở `docs/omr-evidence-ddl-proposal.sql` được chạy **hai lần** trên PostgreSQL 17 container dùng tạm trong GitHub Actions, sử dụng dữ liệu fixture giả lập. Không gọi Supabase production.
- Các kiểm tra gồm: DDL chạy thành công/lặp lại, khóa ngoại, RLS bật, không có quyền `anon`/`authenticated`, Storage bucket `private`, giới hạn 1,5 MB, chống trùng scan+revision và một bài chính thức một artifact.
- Edge Function TypeScript được kiểm tra với Deno, workflow Node/Chromium kiểm tra tạo hình và Excel/ZIP.
- Supabase gateway JWT mặc định không dùng cho phiên giáo viên riêng. **Chỉ** endpoint `omr-evidence` có `verify_jwt = false`; xử lý hành động trong endpoint **bắt buộc** kiểm tra staff_token có hash, hạn và revoked, quyền phòng/trường/môn. Không mở public access tới dữ liệu.

## Chưa được coi là nghiệm thu

- Không được coi CI giả lập bằng chứng rằng RLS/Storage production hoạt động chính xác.
- Chưa có ảnh raw phiếu thật nhiều điều kiện đủ để xác nhận định vị vòng màu.
- Chưa kiểm tra phản hồi toàn bộ luồng Edge Function + private Storage trên hệ thống đã bật.
- Chưa chứng minh quy trình lưu lâu dài hàng nghìn ảnh trên gói Free. Do đó **không tự mở lưu ảnh cloud toàn bộ học sinh**.

## Điểm đạt để tiếp tục

- CI OMR, Submission Safety, Deno và container PostgreSQL đều xanh.
- Hệ thống đang chạy `main` không bị sửa.
- Phải có kiểm thử cuối bằng phiếu thật, đếm dung lượng và tốc độ upload/download trên mạng điện thoại trước khi bật `OMR_V7_TEST` dùng backend thật.

### Performance isolation
- Frontend Stage A must not generate or display annotated evidence for any room except `OMR_V7_TEST`. This protects live V7 grading responsiveness and low-memory Android phones. Official rollout can only be introduced after separate acceptance.

## Trạng thái triển khai sandbox trên dự án Free hiện có (16/11/2026)

- Đã áp dụng migration `omr_evidence_trial_private_free_20261116` chỉ tạo `public.omr_artifacts` và bucket `omr-evidence`, không thay đổi bảng điểm cũ.
- Đã xác minh RLS bật, bucket `public=false`, `anon/authenticated` không được đọc bảng trực tiếp, không có bản ghi minh chứng sau migration.
- Đã triển khai phiên bản 1 của Edge Function `omr-evidence`, `verify_jwt=false` vì dùng xác thực `staff_token` riêng; `OMR_EVIDENCE_OFFICIAL_ENABLED` mặc định false.
- Cổng bảo mật mới OMR 047 kiểm tra endpoint thật từ bên ngoài với token giả, không ghi dữ liệu. Cổng này không chứng minh quyền truy cập của giáo viên hợp lệ; bước đó cần thử trên PWA test.
- 200 bản ghi thử là **ngưỡng dừng**, không phải cam kết lưu trữ vĩnh viễn. Không tự xóa dữ liệu, không tự nâng cấp hoặc chuyển gói phí.
