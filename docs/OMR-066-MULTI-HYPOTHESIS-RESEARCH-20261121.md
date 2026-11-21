# OMR 066 — Multi-hypothesis fiducial registration (research branch)

Date: 21 November 2026
Branch: experiment/omr066-multihypothesis-fiducial
Parent: experiment/omr-v7-full-optimization-060 (Draft PR #205)

## Why this work is different from tuning 27 captured images
The existing 060 geometry path detects connected dark components, filters square-like shapes, and selects four *extreme* centroids from size-filtered pools. An unrelated large square on a tabletop, window frame, or part of a document can displace a true fiducial and prevent page registration. Replaying the same 27 captures cannot systematically expose that entire class of failures.

OMR 066 applies **multiple geometric hypotheses**, then corroborates them with independent, known internal fiducials, which are printed on the actual Ministry of Education 18/4/6 layout. This is a deterministic optical geometry improvement, not a trained model and not a threshold change fitted to photographed samples.

## External source review (design principles only, no third-party code copied)
1. Udayraj123/OMRChecker: preprocessing, configurable templates, perspective normalization, sheet-level mark threshold calibration. https://github.com/Udayraj123/OMRChecker
2. BayarovEmil/omr-system: find a coherent four-marker group instead of greedily picking one set of extrema; geometric consistency, per-sheet calibration, explicit refusal on low confidence. https://github.com/BayarovEmil/omr-system/blob/master/HOW_IT_WORKS.md
3. JayeshGChandan/SheetScanner: corner-marker alignment plus independent blank/multiple/ambiguous classifications; synthetic perspective/noise validation harness. https://github.com/JayeshGChandan/SheetScanner
4. aspose-omr-foss/Aspose.OMR-FOSS-for-Python: marker registration, robustness to rotation/skew, sheet-calibrated mark density. https://github.com/aspose-omr-foss/Aspose.OMR-FOSS-for-Python
5. drfperez/OMRSuite: browser-side OpenCV.js as a possible future route (a new heavy WASM dependency is not accepted without a real performance comparison). https://github.com/drfperez/OMRSuite

**No code imported from external repositories.** Ideas are independently implemented using the existing Dam San JS grayscale, connected-components and homography primitives; this avoids bringing new licenses/runtime dependencies into production.

## Implementation details
- `omr-v7-geometry-066.js` first runs the unchanged, internally validated 060 registration. If 060 succeeds, 066 returns the original homography/corners exactly (regression-free default).
- When 060 fails, take candidate square components (same conservative shape/size filters), rank multiple corner hypotheses, test distinct non-self-intersecting quadrilaterals with size consistency and minimum occupied area.
- Each trial must match **at least three separate internal controls**, from TOP-C, MID-L, MID-C, MID-R, P3-B3, with bounded reprojection RMSE and marker size. No internal confirmation = no accepting a geometric hypothesis. The 060 top-level score/threshold/answer logic is unchanged.
- A separate copy `omr-v7-pipeline-066.js` uses the 066 geometry fallback while preserving the 060 P1/P2/P3 and identity policy, `readOnly=true`, `validForSave=false`, and a distinct `V7_066` engine ID. It is not linked into the official V7 or published field PWA.

## Independent benchmark beyond real photos
`tests/omr_066_multihypothesis_fiducial_simulation.js` synthesizes pixel-level images from the PDF-derived template with **known ground truth**:
- Normal illuminated image: 060 and 066 must return *exactly the same* identity and all answers.
- Four extra dark square decoys beyond the physical sheet, which fool the 060 extrema: 066 must recover all real corner markers via internal controls and recover identity/answers.
- Skewed photograph with competing dark squares: 066 must recover true geometry without assuming corners coincide with picture boundaries.
- Fake document containing only corner squares but no internal controls must be **rejected**.
- Invalid image buffer must be rejected, and the alternate engine cannot be promoted into the 060 read-only bridge or official writer.

Run via existing OMR Camera Grading CI before any merge. Even with successful synthetic tests, **no accuracy improvement on real-world devices may be claimed until independent real-image tests**.

## Policy
- Research #205 remains Draft/MERGE_HOLD. This OMR 066 branch may be reviewed separately, never merged straight to `main`.
- No changes to official V7, student data, DB schema, production writer, or Supabase.
- The 27 eligible scans remain a regression set, not a training set. Capture 26 remains excluded from representative quality statistics.
- Defer new global Otsu thresholds or OpenCV.js until their own benchmarks show a measured gain without increasing double-mark false acceptance.
