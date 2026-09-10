# AI-native Knowledge and Exam Automation Architecture

**Task:** KNOWLEDGE-030A

## 1. Product objective

The teacher must be able to provide ordinary source documents as they already exist: PDF, scanned PDF, DOC, or DOCX. The system must not require the teacher to rewrite those documents into a special template, manually split them by lesson, or manually create metadata before the system can use them.

The target workflow is:

```text
raw source documents
        |
        v
automatic extraction / OCR when needed
        |
        v
AI semantic analysis and structural decomposition
        |
        v
validated structured knowledge revisions
        |
        v
knowledge resolver builds only the relevant source pack
        |
        v
AI creates an exam draft
        |
        v
deterministic exam validation + AI self-check
        |
        v
ONE mandatory teacher decision: APPROVE AND PUBLISH / REJECT
        |
        v
existing secure exam-save path -> exam room
```

The only mandatory human decision in the normal exam-authoring path is the final approval of the generated exam before publication. Knowledge ingestion is automatic in the normal case. Human intervention in document ingestion is an exception path only when extraction or confidence is insufficient.

## 2. Non-negotiable design rules

1. Raw documents are accepted as source material. The teacher is not the normalization worker.
2. Deterministic extraction is preferred when the source already contains usable text. AI is used for semantic analysis, classification, hierarchy reconstruction, lesson/section detection, and quality review; OCR is used only when the source is image-based or text extraction is inadequate.
3. Original source files remain private and are stored in Supabase Storage. PostgreSQL stores metadata, structured units, provenance, and processing state, not duplicate binary blobs.
4. No AI provider receives database credentials, staff tokens, service-role keys, or unrestricted Storage access.
5. AI output never becomes an exam directly. It must pass a canonical schema and deterministic validation first.
6. A generated exam cannot enter the existing secure save/publish path until the teacher explicitly approves the final preview.
7. The knowledge schema is provider-neutral. ChatGPT, Gemini, another model, or a later browser bridge can supply analysis without changing the persistence contract.
8. Do not add embeddings/vector RAG by default. Retrieval starts with deterministic structure: subject -> grade -> document -> lesson -> section -> page/unit. Semantic retrieval can be added only if a concrete need appears.
9. Every knowledge unit keeps provenance back to its source document and page/section where available.
10. Re-analysis is revisioned. A poor new AI analysis must not silently destroy a previously usable revision.

## 3. Knowledge ingestion state machine

Normal path:

```text
QUEUED
  -> EXTRACTING
  -> OCR (only if required)
  -> ANALYZING
  -> READY / AUTO_ACCEPTED
```

Exception path:

```text
ANALYZING
  -> READY / NEEDS_REVIEW
```

Failure path:

```text
EXTRACTING | OCR | ANALYZING
  -> FAILED
```

`AUTO_ACCEPTED` means automated extraction, semantic analysis, and deterministic validation produced a sufficiently reliable revision. `NEEDS_REVIEW` means the revision is retained for diagnosis or optional human inspection but does not automatically replace a prior active revision.

A document can therefore have:

- `analysis_revision`: newest AI-produced revision;
- `active_revision`: revision currently permitted for downstream knowledge packs.

If revision 3 is active and a later revision 4 is low-confidence, revision 3 remains active until revision 4 is corrected or deliberately accepted by a future exception-review workflow.

## 4. Persistent model introduced by KNOWLEDGE-030A

### `knowledge_documents`

One row per uploaded source file. It stores source identity, inferred/canonical document metadata, pipeline status, AI analysis manifest, latest revision, and active revision.

The initial upload contract deliberately requires only raw-file identity plus optional context hints. Subject context can be inherited automatically from the logged-in teacher/workspace. Grade, document type, lesson hierarchy, page structure, and similar metadata are expected to be inferred later by the processing pipeline.

### `knowledge_units`

One row per structured unit in one analysis revision. Units can represent documents, lessons, sections, paragraphs, facts, tables, figures, learning outcomes, assessment rules, or teacher authoring rules.

The authoritative content is stored once in `content` JSON. The foundation intentionally does not duplicate the same large text into a second search-text column and does not store embeddings.

### `knowledge_ingestion_jobs`

A queue/control-plane table for automatic document processing. Workers claim jobs with `FOR UPDATE SKIP LOCKED`, allowing later parallel execution without two workers processing the same source simultaneously.

The queue records the current stage, attempts, worker identity, pipeline version, provider/model metadata, metrics, and failures.

