export type PlannedJson = Record<string, unknown>;

export type PlannedBatch105 = {
  batch_id: string;
  batch_index: number;
  part: number;
  slot_ids: string[];
  slots: PlannedJson[];
  scope_keys: string[];
  structured_stimulus_types: string[];
};

export type PlannedValidation105 = {
  valid: true;
  schema_version: "DAMSAN_PLANNED_GENERATION_VALIDATION_V1";
  planner_version: "105";
  question_count: number;
  slot_count: number;
  slot_ids: string[];
  competency_counts: Record<string, number>;
  cognitive_counts: Record<string, number>;
  stimulus_counts: Record<string, number>;
  source_scope_verified_count: number;
};

const STRUCTURED_STIMULUS_TYPES = new Set([
  "TABLE","CHART","MAP","SCHEMATIC_MAP","IMAGE","DIAGRAM","CLIMOGRAPH","CROSS_SECTION","MULTI_SOURCE"
]);

function fail(code: string): never {
  throw new Error(code);
}

function objectValue(value: unknown, code = "planned_object_invalid"): PlannedJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as PlannedJson;
}

function stringValue(value: unknown, max = 500, required = false, code = "planned_string_invalid") {
  const out = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (required && !out) fail(code);
  return out;
}

function arrayValue(value: unknown, code = "planned_array_invalid") {
  if (!Array.isArray(value)) fail(code);
  return value;
}

function planFromSpec(specValue: unknown) {
  const spec = objectValue(specValue, "planned_spec_invalid");
  const blueprint = objectValue(spec.competency_blueprint, "planned_blueprint_missing");
  const plan = objectValue(spec.exam_design_plan, "planned_design_plan_missing");

  if (blueprint.schema_version !== "DAMSAN_GEO_BLUEPRINT_V1") fail("planned_blueprint_invalid");
  if (plan.schema_version !== "DAMSAN_GEO_DESIGN_PLAN_V1") fail("planned_design_plan_invalid");
  if (plan.status !== "PREVIEW_ONLY_NOT_GENERATOR_ACTIVE") fail("planned_design_plan_state_invalid");

  const slotsObj = objectValue(plan.slots, "planned_slots_missing");
  const part1 = arrayValue(slotsObj.part1, "planned_part1_slots_invalid").map((slot) => objectValue(slot, "planned_slot_invalid"));
  const part2 = arrayValue(slotsObj.part2, "planned_part2_slots_invalid").map((slot) => objectValue(slot, "planned_slot_invalid"));
  const part3 = arrayValue(slotsObj.part3, "planned_part3_slots_invalid").map((slot) => objectValue(slot, "planned_slot_invalid"));

  if (part1.length !== 18 || part2.length !== 4 || part3.length !== 6) fail("planned_slot_count_invalid");

  const all = [...part1, ...part2, ...part3];
  const ids = all.map((slot) => stringValue(slot.slot_id, 40, true, "planned_slot_id_invalid"));
  if (new Set(ids).size !== ids.length) fail("planned_slot_id_duplicate");

  return { spec, blueprint, plan, part1, part2, part3, all };
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function slotScopeKey(slot: PlannedJson) {
  const target = objectValue(slot.content_target, "planned_content_target_missing");
  return stringValue(target.scope_key, 500, true, "planned_scope_key_missing");
}

function slotStimulusType(slot: PlannedJson) {
  return stringValue(slot.stimulus_type, 60, true, "planned_stimulus_type_missing").toUpperCase();
}

function batchOf(part: number, batchIndex: number, label: string, slots: PlannedJson[]): PlannedBatch105 {
  const slotIds = slots.map((slot) => stringValue(slot.slot_id, 40, true, "planned_slot_id_invalid"));
  const scopeKeys = Array.from(new Set(slots.map(slotScopeKey)));
  const structured = Array.from(new Set(slots.map(slotStimulusType).filter((type) => STRUCTURED_STIMULUS_TYPES.has(type))));
  return {
    batch_id: `P${part}-${label}`,
    batch_index: batchIndex,
    part,
    slot_ids: slotIds,
    slots,
    scope_keys: scopeKeys,
    structured_stimulus_types: structured,
  };
}

export function isPlannedGenerationEnabled105(value?: string | null) {
  const raw = (value ?? (typeof Deno !== "undefined" ? Deno.env.get("DAMSAN_AI_PLANNED_GENERATION_105") : "") ?? "")
    .trim()
    .toLowerCase();
  return ["1","true","enabled","on"].includes(raw);
}

export function requirePlannedGenerationEnabled105(value?: string | null) {
  if (!isPlannedGenerationEnabled105(value)) fail("planned_generation_disabled");
}

export function plannedGenerationBatches105(specValue: unknown): PlannedBatch105[] {
  const { part1, part2, part3 } = planFromSpec(specValue);
  const batches: PlannedBatch105[] = [];
  let index = 0;

  chunk(part1, 6).forEach((slots, i) => batches.push(batchOf(1, index++, String.fromCharCode(65 + i), slots)));
  chunk(part2, 2).forEach((slots, i) => batches.push(batchOf(2, index++, String.fromCharCode(65 + i), slots)));
  chunk(part3, 2).forEach((slots, i) => batches.push(batchOf(3, index++, String.fromCharCode(65 + i), slots)));

  if (batches.length !== 8) fail("planned_batch_count_invalid");
  if (batches.flatMap((batch) => batch.slot_ids).length !== 28) fail("planned_batch_slot_count_invalid");
  return batches;
}

export function plannedBatchByIndex105(specValue: unknown, batchIndex: number) {
  const batches = plannedGenerationBatches105(specValue);
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= batches.length) fail("planned_batch_index_invalid");
  return { batches, batch: batches[batchIndex] };
}

