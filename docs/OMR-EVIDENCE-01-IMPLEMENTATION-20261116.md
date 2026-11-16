# OMR-EVIDENCE-01 — nhánh phát triển cô lập (16/11/2026)

## Phạm vi chức năng
- Tạo một ảnh minh chứng duy nhất cho mỗi phiên bản quét: học sinh, mã đề, điểm từng phần và các vòng đánh dấu.
- Vòng xanh lá = chọn đúng; đỏ = lựa chọn sai; vàng = đáp án đúng chưa chọn; tím = có chỉnh sửa thủ công.
- Phần III chỉ vẽ vòng đáp án chuẩn khi chuyển chính xác về bốn cột trên phiếu. Các số không biểu diễn an toàn được lưu dưới dạng chữ số, không bịa vị trí tô.
- Lưu hai bộ đáp án ban đầu/sau chỉnh sửa, cảnh báo và phiên bản, không chỉnh sửa nét bút chì trên ảnh nguồn.
- Xem danh sách minh chứng thử nghiệm; tải ảnh/JSON; xuất Excel ba sheet và ZIP ảnh 20 phiếu mỗi gói.
- Chỉ thử nghiệm tại OMR_V7_TEST; việc tạo ảnh không bao giờ ghi điểm vào bảng kết quả.

## Mã nguồn
- Frontend: omr/omr-v7-evidence.js, omr/omr-evidence-client.js, omr/omr-evidence-export.js, omr/omr-teacher-module.js, PWA 042.
- Backend: supabase/functions/omr-evidence/index.ts (chưa triển khai).
- Bản SQL chuẩn bị review: docs/omr-evidence-ddl-proposal.sql (chưa áp dụng production). Khi được duyệt, tạo migration bằng CLI, diễn tập và kiểm tra RLS, rollback.
- Đường chấm và ghi điểm rpc_staff_submit_omr giữ nguyên, bộ chấm V7 không chỉnh sửa.
- Biến OMR_EVIDENCE_OFFICIAL_ENABLED mặc định false; chỉ bật giai đoạn B sau nghiệm thu riêng.

## An toàn
- Edge kiểm tra phiên giáo viên: token SHA-256, revoke, hạn phiên, quyền trường/bộ môn/phòng và phạm vi học sinh.
- Service role chỉ tồn tại ở máy chủ; bucket private; signed URL hết hạn sau 60 giây. Không mở chính sách public.
- MIME WebP/JPEG, giới hạn 1,5MB/ảnh và 5MB/request.
- Scan ID + revision dùng để chống tạo trùng và phục hồi yêu cầu.

## Cổng phát hành
1. Review độc lập TypeScript và schema, idempotency, RLS, quyền đọc/ghi.
2. Tạo migration chuẩn bằng Supabase CLI và kiểm thử trên DB tạm; không chạm production khi chưa duyệt.
3. Kiểm thử danh tính, phiên hết hạn, tải lên trùng, mất mạng, sai phòng, tải về có hạn.
4. Đo dung lượng ảnh thực và độ chính xác đối chiếu hình.
5. Nghiệm thu 5–10 lượt test P1/P2/P3 và xuất Excel/ZIP.
6. Duyệt riêng việc áp dụng schema, bucket, Edge, cuối cùng mới merge phát hành PWA.

## Bộ kiểm thử
- OMR 044: đúng/sai, P2 bốn ý, Phần III và sửa thủ công.
- OMR 045: UI, CRC32 ZIP, cấu trúc Excel, xác thực backend.
- Hồi quy OMR 001–043 và Submission Safety CI PASS.

## Giới hạn bảo vệ Free plan
- Chặn tạo thêm hồ sơ thử mới khi có 200 minh chứng TEST (lượt sửa tính là bản ghi riêng), tương đương tối đa lý thuyết 600MB ảnh (2 ảnh x 1,5MB).
- Bản ghi đã tồn tại cùng scan_id/revision và checksum được trả về idempotent, không nhân bản.
- Ảnh nguồn tạm trên điện thoại được giảm cạnh dài xuống tối đa 1900px, tránh giữ bản 12MP trong RAM. Ảnh nguồn gốc vẫn được giữ nguyên trên canvas chụp đến khi chuyển phiếu.

## Bổ sung ràng buộc bằng chứng chính thức
- Edge khi bật mode official phải đối chiếu học sinh, trường, phòng, mã đề, 28 đáp án đã xác nhận và điểm với exam_submissions trên máy chủ. Không chấp nhận điểm trùng nhưng nội dung đáp án khác.
- Chế độ chính thức vẫn OFF ở giai đoạn A; chưa có hành động tự lưu ảnh chính thức lên production.
- Ảnh do trình duyệt tạo là bằng chứng trình bày, không phải chữ ký hình học xác thực độc lập. Chỉ dùng kèm raw_answers, metadata, checksum và bản ghi chấm có thẩm quyền.
