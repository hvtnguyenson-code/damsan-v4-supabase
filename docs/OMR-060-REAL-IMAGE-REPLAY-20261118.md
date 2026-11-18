# OMR 060 — Đối chứng 32 ảnh phiếu thật (18/11/2026)

**Trạng thái:** `IMAGE_REPLAY_COMPLETED / REQUIRES_IDENTITY_REVIEW`. Phạm vi chỉ nhánh `experiment/omr-v7-full-optimization-060`. Không phát hành, không merge.

## Dữ liệu và phương pháp
- 25 ảnh `capture.webp` nguyên bản tại phòng `OMR_V7_TEST`, 7 ảnh tại `OMR_V7_PRECISION_TEST`, tổng **32 ảnh / 3.113.128 byte**. Một bài Precision không có ảnh gốc được loại khỏi mẫu ảnh (nhưng điểm đã lưu không thay đổi).
- Nguồn: Supabase Storage riêng tư `omr-evidence`. Kiểm tra từng tệp là WebP RIFF và SHA-256. Ảnh chỉ dùng cục bộ; **không commit ảnh, danh sách học sinh, mã học sinh, URL ký số hoặc token** vào GitHub.
- Bản chạy đối chứng: `omr-core.js` V5, `omr-v7-candidate.js` V7, `omr-v7-pipeline-060.js`; giải mã bằng Sharp v0.35.5, Node v22.23.3. Tất cả các phép đọc dùng hình ảnh chuẩn hóa **1800px** trong kiểm thử chính; xử lý tuần tự một luồng.
- Đối chiếu từng phần với `omr_artifacts.evidence.recognized`, **không xem các giá trị cũ là đáp án đúng tuyệt đối**; riêng 3 chỉnh sửa thủ công được đối chiếu với `confirmed`. SBD được đối chiếu mã HS có thật đã gắn với artifact; mã đề được đối chiếu mã đề ở bản ghi và chuẩn hóa số 0 đầu (ví dụ `0105` = `105`).

## Kết quả định lượng

| Tiêu chí | Bộ V5/V7 cũ chạy lại | 060 nhánh nghiên cứu |
| --- | ---: | ---: |
| Phiếu V5 qua bước nhận dạng/định vị | 32/32 | Không dùng lại V5 |
| V7 candidate `ok:true` | 30/32 | — |
| 060 khớp các mốc nội bộ và định vị thành công | — | 32/32 |
| P1 khớp `recognized` đã lưu | 32/32 | **32/32** |
| P2 khớp `recognized` đã lưu | 31/32 | **32/32** |
| P3 khớp `recognized` đã lưu | 29/32 | **32/32** |
| SBD khớp bản ghi học sinh | V5: 30/32 | **30/32** |
| Mã đề khớp bản ghi (bỏ số 0 đầu) | V5: 30/32 | **30/32** |
| 060 tự chấp nhận nếu chỉ kiểm tra chất lượng ảnh và nội tại phiếu | — | 29/32 |
| 060 tự chấp nhận sau khi so thêm hồ sơ HS và mã đề | — | **27/32** |

**Không được kết luận rằng V7 cũ chỉ định vị được 30/32.** V5 định vị đủ 32/32. Hai kết quả `V7 candidate.ok=false` đều có trạng thái `geometry.status=ok`, nhưng **hiệu chuẩn mực tô Phần III thất bại**; 060 với hiệu chỉnh thử nghiệm đọc được hai phiếu và khớp kết quả tự nhận dạng đã lưu. Hai khác biệt V7/060 khác nằm tại P2 một ô và P3 một câu.

Không có sự thay đổi đáp án P1/P2/P3 nào giữa 060 và trường `recognized` trên cả 32 phiếu ở mức 1800px. Tuy nhiên, **2 phiếu V7 cũ được giáo viên chỉnh thủ công tổng cộng 3 đáp án Phần III**; 060 vẫn không tự xác minh được các chỉnh sửa đó. Không coi dữ liệu `recognized` là nhãn thực tế cho vết tẩy.

