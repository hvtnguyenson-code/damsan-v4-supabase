# OMR V7 – Đặc tả hợp nhất màn quét và xuất bảng điểm có minh chứng
**Mã:** OMR-ROOM-EVIDENCE-050 • **Ngày:** 16/11/2026 • **Trạng thái:** Đã phê duyệt yêu cầu nghiệp vụ, triển khai cô lập trước khi merge.

## Quyết định giao diện
1. Sau khi V7 nhận dạng hợp lệ, màn hình chính chỉ có **một ảnh duy nhất**: phiếu tô màu đúng/sai. Ảnh nguồn và bản đồ mốc vẫn hoạt động trong bộ máy chấm nhưng được thu gọn vào khu vực kỹ thuật và tự hiện khi cần sửa lỗi; không mất khả năng kiểm tra.
2. Dưới ảnh là tên, SBD, mã đề, điểm theo phần, số cảnh báo và ba thao tác **Xác nhận & Lưu**, **Quét lại**, **Kiểm tra/Sửa**. Khi có vị trí cần xác nhận, tự hiển thị cảnh báo và công cụ sửa; không bỏ qua chốt khóa ghi điểm.
3. Các chức năng tải JSON/ảnh, lịch sử và xuất ZIP nằm trong mục «Công cụ minh chứng» đóng mặc định, không chen giữa ảnh và thao tác chấm.
4. Nếu dựng ảnh tô màu lỗi hoặc chưa xác minh mã đề/học sinh, giao diện cho phép xem ảnh gốc và thông báo rõ. Không được hiển thị phiếu của học sinh trước.

## Định danh ảnh
- Tên tệp UTF-8 được giữ dấu tiếng Việt: **SBD - Họ tên - Lớp - MD<Mã đề> - R<revision> - <scan8>.webp**.
- Tên thật lấy từ kết quả liên kết học sinh đã được máy chủ kiểm tra, không lấy chữ HS tự nhập ở nơi không tin cậy.
- Loại ký tự cấm trên Windows, giới hạn độ dài byte UTF-8; suffix scan8 ngăn trùng khi quét lại cùng SBD/revision.
- ZIP có thư mục \`phieu-minh-chung/\` và \`doi-chieu-json/\`; Excel có cột đường dẫn tệp, không ghi signed URL có hạn.
- Giữ ngày giờ DOS hợp lệ trên local ZIP header và central ZIP directory.

## Nguồn điểm và việc ghép dữ liệu
- **Nguồn chuẩn:** điểm chính thức từ \`rpc_lay_ket_qua_phong_gv\`; chỉ sử dụng điểm đó trong cột «Điểm chính thức».
- Minh chứng đọc riêng từ Edge Function \`omr-evidence\` có xác thực phiên giáo viên và quyền phòng thi.
- Ghép theo \`student_id\` rồi đối chiếu SBD/mã học sinh; chỉ một ảnh **mới nhất** của mỗi HS trong gói mặc định; giữ toàn bộ lịch sử để tra cứu.
- Với học sinh có ảnh thử nhưng chưa có điểm chính thức: ghi «Chưa lưu điểm», không biến điểm dự kiến thành điểm thật. Điểm thử nằm cột riêng «Điểm dự kiến».
- Nếu mã đề hoặc điểm dự kiến khác điểm chính thức: gắn trạng thái «Cần đối chiếu» rõ ràng, không tự ghi đè.
- Danh sách xuất gồm **toàn bộ học sinh thuộc đối tượng của phòng**, kể cả HS chưa có bài hay chưa có ảnh. Sắp tăng theo SBD, giữ số 0 đầu; file XLSX dùng định dạng Text cho SBD.
- Nếu có nhiều hơn giới hạn mỗi gói, xuất tuần tự các ZIP có chỉ số phần rõ ràng, không làm nhiều lần tải tự động trên PWA.

## Desktop
- Ngay trong tab «Quản lý điểm phòng thi», thêm cột «Phiếu OMR» cho các hàng có ảnh.
- Chạm «Xem phiếu» mở khung xem bên phải (hoặc toàn màn hình nhỏ) mà không phải tải ZIP trước.
- Thêm nút **Xuất điểm + phiếu OMR**, tạo ZIP có Excel toàn bộ danh sách SBD, ảnh minh chứng có tên HS, JSON đối chiếu và manifest. Xuất không can thiệp điểm.
- Giữ nút «Tải Excel» hiện có; không phá luồng điểm online khác.
- Danh sách chỉ tải khi có phòng được chọn; cache theo phòng, không nhân thêm RPC trong từng chu kỳ polling.
- Không có minh chứng thì cột hiển thị «—», không chặn xem điểm.

## Bảo mật và an toàn
- Dùng danh sách và signed URL từ Edge Function hiện hữu, xác thực \`staff_token\`; không thêm service-role key vào frontend.
- Không thay đổi schema DB, chính sách RLS, bucket, Edge Function hoặc RPC ghi điểm.
- Không đưa ảnh/điểm của phòng khác; loại bỏ tên tệp chứa traversal hoặc ký tự điều khiển.
- Không thay đổi thuật toán nhận dạng V7 và luật chấm 18–4–6.
- Triển khai trên một nhánh, kiểm thử Node+Chromium và Submission Safety CI xanh rồi mới merge.

## Nghiệm thu tối thiểu
AC01 – Một khung ảnh tô màu; mở chi tiết/sửa cảnh báo được; ghi điểm vẫn khóa khi chưa xác nhận.
AC02 – Tên file chuẩn có SBD, tên Unicode chính xác, lớp, mã đề, revision, chống trùng; đọc ZIP bằng trình độc lập.
AC03 – Desktop có cột mở phiếu đúng HS, hiển thị trong panel, không lộ signed URL lâu dài.
AC04 – Excel đủ roster, sắp SBD, 2 chữ số điểm, phân biệt chính thức và dự kiến, link ảnh tương ứng.
AC05 – ZIP chứa ảnh, JSON, manifest với tên trùng Excel; toàn bộ nội dung chỉ giới hạn đúng phòng.
AC06 – Không thay đổi dữ liệu chính thức, quy trình chấm/ghi điểm và cấu trúc Supabase.
AC07 – CI/OFFLINE/Chromium xanh, PWA Version Sync + GitHub Pages thành công mới kết luận đã phát hành.
