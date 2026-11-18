# OMR 060 — Kiểm tra tranh chấp 7 ảnh thật và cổng an toàn ghi điểm

Ngày: 18/11/2026. Nhánh: `experiment/omr-v7-full-optimization-060`.

**Kết luận:** `OFFLINE_REPLAY_PASS / WRITER_MOCK_PASS / LIVE_INTEGRATION_NOT_RUN / MERGE_HOLD`.

## Phạm vi ảnh thật

Bộ mẫu là **7 ảnh WebP gốc** thuộc hai phòng OMR đã lưu. Chúng gồm 5 ảnh nghi vấn SBD/mã đề và 2 ảnh có tổng cộng 3 chỉnh sửa phần III. Đã được truy xuất có thời hạn từ bucket riêng tư, xác minh chữ ký RIFF/WEBP và SHA-256, xử lý độc lập bằng Node + Sharp trên Windows. Không đưa file ảnh, mã học sinh, khóa truy cập hay đường dẫn URL ký số vào GitHub.

Ảnh gốc được nắn về 1800 px, chạy thuật toán OMR 060 ở chế độ `readOnly=true`, `validForSave=false`, truyền đối chiếu `expectedStudentCode` và `expectedExamCode` từ bản ghi cùng minh chứng.

| Chỉ tiêu | Kết quả |
| --- | ---: |
| Ảnh truy xuất và giải mã thành công | **7/7** |
| Ảnh đủ mốc định vị, tái tạo phiếu | **7/7** |
| Đáp án I–II–III khớp bản `recognized` đã lưu | **7/7** |
| Ảnh tranh chấp danh tính bị chặn đúng | **5/5** |
| Đáp án III từng được GV sửa vẫn có cảnh báo để rà soát | **3/3** |
| Lượt ghi điểm thật trong phép thử | **0** |

### Năm trường hợp danh tính

- `precision_06`, `v7_10`: cùng dạng tranh chấp mã đề ở hai phòng; vùng mã đề cho thấy dấu tô đè/đã tẩy, trong đó một vị trí có nhiều dấu đậm. Cơ chế 060 cảnh báo, **không tự đổi mã đề theo DB**.
- `v7_03`: một cột SBD có hai dấu tô đáng kể; 060 báo `SBD.3`, yêu cầu xác minh.
- `v7_04`, `v7_13`: số được đọc trên ảnh không khớp mã học sinh gắn minh chứng. Ảnh có các ô tô cụ thể, nhưng chưa đủ bằng chứng để khẳng định học sinh tô nhầm hay bản ghi ghép nhầm. 060 chặn bằng `SBD_BINDING`; không sửa hồ sơ tự động.

**Kết luận về các trường hợp này:** 5/5 được chặn an toàn. Không nên cố giảm số cảnh báo bằng cách tự đoán mã số từ danh sách lớp.

### Ba chỉnh sửa phần III

- `v7_09 / P3.2`: giáo viên xác nhận `11`; ảnh vùng đáp án có hai dấu `1` đậm, nhưng có các dấu mờ ở cột phía sau. OMR 060 giữ cảnh báo dạng `P3.2`, không đoán thêm ký tự.
- `v7_09 / P3.4`: giáo viên xác nhận `9`; nét tô `9` rõ và một dấu mờ tại vị trí khác; OMR 060 yêu cầu rà soát `P3.4.2`.
- `v7_25 / P3.6`: giáo viên xác nhận `150`; ba dấu `1,5,0` đậm, đồng thời còn vết mờ ở cột cuối; OMR 060 cảnh báo `P3.6.4`.

Ảnh cắt vùng tô **phù hợp với các chỉnh sửa do giáo viên thực hiện**, nhưng việc đọc đúng không được chứng minh bằng cách lấy `confirmed` làm dự đoán của máy. Máy vẫn nhận `?` cho các câu trên và đề nghị giáo viên rà soát. Đây là hành vi an toàn, nhưng **chưa phải tối ưu tự động hóa triệt để**.

