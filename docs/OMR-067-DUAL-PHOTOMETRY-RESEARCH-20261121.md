# OMR 067 — Adaptive dual photometry, independent recognition evidence

Parent 066: `9f10be89cd2b84de6e5c80da67dccdf0c7b6b9f7`; #211 remains Draft. No production deployment.

## Research rationale
Apply established OMR concepts of per-form calibration and local illumination correction, informed by Udayraj123/OMRChecker, BayarovEmil/omr-system and JayeshGChandan/SheetScanner (see OMR-066-MULTI-HYPOTHESIS-RESEARCH). This is independent JavaScript implementation, without copying third-party source or importing new dependencies. 066 geometry and the original V7 candidate remain byte-for-byte unchanged.

## Algorithm
- Eight annular background sectors; estimate local paper brightness/gradient and monitor residual variation.
- Measure center, outer interior, intermediate annulus and four-quadrant coverage separately, excluding printed outer ring as much as possible.
- Robust per-field quantile calibration using the lower ranked bubbles, with absolute floors and field-specific positive ink depth. No forced two-class separation of entirely blank fields.
- Recognize broad filled marks with a lighter center only with strong intermediate-annulus coverage in all quadrants and sufficient contrast. Comparable two clear marks remain invalid; unequal strong depth suggests erasure ambiguity, not an automatic second valid mark.
- Independent classifier plus conservative fusion: irreversible multiple marks preserved; a resolved answer cannot silently flip; recovery of a prior review requires the same strongest legacy position and no strong competing legacy evidence. New independently confirmed multiple/conflicting evidence can veto an existing determination. Strict blank evidence can resolve a numeric review. P3 decoding uses the existing positional grammar, not a guessed character or a presumed answer.
- Identity is veto-only; expected student/exam checking remains intact. No student roster verification claimed. Recognized results remain readOnly=true, validForSave=false, distinct V7_067 engine, no official score writer.

## Local measured results (Node 22; tested source and test blobs verified identical)
Benchmark: 108 generated rectified images, 12 per mode, two deterministic seed ranges; 58 answer groups per image (18 P1 choices, 16 P2 statements, 24 P3 symbol columns). Includes clean, smoothly varying illumination, noise, faint graphite, broad hollow-center fill, off-center fill, sparse P3, double marks and weak erasure traces. These are **engineered tests**, not a representative estimate of exam accuracy or a blinded external dataset. They do not cover every printing/camera artifact.
- All 6,264 evaluated groups: unchanged 066 mark engine 6,240 correct, 24 review, 0 wrong/0 missed; independent measurement and fused 067 each 6,264 correct, 0 wrong/0 missed.
- Hollow-center mode: 672/696 to 696/696, 24 resolved reviews. Other eight modes unchanged in aggregate. No previously accepted single is flipped to a different answer; confirmed multiple remains multiple.
- Full-image integration on a clean synthetic sheet: exact identity and answer parity, sparse P3 values including -7 and 3,5; mismatch veto; 067 cannot pass the 066 research bridge. All outputs are read-only.
- Private replay of 27 eligible real JPEGs (capture 26 excluded): 26/27 answer-identical; a single numeric column on another already flagged sheet changed from resolved comma to review due to uneven competing strong ink evidence (P3.3.3). This is a cautious additional ambiguity, not a proven recognition gain; visual crop shows a gray competing trace and dark comma, so intentional mark vs erased graphite cannot be established. No accepted sheet becomes rejected, and 5 identity-rejected sheets stay rejected; 13 no review, 9 recognized with review, 5 identity-rejected. One already blocked identity column gained independent corroboration. Approximate local wall time 066 124.4 ms, 067 168.4 ms per image; not mobile performance.
- No private images or student identifiers committed. Keep 067 Draft; no real-world overall improvement claim. The erasure/mark ambiguity remains a difficult optical identifiability problem. Need broader independent mixed degradation, real ground truth, and mobile latency testing before changing production.
