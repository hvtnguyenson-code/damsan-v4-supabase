# OMR CAMERA GRADING ROADMAP — V1

## 0. Mục tiêu

Tích hợp chấm phiếu trả lời trắc nghiệm bằng camera điện thoại vào Đam San V4 như một module giáo viên độc lập, giữ nguyên tối đa trải nghiệm hiện tại.

Luồng nghiệp vụ mục tiêu:

1. Giáo viên tạo/trộn đề như hiện tại.
2. Xuất đề bản in từ chính bộ đề vừa trộn.
3. Đẩy chính bộ đề đó vào một hoặc nhiều phòng thi như hiện tại.
4. Học sinh làm bài trên phiếu trả lời trắc nghiệm chuẩn Bộ GDĐT.
5. Giáo viên mở module **Chấm phiếu**, chọn phòng thi, bật camera và quét phiếu.
6. OMR đọc SBD, mã đề và câu trả lời.
7. V4 đối chiếu với đúng mã đề trong phòng và dùng logic chấm điểm canonical của V4.
8. Giáo viên xác nhận kết quả.
9. Điểm được ghi vào kết quả hiện tại của phòng.
10. Giáo viên tiếp tục dùng **Bảng điểm & Thống kê** và chức năng xuất điểm hiện có, không có một hệ thống bảng điểm OMR riêng.

## 1. Nguyên tắc UX bắt buộc

- Không thay đổi luồng tạo đề/trộn đề hiện tại nếu không thật sự cần thiết.
- Không biến OMR thành một hệ thống cấu hình phức tạp.
- Không thêm package/revision/hash/mapping/pipeline vào giao diện giáo viên ở giai đoạn đầu.
- Chức năng mới xuất hiện như một module riêng, ưu tiên một nút rõ ràng: **CHẤM PHIẾU**.
- Giao diện mặc định phải theo luồng: **Chọn phòng → Bắt đầu quét → Kiểm tra → Xác nhận → Quét phiếu tiếp theo**.
- Không tự động ghi điểm ngay khi camera vừa nhận phiếu ở phiên bản đầu.
- Khi có ô nghi ngờ, mã đề không hợp lệ, SBD không khớp hoặc dữ liệu thiếu, hệ thống phải dừng và yêu cầu xác nhận.
- Bảng điểm hiện tại tiếp tục là nơi duy nhất để xem, thống kê và xuất điểm.

## 2. Phiếu chuẩn

Phiên bản đầu chỉ hỗ trợ **một mẫu phiếu chuẩn 18–4–6 theo layout của Bộ GDĐT**.

Yêu cầu:
- Khổ A4.
- Có các mốc định vị để hiệu chỉnh phối cảnh.
- Có vùng SBD.
- Có vùng mã đề.
- Phần I: 18 câu A/B/C/D.
- Phần II: 4 câu × 4 ý Đúng/Sai.
- Phần III: 6 câu trả lời ngắn.
- Phần III phải biểu diễn được các giá trị dạng số, dấu âm và dấu phẩy thập phân theo cấu trúc đề hiện hành.
- Engine phải được calibration theo đúng hình học của mẫu phiếu đã chốt.
- Không đặt mục tiêu đọc mọi loại phiếu ngoài thị trường trong giai đoạn đầu.

APK StarMind Exam chỉ được dùng làm implementation reference cho OMR/camera/template. Không mặc định sao chép nguyên mã nguồn nếu chưa xác minh license.

## 3. Giả định dữ liệu đã được kiểm chứng

Phòng thử nghiệm **TEST_OMR** đã xác nhận luồng hiện tại có thể giữ đồng nhất đề bản in và đề trong phòng:
- Mã đề: 444, 445, 446, 447.
- Mỗi mã: 18 câu Phần I + 4 câu Phần II + 6 câu Phần III.
- Bản Word/đáp án và dữ liệu canonical trong DB khớp về mã đề, thứ tự câu, phương án và đáp án.
- Điều kiện vận hành: sau khi đã xuất bản in, không bấm **Quét & Trộn** lại trước khi đẩy bộ đề đó vào phòng, vì random shuffle có thể sinh lại nội dung với cùng mã đề.

Do đó giai đoạn OMR đầu tiên không cần xây lại kiến trúc Exam Package.

## 4. Nguyên tắc Git/merge — HARD RULE

Đây là quy tắc bắt buộc cho toàn bộ OMR-01 → OMR-05.

### 4.1 Không merge task trung gian vào main

- OMR-01, OMR-02, OMR-03, OMR-04 tuyệt đối không merge vào `main`.
- Không deploy production từ các task trung gian.
- Không thay đổi hành vi production của học sinh hoặc giáo viên trong các task trung gian.

### 4.2 Chuỗi nhánh tuần tự tích lũy

