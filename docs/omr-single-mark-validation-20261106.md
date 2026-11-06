# Đam San V4 — Quy tắc OMR một ô hợp lệ (06/11/2026)

## Quy tắc nghiệp vụ bắt buộc
- **Phần I:** một câu phải có đúng một ô A/B/C/D được tô. Hai ô hoặc nhiều hơn cùng được tô => **câu sai, 0 điểm**, không xét ô nào đậm hơn, kể cả khi một ô trùng đáp án.
- **Phần II:** áp dụng độc lập cho từng ý a/b/c/d, mỗi ý có đúng một ô Đúng/Sai. Tô cả hai => **chỉ ý đó sai**. Điểm *cả câu* vẫn tính theo số ý trả lời đúng còn lại theo thang 0; 0,1; 0,25; 0,5; 1.
- **Tẩy xóa:** chỉ kết luận tô nhiều ô khi **cả hai dấu tô** có bằng chứng mực đủ mạnh ở tâm ô và độ tương phản nền. Vết mờ còn nghi ngờ => cảnh báo, không tự gán ý định của học sinh; để giáo viên đối chiếu phiếu.
- **Phần III:** không đổi thuật toán V3 và cách ghép các cột chữ số.

## Thiết kế kỹ thuật
- Sau khi nắn ảnh chuẩn bằng 4 marker, `chooseSingleMark` xem xét tất cả ô trong mỗi dòng, dùng điểm mực cùng 2 chỉ tiêu tâm ô: `centerInk25` và `centerContrast`.
- Trường hợp khẳng định có ít nhất 2 ô tô => `invalidMultiple:true`, `index:-1`, `value:''`, xuất ký tự `?`, thêm khóa `P1.n` hoặc `P2.na` vào `invalidMarks` và thông báo đúng vị trí.
- Phân biệt nền của ô trống giữa **4 phương án ở Phần I** và **2 phương án ở Phần II** để tránh nhầm đường viền in thành dấu tẩy. Hình ảnh thật đã dùng để kiểm tra logic cục bộ, không lưu ảnh học sinh trong repository.
- `enforceInvalidMarks` tại lớp dựng bài làm khóa các câu/ý đã bị đánh dấu tô nhiều ô, kể cả khi giáo viên sửa ô nhập liệu. Ký tự `?` không trùng đáp án đúng trong quy trình chấm điểm client và canonical server; không sửa SQL/RPC.
- `source_metadata` bổ sung `invalid_multiple_marks` và cờ `to_nhieu_o` để truy vết. Không migration, không đổi phiếu giấy.
- Giao diện giáo viên hiển thị rõ các vị trí bị tính sai, đánh dấu trường dữ liệu, đồng thời giữ cơ chế tự chụp và xác nhận trước khi lưu.

## Đối chiếu trên phiếu tham chiếu
Ở ảnh mẫu **9001**, không có dòng Phần I/II nào đạt điều kiện kết luận tô hai ô, tránh cảnh báo sai do viền in. Ở ảnh **9002**, các chỉ báo mực cho thấy Phần II **câu 1 ý b**, **câu 2 ý a**, **câu 2 ý d** là các trường hợp có hai dấu tô rõ; **câu 1 ý d** là vết còn nghi ngờ, cần kiểm tra thủ công. Đây là đánh giá ảnh chụp tĩnh theo tọa độ ước lượng, **không phải kết quả máy quét PWA mới**.

Do các đáp án trùng bị loại khỏi điểm, mức **8,75** hiển thị trước đây của 9002 không còn hợp lệ theo quy tắc một ô; nếu ba ý nói trên được máy xác nhận là tô nhiều ô, điểm dự kiến sẽ là **7,75**. Kết luận chính thức phụ thuộc lần quét lại trên phiên bản mới.

## Kiểm thử và nghiệm thu
- Core 001: marker, hình học, phiếu 18–4–6, thử tô hai ô vào Phần I và II, kiểm thử chống nhầm ô viền trống, trường hợp tẩy xóa.
- Scoring 003: một câu Phần I và từng ý Phần II bị `invalidMarks` phải 0 điểm; sửa text không thể cộng điểm lại.
- Batch UX 005: kiểm tra đường truyền `invalidMarks`, giao diện và chính sách xác nhận.
- Core 001, Scoring 003, Evidence 009, Room Binding 002, Batch UX 005 kiểm thử mô phỏng độc lập trước PR.
- Cần nghiệm thu thực địa trên cả ảnh phiếu 9001 và 9002; không bấm **Xác nhận & Lưu** trong quá trình kiểm thử.

## Rollback
Nếu bản phát hành này làm xuất hiện false-positive trên phiếu sạch, revert PR và tăng khóa cache PWA. Thay đổi chỉ thuộc web frontend OMR; không đụng dữ liệu kết quả hoặc DB.
