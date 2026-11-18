# OMR-062 — PWA quét phiếu thực tế, ghi minh chứng cục bộ (chỉ đọc)
Ngày: 18/11/2026. PR nghiên cứu #205, nhánh experiment/omr-v7-full-optimization-060.

## Mục tiêu nghiệp vụ
GV chỉ cần mở PWA, chạm "Chụp phiếu", chụp tiếp các phiếu. Mỗi ảnh được xử lý bằng đúng pipeline 060, đối chứng V7 trên cùng ảnh, sau đó tự lưu ảnh JPG và kết quả nghiên cứu trong IndexedDB thiết bị. Không chụp 4–5 ảnh màn hình/phiếu.

## Giao diện và an toàn
- Entry point: omr/field-060/index.html, manifest + service worker giới hạn scope ./; không sửa app GV chính thức.
- Camera: input ảnh với chế độ capture=environment, hỗ trợ chọn ảnh thư viện; chạy trên HTTPS hoặc localhost. Không phụ thuộc luồng getUserMedia cho thiết bị cũ. iOS/Android có thể khác nhau về cách hiển thị hộp chọn.
- Pipeline: OMR060_RESEARCH_ONLY và V7 legacy đối chứng. Kết quả readOnly=true, validForSave=false. SBD/mã đề dự kiến (tùy chọn) được kiểm tra; ô SBD đối chiếu được xóa sau mỗi phiếu.
- IndexedDB: ảnh JPEG (canvas tối đa 2200px cạnh dài), kết quả, cờ nghi vấn, nhận xét GV; tối đa 60 phiếu; lưu trên thiết bị, không đồng bộ cloud.
- Không import Supabase SDK, không gọi RPC, không gọi dịch vụ ảnh, CSP connect-src none. Không có nút chấm hoặc lưu điểm thật.
- Ghi chú GV có thể chỉ rõ câu đọc sai (ví dụ P3.2 = 11), lưu riêng, không chỉnh sửa đáp án máy đọc.
- Xuất ZIP bằng omr-evidence-export.js, tên ảnh dễ đọc, gồm manifest.json, bao-cao.csv, ảnh JPG và JSON chi tiết từng phiếu.
- Mỗi ZIP tối đa 20 phiếu để hạn chế dùng RAM trên điện thoại. Nút tạo ZIP tạo liên kết tải bền vững; GV bấm liên kết để lưu, không cần chụp màn hình.
- Nút xóa toàn bộ cần xác nhận. Không xóa tự động sau xuất.

## Kiểm thử trước khi đưa GV sử dụng
1. Static: node tests/omr_062_fieldtrial_static_simulation.js — tài sản offline, CSP, biệt lập V7, ZIP, đường chỉ đọc.
2. Browser: node tests/run_omr_062_fieldtrial_browser.mjs — Chromium tạo ảnh tổng hợp, quét 2 phiếu, một phiếu đối chiếu danh tính sai; tự lưu, đánh giá GV, ZIP 2 JPG + 2 JSON + manifest + CSV; reload thấy phiếu; chạy offline sau khi SW cài xong.
3. CI OMR và Submission Safety đều phải PASS; không chạy trên production database.
4. Mở trên điện thoại thật, xác minh camera, IndexedDB ổn định, ZIP tải được và chất lượng nhận dạng với ảnh phiếu thật.

## Kế hoạch thử với người dùng
- Dùng HTTPS trên một origin do nhà trường/chủ dự án kiểm soát; không dùng CDN công cộng nhiều ứng dụng chia sẻ cùng origin để giữ ảnh học sinh.
- Lần đầu mở và Thêm vào Màn hình chính; sau đó mở từ biểu tượng PWA, không cần đăng nhập vì không có API backend.
- Quét 10–20 phiếu đa dạng: rõ nét, nghiêng, thiếu sáng, tô mờ, tẩy xóa, câu III bỏ trống/ít câu, nhận dạng SBD/mã đề.
- Khi thấy nghi vấn, chọn Máy đọc sai / cần kiểm tra, ghi ngắn ví dụ P3.6 = 150. Mọi phiếu được tự lưu.
- Cuối đợt: Tạo gói ZIP minh chứng -> bấm liên kết xanh để tải -> tải ZIP lên cuộc trò chuyện hoặc chuyển giao qua kênh riêng được phê duyệt. Không gửi ảnh học sinh lên GitHub.
- Không xóa dữ liệu/trình duyệt trước khi xác minh ZIP đã tải thành công.

## Cổng cần chủ dự án khi phát hành thử
PWA nằm trên nhánh nghiên cứu, chưa có đường HTTPS riêng đã được xác minh cho điện thoại. Không hợp nhất PR #205 và không tự đưa mã nghiên cứu vào PWA giáo viên trên main. Khi kiểm thử đủ xanh, chỉ đưa phần PWA cô lập lên một origin sở hữu; nếu phải thay cấu hình hosting/đụng site production, yêu cầu phê duyệt rõ ràng.

## Giới hạn nghiệm thu
Đây là nghiên cứu chỉ đọc, chưa thay V7. PostgreSQL 17 và Chromium đã có bài thử nhưng kiểm thử trên ảnh thật và toàn bộ Auth/Storage của production chưa hoàn thành. Không ghi điểm thật khi dùng ứng dụng field PWA.
