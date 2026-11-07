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
