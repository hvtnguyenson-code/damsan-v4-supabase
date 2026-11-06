# OMR — Xem ảnh phiếu phóng theo 4 mốc góc (07/11/2026)

## Vấn đề
Ảnh camera sau chụp giữ toàn bộ vùng nền xung quanh tờ giấy. Canvas hiển thị giới hạn 52vh nên phiếu rất nhỏ, khó đối chiếu các vị trí cảnh báo, đặc biệt trên điện thoại.

## Thiết kế
- Camera và thuật toán nhận dạng **không thay đổi**. OMR vẫn nhận **toàn bộ ảnh gốc** rồi trả `markerCorners` tại chính độ phân giải ảnh đã nhận dạng.
- **Chỉ sau khi `scan.ok`**, lớp hiển thị tính khung bao bốn mốc TL–TR–BR–BL, cộng biên 5,5% ngang và 4,5% dọc để giữ mép giấy, giới hạn tọa độ trong ảnh.
- Kiểm tra đủ bốn tọa độ hợp lệ, kích thước vùng phiếu và diện tích tứ giác. Nếu mốc sai hoặc không hợp lệ, **giữ ảnh gốc**, không làm hỏng kết quả chấm.
- Dùng phép `drawImage` để cắt ảnh màu gốc sang canvas chỉ dành cho xem, không đưa ảnh đã cắt trở lại engine và không sửa `scan.homography`/đáp án.
- Khung xem tự tăng tới chiều cao tối đa 75dvh, giữ đúng tỷ lệ dọc trang giấy.
- Chạm ảnh hoặc **Xem chi tiết** để mở toàn màn hình; có nút +/− phóng 1×–3,2×, kéo ngang/dọc khi phóng; **Đóng** hoặc Escape để trở về màn chấm.
- Áp dụng chung cho **tự chụp**, **chụp thủ công** và **chọn ảnh**; ảnh không được tải lên máy chủ và không ghi vào database.

## Giới hạn
Bước này **cắt theo hình chữ nhật bao bốn điểm**, không nắn phối cảnh màu lần thứ hai; giữ nguyên bằng chứng ảnh thực, tránh chi phí tính toán và méo hình. Phép homography phục vụ nhận dạng vẫn chạy như trước.

## Nghiệm thu
- Test 010: tứ giác hợp lệ → ảnh dọc vừa khung, mép không bị cắt; tọa độ biên được giới hạn; tứ giác nhỏ/lỗi → giữ ảnh gốc; crop chỉ diễn ra sau nhận dạng.
- Các bộ OMR 001–009 và Teacher PWA 006–008 tiếp tục chạy trong workflow OMR hiện có.
- Nghiệm thu điện thoại: quét phiếu 9001/9002, đảm bảo điểm và cảnh báo giống bản trước, nhưng hình phiếu phóng lớn hơn rõ rệt, nút xem chi tiết hoạt động.
- Rollback: revert PR và cập nhật khóa cache Teacher PWA, không đụng DB.
