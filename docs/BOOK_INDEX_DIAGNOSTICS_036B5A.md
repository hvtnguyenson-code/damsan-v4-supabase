# BOOK_INDEX_DIAGNOSTICS_036B5A

Read-only production diagnostics for whole-book lesson boundary detection.

Goals:
- inspect the already-extracted OCR artifact; never re-OCR or upload the PDF again;
- expose bounded samples from early pages and likely lesson-heading pages;
- compare strict/relaxed `Bài N` token detection against the current parser;
- preserve all existing safety gates and never fall back to whole-book AI prompting;
- do not mutate `knowledge_documents.book_index`, revisions, jobs, or schema.

The diagnostic action is staff-authenticated and returns only bounded OCR snippets and detector metadata for the selected document. It is intended for short-lived production troubleshooting before a parser change is designed.
