# 049 — AI Exam validation reliability and recovery

## Problem

The first end-to-end Geography exam proved that the AI → validation → teacher approval → canonical room publish boundary works. In repeated authoring, however, a Web-AI response can fail a deterministic gate and the teacher currently receives only a generic error. Failed attempts are not persisted in `ai_exam_requests.processing_error`, so later inspection cannot identify which question or quality rule failed. The Edge generation contract also still advertises the pre-048 question field list even though Geography Part III 048 requires `muc_do`, `bai_hoc`, and `quantitative` metadata.

## Invariants

- Do not weaken Geography Part III quality gate 048.
- A failed validation must not reject the request, publish a draft, or touch a room.
- A recoverable failed validation keeps the current capability usable until its normal expiry, so the corrected JSON can be submitted again.
- Persist only compact failure metadata in `processing_error`; do not persist an extra copy of the full AI exam payload.
- No polling or background database loop is introduced.
- Canonical room publication remains `rpc_ai_exam_approve_and_publish` → `rpc_luu_de_thi_len_phong`.

## 049 behavior

1. The Edge generation contract includes the 048 metadata required by Part III.
2. Draft-validation failures return a specific code, question number/quality details when available, and `recoverable=true` for model-output defects.
3. The Edge function writes a bounded JSON diagnostic to `ai_exam_requests.processing_error` for recoverable failures.
4. The browser shows the exact Vietnamese validation reason instead of the generic “invalid or expired” message.
5. The browser offers one-click **Sao chép yêu cầu sửa lỗi**. The repair prompt contains the current JSON and exact server failure, and instructs the Web AI to return only the corrected `DAMSAN_EXAM_V1` JSON.
6. A successful validation hides the repair control and proceeds to READY_FOR_REVIEW as before.
