# OMR V7 — Tích hợp vào PWA giáo viên trên nhánh nghiên cứu

## Luồng người dùng thống nhất
- Mở **PWA giáo viên → Chấm phiếu** (không URL riêng).
- Chọn phòng như trước. Trong **Thuật toán chấm và lưu điểm**, chọn V6 (mặc định), V7 (thử nghiệm) hoặc V5 (dự phòng).
- Chụp/nhập ảnh → xem nhận dạng 18–4–6 → kiểm tra cảnh báo → xác nhận → lưu vào đúng phòng thi bằng **cùng** `rpc_staff_submit_omr` hiện hữu.
- Chuyển thuật toán xóa kết quả chưa lưu và buộc quét lại. V7 không tự bật mặc định.
- Desktop không tải V7; PWA là nơi lựa chọn V7.

## Phạm vi mã và ranh giới
- Nhánh: `research/omr-v7-independent-candidate-20261112`, PR #180. **Chưa merge**, không ảnh hưởng V6 production.
- Phần III sử dụng bộ nhận dạng riêng V7: nhận các số như `300`, `3000`, `-12`, `12,3`; kiểm tra vị trí bỏ trống và tô nhiều dấu.
- Nguồn V7 giữ `readOnly:true` và `validForSave:false`; chỉ lớp `omr-scan-adapter.js` của PWA được phép chuyển ứng viên **đạt kiểm tra** thành hợp đồng scan thông thường. Không tạo RPC mới.
- V5 vẫn nhận SBD/mã đề và xác định bốn góc như V6; V7 nhận dạng đáp án P1/P2/P3.
- Không đạt hiệu chuẩn, không đủ mốc nội bộ, hoặc kết quả không hợp lệ: **không cho lưu**. Câu/ý không chắc phải xác nhận thủ công; hai ô tô rõ ở P1/P2 luôn sai 0 điểm dù giáo viên sửa ô nhập.
- `omr-result-write.js` sử dụng cùng giao dịch và metadata ghi nhận `recognition_engine: V7`.
- PWA cache phiên bản 030 thêm 2 tệp V7; không thêm deploy, không thay SQL.
- Đã xóa URL/phòng lab độc lập vì không phù hợp luồng thao tác thực tế.

## Bằng chứng kiểm thử
- `tests/omr_v7_candidate_023_simulation.js`: phân loại và hình học tổng hợp.
- `tests/omr_v7_full_024_simulation.js`: ba phần, ánh sáng, tẩy xóa, hai dấu tô và ngữ pháp số.
- `tests/omr_v7_pwa_026_simulation.js`: V7 được chọn trong PWA, cấu trúc lưu điểm chuẩn, thống nhất RPC, chặn ghi khi kết quả không an toàn, metadata V7, mặc định V6, dự phòng V5, không URL riêng.
- Hồi quy V6/V5 vẫn sử dụng CI hiện hữu. Không rerun khi xanh.

## Điều chưa chứng minh
- Không có phiếu thật mới để chứng minh V7 chính xác hơn V6 trên bóng đèn, than chì phản xạ, giấy gấp, Android cũ.
- Chưa đo tốc độ P95 trên điện thoại thật.
- **Chỉ merge khi đã đủ kiểm thử và có quyết định cho phép phát hành**. Tuy đã tích hợp thử vào PWA của nhánh, PWA đang chạy thật vẫn dùng V6/V5.

## Đối chiếu V6/V7 ngay trong PWA — 13/11/2026
- Checkbox đối chiếu ngay dưới bộ chọn thuật toán: khi PWA có V7, hai engine V6/V7 nhận đúng **một** ảnh đã căn phối cảnh; desktop không tải V7 tiếp tục đối chiếu V5/V6 như trước.
- Hiển thị sai khác từng vị trí (18 P1, 16 ý P2 và 6 câu P3), thời gian nhận dạng riêng, số vị trí cảnh báo, điểm dự kiến của từng engine nếu học sinh/mã đề hợp lệ. Không ghi điểm đối chiếu vào phòng, không có URL hoặc service riêng.
- Đối chiếu luôn đánh dấu `_labReadOnly=true`, `captureMode=compare`. Nút lưu ẩn và các lớp xác nhận/lưu điểm hiện hữu vẫn từ chối thao tác. Tắt đối chiếu hoặc chuyển engine bắt buộc xóa kết quả và quét lại.
- V6 vẫn mặc định, V7 chỉ tự chọn để chấm/lưu theo RPC gốc, V5 dự phòng. PWA cache phiên bản 031 để điện thoại nhận mã mới.
- Bổ sung bài test 027 vào CI OMR đang có. PR #180 **chưa merge**, chưa thay đổi hệ thống đang chạy.

## Phòng OMR_V7_TEST — 13/11/2026
- Đã tạo phòng tại Supabase `xcervjnwlchwfqvbeahy`, room id `7383cc9a-7817-48d4-b819-65c2c676ec31`, môn Địa lí lớp 10, đối tượng `10A4,10A5,10A6`, trạng thái `CHO_THI`, assessment `TOT_NGHIEP`.
- 8 mã `101…108` x 28 câu; đáp án được trích từ hai tệp đáp án chính thức người dùng cung cấp, gồm 18 câu P1 + 4 câu P2 + 6 câu P3; chưa có nội dung câu hỏi, vì vậy mỗi dòng có mô tả rõ "chỉ có đáp án".
- Khi giáo viên chọn **V7** và chấm/lưu trong `OMR_V7_TEST`, hai engine đọc **cùng ảnh chuẩn hóa**; V6 là đối chứng. Cùng RPC `rpc_staff_submit_omr`, không tạo bảng hay endpoint mới.
- `exam_submissions.source_metadata.omr_v7_test` chỉ được ghi sau khi giáo viên xác nhận lưu thành công, chứa kết quả dấu tô V6/V7, sai khác theo câu/ý, số cảnh báo, thời gian đọc riêng và lỗi V6 nếu có. Không chứa ảnh, tên học sinh, SBD, đáp án chuẩn hoặc token.
- Phòng khác, hoặc khi chọn V5/V6, không ghi metadata nghiên cứu. Chế độ checkbox đối chiếu V6/V7 vẫn hoàn toàn **không lưu**, do đó để gom hơn 30 mẫu trong DB hãy chọn **V7** và xác nhận lưu điểm vào `OMR_V7_TEST`.
- Độ đúng của engine cần đối chiếu các vết tô thật: V6/V7 thống nhất chưa chứng minh cả hai đều đúng; khóa đáp án chỉ cho phép kiểm tra điểm, không phải ground truth nhận dạng.
