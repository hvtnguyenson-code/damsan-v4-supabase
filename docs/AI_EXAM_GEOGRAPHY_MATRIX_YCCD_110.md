# AI Geography Assessment Matrix & YCCĐ Architecture — 110

## 1. Mục tiêu

Bổ sung một khu vực **Thiết lập ma trận** cho AI ra đề Địa lí, dùng chung cho:

- nhánh `STRICT_TNTHPT` — giữ nguyên cấu trúc 18–4–6;
- nhánh `FLEX_GEOGRAPHY` — số câu từng phần do giáo viên lựa chọn.

Nguyên tắc cốt lõi:

> Cấu trúc có thể linh hoạt; chuẩn chất lượng không linh hoạt.

Mọi đề FLEX vẫn dùng authority, competency, stimulus, authoring contract, independent critic và benchmark quality của P0–P6.

---

# 2. Cơ sở chuẩn hóa

## 2.1. Văn bản/chuẩn chính

1. **Chương trình GDPT môn Địa lí ban hành theo TT32/2018/TT-BGDĐT**, được cập nhật bởi **TT17/2025/TT-BGDĐT**.
2. **TT22/2021/TT-BGDĐT**: đánh giá học sinh THCS/THPT phải căn cứ YCCĐ của chương trình.
3. **Công văn 7991/BGDĐT-GDTrH (17/12/2024)**:
   - ma trận đề kiểm tra định kì;
   - bản đặc tả;
   - ba mức độ: **Biết – Hiểu – Vận dụng**;
   - ma trận theo chủ đề/nội dung, dạng câu và tỉ lệ điểm;
   - đặc tả phải ghi **Yêu cầu cần đạt** và có thể gắn năng lực.
4. Cấu trúc/benchmark TNTHPT 2025+ tiếp tục được dùng làm chuẩn **chất lượng item**, không ép cấu trúc FLEX.

## 2.2. Phân biệt ba lớp dữ liệu

Không đồng nhất ba khái niệm:

### A. `CURRICULUM_REQUIREMENT`

YCCĐ chính thức của chương trình.

Ví dụ:

- “Phân tích được ảnh hưởng…”
- “Sử dụng được bản đồ…”
- “Vận dụng được… giải quyết vấn đề thực tiễn…”

Đây là lớp authority cao nhất cho ma trận.

### B. `TEXTBOOK_LESSON_MAPPING`

Ánh xạ YCCĐ → bài/chủ đề SGK đang dùng.

Tên bài SGK **không phải** chuẩn pháp quy.

Một YCCĐ có thể:

- thuộc một bài;
- trải qua nhiều bài;
- chỉ được hoàn thành sau cả một cụm bài.

### C. `ASSESSMENT_INDICATOR`

Chỉ báo kiểm tra được trên bài thi.

Đây là lớp máy có thể dùng để tạo slot/câu hỏi.

Ví dụ:

YCCĐ:
“Phân tích được ảnh hưởng của vị trí địa lí…”

→ indicators:

- xác định mối quan hệ vị trí → khí hậu;
- giải thích vị trí → giao lưu kinh tế;
- đánh giá vị trí → quốc phòng/an ninh.

---

# 3. Mức độ đánh giá

Khu vực ma trận dùng đúng ba mức của Công văn 7991:

- `KNOW` — Biết
- `UNDERSTAND` — Hiểu
- `APPLY` — Vận dụng

Nhưng hệ thống **không suy mức độ chỉ từ động từ**.

Ví dụ “phân tích” thường gợi ý Hiểu/Vận dụng nhưng mức thực tế còn phụ thuộc:

- dữ kiện đã cho;
- ngữ cảnh mới hay quen thuộc;
- số bằng chứng phải kết hợp;
- có phải chuyển giao kiến thức hay chỉ lặp lại SGK;
- stimulus có cần xử lí hay chỉ trang trí.

Do đó mỗi YCCĐ có:

`allowed_cognitive_levels`

và mỗi assessment indicator có:

`default_cognitive_level`

Nhánh planner mới chọn mức từ indicator, không để generator tự khai.

---

# 4. Ontology năng lực dùng trong ma trận

Dùng lại P1:

## Nhận thức khoa học địa lí

- `GEO_NK_SPATIAL`
- `GEO_NK_CAUSAL`

## Tìm hiểu địa lí

