# OMR V7 research 039 — multi-marker geometry and TNMaker-style diagnostic overlay

Branch: research/omr-v7-local-geometry-overlay-20261115 (base main 395135d0c6135440def50281b87c65eea40fe665). **Do not merge or deploy without image-based acceptance.**

## What is implemented
1. V7 **retains the exact V6 copied recognizer**. The normal save-enabled path remains untouched, V6 official and V5 fallback remain untouched. Only V6/V7 comparison enables research improvements and never writes grades.
2. Geometry: \`omr-v7-geometry.js\` now retains *verified internal control marker* positions after region-median outlier rejection. A new \`offsetAt\` uses nearby anchors for each bubble, weighted by spatial distance. Reject if calibration fails, insufficient markers, or local displacement disagrees with the region model. It can only propose offsets for the already **restricted** V7 lighting-review recovery. It never shifts an accepted V6 mark or applies a whole-page warp.
3. Diagnostic overlay: \`omr-v7-overlay.js\` maps canonical template points onto the **same rectified image** sent to both engines. It shows interior control markers, observed-to-predicted marker residuals, and recognition positions: detected single (green), uncertain (amber), multiple (red). Blank values are neutral. Detection is not necessarily correctness. Nothing is sent to a server or written to score metadata.
4. PWA compare UI gains a collapsed "Bản đồ định vị V7" panel, hidden outside read-only V6/V7 compare mode. The panel redraws on each scan, clears on reset and does not modify save state. Teacher PWA revision is prepared as \`20261115-teacher-pwa-037\` with a **unique recovery bridge file** to avoid stale installed SW module shadowing. Existing bridge files remain for older clients.
5. Test 039: marker interpolation, outlier/failure fallbacks, V6 parity, overlay labels and draw, no writer. Existing OMR/teacher PWA CI remains in place. No DB, Supabase RPC or deployment mechanism changes.

## Acceptance gate for next stage
- Compare with physically verified filled bubbles on independent images: at least the original 3 test papers + hard cases (folded sheet, off-center camera, shadow, erase/re-mark, two selections, zero or one answered P3).
- Report error rate **including silent errors** and marker residual distribution; don't accept "fewer warnings" as proof of more accurate scoring.
- Only consider granting save-enabled V7 enhancements after field-validation proves at least equal precision and no regression on already-correct V6 examples.
- TNMaker screenshot was an external visual reference, not reverse-engineered code, and is not stored in the repository.
