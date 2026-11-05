# P3-105 — Planned Generation Side-by-Side

## Safety invariant

P3 must not change the current production authoring workflow while students are using the system.

Existing actions remain authoritative and unchanged:

- `create_generation_request`
- `get_generation_input`
- `submit_exam_draft`

The current browser UI continues to call only those actions.

P3 adds a parallel path that is unreachable unless the Edge runtime explicitly enables:

`DAMSAN_AI_PLANNED_GENERATION_105=enabled`

No repository config enables this flag.

## New actions

### get_planned_generation_input

Returns one deterministic authoring batch from the existing 28-slot `DAMSAN_GEO_DESIGN_PLAN_V1`.

Batch layout:

- P1: 3 batches × 6 slots
- P2: 2 batches × 2 clusters
- P3: 3 batches × 2 slots
- Total: 8 batches / 28 item slots / 40 answer commands

Knowledge units are filtered server-side to the `scope_key` values assigned to the batch slots.

### validate_planned_batch

Non-persistent validation. It rejects a batch before any draft write if:

- slot ID is missing/duplicated/unknown;
- part does not match;
- content target does not match;
- competency/cognitive/operation does not match;
- required stimulus type does not match;
- P2 statement design does not match;
- source_refs point outside the slot lesson scope.

### submit_planned_exam_draft

Final P3 path. Before entering the existing canonical validator, the server validates all 28 slots and reorders output to server plan order.

After P3 validation, the exam still goes through the existing:

- DAMSAN_EXAM_V1 validator;
- stimulus engine 104;
- knowledge scope quality gate;
- Geography assessment quality gates;
- authority gate;
- canonical variant creation;
- teacher review boundary.

P3 does not publish directly.

## Output contract

Each planned item must include:

- `slot_id`;
- `assessment_design`;
- normal DAMSAN question fields;
- `source_refs`.

For P1/P3, `assessment_design` must reproduce server-owned:

- competency;
- cognitive level;
- operation;
- stimulus type;
- content target.

For P2, the cluster additionally reproduces the A/B/C/D statement-level design.

Structured stimulus slots use `DAMSAN_STIMULUS_V1`. TEXT/NONE slots omit the `stimulus` field.

## Runtime activation rule

P3 code may be merged while the feature flag is OFF because the current UI has no reference to the new actions.

Deployment/activation of the bridge with the flag enabled is a separate acceptance decision and must not occur during active student testing without explicit operational clearance.
