# 038/039 — Normalized Knowledge Source + Assessment Authority

## Decision

Large or layout-complex PDFs are no longer required to pass a bespoke whole-book parser before they can become reliable knowledge sources.

The canonical workflow is:

1. Keep the original PDF/DOC/DOCX privately as provenance.
2. Teacher explicitly selects **subject scope**, **grade**, and **source role**.
3. ChatGPT/Gemini web reads the original file and normalizes it to `DAMSAN_SOURCE_V2` JSONL.
4. Đam San validates schema, physical PDF page provenance, full-page coverage, grade, source role, record types, lesson identity, and unit keys.
5. A validated revision is committed into `knowledge_units`.

The old PDF.js/Tesseract path remains useful for short or clean documents and as a fallback/extraction aid. It is no longer the only route for long textbooks.

## Source roles

`KNOWLEDGE_SOURCE`
: Facts/content that may be tested. Textbooks, learning materials, curriculum content.

`ASSESSMENT_RULE`
: Authoritative rules that define **how** an exam must be written and scored. Never used as factual content for a question.

`ASSESSMENT_BENCHMARK`
: Reference/mock/official sample exams used to learn item-writing patterns, stimulus patterns, difficulty style, and structure. They are never copied verbatim and never become factual knowledge sources.

These roles are intentionally separate. `rpc_knowledge_scope_catalog_read` and `rpc_ai_exam_knowledge_pack_service` expose only `KNOWLEDGE_SOURCE`.

## Grade is mandatory

During normalized-source creation the teacher must choose exactly one of grades 10, 11, or 12. There is no “all grades” option.

During exam generation `exam_spec.grade` is mandatory. The server allows only active `KNOWLEDGE_SOURCE` documents of the same grade into the request and the Knowledge Pack.

This is enforced server-side; browser filtering is only UX defense-in-depth.

## DAMSAN_SOURCE_V2

The first JSONL record must be a manifest. Important fields:

```json
{
  "record_type": "manifest",
  "schema_version": "DAMSAN_SOURCE_V2",
  "source_role": "KNOWLEDGE_SOURCE",
  "subject_name": "Địa lí",
  "grade": 12,
  "title": "SGK Địa lí 12",
  "coverage": {
    "source_page_count": 178,
    "processed_pages_count": 178,
    "missing_pages": [],
    "uncertain_pages": []
  }
}
```

All provenance page numbers are **physical PDF pages, 1-based**, not printed book page labels.

For knowledge sources, the corpus contains `lesson` records plus `knowledge_block`, `table`, `figure`, and/or `learning_outcome` records. A knowledge source without lessons is rejected.

For authority sources, the corpus contains only `assessment_rule` records.

For benchmark sources, the corpus contains only `benchmark_pattern` records. Benchmark patterns describe structure; they do not store reusable copied questions.

`missing_pages` must be empty and `processed_pages_count` must equal `source_page_count`. `uncertain_pages` may be non-empty; that results in `NEEDS_REVIEW` instead of silently activating an uncertain revision.

## Assessment Authority plane

`assessment_authority_profiles` stores machine-readable policy profiles. `assessment_profile_sources` links profiles to normalized regulation and benchmark documents.

Request creation stores an immutable authority snapshot in `exam_spec.assessment_authority`, including a snapshot hash and source state.

Authority precedence is:

1. Official regulation / assessment rule.
2. Official reference/official exam benchmark.
3. Lower-rank benchmark sources.
4. Teacher style requests.

A benchmark can influence **form**, never factual content. Question `source_refs` must always resolve to Knowledge Pack units.

## Geography 12 TNTHPT

`DIA_LI_TNTHPT_2025_PLUS_V1` is seeded as the initial 039 profile.

For `grade=12` + `assessment_type=TOT_NGHIEP`:

- P1 = 18 questions.
- P2 = 4 true/false clusters.
- P3 = 6 short-answer questions.
- The server locks this blueprint during request creation.
- The server re-checks the generated draft with `_ai_exam_authority_gate_039`.
- Existing 037 deterministic quality gates remain active.

A shortened practice test must use another assessment type rather than altering the official TNTHPT blueprint.

## Authority source state

The authority panel exposes one of:

- `VERIFIED_SOURCES`: all declared required source documents are linked and active.
- `DECLARED_NOT_ATTACHED`: machine profile exists, but one or more declared source files have not yet been normalized/linked.
- `MACHINE_PROFILE_ONLY`: profile has no declared required source corpus.

The UI shows this state explicitly. It must never claim that a regulation/reference source was verified when only a hard-coded machine profile exists.

## Security boundaries

- Raw originals and normalized JSONL remain in private Storage buckets.
- `knowledge-normalized-source` uses the existing opaque staff-session boundary and document ownership checks.
- Direct table access to authority registry tables is revoked from anon/authenticated.
- Canonical normalized import is service-role only.
- Grade/source-role restrictions are repeated at request creation and Knowledge Pack construction.
- The draft store runs knowledge-scope gate, existing 037 assessment gate, then 039 authority gate before a draft becomes reviewable.

## AI Web policy

No paid model API is required. The browser produces a prompt, the teacher opens ChatGPT/Gemini and attaches the original document, and the returned JSONL is imported back through deterministic validation.

The AI is a document-normalization worker or exam-generation worker. It is not the final authority. Server gates and teacher approval remain the final boundaries.
