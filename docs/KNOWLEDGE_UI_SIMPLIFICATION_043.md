# KNOWLEDGE-UI-043 — Compact source intake

The original-file upload capability remains required. Every new textbook, regulation, benchmark or short source must first exist as an owned `knowledge_documents` record, and the original file is retained for provenance.

The large legacy upload/extraction presentation is no longer part of the primary teacher workflow.

## UI rule

- Keep source upload available as an auxiliary action.
- Collapse it by default behind `＋ Thêm file mới`.
- Hide the obsolete teacher-facing `Gợi ý cho AI` field.
- Remove the verbose `Ba đường xử lý` explanation from the visible intake card.
- Keep only the compact message explaining where the newly uploaded source goes next: long books → 0A; regulations/benchmarks/short sources → 0B.

## Implementation boundary

The browser reader/extraction implementation is intentionally retained for now because it still provides physical PDF page metadata and supports short/text-clean documents. This change retires its old UI prominence, not the underlying capability.

No room/exam persistence or AI-to-room bridge is changed by 043.
