# OMR V7: per-column sparse calibration (research)

Observed error: V6 P3 calibration requires 8 marked numeric positions even if the pupil answers zero, one or two questions; on the uploaded code-103 paper only 175 and 15 were marked and all 24 positions were flagged.

Independent V7-only extension omr-v7-sparse-p3.js uses the same V6 copied bubble measurements, rank, numeric grammar, and P1 pencil reference if no P3 mark is available.
No minimum positive-mark count; classify each column and then each of the six answers separately. Distinguish completely blank from literal digit 0. Two marks, faint strokes, missing middle digits, and geometry failure remain uncertain.
This module applies ONLY in the PWA V6/V7 read-only comparison mode with experimentalRefinement:true. Default V6 and save-enabled V7 remain unchanged.
All-blank P3 with no P1 reference uses a strict all-columns-low-ink gate; a nonblank ambiguous column stays review, never auto-guessed.
Tests: 0 to 6 answered questions, all blank, digit zero, faint stroke, double marks, missing position, bad geometry, untouched V6 copy and PWA dependency registration.
Original camera frame is not available; ground truth on the user's photo must still be validated before enabling point-saving or production PWA rollout.
Do not merge or deploy from this research branch solely on simulation CI.