Mỗi task làm trên một nhánh riêng, nhưng nhánh tiếp theo phải được tạo từ **HEAD cuối cùng đã nghiệm thu của task trước**, tức là mô phỏng chính xác trạng thái giả định “main đã merge task trước”.

Topology bắt buộc:

```
main
  └── feat/omr-01-core-template
        └── feat/omr-02-room-binding
              └── feat/omr-03-v4-grading
                    └── feat/omr-04-result-write
                          └── feat/omr-05-batch-ux
```

Ý nghĩa:
- `feat/omr-02-room-binding` phải branch từ commit cuối đã nghiệm thu của `feat/omr-01-core-template`.
- `feat/omr-03-v4-grading` phải branch từ commit cuối đã nghiệm thu của OMR-02.
- Tương tự cho OMR-04 và OMR-05.
- Không rebase mỗi task trở lại `main` giữa chừng nếu việc đó làm mất trạng thái tích lũy.
- Mỗi task phải giữ được toàn bộ thay đổi đã nghiệm thu từ task trước.

### 4.3 Merge production chỉ một lần

Chỉ khi OMR-05 hoàn tất và toàn bộ acceptance/regression tests xanh:
- mở **một PR duy nhất** từ nhánh cuối `feat/omr-05-batch-ux` vào `main`;
- review toàn bộ diff tích lũy OMR-01 → OMR-05;
- CI xanh;
- merge đúng một lần;
- sau merge mới cho phép production deploy.

Nếu OMR-05 chưa đạt, không được merge một phần vào `main`.

### 4.4 Rollback

- Trước merge cuối, ghi lại HEAD của `main`.
- Final PR phải có rollback note rõ ràng.
- Nếu production có lỗi nghiêm trọng sau merge, rollback toàn bộ OMR bằng cách revert final merge commit hoặc quay lại HEAD trước OMR.
- Không rollback từng task rời rạc trên production vì production chỉ nhận một merge tổng.

## 5. Task OMR-01 — Phiếu chuẩn + OMR Core + Camera Lab

### Mục tiêu
Dựng engine nhận dạng độc lập, chưa chạm dữ liệu thật.

### Phạm vi
- Chốt mẫu phiếu 18–4–6 theo layout Bộ GDĐT.
- Camera trên điện thoại.
- Crop/guide.
- Nhận marker.
- Hiệu chỉnh phối cảnh/homography.
- Đọc SBD.
- Đọc mã đề.
- Đọc P1/P2/P3.
- Confidence + uncertain cells.
- Trang thử nghiệm/Lab độc lập.

### Không được làm
- Không ghi DB.
- Không chấm điểm chính thức.
- Không tạo kết quả phòng.
- Không thay đổi luồng thi học sinh.

### Acceptance
- Quét được phiếu rõ trong nhiều góc nghiêng hợp lý.
- Đọc đúng cấu trúc 18–4–6.
- Hiện rõ các ô nghi ngờ.
- Có test bằng phiếu in thật trên nhiều ảnh/thiết bị trước khi nghiệm thu.

## 6. Task OMR-02 — Kết nối phòng thi ở chế độ read-only

### Mục tiêu
Ghép dữ liệu OMR với dữ liệu phòng nhưng chưa ghi điểm.

### Luồng
```
Chọn phòng
→ tải danh sách học sinh
→ tải các mã đề canonical trong phòng
→ quét phiếu
→ ghép SBD + mã đề
→ kiểm tra hợp lệ
```

### Kiểm tra bắt buộc
- SBD thuộc đúng phòng.
- Mã đề tồn tại trong phòng.
- Cấu trúc đề phù hợp.
- Không cho đi tiếp nếu mã đề/SBD không hợp lệ.

### Không được làm
- Không ghi kết quả.
- Không sửa điểm.
- Không tạo submission thật.

## 7. Task OMR-03 — Chấm bằng logic canonical của V4

### Mục tiêu
OMR chỉ cung cấp câu trả lời; V4 là nguồn chấm chính thức.

### Nguyên tắc
- Không viết một scoring engine riêng biệt nếu có thể dùng logic hiện tại.
- Answer key phải lấy từ đúng mã đề canonical của phòng.
- Điểm P1/P2/P3 phải tuân theo assessment_type/scoring_config hiện có.

### UX
Hiện preview:
- Học sinh.
- SBD.
- Mã đề.
- Điểm từng phần.
- Tổng điểm.
- Ô nghi ngờ.
- Nút Sửa/Xác nhận.

### Không được làm
- Chưa ghi kết quả chính thức vào bảng điểm.

## 8. Task OMR-04 — Ghi kết quả vào hệ thống hiện tại

### Mục tiêu
Sau xác nhận, kết quả OMR trở thành kết quả bình thường của phòng thi.

### Yêu cầu
- Ghi vào luồng canonical hiện tại, không tạo bảng điểm OMR riêng.
- Bảng điểm & Thống kê hiện tại phải xem được kết quả.
- Xuất điểm hiện tại phải hoạt động như cũ.
- Metadata tối thiểu cần phân biệt nguồn:
  - source = OMR
  - scanned_at
  - scanned_by
  - ma_de
