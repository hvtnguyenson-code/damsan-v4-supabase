# AI-EXAM-070 — Web-AI first

Mục tiêu: đường tạo đề mặc định không được âm thầm gọi API trả phí.

## Luồng mặc định

Giáo viên chọn mã phòng, môn, khối, loại đề và phạm vi kiến thức, sau đó dùng một trong bốn nút:

- Tạo gói & mở ChatGPT
- Tạo gói & mở Gemini
- Tạo gói & mở Claude
- Tạo gói & mở AI web khác

Mỗi nút chỉ:

1. gọi `aieCreatePackage()` để tạo request + Knowledge Package + prompt chuẩn;
2. sao chép prompt vào clipboard nếu trình duyệt cho phép;
3. mở AI web tương ứng ở tab mới;
4. ghi provenance Web-AI tương ứng cho bước kiểm định sau khi giáo viên dán JSON về hệ thống.

Browser overlay 070 không được tham chiếu hoặc gọi `exam-ai-router`, `exam-ai-fragment`, `exam-ai-orchestrator`, `route_plan`, `generate_fragment`, `generate_exam_auto` hay provider/model API ids.

## API nâng cao

Control plane API vẫn được giữ riêng cho nhu cầu nâng cao. Provider/model đã lưu không được tự động sử dụng chỉ vì người dùng bấm nút tạo đề ở màn hình chính.

## Kiểm định

Sau khi AI web trả JSON, giáo viên dán kết quả về mục 3 và bấm `Gửi kiểm định đề`. Canonical server validator và bước `READY_FOR_REVIEW`/phê duyệt cuối cùng không thay đổi.
