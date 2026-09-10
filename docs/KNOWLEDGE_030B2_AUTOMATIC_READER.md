# KNOWLEDGE-030B2 — Automatic Document Reader

## Objective

After the teacher selects ordinary PDF/PDF-scan/DOC/DOCX sources, the normal path must continue automatically from secure raw upload into mechanical document reading. The teacher is not asked to split lessons, mark pages, classify document type, or produce system JSON.

```text
raw document
  -> secure upload (030B1)
  -> automatic reader (030B2)
  -> private DAMSAN_EXTRACT_V1 artifact
  -> EXTRACTED / ANALYZE
  -> AI semantic analyzer (030C)
```

030B2 is intentionally not the semantic AI analyzer. It produces a trustworthy, page-aware text substrate for 030C.

## Execution split

### Browser = mechanical compute plane

The browser already has the selected file bytes and can perform the expensive, parallel-friendly operations without exposing database credentials:

- PDF text-layer extraction with PDF.js;
- selective rendering/OCR of only sparse PDF pages;
- DOCX raw-text extraction with Mammoth;
- legacy Word 97–2003 DOC extraction with the reviewed 0BSD `docToText` implementation.

For PDF OCR, Tesseract.js runs `vie+eng`. OCR is not applied to every page. A page first goes through PDF.js; only pages with too little usable extracted text are rendered and sent to OCR.

This split avoids making Supabase Edge Functions the heavy PDF/OCR runtime. Edge remains the security and persistence boundary.

### Edge Function = security/persistence plane

`knowledge-extraction` validates the existing custom opaque staff session, checks document ownership and job identity, creates a short-lived signed upload capability for a private extraction artifact, verifies the uploaded object, sanitizes the small manifest, and invokes `rpc_knowledge_commit_extraction_service`.

The service-role key never reaches browser code.

## Private extraction artifact

Bucket: `knowledge-artifacts`

- private;
- JSON only;
- 8 MiB per artifact;
- path scoped by school / teacher / document / ingestion job.

The full extracted text is stored once in this private artifact. PostgreSQL receives only a compact `extraction_manifest`, preventing unnecessary duplication of textbook-scale text.

Schema identifier:

```text
DAMSAN_EXTRACT_V1
```

Representative shape:

```json
{
  "schema_version": "DAMSAN_EXTRACT_V1",
  "reader_version": "030B2",
  "source": {
    "filename": "SGK_Dia_li_12.pdf",
    "mime_type": "application/pdf"
  },
  "source_format": "PDF",
  "boundary_mode": "PDF_PAGE",
  "pages": [
    {
      "page_number": 1,
      "text": "...",
      "method": "PDF_TEXT",
      "confidence": null
    }
  ],
  "extraction": {
    "method": "PDFJS_TEXT_PLUS_SELECTIVE_TESSERACT",
    "ocr_pages": [14, 77],
    "ocr_unresolved_pages": []
  }
}
```

## Page and boundary semantics

PDF has a stable physical page model, so every PDF page is retained separately and `boundary_mode=PDF_PAGE`.

DOCX and legacy DOC do not have a reliable physical pagination model without a full Word-compatible layout engine. They are therefore extracted as `boundary_mode=LOGICAL_DOCUMENT`. 030C must infer semantic lesson/section boundaries from content rather than pretending that a Word document's physical page count is authoritative.

## OCR quality behavior

A sparse PDF page is a candidate for OCR. After OCR:

- OCR text replaces sparse direct text only when it yields more usable text;
- the OCR engine and page numbers are recorded;
- pages still lacking usable text are placed in `ocr_unresolved_pages`;
- any unresolved pages make extraction quality `PARTIAL` rather than silently claiming completeness.

030C must treat `PARTIAL` as a quality signal. It may not auto-promote uncertain missing content into authoritative knowledge.

## Queue transition

030B2 adds `EXTRACTED` to the document pipeline. A successful extraction commit performs:

```text
knowledge_documents.pipeline_status = EXTRACTED
knowledge_ingestion_jobs.status      = QUEUED
knowledge_ingestion_jobs.current_stage = ANALYZE
```

The extraction worker claim RPC is also tightened to claim only jobs whose current stage is `EXTRACT`. This prevents an `ANALYZE` job from being accidentally pulled backward into extraction.

## Dependency pinning

The browser reader pins the components that materially affect parsing behavior:

- PDF.js `6.3.289`;
- Mammoth `1.12.2`;
- Tesseract.js `7.0.0`;
- legacy DOC reader `Alpaq92/JSDoc` exact revision `821695a884e0c0bb8592a635d9524bb3e116cd67` (0BSD).

The legacy DOC reader is loaded from an exact commit rather than a moving branch/tag.

## Failure and retry behavior

Raw upload and extraction are deliberately separate durability stages. If raw upload succeeds but local parsing/OCR or artifact persistence fails, the original source remains safely stored and registered; it is not deleted merely because reading failed. The current page retains the raw-upload result so the teacher can retry the reader without uploading the same source again during that session.

A later reliability slice may add resumable source re-download so an interrupted browser session can resume extraction after reload without re-selecting the local file. This is an exception-recovery enhancement, not a prerequisite for the normal one-action path.

## Human-control invariant

No new mandatory review gate is introduced here. In the normal path the machine reads source documents automatically. The mandatory human decision remains the future final exam preview:

```text
APPROVE AND PUBLISH / REJECT
```

The extraction artifact does not publish an exam and cannot bypass that authority.
