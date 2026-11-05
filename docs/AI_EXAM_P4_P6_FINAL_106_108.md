# AI Geography P4–P6 Final Architecture — 106–108

## Operational invariant

This phase does not alter the current production exam workflow.

The current browser UI still uses only:

- `create_generation_request`
- `get_generation_input`
- `submit_exam_draft`

The production student/teacher room flow, submission, grading and publish path are unchanged.

The new stack remains side-by-side and requires three server flags:

- `DAMSAN_AI_PLANNED_GENERATION_105`
- `DAMSAN_AI_INDEPENDENT_CRITIC_106`
- `DAMSAN_AI_CALIBRATION_108`

No repository configuration enables these flags.

The consolidated authoring contract 107 has no feature flag because it is only consumed inside the gated planned-generation path.

---

# P4 — Independent Critic 106

## Why

The generator can no longer certify its own cognitive depth by writing metadata such as `reasoning_steps`, `evidence_count` or self-authored rationale.

P4 defines a separate reviewer role:

`INDEPENDENT_GEOGRAPHY_ASSESSMENT_REVIEWER`

The reviewer receives:

- server-owned design plan;
- generated student-visible item;
- answer;
- stimulus;
- assessment design;
- source references.

It does not receive generator self-scoring as proof of quality.

## Rubric

Each item is scored 0–4 on:

1. distractor quality;
2. cognitive depth;
3. competency fit;
4. stimulus use;
5. answer leakage;
6. real-world quality.

Each item receives:

- `PASS`
- `REVISE`
- `FAIL`

The server validates exact slot coverage and score/verdict consistency.

A report cannot PASS the exam if:

- any item is FAIL or REVISE;
- mean score is below 3.0/4;
- any dimension mean is below 2.75/4;
- maximum item similarity reaches the internal 0.72 threshold.

The reviewer must declare `independent_run=true`.

The final planned-submit path additionally rejects a reviewer whose provider **and** model are identical to the declared generator provider/model.

## P4 actions

Future gated bridge actions:

- `get_independent_critic_input`
- `validate_independent_critic_report`

These actions are not present in the deployed production bridge until a separate activation decision is made.

---

# P5 — Geography Authoring Contract 107

## Goal

The new planned-generation path does not inherit the historical browser prompt stack as its authoring authority.

Instead it consumes one contract:

`DAMSAN_GEOGRAPHY_AUTHORING_CONTRACT_V1`

The contract contains:

- authority order;
- grounding rules;
- STYLE_ONLY_NO_COPY benchmark rule;
- common item-quality rules;
- P1 distractor/TH/VD rules;
- P2 shared-stimulus and statement-depth rules;
- P3 authentic quantitative evidence rules;
- stimulus rules;
- blocked-generation conditions.

The 105 planned-batch contract now embeds 107 directly.

## Compatibility

Historical overlays 049/053/059/060/062/072 are intentionally left untouched for the current production web-AI workflow.

They are not deleted in this phase because deleting them would violate the operational invariant.

At future activation, the planned path can move to 107 without requiring a risky cut-over of the legacy production path.

---

# P6 — Calibration 108

## Benchmark corpus

Calibration uses design fingerprints only, never benchmark question text.

Profile:

`MOET_GEOGRAPHY_2025_2026_FINGERPRINT_V1`

Sources:

- `BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY`
- `BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY`

Reuse policy:

`STYLE_ONLY_NO_COPY`

Observed benchmark dimensions include:

- exact official structure: 18 P1 + 4 P2 clusters + 6 P3;
- 50 minutes;
- 4-page benchmark;
- short/homogeneous P1 item style;
- P1 chart/table use;
- P2 shared TEXT/CHART stimulus;
- P3 authentic quantitative evidence;
- multiple P3 geographic operation families.

## Internal calibration score

The 108 engineering score is not an official Ministry score.

It is an internal release gate over:

- official structure — 20%;
- benchmark stimulus mix — 15%;
- P3 geographic-skill diversity — 15%;
- presentation-budget proxy — 10%;
- independent critic — 30%;
- item similarity — 10%.

Internal thresholds:

- ACCEPT: overall >= 85 and critical dimensions >= 75, with no critic/similarity/structure violation;
- REVIEW: overall >= 75 without structural failure;
- otherwise REJECT.

These thresholds are deliberately versioned as implementation policy and may be recalibrated after teacher acceptance data accumulates.

## Calibration suite

Runtime acceptance exercises 12 candidate exams:

- 6 strong candidates;
- 3 candidates with weak independent-critic scores;
- 3 candidates with intentionally high item similarity.

Expected behavior:

- all six strong candidates ACCEPT;
- no degraded candidate ACCEPT.

This is a deterministic engineering calibration suite, not a claim that 12 synthetic candidates replace empirical student psychometrics.

Runtime acceptance on 2026-11-05:

- strong/gold candidate score: **97.91** → ACCEPT;
- weak-critic candidate → REJECT;
- deliberately high-similarity candidate → REVIEW;
- 12-candidate suite: **6 ACCEPT / 3 REVIEW / 3 REJECT**;
- suite mean score: **90**.

---

# Legacy empirical baseline

A read-only production audit on 2026-11-05 found four historical Geography AI drafts containing:

- 112 questions;
- 72 P1;
- 16 P2;
- 24 P3.

They preserve the official 18/4/6 structure per draft, but were generated before the new architecture:

- 0/112 had `assessment_design`;
- 0/112 had structured `stimulus`;
- average raw stem length was about 180 characters.

Therefore these legacy drafts are useful as a baseline for why P1–P6 were needed, but they are not valid acceptance candidates for the 105–108 pipeline.

---

# Final side-by-side flow

```text
Teacher scope
   ↓
P0 Authority
   ↓
P1 Blueprint + 28-slot Design Plan
   ↓
P2 Stimulus Engine
   ↓
P3 Planned Generator (8 batches / 28 slots)
   ↓
P4 Independent Critic
   ↓
P6 Calibration against official design fingerprints
   ↓
Existing canonical DAMSAN_EXAM_V1 validator
   ↓
Existing teacher review
   ↓
Existing explicit publish boundary
```

P5 Authoring Contract 107 governs the P3 generator step.

The AI still never publishes directly.

---

# Activation rule

Completing P0–P6 in source does **not** authorize production activation.

Production activation checkpoint — 2026-11-05:

- PR #146 merged at `d05792365036681c92093835d67c6e0324883cbc`.
- GitHub Pages deployment #256: SUCCESS.
- PWA Version Sync #197: SUCCESS.
- Supabase `exam-ai-bridge` upgraded from version 4 to **ACTIVE version 5**.
- Read-only `activation_status` smoke test returned HTTP 200 with planned generation 105, independent critic 106, authoring contract 107, calibration 108 and planned Web UI 109 all active.
- Live GitHub Pages `ai_exam.html` returned HTTP 200 and contains the 109 activation cache marker plus the retained Web-first 070 layer.
- Edge logs after cutover show no 5xx. The only 400 was the intentionally malformed first smoke-probe request; the corrected probe returned 200.
- Exact pre-cutover bridge v4 source is preserved at `ops/rollback/exam-ai-bridge-v4-20261105.ts`.
- Teacher explicit approval remains the only publish boundary. Student room/submission/grading code was not modified by activation 109.

A future activation must be a separate operational change with:

1. explicit acceptance by the teacher/owner;
2. a safe time window outside active student testing;
3. deployment of the new bridge source;
4. explicit enabling of all required feature flags;
5. smoke test on a non-production exam request;
6. rollback plan to the current production bridge version.
