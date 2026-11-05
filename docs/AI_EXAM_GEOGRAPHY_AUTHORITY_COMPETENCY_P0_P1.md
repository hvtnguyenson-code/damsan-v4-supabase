# AI Exam Địa lí — Kiến trúc P0–P1: Authority Corpus & Competency Blueprint

> **Trạng thái:** Thiết kế đã được chốt ngày 2026-11-04, **chưa triển khai code**.  
> **Mục tiêu:** nâng AI Exam từ cơ chế “SGK → prompt nhiều lớp → sinh câu → validator” sang hệ thống xây dựng đề có kiểm soát khảo thí: **Authority → Competency Blueprint → Exam Design Plan → Item Generation → Validation**.  
> **Phạm vi tài liệu:** P0 và P1. P2–P6 được ghi ở phần roadmap để giữ đúng thứ tự phát triển.

---

## 1. Bối cảnh

AI Exam hiện đã có các nền tảng quan trọng:

- Knowledge Pack theo active revision của SGK;
- lesson scope;
- profile khảo thí `DIA_LI_TNTHPT_2025_PLUS_V1`;
- cấu trúc Địa lí TNTHPT 18 câu Phần I + 4 cụm Phần II + 6 câu Phần III, 50 phút;
- quality gates cho grounding, Part II, Part III, metadata định lượng và provenance;
- authority infrastructure:
  - `assessment_authority_profiles`;
  - `assessment_profile_sources`;
  - `knowledge_documents.source_role`;
  - `knowledge_documents.authority_profile_id`;
  - `knowledge_documents.authority_code`;
  - `rpc_assessment_authority_slots`;
  - `rpc_knowledge_set_authority_binding`;
  - `rpc_assessment_authority_pack`.

Tuy nhiên, hệ thống hiện mạnh ở **đúng schema/đúng đáp án/không bịa nguồn** hơn là **chất lượng khảo thí môn Địa lí**.

Các khoảng trống chính:

1. profile authority đang khai báo nguồn nhưng chưa gắn corpus khảo thí chuẩn thật;
2. ma trận hiện chủ yếu dựa trên `NB/TH/VD`, chưa có ontology năng lực Địa lí;
3. chưa có Exam Design Plan cố định trước khi sinh câu;
4. stimulus đặc thù Địa lí (bản đồ, biểu đồ, sơ đồ, hình ảnh...) chưa là first-class object;
5. generator tự khai metadata nhận thức, làm tăng nguy cơ “tự chứng nhận” độ khó;
6. nhiều prompt overlay tích lũy theo lịch sử, gây đúng kỹ thuật nhưng dễ cứng và khuôn.

---

# P0 — Authority Corpus thật

## 2. Mục tiêu P0

P0 phải biến profile khảo thí từ trạng thái:

`DECLARED_NOT_ATTACHED`

sang trạng thái có **nguồn chuẩn hóa thật, có provenance, được gắn đúng authority slot**.

AI không được chỉ đọc các quy tắc do dự án mô tả lại. Hệ thống phải có corpus authority thực sự để:

- xác định chuẩn bắt buộc;
- học pattern khảo thí;
- calibration phong cách;
- truy nguyên nguồn khi profile thay đổi;
- tái tạo snapshot authority cho từng request.

---

## 3. Hai trục thẩm quyền

Không dùng một chuỗi authority duy nhất cho mọi loại quyết định.

### 3.1. Normative authority

Quyết định **những gì bắt buộc**:

1. Chương trình GDPT 2018 môn Địa lí;
2. quy định/cấu trúc định dạng đề thi tốt nghiệp THPT từ năm 2025.

Normative authority quyết định:

- thành phần năng lực;
- yêu cầu cần đạt;
- dạng câu;
- số lệnh hỏi;
- thời gian;
- scoring;
- các giới hạn bắt buộc.

Benchmark không được ghi đè normative authority.

### 3.2. Style/calibration authority

Quyết định **cách triển khai chuẩn trong đề thực tế**:

1. đề chính thức gần nhất;
2. đề chính thức các năm trước;
3. đề tham khảo chính thức;
4. đề thi thử cấp tỉnh chất lượng cao.

Style/calibration authority chỉ dùng để học:

- độ dài stem;
- loại stimulus;
- sức nhiễu;
- cognitive operation;
- cách khai thác bảng/bản đồ/biểu đồ;
- độ tự nhiên;
- pattern phân hóa.

Nó **không trở thành content source** và không được sao chép câu chữ, dữ liệu hay đáp án.

---

## 4. Authority slots cần có

