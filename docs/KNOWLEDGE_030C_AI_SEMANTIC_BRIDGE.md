# KNOWLEDGE-030C — AI Semantic Analysis Bridge

## Goal

Convert the extracted `DAMSAN_EXTRACT_V1` artifact into structured, provenance-preserving knowledge without asking the teacher to normalize the source document.

This slice deliberately separates the **AI model runtime** from the Đam San security boundary. ChatGPT, Gemini, or another web AI may perform the semantic reasoning, but it never receives Supabase credentials or the teacher's staff token.

## Flow

```text
DAMSAN_EXTRACT_V1 (private Storage)
        ↓
teacher session creates short-lived ANALYZE capability
        ↓
AI client calls knowledge-ai-bridge with capability only
        ↓
bridge returns DAMSAN_ANALYSIS_INPUT_V1
        ↓
AI returns DAMSAN_KNOWLEDGE_V1
        ↓
server deterministic validator
        ↓
rpc_knowledge_commit_analysis_service()
        ↓
knowledge_units revision
        ↓
AUTO_ACCEPTED or NEEDS_REVIEW
```

The normal ingestion path remains automatic. `NEEDS_REVIEW` is an exception state for low-confidence or incomplete extraction and is **not** a routine teacher approval gate.

## Capability security

`knowledge_ai_handoffs` stores only a SHA-256 digest of the capability token. A raw capability is returned once by the Edge Function and is never persisted in PostgreSQL.

A capability is:

- scoped to one document and one ingestion job;
- scoped to purpose `ANALYZE`;
- short lived (maximum two hours);
- revocable by issuing a replacement capability;
- unusable after completion or expiry;
- independent of `damSan_StaffToken`.

The AI-facing calls therefore do not expose the custom teacher session, service-role key, database connection string, or unrestricted Storage access.

## Canonical AI output

The bridge accepts `DAMSAN_KNOWLEDGE_V1` with document metadata plus an array of structured knowledge units. Each unit carries hierarchy, content, provenance, confidence, and optional physical page boundaries. For DOC/DOCX, physical page numbers may legitimately be absent; provenance must still identify the source document and logical source location.

## Deterministic quality gate

The AI does **not** choose `AUTO_ACCEPTED` itself. The server derives the quality state from structural checks and extraction quality. A revision is auto-accepted only when all of the following are true:

- extraction quality is `COMPLETE`;
- there are no unresolved OCR pages;
- the analysis has at least three units;
- no more than 20% of units have confidence below `0.70`;
- no more than 10% of units are missing meaningful provenance;
- canonical schema and unit structure pass the existing commit RPC validation.

Otherwise the revision is preserved as `NEEDS_REVIEW`; any previous active revision remains active.

## Provider-neutral runtime

The bridge does not hard-code OpenAI, Google, Anthropic, or any API-key based provider. This is intentional. It is compatible with a future ChatGPT/Gemini web connector or browser agent, allowing the user's existing web-model subscription to perform reasoning without embedding a paid model API key in Đam San.

## Human-control invariant

Knowledge analysis does not introduce a routine approval click. The single mandatory teacher decision remains at the later **complete exam preview → APPROVE AND PUBLISH / REJECT** boundary.
