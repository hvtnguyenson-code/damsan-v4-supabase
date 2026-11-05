# AI Geography Curriculum Catalog 114

## Mục tiêu

Thay lớp suy diễn YCCĐ/indicator theo tên bài trong `ai_exam_geography_matrix_111.js` bằng nguồn dữ liệu phiên bản hóa:

`CURRICULUM_REQUIREMENT -> TEXTBOOK_LESSON_MAPPING -> ASSESSMENT_INDICATOR`.

## Phạm vi 114

1. Catalog YCCĐ cho khối 10 và 12.
2. Mapping YCCĐ -> lesson scope của SGK normalized đang active.
3. Indicator catalog dùng cho matrix 111 và planner 112.
4. Không tự tạo lesson mapping lớp 11 khi kho tri thức chưa có SGK 11 normalized.
5. STRICT_TNTHPT giữ nguyên cấu trúc 18-4-6.
6. FLEX_GEOGRAPHY chỉ được lấy row từ catalog/mapping đã xác minh.
7. Không thay đổi luồng học sinh, nộp bài, chấm bài hoặc publish.

## Quy tắc nguồn

- Authority chương trình: TT32/2018/TT-BGDĐT và bản cập nhật hiện hành.
- Khối 12 phải áp dụng patch TT17/2025 cho nội dung bị thay đổi.
- Tên bài SGK chỉ là lớp mapping; không được coi là YCCĐ pháp quy.
- Không gắn nhãn `CURRICULUM_NORMALIZED` cho dữ liệu suy diễn bằng regex/tên bài.
- Mỗi mapping phải có `mapping_confidence` và `mapping_source`.

## Data contract

### Requirement

```json
{
  "requirement_id": "G12_...",
  "grade": 12,
  "curriculum_topic": "...",
  "requirement_text": "...",
  "authority_code": "BGDDT_GEOGRAPHY_CURRICULUM_2018",
  "authority_revision": "TT17_2025_CURRENT",
  "competency_codes": ["GEO_NK_SPATIAL"],
  "allowed_cognitive_levels": ["KNOW","UNDERSTAND","APPLY"]
}
```

### Lesson mapping

```json
{
  "requirement_id": "G12_...",
  "scope_key": "...",
  "lesson_code": "BAI_01",
  "coverage": "PRIMARY",
  "mapping_source": "ACTIVE_NORMALIZED_TEXTBOOK",
  "mapping_confidence": 1
}
```

### Indicator

```json
{
  "indicator_id": "G12_..._I01",
  "requirement_id": "G12_...",
  "indicator_text": "...",
  "operation_code": "SPATIAL_RELATION",
  "default_cognitive_level": "UNDERSTAND",
  "allowed_item_types": ["P1","P2"],
  "preferred_stimuli": ["MAP","TEXT"]
}
```

## Acceptance

- Matrix 111 không còn gọi heuristic `candidatesForLesson()` cho khối 10/12.
- Mọi row có requirement/indicator ID ổn định và truy ngược được nguồn.
- Khối 11 hiển thị trạng thái chưa có lesson mapping thay vì sinh giả.
- Planner 112 nhận cùng schema hiện tại, không phá tương thích.
- Có regression test cho STRICT/FLEX và source-integrity.
- Chỉ mở PR sau khi test local/CI fixture đạt.