Profile `DIA_LI_TNTHPT_2025_PLUS_V1` nên có tối thiểu các slot:

| authority_code | source_role | rank | required | Vai trò |
|---|---|---:|---|---|
| `BGDDT_GEOGRAPHY_CURRICULUM_2018` | `ASSESSMENT_RULE` | 1 | yes | Năng lực môn, YCCĐ, công cụ Địa lí |
| `BGDDT_FORMAT_RULE_2025` | `ASSESSMENT_RULE` | 1 | yes | Cấu trúc, dạng câu, thời gian, scoring |
| `BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY` | `ASSESSMENT_BENCHMARK` | 3 | yes | Pattern đề tham khảo chính thức |
| `BGDDT_OFFICIAL_EXAM_2025_GEOGRAPHY` | `ASSESSMENT_BENCHMARK` | 2 | recommended | Benchmark kỳ thi thật |
| `BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY` | `ASSESSMENT_BENCHMARK` | 2 | yes | Benchmark thực tế mới nhất |
| `PROVINCIAL_GEOGRAPHY_HIGH_QUALITY` | `ASSESSMENT_BENCHMARK` | >=20 | optional | Mở rộng pattern, không ghi đè Bộ |

### Ghi chú

- `ASSESSMENT_RULE` và `ASSESSMENT_BENCHMARK` phải dùng cơ chế binding hiện có.
- Không tự động bind theo tên file.
- Binding phải đi qua `rpc_knowledge_set_authority_binding`.
- Mỗi authority slot có danh tính rõ: `profile_id + authority_code + source_role`.

---

## 5. Normalization cho authority source

Authority source **không normalize giống SGK**.

### 5.1. ASSESSMENT_RULE units

Nên tạo unit taxonomy:

- `RULE.EXAM_STRUCTURE`
- `RULE.SCORING`
- `RULE.TIME_LIMIT`
- `RULE.PAGE_BUDGET`
- `RULE.COMPETENCY`
- `RULE.COGNITIVE_LEVEL`
- `RULE.ITEM_FORMAT`
- `RULE.STIMULUS`
- `RULE.ASSESSMENT_PRINCIPLE`

Mỗi unit cần provenance đến trang/phần của tài liệu gốc.

### 5.2. ASSESSMENT_BENCHMARK units

Không đưa nguyên văn đề mẫu vào generator. Chuẩn hóa thành **design fingerprint**:

- `BENCHMARK.ITEM_PATTERN`
- `BENCHMARK.STIMULUS_PATTERN`
- `BENCHMARK.DISTRACTOR_PATTERN`
- `BENCHMARK.COGNITIVE_OPERATION`
- `BENCHMARK.DATA_USAGE`
- `BENCHMARK.SPATIAL_REASONING`
- `BENCHMARK.ITEM_LENGTH`

Ví dụ fingerprint:

```json
{
  "part": 1,
  "stimulus_type": "MAP",
  "competency": "GEO_TH_TOOL",
  "cognitive": "TH",
  "operation": "SPATIAL_COMPARISON",
  "distractor_family": "NEAR_MISS_SPATIAL_RELATION",
  "stem_length_band": "SHORT",
  "requires_two_evidence_elements": true
}
```

Generator chỉ học pattern, không nhận nguyên văn item benchmark nếu không cần thiết.

---

## 6. Trạng thái authority

Đề xuất trạng thái logic:

- `NONE`
- `DECLARED_NOT_ATTACHED`
- `PARTIAL_SOURCES`
- `VERIFIED_SOURCES`

### Điều kiện VERIFIED_SOURCES

Ít nhất các nguồn required phải:

- đã upload;
- normalized;
- quality accepted;
- có active revision;
- được bind đúng profile/authority code;
- có provenance;
- authority pack đọc được;
- snapshot hash xác định được.

Nếu chưa `VERIFIED_SOURCES`:

- vẫn có thể cho tạo bài luyện;
- **không được gắn nhãn “chuẩn chính thức TNTHPT”**.

---

# P1 — Geography Competency Blueprint

## 7. Nguyên tắc

Không coi `NB/TH/VD` là ma trận đầy đủ.

Blueprint Địa lí phải là:

**Content × Geography Competency × Cognitive Level × Stimulus × Item Type**

Mỗi request phải có một blueprint snapshot trước khi sinh câu.

Không hard-code tỉ lệ năng lực từ suy đoán của AI. Tỉ lệ/target phải được compiler suy ra từ authority corpus và calibration corpus.

---

## 8. Competency ontology

### 8.1. Nhận thức khoa học địa lí — GEO_NK

#### `GEO_NK_SPATIAL`

