# OMR 068 — spatial consensus and cached photometry

Research-only child of 067 PR #212. No production entrypoint, official V7, 066, 067, DB, scoring, identity binding or field PWA is modified.

## Implementation
- Cache bounded immutable geometric sampling plans by template layout and resolution, never pixels or decisions. Preserve the 067 measurement equations and ordering.
- Independently recheck eligible review-to-single recoveries at +/- 0.14 bubble radii in four directions. Require >= 3 matching single classifications and no competing single/multiple.
- Audit competing residual ink using connected components at two contrast levels after local paper plane normalization. Strong spatially persistent secondary ink is a review veto, never automatically dismissed as erasure or declared intentional.
- Preserve all 067 identity vetoes, confirmed multiple states, positional grammar and read-only bridge. Do not silently flip singles.
- Do not use answer keys or real student identity to infer marks.

## Local measurement parity
The exact source blob (727c155c828f2863072018a18ac1bf0e941de4f6) was executed with 067 in an isolated JS test. On deterministic noise images at 1239x1800, 1032x1500 and 1551x2254 all inspect() results were exactly JSON-identical. Four warm repeated inspect() calls per resolution measured 761/283 ms, 548/212 ms and 1157/442 ms (067/068). These are local isolated JS microbenchmarks, NOT whole-pipeline or phone performance.

## Qualification
CI includes the existing 067 benchmark and new 40-image / 2,320-group mixed degradation benchmark. Unequal intentional double marks and partial residuals are scripted rather than learned from the 27 real images. Report both corrected unsafe decisions and extra reviews; ambiguity remains intrinsic when a mark resembles erased ink. Cache equivalence is tested including pixel replacement and size changes. End-to-end synthetic identity binding and no-save checks required. Real-image replay, independent truth and mobile timing remain outstanding. Keep draft, no merge/deploy.
