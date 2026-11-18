# OMR 060 — kiểm thử đối chứng trên dữ liệu đã lưu (18/11/2026)

**Trạng thái:** PARTIAL / IMAGE_REPLAY_BLOCKED. Báo cáo chỉ chứa số liệu tổng hợp, không chứa danh tính hay ảnh học sinh.

## Phạm vi
- Dữ liệu Supabase project `xcervjnwlchwfqvbeahy` (chỉ đọc).
- `OMR_V7_TEST`: 25 bản ghi điểm, 25 bản ghi minh chứng, 25 đường dẫn ảnh gốc `capture.webp`.
- `OMR_V7_PRECISION_TEST`: 8 bài có điểm, 7 bản ghi minh chứng và 7 đường dẫn `capture.webp`, 1 bài không có bản ghi minh chứng.
- Đối chiếu trực tiếp với `storage.objects`: **32/32 đường dẫn có bản ghi đối tượng** trong bucket `omr-evidence` (private), mimetype `image/webp`, không thiếu bản ghi đối tượng. Metadata này **không xác nhận được nội dung pixel**.
- Kích thước trung bình metadata: V7 ~94.162 B (71.238–125.558 B); Precision ~108.440 B (87.302–133.624 B).

## Kết quả kiểm thử đã thực hiện
1. Truy vấn `omr_artifacts.evidence`: 25 bản V7 có 8 phiếu / 22 vị trí cảnh báo (P1 4; P2 4; P3 14); 2 phiếu có tổng cộng 3 chỉnh sửa đáp án. Bản Precision có 3 phiếu / 5 vị trí cảnh báo, tất cả thuộc P3; chưa ghi nhận chỉnh sửa qua trường `edits`.
2. Chạy chính hàm **`compareAnswers` của nhánh 060** trên 32 bộ `recognized` và `confirmed` đã lưu: V7 phát hiện chính xác 3 thay đổi (P3.2, P3.4, P3.6) trong 2 phiếu; 23 phiếu V7 còn lại không thay đổi; 7 phiếu Precision không thay đổi. Đây là kiểm thử **so sánh dữ liệu JSON, không phải tái nhận dạng ảnh**. SBD/mã đề không có nhãn đọc độc lập trong minh chứng này nên không được tính là đã xác minh lại từ ảnh.
3. Hai phòng có 8 bài tương ứng theo học sinh: điểm lưu 7/8 trùng; 1 trường hợp (mã đề 106) khác -0,25 điểm ở Precision. Với 7 ảnh có mặt ở cả hai phòng, P1 giống nhau 7/7; P2 giống nhau 7/7; P3 giống nhau 6/7.
4. Các ảnh PDF/JPG trong gói xuất cũ tại cuộc trò chuyện chỉ là ảnh có overlay vẽ kết quả, **không phải ảnh capture.webp nguyên bản**. Không dùng để chứng minh khả năng phân biệt vết tẩy.

## Điều chưa hoàn thành
**Chưa chạy `omr-v7-pipeline-060.js` trên 32 file `capture.webp` gốc.** Công cụ Supabase trong phiên này chỉ truy cập PostgreSQL và metadata Storage, không có thao tác tải xuống binary của bucket private. Yêu cầu tạo điểm truy cập tạm thời để đọc ảnh bị hệ thống an toàn chặn; không lách hạn chế bằng cách mở public bucket, làm lỏng RLS, đưa secret vào repository hoặc sửa DB.

Vì vậy:
- Không có kết quả `060 vs V7` về tính đúng/sai của việc nhận dạng ảnh trên toàn bộ corpus.
- Không có cơ sở tuyên bố 060 tăng độ chính xác hoặc giảm cảnh báo/vết tẩy thực tế.
- Không tiến hành merge, release, sửa điểm hoặc điều chỉnh ngưỡng trên cơ sở dữ liệu JSON cũ.

## Điều kiện để hoàn tất image replay
Dùng một đường truy xuất đã được phê duyệt cho bucket private (ví dụ nguồn file trong giao diện giáo viên có quyền, hoặc công cụ kết nối Storage được cấp quyền phù hợp) để đưa **32 ảnh capture.webp nguyên bản** vào một môi trường kiểm thử cô lập, theo thứ tự được đối chiếu với bản ghi `omr_artifacts`. Chạy V7 nguyên trạng và 060 song song, xuất thống kê từng câu I/II/III và SBD/mã đề, ưu tiên 3 vị trí P3.2.3/P3.2.4/P3.5.2 của mã đề 106; phân biệt sai khác so với nhãn đã xác minh và khác biệt so với V7 cũ.

**Không yêu cầu giáo viên quét lại. PR #205 vẫn Draft.**

## Nhật ký thực thi tiếp theo khi người quản trị đã cấp quyền (18/11/2026)
- Đã xác minh đọc qua giao thức truy xuất tạm thời nhận danh sách **32/32 ảnh gốc** và phát hành liên kết tải xuống ngắn hạn đúng hai phòng.
- **Không tải/giải mã được các file WebP** trước khi liên kết và quyền tạm thời hết hạn; kiểm tra ở nơi nhận gặp lỗi xử lý phiên và không tạo được tập ảnh có SHA256 đối chiếu.
- Gia hạn dịch vụ đọc tạm thời bị chặn bởi lớp kiểm tra an toàn. Không thử lách chính sách hoặc mở bucket public.
- Đã đóng dịch vụ tạm `omr-060-audit-read-once`: phiên bản 2 chỉ trả `410 audit_closed`, đồng thời bật `verify_jwt=true`. Không còn endpoint truy xuất dữ liệu học sinh.
- Đã kiểm tra tệp đi kèm cuộc trò chuyện: chỉ có ảnh annotated/vẽ vòng đáp án hoặc ảnh nhỏ, không phải 32 file `capture.webp` nguyên bản; vì thế chưa sử dụng làm bằng chứng phân loại vết tẩy.
- Việc tái chạy pixel `OMR 060 vs V7` trên 32 ảnh gốc **vẫn chưa được thực hiện**, không tuyên bố đã hoàn tất. Cần xuất có xác thực theo phiên giáo viên hoặc đưa các ảnh gốc vào vùng kiểm thử riêng tư, rồi tính hash và chạy offline.
- Giữ nguyên `main`, điểm, Storage và trạng thái Draft của PR #205.