export function filterKnowledgeUnitsForBatch105(unitsValue: unknown, batch: PlannedBatch105) {
  const units = arrayValue(unitsValue, "planned_knowledge_units_invalid").map((unit) => objectValue(unit, "planned_knowledge_unit_invalid"));
  const allowed = new Set(batch.scope_keys);
  const filtered = units.filter((unit) => allowed.has(stringValue(unit.scope_key, 500)));
  if (!filtered.length) fail("planned_batch_knowledge_empty");
  return filtered;
}

function slotOutputContract(slot: PlannedJson) {
  const part = Number(slot.part);
  const stimulusType = slotStimulusType(slot);
  const contentTarget = objectValue(slot.content_target, "planned_content_target_missing");
  const contract: PlannedJson = {
    slot_id: slot.slot_id,
    part,
    content_target: contentTarget,
    stimulus_type: stimulusType,
  };

  if (part === 2) {
    contract.primary_competency_code = slot.primary_competency_code;
    contract.statement_design = slot.statements;
  } else {
    contract.competency_code = slot.competency_code;
    contract.cognitive_level = slot.cognitive_level;
    contract.operation_code = slot.operation_code;
  }
  if (part === 3) contract.quantitative_family = slot.quantitative_family;
  return contract;
}

export function plannedBatchInstructions105(
  specValue: unknown,
  batch: PlannedBatch105,
  stimulusContract: unknown,
) {
  const { plan } = planFromSpec(specValue);
  const outputSlots = batch.slots.map(slotOutputContract);
  return {
    schema_version: "DAMSAN_PLANNED_BATCH_INSTRUCTIONS_V1",
    planner_version: "105",
    task: "WRITE_ONLY_THE_ASSIGNED_EXAM_ITEMS",
    batch_id: batch.batch_id,
    batch_index: batch.batch_index,
    rules: [
      "Generate exactly one item for every assigned slot and no additional items.",
      "Copy slot_id and assessment_design exactly from the slot contract; do not change competency, cognitive level, operation, content target, or stimulus type.",
      "Use only the supplied knowledge units for factual/curricular content and source_refs.",
      "Every source_refs entry must belong to the assigned slot content_target.scope_key.",
      "Do not mention slot_id, source_refs, unit_key, knowledge package, lesson authoring workflow, or competency metadata in student-facing text.",
      "For structured stimulus slots, use DAMSAN_STIMULUS_V1 and match the required stimulus_type exactly.",
      "For TEXT or NONE stimulus types, omit the stimulus field; express the necessary context in noi_dung only.",
      "MAP means source-grounded geometry with geometry_provenance; if grounded geometry is unavailable, return a blocked item instead of inventing a map.",
      "Return only JSON. No Markdown fence and no commentary outside JSON.",
    ],
    output_schema: {
      schema_version: "DAMSAN_ITEM_BATCH_V1",
      required_root_fields: ["schema_version","batch_id","items"],
      item_required_fields: [
        "slot_id","assessment_design","phan","noi_dung","A","B","C","D",
        "dap_an_dung","loi_giai","source_refs"
      ],
    },
    assigned_slots: outputSlots,
    stimulus_contract: batch.structured_stimulus_types.length ? stimulusContract : null,
    exam_constraints: {
      assessment_type: (plan as PlannedJson).assessment_type ?? "TOT_NGHIEP",
      presentation_budget: (plan as PlannedJson).presentation_budget ?? null,
      plan_hash: (plan as PlannedJson).plan_hash ?? null,
    },
  };
}

