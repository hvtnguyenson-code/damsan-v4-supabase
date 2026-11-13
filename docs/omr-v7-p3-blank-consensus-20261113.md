# OMR V7 — xử lý nhầm ô trống Phần III (13/11/2026)

## Căn cứ
- Ảnh chụp màn hình PWA: V6 và V7 (khi đó kế thừa V6) đều cảnh báo P3.1.2 dù ảnh phiếu giấy trực quan cho thấy Câu 1 Phần III không được tô.
- Ảnh giấy gốc từ cùng phiếu không phải đúng khung hình camera đã đọc trong PWA. Đã nắn phối cảnh một lần để đo tín hiệu, không thể khẳng định đã tái hiện đúng cảnh báo.
- Dữ liệu đo được ở Câu 1 (4 vị trí số) có top-score [0.1044, 0.1388, 0.1168, 0.1068] và mức tô tâm [0.3333, 0.4154, 0.3906, 0.3438], độ chênh top/second rất nhỏ, tương thích với nền in/giấy không đều. Không đưa ảnh học sinh hoặc dữ liệu định danh vào Git.

## Cách sửa trong nhánh nghiên cứu
- Giữ nguyên toàn bộ `omr-reliability-v6.js`, bản sao `omr-reliability-v7-baseline.js`, thuật toán V5/V6, DB, RPC và PWA.
- Chỉ thêm `tryRecoverUniformBlank` vào mô-đun cộng thêm `omr-v7-numeric.js`.
- Chỉ xét khi 1 trong 4 vị trí số là REVIEW với lý do thiếu bằng chứng phân biệt nét tô/vết tẩy, 3 vị trí còn lại đã được V6 đánh giá BLANK; câu số hiện là '?'; hình học trong phiếu và hiệu chuẩn Phần III đạt.
- Đo lại 4 cột bằng chính `B.measureP3Columns` bản sao V6. Yêu cầu toàn bộ độ đậm thấp, mức phủ tâm thấp, không có chênh nổi bật giữa các ô, và cột REVIEW không đậm hơn ba cột BLANK xung quanh.
- Chỉ ở chế độ `experimentalRefinement:true`, mới có thể thay P3 câu đó từ '?' thành '' (bỏ trống) và loại bỏ cảnh báo vị trí tương ứng. Hai ô tô, nét tô nhẹ khác biệt, vết tẩy nổi bật, một câu có chữ số rõ, hình học chưa đạt đều bị loại khỏi điều kiện phục hồi.
- Chế độ mặc định PWA không gọi cải tiến này, giữ nguyên kết quả V6. Không tăng phiên bản PWA, không deploy, không merge.

## Kiểm chứng và giới hạn
- Test OMR 034 sử dụng số đo nét tô đã ẩn danh và mô phỏng tình huống 1 cảnh báo ở vị trí 2; thử chặn nét tô rõ, dấu tẩy và một câu có nhiều vị trí nghi ngờ.
- Test hiện tại **không chứng minh** đã hết cảnh báo trên khung hình PWA ban đầu. Cần so sánh trên ảnh camera gốc và đối chiếu thủ công trước khi bật thực tế.
- Không được tự tuyên bố V7 đạt độ chính xác cao hơn V6 chỉ dựa trên số cảnh báo giảm.

## PWA rollout for three-sheet field evaluation (13/11/2026)

- Revision \`20261113-teacher-pwa-034\` updates the existing teacher PWA and its Service Worker; no new app URL, database, RPC or deployment mechanism.
- One extra recovery asset \`teacher/omr-v7-runtime-20261113-034.js\` contains the exact canonical scan adapter + OMR teacher module. It has a genuinely new path, not merely a new query string, to bypass old installed-worker caches. The previous \`033\` bridge file is preserved for existing offline clients.
- **V7 experimental refinement (including P3 blank consensus)** remains enabled **only** for the existing **Đối chiếu V6/V7 — chỉ xem, không lưu điểm** path. The canonical V6 and save-enabled V7 path do not enable \`experimentalRefinement\`. V6 default and V5 fallback are unchanged.
- Teacher testing instructions: choose \`OMR_V7_TEST\`, tick \`Đối chiếu V6/V7\`, scan three **different** papers, photograph each original paper separately and retain the on-screen readouts. Do NOT save from compare mode; if points are to be persisted, explicitly switch to the V6 official mode and manually confirm the paper.
- PWA JS assets stay network-first, the new version is precached for offline fallback, no forced reload during an active scan.
- Regression 035 checks exact source parity for the recovery bundle, unique resource path, version synchronization and read-only safety; regression 034 checks the guarded blank decision with simulated paper metrics. No test claims end-to-end accuracy on the actual camera frame.
