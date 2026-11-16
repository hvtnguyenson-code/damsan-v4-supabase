# OMR 055 — Xóa điểm phòng thi và toàn bộ minh chứng

## Nghiệp vụ
- Nút **Xóa điểm phòng này** vẫn là một thao tác ở dashboard giáo viên.
- Khi xác nhận, xóa vĩnh viễn: điểm/chi tiết, bài nộp, phiếu OMR (cả TEST và OFFICIAL), ảnh nguồn và ảnh chấm từ bucket riêng tư, trạng thái lượt làm bài của học sinh.
- Giữ nguyên phòng, mã đề, cấu hình chấm, phân quyền và danh sách học sinh.
- Mốc `thoi_gian_mo` về NULL để từ chối ảnh chụp/biên nhận cũ; mở lại phòng tạo mốc lượt thi mới.
- Học sinh đang làm bài không được tiếp tục lượt thi cũ sau reset.

## Trật tự an toàn
1. Hiển thị xác nhận xóa vĩnh viễn, nhắc xuất Excel/PDF trước nếu cần.
2. Gọi Edge Function `omr-evidence` action `cleanup_room`, xác thực token staff, chỉ dọn hai tiền tố `test/<school>/<room>/` và `official/<school>/<room>/`.
3. Dùng Supabase Storage API `remove()` để thu hồi object thực sự, bao gồm file bị bỏ lại sau upload lỗi.
4. Chỉ sau khi kiểm tra Storage trống mới gọi RPC token-secured `rpc_reset_room_results`. SQL `FOR UPDATE` phòng, kiểm tra lại tiền tố Storage, xóa các bản ghi theo thứ tự FK.
5. Nếu dọn Storage hỏng: không gọi RPC xóa. Nếu có sự cố DB sau khi Storage đã dọn: báo lỗi, giữ metadata trong DB cho retry; không báo thành công sai.
6. Chỉ trả trạng thái success khi SQL trả success. Hiển thị số điểm, bài nộp, minh chứng và file được dọn.

## Kiểm thử
- PG17 container: hai lượt apply cùng migration; token không hợp lệ; còn Storage thì chặn xóa; simulate Storage dọn; xóa thành công, lặp lại idempotent; phòng và đề thi khác nguyên vẹn.
- JS VM: thứ tự Storage trước DB; dừng khi Storage lỗi; RPC khác không chạy cleanup; confirm và số liệu.
- Hồi quy: OMR Camera Grading + OMR Evidence Backend + Submission Safety.

## Phát hành
Triển khai migration trước khi giao diện mới được phát hành. Edge Function version 3 đã có `cleanup_room`, không thay đổi. Không thử xóa phòng thật; người dùng tự nghiệm thu lần reset tiếp theo từ UI.
