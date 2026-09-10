# KNOWLEDGE-030B1 — Secure Raw Document Upload

## Scope

This slice connects the KNOWLEDGE-030A persistence foundation to a teacher-facing raw-document ingestion entry point.

The teacher supplies ordinary source files exactly as they already exist. No lesson codes, page ranges, document type, grade, JSON schema, or manual chunking is required before upload.

Normal flow:

```text
knowledge.html
  -> existing damSan_StaffToken from sessionStorage
  -> knowledge-upload Edge Function
  -> validate custom staff session and teacher identity
  -> issue short-lived signed upload capability
  -> browser uploads raw bytes directly to private knowledge-source bucket
  -> Edge Function verifies the object and registers it
  -> rpc_knowledge_register_upload_service()
  -> knowledge_ingestion_jobs = QUEUED / EXTRACT
```

## Security properties

- The browser never receives the Supabase service-role key.
- The service-role key is read only inside the Edge Function from `SUPABASE_SERVICE_ROLE_KEY`.
- The Edge Function does not trust CORS as authentication. Every prepare/complete request validates the existing opaque staff token against `staff_sessions`, including revocation and expiry.
- `ma_gv` is bound to the teacher identity resolved from the token.
- Storage paths are generated server-side and scoped as `school_id/teacher_id/randomized-name`.
- Completion verifies the uploaded object exists before queue registration.
- A file-size mismatch is rejected and the suspect object is removed.
- Queue registration uses the service-only RPC introduced in KNOWLEDGE-030A.
- Protected knowledge tables remain inaccessible for direct browser mutation.

Because this project uses custom staff sessions rather than Supabase Auth JWT identities, the deployed `knowledge-upload` Edge Function must use `verify_jwt = false`. This does **not** make the operation anonymous: the function implements the project-specific staff-token authentication itself on every POST.

## Upload contract

Accepted MIME types remain aligned with the private bucket created by KNOWLEDGE-030A:

- `application/pdf`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

Maximum size: 50 MiB per file.

The only optional semantic input is a free-text hint. Example: "SGK Địa lí 12 Kết nối tri thức". Leaving it blank is valid and is the expected normal case when the file is self-describing.

## Teacher UI

`knowledge.html` is intentionally a standalone authenticated workspace in this slice. It reuses the existing teacher session in the same browser tab and supports multi-file drag/drop.

The page shows the persistent library through `rpc_knowledge_library_read()` and polls every five seconds while documents are in active pipeline states.

At the end of 030B1, newly uploaded documents remain `QUEUED`. That is intentional. The next slice, 030B2, attaches the automatic mechanical document reader:

```text
QUEUED / EXTRACT
  -> direct PDF/DOC/DOCX extraction
  -> scan detection
  -> OCR only when required
  -> page-preserving extraction artifact
  -> QUEUED / ANALYZE
```

030B2 still does not require the teacher to normalize or classify documents.

## Human-control invariant

Document ingestion contains no routine approval step. The one mandatory human decision remains later in the exam pipeline: the teacher reviews the complete generated exam and explicitly chooses APPROVE AND PUBLISH or REJECT.
