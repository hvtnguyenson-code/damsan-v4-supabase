# CHUNKED NORMALIZATION 042

Long knowledge documents are normalized as a staged workflow instead of one model response for the whole book.

## Boundary

- `KNOWLEDGE_SOURCE` documents with more than 40 physical PDF pages use the chunked path.
- Existing one-shot `DAMSAN_SOURCE_V2` stays available for short knowledge documents and for assessment-rule / benchmark documents.
- The AI authoring -> room boundary is unchanged. This feature only prepares `knowledge_units` and never writes room/exam tables.

## Pipeline

1. **Structure scanner** (`DAMSAN_SOURCE_PLAN_V1`) maps the document into disjoint physical-page ranges: lessons, non-lesson ranges, or unresolved ranges.
2. Server validates that ranges cover physical pages `1..N` exactly once and deterministically splits lesson ranges into balanced chunks of at most 12 pages.
3. **Lesson chunk worker** processes exactly one assigned chunk and emits `chunk_status` plus content records. It never emits a whole-book manifest and never chooses lesson metadata.
4. Chunk importer validates page coverage and locks lesson/page identity from the server plan. Missing pages keep the chunk `INCOMPLETE`; uncertain pages keep it `NEEDS_REVIEW`.
5. **Assembler** runs only after every lesson chunk has no missing pages and the plan has no unresolved ranges. It generates lesson records, merges content records, computes final coverage from validated chunks, creates the final `DAMSAN_SOURCE_V2` manifest, and calls the existing canonical normalized-source import service.

## Coverage semantics

- `processed_pages` means pages the chunk worker actually read.
- `missing_pages` are assigned pages not read.
- `uncertain_pages` must be a subset of `processed_pages`.
- Every assigned lesson page must appear in exactly one of `processed_pages` or `missing_pages`.
- Non-lesson ranges are structurally accounted by the scanner and are recorded in the final manifest notes; they do not become factual knowledge units.
- Final `processed_pages_count` is computed by the assembler. It is never pre-filled in a worker prompt.

## Unit keys

Chunked content uses a collision-safe prefix:

`BAI_XX_CYY_U001`, `BAI_XX_CYY_T001`, `BAI_XX_CYY_F001`, `BAI_XX_CYY_LO001`.

The assembler creates one canonical lesson unit per lesson: `LESSON:BAI_XX`.