## Rủi ro SBD/mã đề cần chặn
- Mã đề không khớp hồ sơ ở **2 ảnh của cùng một trường hợp**, thuộc hai phòng; 060 đã đưa ra cảnh báo nhận dạng vùng mã đề.
- SBD không khớp hồ sơ ở **2 ảnh khác**. Bộ phân loại cũ và 060 đều đọc khác mã HS đang gắn với ảnh; chưa xác định đó là nhầm đọc hay nhầm liên kết bản ghi.
- Một ảnh khác có cảnh báo **hai dấu tô tại một vị trí SBD**, dù số đọc ra trùng hồ sơ.
- Tổng cộng 5 ảnh có vấn đề về chất lượng/binding danh tính. Cơ chế 060 sau sửa chỉ tiếp tục tự động cho **27/32**, giữ lại 5 ảnh để xác minh. Không tự sửa danh tính theo DB và không ghi điểm.

## Quan sát độ phân giải và tốc độ
- Chạy thử ở độ dài chuẩn hóa **1500px** làm 060 khác `recognized` tại **4 vị trí Phần III**; **1800px** cho kết quả khớp 32/32. Nhánh 060 nay đặt mức tối thiểu 1800px, dù bên gọi yêu cầu 1300/1500px.
- Trên máy Windows dùng để kiểm thử, tổng thời gian xử lý thuật toán cho 32 ảnh: V5 ≈ **3,65 giây**, V7 riêng ≈ **3,88 giây**, 060 ≈ **4,07 giây** (một lần chạy kiểm chứng). Tổng V5+V7 ~7,53 giây so với 060 ~4,07 giây, cho thấy tiềm năng giảm xử lý lặp trong cùng điều kiện. **Chưa đo thời gian camera, mạng, lưu minh chứng hoặc tốc độ PWA trên điện thoại**; không tuyên bố tốc độ thực tế tăng 46%.
- Bản 060 vẫn có cờ `readOnly:true` / `validForSave:false`; không tồn tại đường gọi lưu điểm.

## Các thay đổi có bằng chứng được chốt **chỉ trên nhánh 060**
1. Cố định tối thiểu **1800px** để tránh hồi quy Phần III.
2. Cho phép truyền **`expectedStudentCode` / `expectedExamCode`** từ hồ sơ đã gắn để đối chiếu; **không bao giờ tự suy luận/sửa dấu tô**. Không trùng hồ sơ ⇒ `SBD_BINDING` / `MADE_BINDING`, `ok:false`, `requiresRetake:true`.
3. So sánh mã số danh tính có chuẩn hóa số 0 đầu.
4. Có bộ chạy lại ngoại tuyến `tests/omr_v7_replay_private_060.js`. Chỉ chạy bằng `OMR060_CORPUS_DIR` trỏ tới bộ ảnh được cấp phép và `OMR060_SHARP_PATH` nếu Sharp không cài ở nơi chạy. Không chạy trong CI vì **không đưa ảnh học sinh vào repository**.

## Bảo vệ dữ liệu và quyết định phát hành
- Endpoint đọc tạm `omr-060-audit-corpus-private` đã được **đóng bằng phiên bản chỉ trả 410** và **bật `verify_jwt=true`** ngay sau khi tải thành công; không mở bucket công khai, không thay đổi RLS/schema/điểm.
- **PR #205 giữ Draft; KHÔNG MERGE/HAY PHÁT HÀNH.** V7 chính thức vẫn nguyên trạng.
- Nghiệm thu còn thiếu: xác minh bằng mắt **5 trường hợp danh tính nghi ngờ** và **3 ô P3 từng được giáo viên chỉnh**, từ đó xác lập nhãn thực tế để đánh giá độ chính xác về nét tô/tẩy. Việc này có thể thực hiện trực tiếp trên ảnh gốc đã lưu, không cần quét mới.

Các mã phiếu đánh số trong phép thử là chỉ số nội bộ vô danh; không chứa danh tính học sinh.