Các operation:

- `LOCATE`
- `SPATIAL_DISTRIBUTION`
- `SPATIAL_COMPARISON`
- `SPATIAL_RELATION`
- `REGIONAL_DIFFERENTIATION`

#### `GEO_NK_CAUSAL`

Các operation:

- `CAUSE_EFFECT`
- `MULTI_FACTOR_EXPLANATION`
- `NATURAL_SOCIOECONOMIC_RELATION`
- `PROCESS_EXPLANATION`
- `CONSEQUENCE_ANALYSIS`

---

### 8.2. Tìm hiểu địa lí — GEO_TH

#### `GEO_TH_TOOL`

Các operation:

- `READ_MAP`
- `READ_CHART`
- `READ_TABLE`
- `READ_IMAGE`
- `READ_DIAGRAM`
- `READ_CROSS_SECTION`
- `COMPARE_DATA`
- `TREND_ANALYSIS`
- `STRUCTURE_ANALYSIS`
- `SPATIAL_DATA_ANALYSIS`
- `CALCULATE_GEO_INDICATOR`
- `SELECT_CHART`
- `INTERPRET_CHART`

#### `GEO_TH_FIELD`

Dùng cho competency catalog nhưng thường không đánh giá trực tiếp bằng đề giấy.

#### `GEO_TH_INFO`

Khai thác, lựa chọn và xử lí nguồn thông tin Địa lí.

---

### 8.3. Vận dụng kiến thức, kĩ năng — GEO_VD

#### `GEO_VD_REALITY`

- `REAL_WORLD_INTERPRETATION`
- `CONTEXT_UPDATE`

#### `GEO_VD_PROBLEM`

- `SCENARIO_APPLICATION`
- `DECISION_MAKING`
- `SOLUTION_SELECTION`
- `IMPACT_ASSESSMENT`
- `TRADEOFF_EVALUATION`

#### `GEO_VD_RESEARCH`

Giữ trong ontology nhưng không ép vào bài thi giấy nếu không phù hợp.

---

## 9. Assessability

Mỗi competency descriptor phải có khả năng đánh giá theo mode.

```json
{
  "assessment_mode": "PAPER_TNTHPT",
  "assessability": "DIRECT"
}
```

Giá trị:

- `DIRECT`
- `INDIRECT`
- `NOT_SUITABLE_FOR_PAPER_EXAM`

Ví dụ:

- `READ_MAP` → DIRECT;
- `FIELDWORK_DATA_COLLECTION` → NOT_SUITABLE_FOR_PAPER_EXAM;
- `REAL_WORLD_APPLICATION` → DIRECT khi đề cung cấp stimulus phù hợp.

---

## 10. Stimulus taxonomy

Stimulus phải là first-class object:

- `NONE`
- `TEXT`
- `TABLE`
- `CHART`
- `MAP`
- `SCHEMATIC_MAP`
- `IMAGE`
- `DIAGRAM`
- `CLIMOGRAPH`
- `CROSS_SECTION`
- `MULTI_SOURCE`

Ví dụ:

```json
{
  "type": "MAP",
  "source_origin": "LOCAL_GROUNDED",
  "evidence_refs": [],
  "student_visible": true,
  "competencies_supported": [
    "GEO_NK_SPATIAL",
    "GEO_TH_TOOL"
  ]
}
```

P2 sẽ xây renderer/generator tương ứng.

---

## 11. Blueprint schema

Blueprint nên được lưu trong:

`assessment_authority_profiles.profile.competency_blueprint`

và snapshot vào:

`ai_exam_requests.exam_spec.competency_blueprint`.

Đề xuất:

```json
{
  "schema_version": "DAMSAN_GEO_BLUEPRINT_V1",
  "authority_basis": {
    "profile_id": "DIA_LI_TNTHPT_2025_PLUS_V1",
    "source_snapshot_hash": "..."
  },
  "content_scope": [],
  "matrix": [],
  "stimulus_policy": {},
  "coverage_constraints": {},
  "presentation_constraints": {
    "minutes": 50,
    "max_print_pages": 4
  }
}
```

---

## 12. Matrix cell

Mỗi cell mô tả một nhu cầu khảo thí:

```json
{
  "competency_code": "GEO_TH_TOOL",
  "operation": "READ_CHART",
  "cognitive_level": "TH",
  "parts_allowed": [1, 2],
  "stimulus_types": ["CHART", "TABLE"],
  "target_min": 1,
  "target_max": 3,
  "authority_refs": [
    "BGDDT_GEOGRAPHY_CURRICULUM_2018",
    "BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY"
  ]
}
```