- Có thể bổ sung omr_confidence / omr_reviewed nếu cần audit nhưng không làm rối UI.

### Trường hợp xung đột
- Nếu học sinh đã có điểm online: không tự ghi đè.
- Nếu đã có kết quả OMR: cảnh báo trùng.
- Mọi ghi đè phải cần xác nhận rõ.

## 9. Task OMR-05 — Chấm liên tục + UX hoàn thiện + hardening

### Mục tiêu
Tối ưu cho 30–40 bài liên tục.

### Luồng cuối
```
Chọn phòng
→ Bắt đầu chấm
→ Quét phiếu 1
→ Xác nhận
→ Lưu
→ camera tự sẵn sàng cho phiếu 2
→ ...
```

### Tính năng
- Chống quét trùng học sinh.
- Cảnh báo bài đã có kết quả.
- Tiến độ đã chấm/còn lại.
- Xem lại phiếu vừa chấm.
- Quét tiếp nhanh.
- Recovery khi camera/browser lỗi.
- Không mất kết quả đã xác nhận.
- Kiểm thử trên Android; kiểm tra khả năng Safari/iOS nếu camera API cho phép.
- Regression toàn bộ luồng giáo viên/học sinh liên quan.

### Gate cuối
Chỉ khi OMR-05 hoàn chỉnh mới được mở final PR vào main.

## 10. Final acceptance trước merge main

Final branch phải chứng minh đồng thời:
- Luồng tạo/trộn/xuất/đẩy đề cũ không bị thay đổi theo hướng xấu.
- Phiếu chuẩn đọc ổn định.
- SBD/mã đề ghép đúng phòng.
- P1/P2/P3 được đọc và chấm đúng.
- Kết quả OMR xuất hiện đúng trong Bảng điểm & Thống kê.
- Xuất điểm hoạt động bình thường.
- Không ghi đè bài online ngoài ý muốn.
- Không ảnh hưởng student runtime.
- Không deploy production trước khi final PR merge.
- Có rollback toàn bộ OMR rõ ràng.

## 11. Quy tắc tiếp tục ở chat mới

Khi chat hiện tại bị đầy hoặc chuyển phiên, trước khi làm OMR phải:
1. Đọc file này.
2. Xác minh `main` hiện tại.
3. Xác minh nhánh OMR gần nhất và HEAD cuối đã nghiệm thu.
4. Không tạo task tiếp theo từ `main` nếu task trước đã có commit nghiệm thu; phải branch từ HEAD của task trước.
5. Không merge vào main trước OMR-05.
6. Không thay đổi phạm vi/UX nếu chưa có quyết định mới của chủ dự án.

## 12. Trạng thái triển khai cập nhật 2026-11-05

- Quy trình: CHỐT.
- OMR-01: ĐÃ CODE — template BGD 2025 18–4–6, OMR core, camera/file lab, synthetic geometry test.
- OMR-02: ĐÃ CODE — room/student/exam binding read-only, hỗ trợ mã phiếu 4 số như 0444 ghép mã DB 444.
- OMR-03: ĐÃ CODE — preview grading mirror đúng canonical grader V4.
- OMR-04: ĐÃ CODE TRÊN NHÁNH — staff-confirmed canonical write RPC; migration CHƯA APPLY vào production DB; không ghi thẳng ket_qua; khóa trường + môn; không tự ghi đè kết quả.
- OMR-05: ĐÃ CODE — một nút Chấm Phiếu riêng, camera/chọn ảnh, chỉnh đáp án, review ô nghi ngờ, xác nhận thủ công, batch scan.
- Final branch: `feat/omr-05-batch-ux`.
- Final PR: **#153**, trạng thái **DRAFT / CHƯA MERGE**.
- OMR Camera Grading CI: GREEN tại code commit `23734374d78a9dbe912dbbecdcee72ed4e30d1e3`.
- Submission Safety CI: GREEN tại cùng code commit.
- Production `main`: CHƯA CÓ OMR.
- Supabase production: CHƯA APPLY migration OMR.
- Deploy production: CHƯA THỰC HIỆN.

### Gate còn lại trước merge main

BẮT BUỘC nghiệm thu bằng phiếu 18–4–6 in thật và camera điện thoại thật:
1. ảnh thẳng, nghiêng và ánh sáng thông thường;
2. SBD và mã đề (đặc biệt 0444 ↔ 444);
3. P1/P2/P3 với mức tô thực tế;
4. ô bỏ trống, tô đôi, tô nhạt;
5. sửa thủ công + xác nhận ô cảnh báo;
6. một lượt test ghi điểm có kiểm soát sau khi migration được áp dụng trong môi trường nghiệm thu phù hợp.

Không được mark PR ready hoặc merge main trước khi gate này đạt.
