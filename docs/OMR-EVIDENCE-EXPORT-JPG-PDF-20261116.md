# OMR V7 — tên tệp dễ đọc và xuất JPG/PDF (16/11/2026)

## Yêu cầu thực tế
Tệp ZIP từ phòng `OMR_V7_TEST` từng chứa các ảnh `.webp` với đuôi định danh kỹ thuật (ví dụ `c38f32d1`). Giáo viên cần nhận ra phiếu bằng SBD/họ tên/lớp/mã đề và mở/in được ngay.

## Chuẩn đầu ra
- Ảnh tải trực tiếp: JPEG `.jpg`, không tải `.webp`.
- Nút **Tải phiếu PDF**: một tệp `.pdf` A4/phiếu, ảnh tự vừa khổ trang, không cắt, có thể in.
- ZIP theo phòng: `thong-ke-omr.xlsx`, `phieu-minh-chung/*.pdf`, `anh-jpg/*.jpg`, `doi-chieu-json/*.json`, `manifest.json`.
- Tên: `100412 - H Hồng Niê - 10A4 - MD105 - L03.pdf` (L03 = lần chỉnh sửa 03).
- Nếu hai lượt quét có cùng SBD/họ tên/lớp/mã đề/lần, tự đánh thêm `- Ban02`, `- Ban03`, không chèn UUID.
- Excel liên kết vào đúng tệp PDF trong ZIP. JSON và manifest vẫn giữ `scan_id`, `revision` để tra cứu/audit.

## Giới hạn kỹ thuật và an toàn
- Supabase Storage tiếp tục lưu private WebP tiết kiệm dung lượng; chỉ chuyển đổi ảnh khi xuất/tải.
- Không thay đổi PostgreSQL, bucket, Edge Function, tính điểm, phê duyệt hay quyền.
- Không thêm thư viện bên ngoài: JPEG canvas trình duyệt; PDF đơn trang nhúng ảnh JPEG theo chuẩn PDF 1.4.
- Dữ liệu PDF/JPG chỉ nằm trong gói tải về trên thiết bị giáo viên. Các signed URL hiện tại vẫn hết hạn sau 60 giây.
- Giữ quy trình ZIP theo lô 20 phiếu để tránh quá bộ nhớ trên điện thoại.

## Kiểm thử
- OMR 052: file names tiếng Việt, không còn UUID, chống trùng bằng số phiên, PDF A4 có DCTDecode/JPEG và xref hợp lệ.
- OMR 046: xuất qua Chromium thật từ WebP thành PDF/JPG; kiểm tra magic bytes trong ZIP; tải tệp theo cử chỉ người dùng.
- OMR 048/050/051: kiểm tra luồng tải, thống kê Excel, URL, manifest và tên phiếu đúng.
- Hồi quy OMR và Submission Safety CI đều bắt buộc PASS trước merge; GitHub Pages và PWA Version Sync phải SUCCESS sau merge.