function unitScopeMap(unitsValue: unknown) {
  const units = arrayValue(unitsValue, "planned_knowledge_units_invalid").map((unit) => objectValue(unit, "planned_knowledge_unit_invalid"));
  const map = new Map<string,string>();
  for (const unit of units) {
    const unitKey = stringValue(unit.unit_key, 400, true, "planned_unit_key_invalid");
    const scopeKey = stringValue(unit.scope_key, 500, true, "planned_scope_key_missing");
    map.set(unitKey, scopeKey);
  }
  return map;
}

function refsOf(question: PlannedJson) {
  if (!Array.isArray(question.source_refs) || question.source_refs.length < 1) fail("planned_source_refs_invalid");
  const refs = question.source_refs.map((value) => {
    if (typeof value === "string") return stringValue(value, 400, true, "planned_source_refs_invalid");
    const obj = objectValue(value, "planned_source_refs_invalid");
    return stringValue(obj.unit_key, 400, true, "planned_source_refs_invalid");
  });
  return Array.from(new Set(refs));
}

function sameString(actual: unknown, expected: unknown, code: string) {
  if (stringValue(actual, 500, true, code) !== stringValue(expected, 500, true, code)) fail(code);
}

function expectedStimulusPresence(question: PlannedJson, type: string) {
  if (STRUCTURED_STIMULUS_TYPES.has(type)) {
    const stimulus = objectValue(question.stimulus, "planned_stimulus_required");
    sameString(stimulus.type, type, "planned_stimulus_type_mismatch");
  } else if (question.stimulus != null) {
    fail("planned_stimulus_unexpected");
  }
}

function validateStatementDesign(actualValue: unknown, expectedValue: unknown) {
  const actual = objectValue(actualValue, "planned_statement_design_missing");
  const expected = objectValue(expectedValue, "planned_statement_design_invalid");
  for (const key of ["A","B","C","D"]) {
    const a = objectValue(actual[key], "planned_statement_design_missing");
    const e = objectValue(expected[key], "planned_statement_design_invalid");
    sameString(a.cognitive_level, e.cognitive_level, "planned_statement_cognitive_mismatch");
    sameString(a.competency_code, e.competency_code, "planned_statement_competency_mismatch");
    sameString(a.operation_code, e.operation_code, "planned_statement_operation_mismatch");
  }
}

function validateQuestionAgainstSlot(
  question: PlannedJson,
  slot: PlannedJson,
  scopeByUnitKey: Map<string,string>,
) {
  const slotId = stringValue(slot.slot_id, 40, true, "planned_slot_id_invalid");
  sameString(question.slot_id, slotId, "planned_question_slot_mismatch");

  const part = String(Number(slot.part));
  if (String(question.phan ?? question.Phan ?? "") !== part) fail("planned_question_part_mismatch");

  const expectedScope = slotScopeKey(slot);
  const design = objectValue(question.assessment_design, "planned_assessment_design_missing");
  sameString(design.slot_id, slotId, "planned_design_slot_mismatch");
  const designTarget = objectValue(design.content_target, "planned_design_content_target_missing");
  sameString(designTarget.scope_key, expectedScope, "planned_design_scope_mismatch");

  const stimulusType = slotStimulusType(slot);
  sameString(design.stimulus_type, stimulusType, "planned_design_stimulus_mismatch");
  expectedStimulusPresence(question, stimulusType);

  if (part === "2") {
    sameString(design.primary_competency_code, slot.primary_competency_code, "planned_design_competency_mismatch");
    validateStatementDesign(design.statement_design, slot.statements);
  } else {
    sameString(design.competency_code, slot.competency_code, "planned_design_competency_mismatch");
    sameString(design.cognitive_level, slot.cognitive_level, "planned_design_cognitive_mismatch");
    sameString(design.operation_code, slot.operation_code, "planned_design_operation_mismatch");
    if (stringValue(question.muc_do, 120, true, "planned_muc_do_missing").toUpperCase()
      !== stringValue(slot.cognitive_level, 120, true, "planned_slot_cognitive_missing").toUpperCase()) {
      fail("planned_muc_do_mismatch");
    }
    if (part === "3") {
      sameString(design.quantitative_family, slot.quantitative_family, "planned_quantitative_family_mismatch");
    }
  }

  const refs = refsOf(question);
  for (const ref of refs) {
    const unitScope = scopeByUnitKey.get(ref);
    if (!unitScope) fail("planned_source_ref_unknown");
    if (unitScope !== expectedScope) fail("planned_source_ref_outside_slot");
  }

  return { slot_id: slotId, refs, expectedScope, stimulusType };
}

