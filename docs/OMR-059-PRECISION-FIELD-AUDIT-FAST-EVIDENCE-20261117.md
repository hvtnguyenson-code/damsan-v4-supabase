# OMR 059 — đánh giá thực tế Precision Capture và sửa luồng lưu nhanh
Ngày 17/11/2026. Phạm vi: phòng `OMR_V7_PRECISION_TEST` duy nhất; không sửa đáp án/điểm đã nộp.

## Dữ liệu hiện có (chỉ đọc)
- Phòng thử mới: 8 bài nộp đã chấm, 8 điểm, 7 minh chứng, 1 trường hợp thiếu ảnh.
- So từng học sinh với phòng `OMR_V7_TEST`: 7/8 bằng điểm, 1 bài lệch -0,25 điểm (mã đề 106), 3 cảnh báo vết tô/tẩy tại P3.2.3, P3.2.4, P3.5.2. Không có ground truth ảnh vật lý nên không suy luận hướng nào chấm đúng.
- Trong 7 lần ảnh được lưu, từ thời điểm `graded_at` đến `omr_artifacts.created_at`: min 3,44s, median 4,90s, mean 6,59s, max 10,36s.
- Nhật kí Edge Function `omr-evidence` (14:37–14:43Z): 7 request lưu 200, thời gian thực thi 2,37–9,49s; 2 ảnh/phiếu được tải tuần tự. Một bài có điểm nhưng chưa có bằng chứng không có request POST/omr-evidence tương ứng trong cửa sổ đó. Chưa đủ bằng chứng xác định nguyên nhân phía client.
- Bộ kiểm tra hình học trước chụp không đổi thuật toán đọc mực tô, vì vậy chưa thể cải thiện nét tẩy chỉ bằng Precision Capture. Không hạ ngưỡng P3 hoặc tự thay dấu tô chưa rõ.

## Thay đổi thử nghiệm 059
1. Trong **duy nhất** phòng `OMR_V7_PRECISION_TEST`: giảm 3 xuống 2 frame ổn định và mức chuyển động tương đối 0,014 (thay 0,009). Vẫn bắt đủ 4 góc, mốc nội bộ, độ nét, sáng.
2. Một click `Xác nhận & Lưu` đủ xác nhận ở phòng thử; bỏ modal `confirm` thừa cho phòng này. Các phòng khác giữ nguyên xác nhận.
3. Sau khi ghi điểm thành công, hai ảnh minh chứng được đóng gói thành JSON và **ghi bền vững vào IndexedDB trên thiết bị theo staff + room + submission_id**. Chỉ sau khi transaction hoàn thành mới cho sang bài tiếp theo. Tải Edge Function ở nền, tuần tự để tránh quá tải, tự thử lại trên mở phòng hoặc khi có mạng trở lại.
4. Nếu xếp hàng lỗi, **không** chuyển sang bài tiếp theo; hiện `Lưu lại minh chứng` để dùng luồng trực tiếp, không gửi lại điểm. Nếu tải nền thất bại, hiển thị số ảnh chờ và nút `Thử tải lại minh chứng`; không xóa yêu cầu cũ.
5. Báo cáo minh chứng phòng thử bổ sung `eraser_diagnostic_v1` cho P3: chỉ lưu vị trí nghi ngờ, top/second, tỷ lệ tô, ngưỡng hiệu chuẩn. Mục đích đủ dữ liệu nghiên cứu nét tô/tẩy sau vòng thử mới, **không tự đổi điểm**. Không thay schema DB, RPC, Edge Function hay Storage.
6. Mọi phòng khác tiếp tục quy trình hiện tại, không bật queue hoặc giảm ngưỡng camera.

## Điều kiện và giới hạn
- Không tuyên bố Storage API xử lý nhanh hơn: hàng đợi giảm thời gian **chờ của giáo viên** sau khi ghi điểm; thời gian mạng vẫn phụ thuộc Supabase.
- Không tự giải quyết vết tẩy đáng ngờ khi chưa có ảnh gốc và đáp án do người kiểm tra xác nhận. Trường hợp mã 106 là mẫu cần kiểm tra thực tế trước khi nâng cấp phân loại.
- IndexedDB có giới hạn 40 minh chứng chờ; không tự xóa để giải phóng quota. Nếu không có IndexedDB, thông báo và yêu cầu lưu trực tiếp.
- Khi tiếp tục kiểm thử, theo dõi cột minh chứng chờ và kiểm tra đối chiếu từng học sinh sau khi đồng bộ. Mọi lỗi có thể thử lại mà không ghi trùng điểm.
- Kiểm thử Node 059 + toàn bộ CI OMR/PWA; giữ nguyên dữ liệu hai phòng.