## Kiểm thử tầng ghi điểm và bảo toàn V7

**Điều chỉnh sau CI:** Bài thử `OMR 029` phát hiện mã nguồn trong gói phục hồi PWA cũ yêu cầu khớp byte với hai tệp V7 chuẩn. Vì vậy **không chỉnh sửa hai tệp dùng chung** `omr-scan-adapter.js` và `omr-result-write.js`. Cả hai được khôi phục chính xác blob của `main`; kiểm tra hồi quy cuối trên CI Linux.

Các chốt chặn được đặt **ngay trong `omr-v7-pipeline-060.js`**:
1. Candidate nghiên cứu có engine khác biệt `OMR060_RESEARCH_CANDIDATE` và `omr060ResearchOnly=true`. Adapter V7 chính thức hiện chỉ chấp nhận `V7_COMPLETE_CANDIDATE`, nên không thể tự nâng cấp candidate 060 thành kết quả ghi điểm.
2. Kết quả 060 gắn `readOnly=true`, `validForSave=false`, `_labReadOnly=true`, `captureMode=compare`, `recognitionEngine=V7_060`; ngay khi đặt nguyên kết quả vào preview, bộ ghi điểm V7 hiện có từ chối.
3. Hàm `toResearchScan` trong 060 kiểm tra nghiêm ngặt nguồn dữ liệu và vẫn giữ các cờ chỉ đọc. Không có chức năng gọi `staffRpc`, cấp quyền hoặc lưu kết quả.

`tests/omr_060_writer_safety_simulation.js`: **9 trường hợp không hợp lệ bị từ chối**, **2 trường hợp V7 chuẩn hợp lệ được ghi qua RPC giả**; không thực hiện bất kỳ RPC ghi thật nào. `tests/omr_v7_optimization_060_simulation.js` còn xác minh chính adapter V7 hiện hành từ chối candidate 060 có engine riêng. Bộ kiểm thử hàng đợi minh chứng 059 cũng PASS.

Bộ kiểm thử riêng `tests/omr_060_adjudication_private.js` tái lập kiểm tra 7 ảnh, yêu cầu `OMR060_CORPUS_DIR` và tùy chọn `OMR060_SHARP_PATH`; không được đưa ảnh học sinh, nhãn riêng tư hoặc khóa đọc lên GitHub. **Không chạy bài thử ảnh riêng tư trong CI công khai**.

## Điều kiện merge

**Đã đủ:** kiểm thử ảnh thật trên 32 mẫu tổng thể và 7 mẫu tranh chấp, bảo vệ danh tính, bảo vệ 3 ca hiệu chỉnh thủ công, kiểm thử lỗi ghi giả lập, CI hồi quy.

**Chưa đủ để merge như tính năng chấm chính thức:** chưa chạy tương tác giao diện có 060 được cô lập vào một phòng thử nghiệm, chưa xác nhận một lượt lưu điểm + minh chứng thật với cơ chế quyền/rollback và chưa có nghiệm thu phê duyệt. Các kiểm thử ghi ở trên là **mô phỏng, không được diễn giải là kiểm thử ghi DB thực tế**.

**Chỉ dẫn:** Giữ PR #205 ở trạng thái **Draft**, không merge, không phát hành, không sửa dữ liệu học sinh. Có thể sử dụng V7 chính thức bình thường. Phát triển nhánh 060 vẫn có đường lùi hoàn toàn.

## Bảo mật

Dịch vụ đọc ảnh có thời hạn `omr-060-adjudication-7` đã được đóng bằng phiên bản 2 trả `410 audit_closed` và `verify_jwt=true` ngay sau khi tải ảnh. Ảnh và bản kê danh tính trên máy kiểm thử phải bị xóa sau khi hoàn tất kiểm chứng; GitHub chỉ lưu bộ kiểm thử vô danh và báo cáo thống kê.