`target_min/max` phải được compiler lấy từ authority/corpus calibration, không phải hard-code theo suy đoán.

---

# Exam Design Plan

## 13. Planner chạy trước generator

Luồng đích:

```text
Teacher chọn môn/khối/loại đề/bài
        ↓
Authority Resolver
        ↓
Competency Blueprint Compiler
        ↓
Exam Design Planner
        ↓
28 item slots
        ↓
Item Generator
        ↓
Validator / Critic
```

AI không còn tự quyết toàn bộ cấu trúc đề.

---

## 14. Item slot

Ví dụ P1:

```json
{
  "slot_id": "P1-07",
  "part": 1,
  "lesson_targets": ["BAI_02"],
  "competency": "GEO_NK_CAUSAL",
  "operation": "CAUSE_EFFECT",
  "cognitive": "TH",
  "stimulus_type": "TEXT",
  "design_constraints": {
    "distractor_family": "CAUSAL_NEAR_MISS",
    "min_evidence": 2
  }
}
```

Ví dụ P2 cluster:

```json
{
  "slot_id": "P2-02",
  "part": 2,
  "stimulus_type": "MAP",
  "primary_competency": "GEO_TH_TOOL",
  "statements": {
    "A": {"competency": "GEO_TH_TOOL", "cognitive": "NB"},
    "B": {"competency": "GEO_NK_SPATIAL", "cognitive": "TH"},
    "C": {"competency": "GEO_NK_CAUSAL", "cognitive": "TH"},
    "D": {"competency": "GEO_VD_PROBLEM", "cognitive": "VD"}
  }
}
```

---

## 15. Metadata item mới

Mỗi question cần thêm:

```json
{
  "assessment_design": {
    "slot_id": "P1-07",
    "competency_code": "GEO_NK_CAUSAL",
    "operation_code": "CAUSE_EFFECT",
    "cognitive_level": "TH",
    "stimulus_type": "TEXT",
    "content_targets": ["BAI_02"]
  }
}
```

`muc_do` vẫn giữ để tương thích nhưng nên trở thành giá trị dẫn xuất từ:

`assessment_design.cognitive_level`.

---

# Quy tắc theo từng phần

## 16. Phần I

### NB

- kiểm soát số câu fact;
- không để đề trở thành bài nhớ SGK.

### TH

Ưu tiên:

- causal relation;
- spatial relation;
- comparison;
- trend interpretation;
- data interpretation.

### VD

Không chấp nhận “phương án tích cực/toàn diện nhất” như một shortcut.

VD phải có ít nhất một yếu tố:

- new scenario;
- decision under conditions;
- multi-source reasoning;
- spatial transfer;
- real-world application;
- trade-off.

Distractor phải là **near-miss Địa lí**, sai ở điều kiện/quan hệ cụ thể.

---

## 17. Phần II

Mỗi cluster phải có thiết kế trước cho:

- stimulus;
- competency chính;
- competency/mức độ từng statement;
- operation từng statement.

Không dùng `statement_reasoning.reasoning_steps` do chính generator tự khai làm bằng chứng duy nhất về độ sâu.

P4 sẽ bổ sung critic độc lập.

---

## 18. Phần III

Không blueprint theo phép tính trước.

Sai:

```text
GROWTH_PERCENT
AVERAGE
RANGE
BALANCE
```

Đúng:

```text
GEO_TH_TOOL
  → ANALYZE_STATISTICAL_DATA
    → GROWTH_RATE
```

Operation toán học chỉ là implementation detail của skill Địa lí.

Một câu chỉ được giữ nếu phép tính phục vụ một thao tác Địa lí hợp lệ.

---

# Coverage & presentation

## 19. Coverage constraints toàn đề

Planner cần kiểm:

- content coverage;
- competency coverage;
- cognitive coverage;
- stimulus coverage;
- operation diversity;
- lesson duplication;
- item similarity;
- reading/time budget;
- print page budget.

Không coi 6 operation toán khác nhau là đa dạng nếu cả 6 vẫn chỉ là “đọc bảng rồi tính”.

---

## 20. Time/page budget

Blueprint đầy đủ:

```json
{
  "minutes": 50,
  "max_print_pages": 4
}
```

Planner phải ước lượng reading cost:

- P1 NB: low;
- P1 TH/VD: medium;
- P2 text/map/table: medium–high;
- P3 table: high.

Không được tạo 4 stimulus P2 dài + 6 bảng P3 lớn nếu tổng thể vượt budget.

---

# Kiến trúc dữ liệu

