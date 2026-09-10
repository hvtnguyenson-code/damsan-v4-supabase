# 037 — Chuẩn sinh đề Địa lí TNTHPT 2025+

## Mục tiêu

`DIA_LI_TNTHPT_2025_PLUS_V1` là profile khảo thí dành cho Địa lí. Profile tách **tri thức nội dung** (SGK/YCCĐ/tài liệu giáo viên đã duyệt) khỏi **tri thức khảo thí** (cấu trúc và kỹ thuật ra câu hỏi). AI chỉ được lấy nội dung từ Knowledge Pack đang được chọn; corpus đề thi chỉ dùng để học cách đặt câu hỏi, không phải nguồn kiến thức để sao chép.

## Thứ tự thẩm quyền

1. Quy định cấu trúc/định dạng của Bộ GDĐT — chuẩn cứng.
2. Đề tham khảo chính thức của Bộ GDĐT từ năm 2025 — chuẩn phong cách chính.
3. Đề thi chính thức tốt nghiệp THPT — benchmark thực chiến.
4. Đề thi thử của Sở GDĐT — benchmark phụ để mở rộng mẫu; không được ghi đè chuẩn Bộ.
5. Đề trường THPT/chuyên có chất lượng — chỉ tham khảo kỹ thuật, không có thẩm quyền quy định.

## Nguồn chuẩn đã khảo sát

- Cục Quản lý chất lượng, Bộ GDĐT — cấu trúc định dạng đề thi tốt nghiệp THPT từ năm 2025: https://vqa.moet.gov.vn/vi/news/thong-bao/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-74.html
- Cục Quản lý chất lượng, Bộ GDĐT — đề thi tham khảo Kỳ thi tốt nghiệp THPT từ năm 2025: https://vqa.moet.gov.vn/vi/news/tin-tuc-su-kien/de-thi-tham-khao-ky-thi-tot-nghiep-thpt-tu-nam-2025-159.html
- Sở GDĐT Đắk Lắk — tổ chức thi thử tốt nghiệp THPT năm 2025: https://daklak.edu.vn/dak-lak-to-chuc-thi-thu-tot-nghiep-thpt-nam-2025.html
- Corpus đề thử Địa lí 2025 của các Sở Hà Tĩnh, Bà Rịa–Vũng Tàu, Hà Nội, Hòa Bình, Bình Phước được dùng làm benchmark phụ; nguồn tổng hợp chỉ là chỉ mục, không phải authority.

## Blueprint Bộ dùng cho một đề Địa lí đầy đủ

- Thời gian: 50 phút.
- Phần I: 18 câu trắc nghiệm nhiều lựa chọn, 0,25 điểm/câu, tổng 4,5 điểm.
- Phần II: 4 câu Đúng/Sai, mỗi câu 4 nhận định. Chấm 1/2/3/4 ý đúng tương ứng 0,1/0,25/0,5/1,0 điểm; tổng tối đa 4,0 điểm.
- Phần III: 6 câu trả lời ngắn, 0,25 điểm/câu, tổng 1,5 điểm.

Số câu thực tế của một bài luyện rút gọn vẫn do `authoritative_exam_spec.counts` quyết định; profile này áp dụng kỹ thuật ra câu hỏi ngay cả khi số câu nhỏ hơn blueprint đầy đủ.

## Pattern rút ra từ đề tham khảo Bộ

### Phần I

- Stem thường ngắn, tập trung một yêu cầu nhận thức.
- Bốn phương án cùng phạm trù; phương án nhiễu không được vô lí hoặc lạc chủ đề.
- Câu thông hiểu/vận dụng yêu cầu nhận xét, giải thích, quan hệ nhân quả hoặc xử lí thông tin; không chỉ đổi chữ từ SGK.
- Tránh dấu hiệu lộ đáp án như đáp án đúng dài bất thường, lặp nguyên từ khóa của stem hoặc dùng từ tuyệt đối chỉ xuất hiện ở phương án sai.

### Phần II

Mỗi câu là **một cụm stimulus + bốn nhận định**. Đề tham khảo Bộ sử dụng cả đoạn thông tin và biểu đồ/bảng số liệu. Bốn nhận định không phải bốn câu nhớ máy móc rời nhau: có nhận định khai thác trực tiếp stimulus và có nhận định cần giải thích, suy luận hoặc tính toán. Các nhận định phải tương đối độc lập và mỗi ý phải xác định Đ/S rõ ràng.

Quality gate 037 bắt buộc:

- `noi_dung` phải đủ dài để đóng vai trò stimulus;
- A/B/C/D là bốn nhận định khác nhau;
- pattern đáp án không được cả bốn cùng Đ hoặc cả bốn cùng S;
- có `muc_do`, `bai_hoc`, `source_refs`, `loi_giai`.

### Phần III

Đề tham khảo Bộ dùng bài toán định lượng với dữ liệu đủ trong câu/bảng, một kết quả số duy nhất và chỉ dẫn làm tròn rõ. Các dạng quan sát được gồm biên độ nhiệt, tổng/chênh lệch lượng mưa, mật độ dân số, năng suất, tỉ trọng và cơ cấu dân số.

Quality gate 037 bắt buộc:

- `dap_an_dung` là một số;
- stem có dữ liệu số;
- có chỉ dẫn làm tròn/độ chính xác;
- `loi_giai` đủ để kiểm chứng phép tính;
- không lấy số liệu ngoài Knowledge Pack.

## Chính sách prompt

Prompt compiler phải:

- dùng `exam_spec` do server trả về làm authoritative spec, không dùng bản local nếu server đã enrich;
- đưa `assessment_standard` vào Knowledge Package;
- cấm model knowledge ngoài nguồn;
- yêu cầu AI tự audit từng câu trước khi xuất JSON;
- cấm sao chép câu chữ/dữ liệu từ benchmark nếu benchmark không nằm trong content Knowledge Pack;
- yêu cầu output duy nhất `DAMSAN_EXAM_V1`.

## Server quality gate

Migration 037 gắn profile theo `mon_hoc.ten_mon` ở server; client không được tự gắn profile cho môn khác. `rpc_ai_exam_store_draft_service` chạy `_ai_exam_quality_gate_037` trước khi lưu draft. Gate hiện xử lí các lỗi định lượng/định dạng có thể kiểm chứng chắc chắn; các tiêu chí ngữ nghĩa như độ hợp lí của distractor vẫn do prompt + preview giáo viên kiểm soát và sẽ được mở rộng ở 038.

## Không thuộc phạm vi 037

- Chia nguyên cuốn SGK thành Chương/Bài và chọn lesson scope: 036/đợt kế tiếp.
- `DAMSAN_EXAM_DRAFT_V2` và QA metadata sâu hơn: 038.
- Tự động browser-agent handoff: chưa bật trong giai đoạn này.