- `GEO_TH_TOOL`
- `GEO_TH_FIELD`
- `GEO_TH_INFO`

## Vận dụng

- `GEO_VD_REALITY`
- `GEO_VD_PROBLEM`
- `GEO_VD_RESEARCH`

Ma trận phải hiển thị **mức độ** và **năng lực** là hai cột khác nhau.

Không được dùng NB/TH/VD thay cho competency.

---

# 5. Thiết kế khu vực “Thiết lập ma trận”

## 5.1. Thanh cấu hình đầu

- Khối: 10 / 11 / 12
- Loại đề:
  - TNTHPT chuẩn
  - Kiểm tra định kì
  - Bài luyện
  - Custom
- Thời gian
- Tổng điểm
- Số mã đề

## 5.2. Phạm vi kiến thức

Cây:

`Khối → Chủ đề → Bài SGK → YCCĐ`

GV có thể chọn:

- cả chủ đề;
- một số bài;
- YCCĐ cụ thể trong bài.

## 5.3. Bảng ma trận

Một hàng tương ứng **YCCĐ hoặc assessment indicator**, không phải chỉ tên bài.

Cột đề xuất:

| Cột | Ý nghĩa |
|---|---|
| Khối | 10/11/12 |
| Chủ đề | mạch/chủ đề chương trình |
| Bài SGK | lớp ánh xạ |
| YCCĐ | nguyên văn/normalized |
| Năng lực | Geography competency |
| Biết | số câu |
| Hiểu | số câu |
| Vận dụng | số câu |
| P1 | số câu nhiều lựa chọn |
| P2 | số cluster Đúng/Sai |
| P3 | số trả lời ngắn |
| Stimulus | NONE/TEXT/TABLE/CHART/MAP/... |
| Điểm | trọng số |
| Trạng thái | hợp lệ/cảnh báo |

## 5.4. Hai chế độ nhập

### AUTO

Hệ thống đề xuất ma trận từ:

- YCCĐ;
- thời lượng chương trình;
- lesson scope;
- benchmark TNTHPT;
- loại đề/thời gian;
- competency coverage.

GV chỉ chỉnh.

### MANUAL

GV nhập số câu trực tiếp theo từng YCCĐ.

Server vẫn kiểm:

- tổng câu;
- cấu trúc;
- YCCĐ coverage;
- competency;
- stimulus feasibility;
- cognitive balance;
- point total.

---

# 6. STRICT_TNTHPT vs FLEX_GEOGRAPHY

## STRICT_TNTHPT

Giữ nguyên P1–P6 hiện tại:

- 18 P1
- 4 P2
- 6 P3
- 40 commands
- benchmark structure hard gate.

Ma trận chủ yếu dùng để thể hiện/điều chỉnh **content coverage**, không được phá cấu trúc.

## FLEX_GEOGRAPHY

Cấu trúc lấy từ ma trận giáo viên.

Ví dụ:

- P1 = 12
- P2 = 2
- P3 = 3

→ 17 item slots.

Structure compliance = so với **ma trận đã khóa**, không so với 18–4–6.

Quality calibration vẫn dùng chuẩn TNTHPT:

- distractor quality;
- reasoning depth;
- stimulus;
- competency fit;
- geography skill quality;
- real-world context;
- similarity.

---

# 7. YCCĐ catalog theo khối

## Khối 10

Mạch chính:

- Một số vấn đề chung
- Địa lí tự nhiên
- Địa lí kinh tế – xã hội đại cương

Các operation thường gặp:

- phân biệt;
- xác định;
- trình bày;
- giải thích;
- phân tích;
- so sánh;
- đọc bản đồ;
- phân tích số liệu;
- vẽ/nhận xét biểu đồ;
- liên hệ/vận dụng thực tế.

Knowledge corpus Đam San hiện có **SGK Địa 10** đã normalized theo bài, từ Bài 1 đến Bài 40.

## Khối 11

Mạch chính:

- Một số vấn đề KT–XH thế giới
- Địa lí khu vực và quốc gia

YCCĐ nổi bật:

- phân tích khác biệt phát triển;
- toàn cầu hóa/khu vực hóa;
- đọc số liệu/bản đồ;
- phân tích các khu vực/quốc gia;
- so sánh;
- giải thích tác động tự nhiên – dân cư – kinh tế;
- khai thác/đánh giá nguồn thông tin.

