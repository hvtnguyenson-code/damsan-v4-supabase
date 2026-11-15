# OMR V7 chính thức — phát hành PWA 039 (15/11/2026)

## Quyết định
Giáo viên chỉ chấm và lưu điểm bằng V7 trên cả PWA và giao diện máy tính. V5/V6 không còn là lựa chọn UI; mô-đun cũ giữ trong repository cho khả năng mở phiên PWA đang chạy và hồi quy lịch sử, không có đường chọn để chấm chính thức.

## Mã nguồn
- `omr/omr-teacher-module.js`: khóa một đường ghi V7, không phục hồi scan V5/V6 hoặc compare. Nếu V7 chưa nạp đủ thì vô hiệu hóa camera và chọn ảnh, không tự fallback.
- Nhánh V7 chính thức gọi `V7.analyzeValidatedRectified(rect,T.template,null,{experimentalRefinement:true})` — cùng chuỗi hiệu chỉnh mốc, ánh sáng, Phần III thưa mẫu đã được dùng ở chế độ đối chiếu.
- `E.fromV7` chuẩn hóa sang cấu trúc hiện có. `S.previewScan` và `W.submitConfirmed` tiếp tục xử lý chấm và lưu, không RPC mới.
- Chỉ lưu nếu `recognitionEngine==='V7'`, `captureMode==='v7'`; chặn `_labReadOnly`, `_requiresRetake`, kết quả thiếu SBD/mã đề/học sinh, dấu tô không chắc chưa xác nhận, ghi đè/conflict.
- Trên kết quả V7, bản đồ định vị được hiển thị để quan sát, không tự lưu điểm.
- `giaovien.html`: nạp đầy đủ thư viện V7 giống PWA.
- PWA `20261115-teacher-pwa-039`, bridge `teacher/omr-v7-runtime-20261115-039.js`; không xóa asset cũ đang được PWA cũ sử dụng.

## Giới hạn kiểm chứng
Ba ảnh do giáo viên thử là cơ sở nghiệp vụ để chọn V7; chưa có bộ ảnh và nhãn đáp án độc lập để định lượng độ chính xác. Kiểm thử tự động chứng minh luồng lưu điểm, các chốt an toàn và tải đúng mô-đun, **không phải** bằng chứng V7 đúng với mọi phiếu.
