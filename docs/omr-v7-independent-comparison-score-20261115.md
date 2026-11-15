# OMR V7 — tính điểm đối chiếu độc lập V6 (15/11/2026)

## Vấn đề được quan sát
Phiếu 100434 / mã đề 103: V6 không hiệu chuẩn Phần III (24 cảnh báo); V7 sparse-p3 đọc được 2 đáp án 175 và 15, phần còn lại bỏ trống. UI cũ chỉ tính điểm từ \`state.lastPreview\` của \`reviewCurrent()\` dựa trên V6, nên V6 không đạt đã chặn cả điểm V7.

## Thay đổi
- \`omr/omr-v7-lab-score.js\`: mô-đun thuần, **chỉ đọc**, nhận candidate + scan gốc + model phòng + các API hiện có; bắt buộc:
  - Scan phải là ảnh hợp lệ, \`_labReadOnly=true\`, \`captureMode='compare'\`.
  - SBD/mã đề phải được tìm đúng và duy nhất bằng \`B.bindScan\` từ phòng đang chọn.
  - Đầy đủ cấu trúc đáp án 18–4–6, hình học mốc trong đạt, hiệu chuẩn P1/P2 và P3 của **chính candidate** đáng tin cậy.
  - Candidate V7 còn phải giữ \`readOnly=true\`, \`validForSave=false\`, \`ok=true\`, \`requiresRetake=false\`, \`retakeReasons=[]\`.
- Điểm dự kiến V6 và V7 được tính **độc lập** qua \`S.previewScan\` cùng đề đáp án; không phụ thuộc \`state.lastPreview\` do V6 sinh ra.
- V6 bị loại vì hiệu chuẩn không đủ thì hiện rõ lý do, nhưng V7 vẫn có điểm thử nghiệm nếu tự đạt chốt chặn. Nếu V7 cảnh báo dấu tô, hiển thị số vị trí cần kiểm tra; mọi điểm đều chỉ tham khảo, không lưu.
- Giữ bất biến \`omrSave\` ẩn, \`rpc_staff_submit_omr\` chặn compare mode, V6 mặc định, V5 dự phòng, V7 save-enabled không bật nghiên cứu.
- PWA \`20261115-teacher-pwa-038\` và tệp recovery mới \`teacher/omr-v7-runtime-20261115-038.js\`; giữ các bundle lịch sử để không làm gián đoạn PWA cũ. Không DB / schema / server RPC / deployment workflow mới.

## Hồi quy
- OMR 040: fixture Phiếu 100434/mã 103, V6 24 cảnh báo P3 hiệu chuẩn false, V7 hai đáp án (175, 15) và 4 bỏ trống; xác minh điểm từ đề đối chứng sinh tổng hợp.
- 12 điều kiện từ chối: không bật compare, SBD giả, mã đề giả, giấy không đạt, marker không đạt, p3 / p1 calibration fail, candidate unsafe, model cấu trúc sai.
- Hồi quy V6+V7 lưu điểm vẫn giữ chốt chặn và không ghi từ lab.
- Không coi điểm fixture là điểm thực tế phiếu 100434: đáp án đúng trong test là dữ liệu **giả lập**; PWA sử dụng đáp án thật đã lưu ở phòng để tính.