export function validatePlannedBatch105(
  payloadValue: unknown,
  specValue: unknown,
  batchIndex: number,
  allKnowledgeUnits: unknown,
) {
  const payload = objectValue(payloadValue, "planned_batch_payload_invalid");
  if (payload.schema_version !== "DAMSAN_ITEM_BATCH_V1") fail("planned_batch_schema_invalid");
  const { batch } = plannedBatchByIndex105(specValue, batchIndex);
  sameString(payload.batch_id, batch.batch_id, "planned_batch_id_mismatch");
  if (!Array.isArray(payload.items) || payload.items.length !== batch.slots.length) fail("planned_batch_item_count_mismatch");

  const scopeByUnitKey = unitScopeMap(allKnowledgeUnits);
  const slotById = new Map(batch.slots.map((slot) => [stringValue(slot.slot_id,40,true), slot]));
  const seen = new Set<string>();
  const ordered: PlannedJson[] = [];

  for (const raw of payload.items) {
    const q = objectValue(raw, "planned_question_invalid");
    const slotId = stringValue(q.slot_id, 40, true, "planned_question_slot_missing");
    if (seen.has(slotId)) fail("planned_question_slot_duplicate");
    const slot = slotById.get(slotId);
    if (!slot) fail("planned_question_slot_unknown");
    validateQuestionAgainstSlot(q, slot, scopeByUnitKey);
    seen.add(slotId);
  }

  for (const slot of batch.slots) {
    const id = stringValue(slot.slot_id,40,true);
    const q = (payload.items as unknown[]).map((item)=>objectValue(item)).find((item)=>stringValue(item.slot_id,40)===id);
    if (!q) fail("planned_question_slot_missing");
    ordered.push(q);
  }

  return {
    schema_version: "DAMSAN_ITEM_BATCH_V1",
    batch_id: batch.batch_id,
    items: ordered,
  };
}

export function validatePlannedExam105(
  examValue: unknown,
  specValue: unknown,
  allKnowledgeUnits: unknown,
): { exam: PlannedJson; validation: PlannedValidation105 } {
  const exam = objectValue(examValue, "planned_exam_invalid");
  const { all } = planFromSpec(specValue);
  if (!Array.isArray(exam.questions) || exam.questions.length !== all.length) fail("planned_exam_question_count_mismatch");

  const scopeByUnitKey = unitScopeMap(allKnowledgeUnits);
  const slotById = new Map(all.map((slot) => [stringValue(slot.slot_id,40,true), slot]));
  const seen = new Set<string>();
  const questionBySlot = new Map<string,PlannedJson>();
  const competencyCounts: Record<string,number> = {};
  const cognitiveCounts: Record<string,number> = {};
  const stimulusCounts: Record<string,number> = {};
  let sourceScopeVerifiedCount = 0;

  for (const raw of exam.questions) {
    const q = objectValue(raw, "planned_question_invalid");
    const slotId = stringValue(q.slot_id, 40, true, "planned_question_slot_missing");
    if (seen.has(slotId)) fail("planned_question_slot_duplicate");
    const slot = slotById.get(slotId);
    if (!slot) fail("planned_question_slot_unknown");
    const checked = validateQuestionAgainstSlot(q, slot, scopeByUnitKey);
    seen.add(slotId);
    questionBySlot.set(slotId, q);
    sourceScopeVerifiedCount += 1;

    const part = String(Number(slot.part));
    const comp = part === "2"
      ? stringValue(slot.primary_competency_code,120,true)
      : stringValue(slot.competency_code,120,true);
    competencyCounts[comp] = (competencyCounts[comp] || 0) + 1;

    const cognitive = part === "2" ? "MIXED_NB_TH_TH_VD" : stringValue(slot.cognitive_level,120,true);
    cognitiveCounts[cognitive] = (cognitiveCounts[cognitive] || 0) + 1;
    stimulusCounts[checked.stimulusType] = (stimulusCounts[checked.stimulusType] || 0) + 1;
  }

  if (seen.size !== all.length) fail("planned_exam_slot_coverage_incomplete");
  const orderedQuestions = all.map((slot) => {
    const id = stringValue(slot.slot_id,40,true);
    const q = questionBySlot.get(id);
    if (!q) fail("planned_question_slot_missing");
    return q;
  });

  const validation: PlannedValidation105 = {
    valid: true,
    schema_version: "DAMSAN_PLANNED_GENERATION_VALIDATION_V1",
    planner_version: "105",
    question_count: orderedQuestions.length,
    slot_count: all.length,
    slot_ids: all.map((slot)=>stringValue(slot.slot_id,40,true)),
    competency_counts: competencyCounts,
    cognitive_counts: cognitiveCounts,
    stimulus_counts: stimulusCounts,
    source_scope_verified_count: sourceScopeVerifiedCount,
  };

  return {
    exam: { ...exam, questions: orderedQuestions },
    validation,
  };
}
