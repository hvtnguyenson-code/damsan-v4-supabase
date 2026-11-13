# OMR V7: điều tra ba phiếu thực tế ngày 13/11/2026

## Bằng chứng từ ảnh PWA người dùng cung cấp
- Mã 102: V6 báo 0 vị trí cần kiểm tra; V7 báo 3.
- Mã 108: V6 báo 1; V7 báo 22, hình học bên trong `review`.
- Phiếu thứ ba: V6 báo 5; V7 báo 30, hình học bên trong `review`.
- V7 phân loại nhiều dấu tô thực thành `?` ở phần I/II và nhiều vị trí số trống thành `review` ở P3, sau cùng không thể lưu.

## Nguyên nhân được xác nhận từ mã nguồn
- V7 P1 dùng seed hiệu chuẩn `score >= .19, fill >= .43` và từ chối `fill < .45`, trong khi V6 chấp nhận seed `score > .12, fill > .30` và kiểm tra độ tách biệt.
- V7 P3 chỉ coi một cột trống nếu `top <= background + .10*span && fill < .13`; nhiều vị trí trống có nét in nền hoặc nhiễu cao hơn ngưỡng đó, chuyển sang `?`.
- V7 coi `geometry.status='review'` là lý do yêu cầu quét lại; không tương đương nhận dạng sai vì V6 vẫn đọc nhiều câu. Không nới chốt chặn này trước khi có ảnh gốc độ phân giải cao và đo sai lệch tọa độ thực.

## Giới hạn sửa trong nhánh nghiên cứu
1. Giảm ngưỡng seed và phân loại P1/P2, ưu tiên độ tách biệt giữa các ô, nhưng vẫn giữ phạt tô hai ô và cảnh báo vết tẩy.
2. Cải tiến blank gate P3 để ô in chưa tô không gây 20+ cảnh báo; các vết tô đơn rõ được đọc. Không đoán thêm chữ số và không mượn đáp án chuẩn.
3. **Không thay đổi** cấu trúc DB, Supabase, PWA, điểm, RPC, V6, V5, logic nội bộ mốc hoặc cơ chế phát hành.
4. Thêm test 030 cho các failure mode từ ảnh PWA và chạy test 023, 024 và toàn CI như trước.

## Điều chưa thể kết luận
Ảnh đính kèm là ảnh chụp màn hình PWA có hình phiếu đã thu nhỏ, không phải ảnh gốc do camera chụp. Vì vậy bộ test mô phỏng chỉ chứng minh logic, không xác nhận V7 đã khắc phục trên ba phiếu đó.

**Không merge hoặc phát hành V7 hardening** cho đến khi có ảnh gốc từ PWA hoặc kiểm chứng lại trên phiếu thực tế bằng nhánh thử nghiệm. V6 tiếp tục là lựa chọn an toàn đang vận hành.
