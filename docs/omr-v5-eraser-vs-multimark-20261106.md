# OMR V5 — Phân biệt vết tẩy chì và tô nhiều ô

## Dữ liệu thực tế — 06/11/2026
Sau khi phát hành PWA 017, phiếu 9001 của Yến An quét ổn định; phiếu 9002 hiển thị 7,6 điểm, cảnh báo Phần II câu 1b, 1c, 2a, 2d và Phần III câu 4, cột 4. Ảnh phiếu 9002 cho thấy câu 1b, 1c, 2a có dấu tô rõ tại một ô và vết tẩy nhạt ở ô còn lại. Câu 2d có hai dấu đáng kể, cần người chấm xác minh.

Đo tâm các ô trên ảnh gốc (chênh lệch mức xám so với nền, không phải kết quả engine):
- P2.1b: nét đậm ~119; vết xóa ~33
- P2.1c: nét đậm ~127; vết xóa ~16
- P2.2a: nét đậm ~132; vết xóa ~47
- P2.2d: hai vết ~113 và ~81 — không đủ tách biệt

## Thiết kế và nguyên tắc
Không thay hình học, mẫu 18–4–6, luật tính điểm, DB, RPC, học sinh hoặc quy trình tự chụp.
1. Với Phần I và từng ý Phần II, so sánh **độ tương phản tâm ô** của lựa chọn mạnh nhất với lựa chọn thứ hai ngay trên cùng câu/ý; xem xét thêm mật độ tâm và mức mực tổng thể.
2. Nếu một ô mạnh vượt rõ các dấu mờ còn lại, **chốt ô mạnh**, không phát cảnh báo chỉ vì nét tẩy còn chút chì.
3. Nếu hai ô đều có mực thật và mức tô tương đương, trả `invalidMultiple`; câu/ý **0 điểm**, không thể sửa nhập tay để được cộng điểm.
4. Nếu hai ô có dấu đáng kể nhưng chưa chắc có phải tô đôi, trả `uncertain` và yêu cầu kiểm tra thủ công. Không tự cộng điểm cho trường hợp này.
5. Phần III dùng lại bộ hiệu chuẩn V3; thêm bằng chứng tâm thực sự sạch để phân loại một cột số còn trống thay vì báo nhầm do đường viền in.

Phân loại sử dụng một lõi bằng chứng pixel, không thêm thư viện OMR, AI hay một pipeline song song. Thời gian kiểm tra chỉ tính vài số liệu mỗi ô, không tăng chi phí nắn ảnh.

## Các kiểm thử
- OMR CORE 001: nhiều dấu tô rõ phải tính sai; tẩy nhạt của ba trường hợp 9002 tự chọn ô đậm; P2 câu 2d phải cảnh báo; bảo toàn phiếu tô chuẩn và ảnh tổng hợp 18–4–6.
- OMR EVIDENCE 009: giữ `300`, `3000`, `3009`, không biến vết mờ thành số 0.
- OMR SCORING 003: câu/ý `invalidMarks` được khóa kết quả sai, kể cả khi sửa form.
- Teacher PWA 018: đổi cache-busting để đảm bảo JS mới tải về.

Giới hạn: Các ảnh nguồn 9002 là ảnh chụp tĩnh, chưa phải các frame nguồn gốc từ camera PWA. Tỷ lệ nhận đúng và cảnh báo trên điện thoại chỉ có thể nghiệm thu bằng quét thực địa. Không tự tạo/ghi bản ghi điểm vào DB để thử nghiệm.

## Điều kiện nghiệm thu
- Phiếu 9001 vẫn được nhận toàn bộ, 10 điểm, không cảnh báo vô cớ.
- Phiếu 9002: ưu tiên nhận đúng P2 1b=S, 1c=Đ, 2a=Đ; P2 2d cần kiểm tra; Phần III câu 4 trả lời `300` không thêm số hoặc cảnh báo cho ô sạch.
- Duy trì bắt phiếu nhanh, không thay UX camera.
- Không tự merge khi CI chưa xanh; nếu nghiệm thu thực tế kém hơn có thể revert PR và nâng cache version mà không rollback DB.