## 21. Ưu tiên tái sử dụng DB

P0 không cần schema mới nếu hạ tầng authority hiện tại đáp ứng.

P1 giai đoạn đầu cũng ưu tiên JSONB hiện có:

- `assessment_authority_profiles.profile`;
- `ai_exam_requests.exam_spec`.

Chỉ tách relational tables sau này nếu analytics/calibration cần truy vấn quy mô lớn.

Nguyên tắc:

**không migration chỉ để làm đẹp schema nếu JSONB hiện tại đủ an toàn.**

---

# Acceptance criteria

## 22. P0 hoàn thành khi

1. Các authority source required đã được gắn file chuẩn hóa thật.
2. Mỗi nguồn có provenance.
3. Active revision hợp lệ.
4. Authority pack đọc được.
5. Snapshot hash ổn định.
6. `source_state = VERIFIED_SOURCES`.
7. UI hiển thị rõ nguồn nào đã xác minh.
8. Nếu thiếu nguồn required, không gắn nhãn “chuẩn chính thức TNTHPT”.

---

## 23. P1 hoàn thành khi

Một request TNTHPT tạo được **Exam Design Plan 28 slot** trước khi sinh câu:

- 18 slot P1;
- 4 cluster P2;
- 6 slot P3;
- mỗi slot có:
  - content target;
  - competency;
  - cognitive level;
  - stimulus;
  - operation;
- planner kiểm coverage toàn đề;
- thay lesson scope thì plan được tái lập;
- generator không tự định nghĩa mức độ của chính câu nó viết;
- chưa sinh một câu nào vẫn có thể trả lời được:
  - đề kiểm tra năng lực gì;
  - ở mức độ nào;
  - bằng dạng stimulus nào;
  - nội dung nào được phủ.

---

# Roadmap tiếp theo

Sau P0–P1, triển khai theo thứ tự:

### P2 — Stimulus Engine

Hỗ trợ thực sự:

- TABLE;
- CHART;
- MAP;
- SCHEMATIC_MAP;
- IMAGE;
- DIAGRAM;
- CLIMOGRAPH;
- CROSS_SECTION;
- MULTI_SOURCE.

### P3 — Planned generation

Sinh theo slot, không sinh một lần 28 câu tự do.

### P4 — Independent critic

Tách generator và reviewer.

Critic đánh giá:

- distractor;
- cognitive depth;
- competency fit;
- stimulus use;
- answer leakage;
- item similarity;
- real-world quality.

### P5 — Prompt consolidation

Hợp nhất các overlay lịch sử thành một Geography Authoring Contract rõ ràng.

### P6 — Calibration

Sinh nhiều đề, chấm bằng rubric và so với corpus Bộ trước khi tiếp tục chỉnh generator.

---

# Nguyên tắc kiến trúc cuối cùng

AI không còn là thành phần “tự ra một đề”.

AI chỉ thực hiện:

> **Viết một item đáp ứng một slot khảo thí đã được server xác định trước.**

Server sở hữu:

- authority;
- blueprint;
- competency;
- cognitive target;
- stimulus policy;
- coverage;
- time/page budget;
- validation.

Đây là nền tảng để Đam San V4 chuyển từ **AI tạo câu hỏi** sang **hệ thống xây dựng đề thi có kiểm soát khảo thí**.

---

## Tài liệu liên quan

- `docs/GEOGRAPHY_ASSESSMENT_STANDARD_037.md`
- `docs/NORMALIZED_KNOWLEDGE_AUTHORITY_038_039.md`
- `docs/AI_EXAM_031A_GENERATION_BRIDGE.md`
- `docs/AI_EXAM_RELIABILITY_049.md`
- `docs/AI_EXAM_055_PART3_TABLE_COMPACT_ANSWER.md`

## Trạng thái triển khai

- [x] P0 — authority source registry/slot expansion (097)
- [x] P0 — PARTIAL_SOURCES / VERIFIED_SOURCES readiness semantics (097)
- [x] P0 — authority corpus thật — 4/4 nguồn bắt buộc VERIFIED_SOURCES (097–101)
- [ ] P0 — authority normalization
- [ ] P0 — VERIFIED_SOURCES acceptance
- [x] P1 — competency ontology — authority-grounded (100)
- [x] P1 — blueprint compiler — 102 production PASS
- [ ] P1 — exam design planner — 103 đang triển khai
- [ ] P1 — 28-slot acceptance
- [ ] P2 — stimulus engine
- [ ] P3 — planned generation
- [ ] P4 — independent critic
- [ ] P5 — prompt consolidation
- [ ] P6 — calibration