**Hiện kho tri thức Đam San chưa có SGK Địa 11 normalized**, nên chưa được phép tạo mapping “theo bài SGK 11” tự động.

Có thể xây `CURRICULUM_REQUIREMENT` lớp 11 trước; lesson mapping phải đợi nguồn SGK 11 hoặc kế hoạch dạy học được đưa vào.

## Khối 12

Mạch chính hiện hành:

- Địa lí tự nhiên
- Địa lí dân cư
- Địa lí các ngành kinh tế
- Địa lí các vùng kinh tế
- Địa lí địa phương

Phải áp dụng TT17/2025 cho nội dung cập nhật về vùng, tỉnh/thành, bản đồ và địa lí địa phương.

Knowledge corpus hiện có SGK Địa 12 normalized Bài 1–35.

---

# 8. Dữ liệu chuẩn đề xuất

## Requirement

```json
{
  "requirement_id": "G12_NAT_POS_001",
  "grade": 12,
  "curriculum_topic": "Vị trí địa lí và phạm vi lãnh thổ",
  "requirement_text": "...",
  "authority_code": "BGDDT_GEOGRAPHY_CURRICULUM_2018",
  "authority_revision": "TT17_2025_CURRENT",
  "competency_codes": ["GEO_NK_SPATIAL", "GEO_TH_TOOL"],
  "allowed_cognitive_levels": ["KNOW", "UNDERSTAND", "APPLY"]
}
```

## Lesson mapping

```json
{
  "requirement_id": "G12_NAT_POS_001",
  "document_id": "...",
  "lesson_code": "BAI_01",
  "coverage": "PRIMARY",
  "confidence": 1.0
}
```

## Indicator

```json
{
  "indicator_id": "G12_NAT_POS_001_I02",
  "requirement_id": "G12_NAT_POS_001",
  "operation": "SPATIAL_RELATION",
  "default_cognitive_level": "UNDERSTAND",
  "allowed_item_types": ["P1", "P2"],
  "preferred_stimuli": ["MAP", "TEXT"],
  "paper_assessability": "DIRECT"
}
```

---

# 9. Validation rules

Server phải reject ma trận nếu:

1. YCCĐ không thuộc khối/phạm vi đã chọn.
2. P1/P2/P3 tổng không khớp cấu hình.
3. Số điểm không khớp tổng điểm.
4. Vận dụng được gán cho indicator không hỗ trợ transfer/application.
5. MAP được yêu cầu nhưng không có nguồn hình học đáng tin cậy.
6. Một YCCĐ bị dùng quá mức, làm mất coverage.
7. Đề quá nhỏ nhưng giáo viên ép coverage không khả thi.
8. Câu được tạo không khớp requirement_id/indicator_id của slot.

---

# 10. Quality rules cho FLEX

Không giảm chất lượng vì số câu ít.

Giữ nguyên:

- P4 critic;
- P5 authoring contract;
- P6 style/quality benchmark.

Điều chỉnh theo quy mô:

- coverage target proportional;
- stimulus diversity proportional;
- competency diversity proportional;
- P3 operation diversity proportional.

Không dùng quota tuyệt đối 18–4–6 cho FLEX.

---

# 11. Trạng thái dữ liệu hiện tại

Production hiện có:

- SGK Địa 10: normalized, active.
- SGK Địa 12: normalized, active.
- SGK Địa 11: **chưa có**.
- Authority P0 hiện tập trung sâu vào lớp 12/TNTHPT.

Vì vậy triển khai đúng thứ tự:

1. chuẩn hóa curriculum requirement catalog 10–11–12;
2. map YCCĐ → SGK 10 và SGK 12;
3. tạo indicator catalog;
4. xây UI ma trận;
5. dynamic planner FLEX;
6. mở mapping lớp 11 sau khi có nguồn SGK/kế hoạch dạy học đáng tin cậy.

---

# 12. Nguyên tắc cuối

> `Requirement → Indicator → Matrix → Slot → Item → Critic → Calibration`

Không dùng:

> `Tên bài → AI tự đoán câu hỏi → AI tự khai mức độ`

Đây là điều kiện để hệ thống đi từ “AI sinh đề đúng cấu trúc” thành hệ thống **thiết kế đánh giá có căn cứ chương trình**.
