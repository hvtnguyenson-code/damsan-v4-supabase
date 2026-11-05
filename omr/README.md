# OMR module — Task 001

Đây là sandbox phát triển OMR độc lập của Đam San V4.

## Phạm vi hiện tại

- Template `MOET_TLTN_2025_18_4_6_V1` dựa trên hình học phiếu TLTN BGD 2025 gốc.
- Profile sử dụng: 18 câu Phần I, 4 câu Phần II (16 ý), 6 câu Phần III.
- SBD 8 chữ số, mã đề 4 chữ số.
- Camera/file input chạy hoàn toàn phía trình duyệt.
- Nhận 4 mốc góc, tính homography, đọc ô tô và đánh dấu mục nghi ngờ.
- `omr-lab.html` không kết nối Supabase, không ghi điểm, không gọi dữ liệu phòng thi.

## An toàn

OMR-01 không được tích hợp vào `giaovien.html`, `hoc_sinh.html` hay runtime production. Đây là lab độc lập cho đến khi hoàn tất chuỗi OMR-01 → OMR-05 và final PR được duyệt.

## Nguồn tham khảo

APK StarMind Exam do chủ dự án cung cấp được dùng để nghiên cứu cách tổ chức OMR và hình học phiếu. Module này được viết lại cho Đam San V4, không nhập backend/offline storage/login từ APK.

## Kiểm thử

Chạy:

```bash
node tests/omr_core_001_simulation.js
```

Test bao phủ:
- cấu trúc template 18-4-6;
- phép chiếu homography;
- lựa chọn ô và cờ uncertain;
- phát hiện bốn mốc góc;
- mô phỏng phiếu 1638×2339 đọc end-to-end SBD, mã đề, P1 và P2.

## Gate trước OMR-02

OMR-01 chỉ được nghiệm thu sau khi thử với phiếu in thật/ảnh camera thật và hiệu chỉnh threshold nếu cần. OMR-02 phải branch từ HEAD cuối đã nghiệm thu của OMR-01.


## Quy ước SBD V4

Phiếu Bộ có 8 cột SBD, trong khi `hoc_sinh.ma_hs` của V4 là chuỗi số cố định 6 ký tự.

Quy tắc bắt buộc:

```
SBD trên phiếu = "00" + ma_hs 6 số
```

Ví dụ `ma_hs = 001234` thì học sinh tô `00001234`.

Engine phải:
- giữ nguyên đủ 8 chữ số đọc từ phiếu;
- yêu cầu đúng định dạng `^00\\d{6}$`;
- lấy đúng 6 ký tự cuối;
- match EXACT với `ma_hs`;
- không xóa leading zero và không thử các biến thể rút gọn;
- không cho lưu nếu prefix/độ dài sai, không tìm thấy hoặc bị trùng.
