# OMR-064 — Field PWA update reliability, identity provenance and batch export
Date: 2026-11-21

## Evidence basis (privacy-safe aggregate only)
An uploaded, private 20-capture OMR 060 ZIP was reviewed locally. It contains
three previously tested captures and 17 later captures; several later images
are rescans of the same physical sheets. The manifest identifies 28 stored
captures but only 20 were present in the uploaded ZIP.

- 10/20 had no 060 review alerts.
- 6/20 were recognized with P3-related review alerts.
- 4/20 were rejected for ambiguous SBD or exam-code bubbles.
- In 18 captures where V7 produced a comparable answer set, P1/P2/P3 answer
  comparison was unchanged; the legacy JSON incorrectly reported two phantom
  identity differences because it came from a stale offline PWA build.
- Two sheets had clearly written identifiers different from the corresponding
  bubble values; the bubbles were individually unambiguous. This is a **roster
  binding/business validation** gap, not a reason to change the optical
  ranking. Do not infer that an accepted bubble ID identifies a real student.
- Repeat captures of the same physical sheet yielded different review verdicts
  in some cases; keep fail-closed review thresholds. No handwriting OCR is added.
- Teacher review verdicts in the export were all unchecked. These images are
  not yet a fully adjudicated ground-truth benchmark.
- No student names, IDs, images, notes or raw ZIP are committed.

## Change
- SW cache version increments to v3, update install calls skipWaiting and
  activate claims **only the field-PWA scope**. Existing IndexedDB captures
  are not modified. No changes to teacher PWA or production V7.
- Page displays field build OMR060_FIELD_064; exported manifest carries
  exportBuild and new captures carry build. Old records without a build remain
  identifiable as legacy from missing field; their comparisons are normalized
  at export time with the earlier raw evidence preserved in JSON.
- The UI explicitly states that decoded SBD bubbles have **not** been verified
  against a room/student roster. An optional manually entered expected SBD is
  marked as a manual comparison, not as a roster verification.
- Add a selectable export batch range, so users can request captures 21–28
  after restarting the PWA rather than relying on an in-memory offset.
- New update banner offers a reload action only on user tap; capture remains
  locally stored across update.

## Gates
- Field static inventory/regression and Chromium: camera input, local evidence,
  batch ZIP, reload, offline, unverified roster status and version.
- OMR and Submission Safety workflows must PASS.
- Keep research PR #205 Draft/Merge Hold; do not modify core OMR algorithms,
  official V7, API writer, Supabase migrations, or official student data.
