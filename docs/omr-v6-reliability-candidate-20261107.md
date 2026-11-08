# OMR V6 — reliability candidate (07/11/2026)

## Immutable rollback baseline
Production comparison point: \`c67b242f8d7a3abe74814df6d328d3856be23a26\` (Teacher PWA 021, OMR V5).
Restore only the OMR upgrade by reverting its PR; never reset main, never modify production DB to roll back recognition. Before any release compare deployed Pages/Service Worker hash against the intended git version. This PR deliberately does not deploy a new recognition rule.

## Architecture decision: one calibration model
The V6 candidate learns normal pencil darkness and empty-bubble noise from the 18 P1 four-choice rows. For every candidate bubble:
- Four small background probes outside the printed circle estimate a local affine illumination plane, even on gray printed regions.
- Each center pixel is measured relative to its local paper brightness rather than using absolute grayscale thresholds.
- A single sheet-calibrated classifier decides single mark, blank, multiple clear marks or review.
- A confirmed two-mark response stays invalid per P1/P2 policy; an erased second mark does not automatically invalidate the response.
- The output includes *evidence* and lighting diagnostics, not invented probabilities.
- The four-corner homography, all P3 digit extraction, camera auto-capture, scoring and write/RPC paths remain untouched.
- **No teacher-page reference or import points to this module.** It is an offline candidate only, not another live OMR pipeline.

## Experiment design
Test 013 covers clean P1, different-strength erasures in P2, actual two-filled bubbles, blanks and loss of calibration. Each scene is rendered under daytime, multiplicative gradient and local lamp-shadow transforms. These are synthetic *lighting changes*, not independent real camera captures.

A local, private comparison (not committed) on the supplied 9002 rectified photo showed stable P2 readings for 1b=S, 1c=Đ, 2a=Đ and review for 2d under simulated brightness gradients. The unchanged V5 thresholds classified 2d as invalid-double in some variants and review in another. This is supporting evidence only: one photo cannot prove reliability across phones, shadows, glare, blur, angle and erasures. No identifiable sheet photos were uploaded to this repository.

## Gates before activating candidate in PWA
1. Offline measurements on the 9001 and 9002 genuine sheets plus at least one classroom collection with manually verified labels, multiple photos per difficult sheet.
2. Per-sheet score agreement, silent-error rate and review burden vs V5; hold out sheets by *physical paper*, not by photo.
3. Profile P50/P95 execution time on an Android phone, including the slowest supported device; no auto-capture delay regression.
4. Geometry validation of the interior control markers as diagnostics (not using them to pull the homography). Light and geometry issues must have separate review reasons.
5. If no objective gain, discard candidate and retain the baseline without any production rollback.

## Field test: opt-in V6 comparison on the existing teacher PWA
Teacher PWA version 022 adds a manual checkbox "Thử nghiệm V6 – đối chiếu V5/V6".
The mode is OFF by default and only shown in the mobile PWA. V5 processes
the original camera frame as before. V6 then checks the SAME frame, using V5
homography to normalize its geometry. Only P1/P2 are candidate V6 decisions;
P3, student ID and exam code remain the V5 values.

A lab capture is marked read-only even if the teacher later toggles modes.
The save button is hidden and disabled, and saveCurrent() checks the flag
before any RPC write. Switching modes discards the current scan and requires
a new capture. Any V6 error leaves the V5 analysis intact. All diagnostics
run locally without uploading images.

Use the existing Pages + CI deployment workflow; no preview hosting or
second deploy. Default V5 performance and canonical results are unchanged.
Scan a variety of real sheets (including 9002) under daytime/night lighting,
multiple angles and distances. Compare V5 score, tentative V6 score and
per-item differences. This test mode cannot write scores to the DB.

## Scope
Only new experimental module, regression test, this document and one extra step in the existing OMR CI workflow. No DB migration, live feature toggle, release workflow, PWA cache change or scoring behavior change.

## Reference sources
- Udayraj123/OMRChecker: sheet-level and per-question threshold calibration.
- sdaps/sdaps: confidence and coverage-based ink metrics.
- sajidbuet/OMRFlow: internal geometric validation and honest real-data qualification.
- Research cited in the investigation: pencil-mark personalization, illumination correction, abstention on undecidable regions.
Approach is original implementation; external code was not copied into this module.


## Phase 2 — Internal geometry verification, no warping
New offline-only \`inspectMarkerGeometry\` measures the center offset of each interior printed control square (ID/P1/P2/P3) from its expected position in the already rectified image. The locator uses local-background-adaptive binarization and connected components, rejecting thin circle outlines, oversized blobs and missing controls. It **never changes** the four-corner homography, the answer coordinates or a pupil's grade.

The residual is normalized to one answer-circle radius rather than raw pixels. Independent research measurements on the two private rectified sheets (images not committed):
| Region | 9001 P90 | 9002 P90 |
|:--|--:|--:|
| P1 | 0.60 R | 0.49 R |
| P2 | 0.44 R | 0.44 R |
| P3 | 0.68 R | 0.83 R |

These values come from two photographs and are not population confidence bounds. \`P3\` on 9002 crosses the **tentative 0.80 R diagnostic flag**. This is evidence of local image/template displacement, not proof that any particular answer was misread. Systematic registration/template errors may also contribute.

Experiment 014 covers centered controls, simulated night illumination, displaced P3, absent P2 controls and thin outlined lookalikes; all must pass. Treat missing/undetectable markers as *insufficient*, never as good geometry. No production feature or camera flow depends on this experimental diagnostic. A deployment gate requires multiple held-out physical sheets, not merely synthetic geometric shifts.


## Phase 3 — V6 evidence-first correction (2026-11-08)

A real teacher-PWA comparison returned the correct V5 baseline 8.25 for the difficult 9002 sheet but V6 produced 5 extra '?' answers and a hypothetical 7.00. The V5 result never changed and was never replaced by V6.

**Root cause:** the old V6 classifier rejected every marked circle where the spread of four nearby brightness probes exceeded 0.35, even when one circle was decisively darker than all others. Paper probe locations can coincide with printed text, frame lines or gray-to-white transitions. The spread cannot be interpreted as a direct test of mark certainty. The corrected decision order remains: check missing marks, confirmed multiple marks and substantial second marks; then use normalized top-vs-second evidence separation to decide if the first mark is clearly isolated; only when evidence is not decisive does anomalous surrounding brightness call for review. No new OMR pipeline, ML model or external dependencies were added.

**Local reference-image replay (not camera acceptance):** on two existing private rectified reference images, original V6 auto-recognized 18/34 and 24/34 P1/P2 answers. The evidence-first version auto-recognized 34/34 and 33/34; the remaining P2.2d still requests review. Original photos stay private and are not committed. A single snapshot cannot establish production accuracy.

The new OMR 016 regression tests the five false-review scenarios, strong erasures, two genuinely marked circles, weak marks under uneven light, blank marks and failed sheet calibration. The teacher comparison UI now explains each unresolved item in Vietnamese. PWA version 023 invalidates caches for the experimental V6 file. V5 recognition, geometry, P3, camera, grade rules, write guards and database are unchanged.

**Rollback:** revert this single PR and refresh teacher PWA cache to restore the prior V6 trial, with production V5 unaffected. The immediate pre-fix main SHA is `5a9be65d63a393403e01caa7dab4abebe8dfd860`; initial baseline `c67b242f8d7a3abe74814df6d328d3856be23a26`.


## Phase 4 — Independent V6 Part III recognizer (08/11/2026)

- V6 now extracts every mark in each of four P3 character columns using its own normalized, paper-relative pencil features; calibrates P3 separately using the six questions (24 columns); and decodes a numeric grammar with explicit minus, comma, digits and optional trailing blanks.
- V5 supplies only the already validated outer-four-marker homography, student ID and exam code. V6 **does not call V5 P3 recognition** and returns independent `p3`, `p3Evidence`, `p3Calibration` and per-column warning keys `P3.q.c`.
- Critical invariant: `300` is three selected characters and one trailing blank. `3000` and `3009` require an actual marked fourth column. A weak fourth mark produces an uncertain/question value, not an auto-appended digit. A gap between marked columns or malformed punctuation also causes review; no silent compaction.
- A column may be blank; a *clearly blank* column is not a warning. Strongly competing marks in one column cause review. The model does not use the answer key to infer missing digits or choose a score.
- Main V5 score/write operations are unchanged. Opt-in V6 comparison reports differences in all three sections and uses V6 P3 for its tentative score; it remains read-only, with the Save button guarded both visually and in the action handler.
- Two **private** rectified reference sheets were used locally to verify complete six-answer arrays. Both passed under the source image and four simulated transforms (horizontal illumination gradient, lamp shadow, dimming, mild blur). These are *not 10 independent camera photos*; the original photos are not checked into the repository. See OMR 017 synthetic regression for negative values, decimal placement, blank-vs-zero, double marks, erasures and invalid grammar.
- Performance and accuracy must still be evaluated in real PWA camera sessions before replacing V5. Teacher PWA version 024 contains a cache-busting revision of the optional V6 module.

Rollback: revert the single V6 P3 PR. Immediate baseline before P3 change: `e6a81f67a1046051d71d97bfb1f61b066c5664f7`. Do not roll back databases or reset main.
