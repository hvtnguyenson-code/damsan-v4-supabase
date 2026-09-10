# AI-EXAM-031A — Provider-neutral exam generation bridge

## Purpose

This slice turns the structured Knowledge Library into a secure AI exam-generation control plane while preserving one mandatory human decision: **review the complete draft, then APPROVE AND PUBLISH or REJECT**.

No AI client receives a database credential, service-role key, or teacher staff token. AI access uses a short-lived capability scoped to one exam-generation request.

## Flow

```text
active Knowledge Library
        ↓
teacher defines room + exam specification
        ↓
exam-ai-bridge issues short-lived capability
        ↓
ChatGPT / Gemini / future web AI reads bounded knowledge-pack pages
        ↓
AI submits DAMSAN_EXAM_V1
        ↓
deterministic validator
  - schema / profile
  - exact requested part counts
  - answer formats
  - CUSTOM weights
  - every question grounded in existing knowledge unit_key
        ↓
deterministic variant builder
        ↓
READY_FOR_REVIEW
        ↓
================ TEACHER ================
 APPROVE AND PUBLISH          REJECT
        ↓                        ↓
rpc_luu_de_thi_len_phong()    no room write
        ↓
existing authoritative room safety checks
```

## Request model

`ai_exam_requests` stores the teacher, target school/subject/room, `exam_spec`, and the exact active knowledge documents selected for generation. If no explicit document list is supplied, the service selects all active knowledge documents in the target subject scope.

Typical `exam_spec`:

```json
{
  "assessment_type": "TOT_NGHIEP",
  "variant_count": 4,
  "counts": { "p1": 18, "p2": 4, "p3": 6 },
  "instructions": "Bám yêu cầu cần đạt; ưu tiên kiến thức cơ bản."
}
```

Supported assessment profiles remain exactly aligned with the current authoritative save/scoring path:

- `LEGACY`
- `TOT_NGHIEP`
- `MCQ_ONLY`
- `TRUE_FALSE_ONLY`
- `SHORT_ONLY`
- `CUSTOM`

## DAMSAN_EXAM_V1

The AI submits one canonical exam, not direct database rows. Required root fields are:

- `schema_version = DAMSAN_EXAM_V1`
- `title`
- `assessment_type`
- `scoring_config`
- `questions[]`

Every question must include `source_refs` containing one or more real `knowledge_units.unit_key` values from the supplied Knowledge Pack. Unknown unit keys fail validation. This gives a deterministic grounding check rather than trusting an AI statement that a question is source-based.

Part contracts:

- Part 1: `A/B/C/D` are required and `dap_an_dung` is one of `A/B/C/D`.
- Part 2: `A/B/C/D` are the four statements; answer has four `Đ/S` slots. ASCII `D` is normalized to `Đ`.
- Part 3: `dap_an_dung` is the canonical short-answer string; choice fields are removed from the canonical variant representation.

## Variant generation

The AI does not publish arbitrary variants. After validation, Đam San creates the requested number of variants deterministically. 031A rotates question order **within each part** while preserving the question/answer pair and part grouping. This is intentionally conservative: it avoids introducing answer-key corruption while establishing automatic multi-code generation. Choice-level shuffling and formula parameterization can be added as separate validated transforms later.

## Final approval boundary

AI submission can only create a `READY_FOR_REVIEW` draft. It cannot write to `phong_thi` or `de_thi`.

`rpc_ai_exam_approve_and_publish()` is the only new publish path. It requires the live teacher staff session and internally calls the existing `rpc_luu_de_thi_len_phong()` with the validated variants. Therefore existing room lifecycle, subject/school scope, overwrite, assessment profile, scoring configuration, and history guards remain authoritative.

`rpc_ai_exam_reject()` marks the request rejected and revokes outstanding AI capabilities without mutating the room.

## Provider-neutral execution

`exam-ai-bridge` does not call an OpenAI, Gemini, Anthropic, or other paid model API. The generation contract is designed for the web-model/connector path so an existing ChatGPT or Gemini web subscription can perform the reasoning. Wiring that consumer into a near-one-command user experience is a later UI/connector slice; 031A establishes the secure execution contract and final approval semantics.
