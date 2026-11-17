# OMR 057 — Minh chứng chính thức cho mọi phòng thi

## Quy tắc vận hành
- Bỏ hoàn toàn giới hạn 200 **bản ghi minh chứng TEST**; không thay bằng ngưỡng số học sinh tùy tiện.
- Giữ `OMR_V7_TEST` ở `mode=test`, để duy trì khả năng xem và đối chiếu 25 phiếu thử cũ.
- Mọi phòng thi V7 khác ghi `mode=official` vào bucket private `omr-evidence`.
- Một học sinh trong một phòng chỉ có **một bản ghi minh chứng cuối cùng**, lưu đúng hai ảnh (`capture` và `annotated`), dữ liệu đáp án, điểm và vị trí giáo viên sửa; đã có unique index `omr_artifacts_one_final_per_student(room_id,student_id)` từ OMR 056.
- Khi giáo viên xem/chỉnh đáp án, ảnh chỉ dựng trên canvas cục bộ. **Chỉ sau khi** `rpc_staff_submit_omr` trả `success` và `submission_id`, frontend mới gửi ảnh lên Edge Function.
- Edge Function `omr-evidence` chỉ nhận `official` khi phiên staff hợp lệ, trường/phòng/môn/học sinh hợp lệ, bài nộp OMR ở trạng thái `graded`, cùng giáo viên, đúng `submission_id`, mã đề, điểm và cả 28 đáp án; không tin điểm client đơn lẻ.
- Thao tác `Xóa điểm phòng thi` và `Xóa phòng hoàn toàn` giữ nguyên chức năng dọn tệp ở cả `test` / `official` qua Storage API đã phát hành tại OMR 054/055.
- Giáo viên xem danh sách minh chứng và xuất ZIP (Excel + PDF từng học sinh) trong chính phòng đang chọn, không bị giới hạn vào phòng thử.

## Bảo vệ Supabase Free
- Bucket `omr-evidence` vẫn **private**, `MAX_IMAGE=1_500_000 bytes` mỗi ảnh, MIME WebP/JPEG; không nới hạn mức file/bucket.
- Dung lượng Storage tiếp tục chịu giới hạn tổ chức Free 1 GB và quota thực tế; khi chạm quota hiển thị lỗi, **không xóa điểm hoặc phiếu của học sinh khác**.
- Nếu điểm đã được ghi nhưng ảnh tải lên thất bại, giữ phiếu hiện tại để người dùng bấm **Lưu lại minh chứng**, không ghi lại điểm hay chấm lại phiếu.
- Không thay đổi thuật toán nhận dạng, chấm V7, bảng điểm, trường học hoặc mã đề. Không chạy dọn tự động lên dữ liệu đang có.

## Tiêu chí nghiệm thu
1. OMR Camera Grading CI, OMR Evidence Backend CI, Submission Safety CI xanh.
2. Frontend Desktop/PWA chọn phòng bình thường, xem trước không tạo Storage object; bấm Xác nhận & Lưu mới ghi minh chứng.
3. Edge backend reject phiên sai, `mode=test` cho phòng thật, mã đề/điểm/đáp án/bài nộp không trùng; 200+ học sinh không bị chặn bởi ngưỡng nhân tạo.
4. Phòng `OMR_V7_TEST` còn nguyên 25 kết quả, 25 minh chứng, 50 ảnh; các phòng chưa chấm không bị tác động.
5. Xác minh lần đầu dùng phòng thi thật qua điều hành giáo viên; không xóa bản ghi production để diễn tập.
