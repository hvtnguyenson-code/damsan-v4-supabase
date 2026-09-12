# KNOWLEDGE-UI-043 — Simplify source intake

The raw-file upload capability remains required because every new textbook, regulation, benchmark or short source must first exist as an owned `knowledge_documents` record with the original file preserved for provenance.

What is retired from the primary teacher workflow is the large legacy upload/extraction presentation. The source-intake UI is therefore collapsed by default and presented as an auxiliary action, while the active normalization workflows remain primary.

Rules:
- Keep original-file upload available.
- Do not remove the extraction implementation yet; it still supplies physical PDF page metadata and supports short/text-clean documents.
- Remove the teacher-facing legacy hint field and verbose three-pipeline explanation from the intake card.
- Collapse intake by default when the library already contains documents; automatically open it only for an empty library.
- No changes to room/exam persistence or AI-to-room bridge.
