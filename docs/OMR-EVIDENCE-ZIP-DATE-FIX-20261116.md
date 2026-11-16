# OMR Evidence ZIP timestamp — khắc phục ngày 30/11/1979 (16/11/2026)

## Nguyên nhân
Bộ đóng gói ZIP ở `omr/omr-evidence-export.js` ghi **0** tại hai trường thời gian DOS (offset 10/12 ở local file header và 12/14 trong central directory). ZIP cần ngày hợp lệ trong khoảng năm 1980–2107. Giá trị `0` có month=0/day=0 và một số phần mềm giải nén diễn giải thành 30/11/1979.

Đây là lỗi siêu dữ liệu ZIP, không phải thời gian tạo minh chứng trong PostgreSQL/JSON. Kiểm tra chỉ đọc `omr_artifacts` trên production cho thấy `created_at` và `evidence.created_at` đều là 16/11/2026.

## Sửa lỗi
- Ghi **cùng một thời điểm xuất ZIP theo giờ địa phương của thiết bị** vào cả local header và central directory cho mọi tệp.
- Quy tắc DOS: `date=((year-1980)<<9)|((month+1)<<5)|day`; `time=(hour<<11)|(minute<<5)|floor(second/2)`.
- Kiểm tra ngày không hợp lệ và chặn/tránh năm ngoài 1980–2107.
- Bản PWA giáo viên `20261116-teacher-pwa-044`; bundle recovery mới `teacher/omr-v7-runtime-20261116-044.js`; desktop cache v046.
- Không đổi ZIP payload, Excel, ảnh, điểm, schema, Storage hay API.

## Nghiệm thu
- OMR 049: dùng ngày cố định 16/11/2026 14:24:22, kiểm tra local+central header giống nhau cho 3 tệp; Python `zipfile` độc lập xác nhận đầy đủ tên và ngày.
- OMR 048: xuất ZIP có dữ liệu Excel/ảnh từ URL ký giả lập.
- OMR 046: Chromium dựng Excel/ZIP, tạo liên kết tải blob và kiểm tra cấu trúc.
- CI OMR và Submission Safety bắt buộc xanh; merge rồi GitHub Pages/PWA Version Sync xanh.
