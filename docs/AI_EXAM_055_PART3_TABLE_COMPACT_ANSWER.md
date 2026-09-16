# AI-EXAM-055 — Geography Part III table + compact answer

## Scope

This change applies only to `DIA_LI_TNTHPT_2025_PLUS_V1`.

## Student-visible data

- A Part III item with at least 3 raw quantitative inputs must present those data in a semantic HTML table embedded in `noi_dung`.
- The table is marked with `data-damsan-p3="1"` and uses only `caption`, `thead`, `tbody`, `tr`, `th`, and `td` in the authoring contract.
- The existing student renderer already sanitizes `noi_dung` with DOMPurify and the existing `.q-text table` CSS renders the table in the exam room. No second room payload or alternate renderer is introduced.
- Validation strips tags/attributes before counting visible numeric tokens and, for required tables, checks that each `quantitative.inputs` numeric value is represented in the table text after decimal/thousands normalization.

## Compact numeric answer

The canonical Part III answer is a numeric string of at most 4 characters. The character budget includes the leading minus sign and the decimal comma.

Examples that fit: `2`, `22`, `222`, `2222`, `22,2`, `2,22`, `-222`, `-2,2`.

No unit, spaces, thousands separator, or leading `+` is stored in `dap_an_dung`. Decimal-dot AI output is accepted as recoverable input and canonicalized to comma before the Geography draft/variants are persisted.

## Result scaling

`quantitative.result_divisor` is optional and may only be a power of ten from 1 through 1e9. It divides the server-recomputed result before rounding. This supports legitimate unit presentation such as people -> thousand people without weakening arithmetic verification.

## Safety

The existing 053 arithmetic engine remains the base. 055 wraps it; it does not replace supported operations. The draft-normalization trigger is scoped to the Geography TNTHPT authority profile. Room publication and student submission paths are unchanged.
