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