## 5. Raw file storage

Bucket: `knowledge-source`

Properties in this phase:

- private bucket;
- current size limit: 50 MiB per file, aligned with the current project/free-tier operational limit;
- accepted source MIME types: PDF, DOC, DOCX;
- no anonymous direct object write path;
- no public raw-source URL.

A later Edge Function will issue short-lived signed upload capability only after validating the existing custom staff session. Large files will upload directly to Storage using signed-upload capability rather than passing the entire document through the Edge Function body.

## 6. Security boundary

The existing application uses custom `staff_sessions`, not Supabase Auth user identities. Knowledge persistence therefore follows the same control-plane pattern:

```text
teacher browser
   -> existing custom staff token
   -> trusted RPC / Edge Function boundary
   -> private tables and private Storage
```

Service-only functions are explicitly revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`. Browser-side code must never receive the service-role key.

The teacher-facing library read RPC validates the staff token through `_staff_session_gv_id()` and binds the supplied teacher code to the session identity. Normal teachers see their own source library in this foundation; Admin can inspect the complete library.

## 7. Planned processing pipeline

The next phases build on this foundation without changing the raw-document contract.

### 030B - Secure upload and document reader

- teacher selects or drops raw PDF/DOC/DOCX;
- secure signed upload to private Storage;
- automatic queue registration;
- direct text extraction for text-based PDF/DOCX where feasible;
- scanned-document detection;
- OCR fallback for scanned pages;
- page boundaries retained.

### 030C - AI semantic analyzer

- infer document title/type/grade/subject hints;
- detect chapters, lessons, sections, tables, figures, requirements, and assessment rules;
- build `knowledge_units` automatically;
- attach page/section provenance;
- calculate quality signals;
- deterministic validator decides `AUTO_ACCEPTED` vs `NEEDS_REVIEW`;
- provider-neutral adapter so the persistence layer does not depend on one model vendor.

### 030D - Knowledge resolver and pack builder

Teacher requests content such as "Địa lí 12 - Bài 6 và Bài 7". The resolver retrieves only active units matching the requested scope and constructs a bounded `DAMSAN_KNOWLEDGE_PACK_V1` instead of repeatedly sending whole textbooks.

### 030E - AI exam draft contract

AI output is normalized to `DAMSAN_EXAM_V1`, mapped to the currently supported Parts I/II/III model, validated structurally and semantically as far as deterministic checks allow, and displayed as one complete preview.

### 030F - Single-decision publish orchestration

The normal teacher workflow becomes:

```text
choose scope + exam requirements
        -> system gathers knowledge
        -> AI generates
        -> system validates/self-checks
        -> final preview
        -> teacher clicks APPROVE AND PUBLISH
        -> existing luuDeThiLenSupabase()
        -> rpc_luu_de_thi_len_phong()
        -> room ready
```

The teacher may reject the draft and request regeneration, but the system must not require intermediate copy/paste, JSON editing, metadata entry, or manual question-bank conversion.

## 8. AI execution strategy

The schema intentionally does not assume a paid model API. The processing worker can later use one of several execution adapters:

- a programmatic provider when a suitable free/paid API is configured;
- a controlled web-AI bridge for high-quality teacher-side generation;
- another trusted model execution environment.

The provider adapter receives only the bounded source material required for its task. It never receives Supabase credentials or staff-session secrets.

For document ingestion, deterministic parsing/OCR should do as much mechanical work as possible before AI. This reduces token usage and makes the AI responsible for the task it is best suited to: semantic structure and interpretation rather than byte-level document decoding.

## 9. The single mandatory human gate

The architecture distinguishes two concepts:

- **automatic knowledge quality control:** routine and machine-driven;
- **exam publication authority:** always human-controlled.

No generated exam may be published merely because an AI model or validator returned success. The final exam preview must enter a `READY_FOR_APPROVAL` state. Only an explicit teacher action may transition it to the existing save/publish boundary.

This invariant must remain true even if future phases automate source selection, room creation, question generation, variant generation, scoring configuration, and upload.

## 10. Scope deliberately excluded from KNOWLEDGE-030A

This phase does not yet:

- upload files from the teacher UI;
- parse PDF/DOC/DOCX bytes;
- run OCR;
- call an AI model;
- build knowledge packs;
- generate exam questions;
- publish an exam;
- change the existing student runtime or grading logic.

It only establishes the secure, revisioned, automation-first persistence/control plane required for those phases.
