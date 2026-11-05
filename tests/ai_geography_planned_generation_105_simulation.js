const fs=require('fs');
const assert=require('assert');

const bridge=fs.readFileSync('supabase/functions/exam-ai-bridge/index.ts','utf8');
const shared=fs.readFileSync('supabase/functions/_shared/exam_planned_generation_105.ts','utf8');
const probe=fs.readFileSync('supabase/functions/planned-generation-probe-105/index.ts','utf8');
const aiJs=fs.readFileSync('ai_exam.js','utf8');
const aiHtml=fs.readFileSync('ai_exam.html','utf8');

assert(shared.includes('DAMSAN_AI_PLANNED_GENERATION_105'),'105 feature-gate env missing');
assert(shared.includes('planned_generation_disabled'),'105 disabled gate code missing');
assert(shared.includes('DAMSAN_GEO_BLUEPRINT_V1'),'105 blueprint precondition missing');
assert(shared.includes('DAMSAN_GEO_DESIGN_PLAN_V1'),'105 design-plan precondition missing');
assert(shared.includes('PREVIEW_ONLY_NOT_GENERATOR_ACTIVE'),'105 must consume only pre-activation plan state');
assert(shared.includes('DAMSAN_ITEM_BATCH_V1'),'105 batch output schema missing');
assert(shared.includes('DAMSAN_PLANNED_GENERATION_VALIDATION_V1'),'105 full validation schema missing');
assert(shared.includes('planned_source_ref_outside_slot'),'105 per-slot source-scope gate missing');
assert(shared.includes('planned_stimulus_type_mismatch'),'105 stimulus-plan match gate missing');
assert(shared.includes('planned_design_competency_mismatch'),'105 competency-plan match gate missing');
assert(shared.includes('planned_design_cognitive_mismatch'),'105 cognitive-plan match gate missing');
assert(shared.includes('planned_design_operation_mismatch'),'105 operation-plan match gate missing');
assert(shared.includes('planned_quantitative_family_mismatch'),'105 P3 quantitative-family gate missing');
assert(shared.includes('planned_statement_cognitive_mismatch'),'105 P2 statement-level cognitive gate missing');
assert(shared.includes('planned_statement_competency_mismatch'),'105 P2 statement-level competency gate missing');

assert(shared.includes('chunk(part1, 6)'),'105 P1 batch partition missing');
assert(shared.includes('chunk(part2, 2)'),'105 P2 batch partition missing');
assert(shared.includes('chunk(part3, 2)'),'105 P3 batch partition missing');
assert(shared.includes('batches.length !== 8'),'105 batch count invariant missing');
assert(shared.includes('length !== 28'),'105 slot count invariant missing');
assert(shared.includes('WRITE_ONLY_THE_ASSIGNED_EXAM_ITEMS'),'105 slot-only authoring instruction missing');
assert(shared.includes('MAP means source-grounded geometry'),'105 grounded MAP authoring instruction missing');

assert(bridge.includes('get_planned_generation_input'),'105 planned input action missing');
assert(bridge.includes('validate_planned_batch'),'105 non-persistent batch validation action missing');
assert(bridge.includes('submit_planned_exam_draft'),'105 planned final submit action missing');
assert(bridge.includes('requirePlannedGenerationEnabled105();'),'105 bridge feature gate missing');
assert(bridge.includes('allKnowledgeUnits105'),'105 bounded full knowledge-pack loader missing');
assert(bridge.includes('filterKnowledgeUnitsForBatch105'),'105 batch knowledge filtering missing');
assert(bridge.includes('validatePlannedExam105'),'105 final server-owned plan validation missing');
assert(bridge.includes('planned_generation_engine_version: "105"'),'105 validation telemetry missing');

const oldGetStart=bridge.indexOf('async function getGenerationInput');
const oldGetEnd=bridge.indexOf('async function allKnowledgeUnits105',oldGetStart);
assert(oldGetStart>=0&&oldGetEnd>oldGetStart,'105 legacy get_generation_input block missing');
const oldGet=bridge.slice(oldGetStart,oldGetEnd);
assert(!oldGet.includes('requirePlannedGenerationEnabled105'),'105 must not gate legacy get_generation_input');
assert(oldGet.includes('action: "get_generation_input"'),'105 legacy get_generation_input response changed/missing');

const oldSubmitStart=bridge.indexOf('async function submitExamDraft');
const oldSubmitEnd=bridge.indexOf('async function validatePlannedBatchBridge105',oldSubmitStart);
assert(oldSubmitStart>=0&&oldSubmitEnd>oldSubmitStart,'105 legacy submit_exam_draft block missing');
const oldSubmit=bridge.slice(oldSubmitStart,oldSubmitEnd);
assert(!oldSubmit.includes('requirePlannedGenerationEnabled105'),'105 must not gate legacy submit_exam_draft');
assert(oldSubmit.includes('action: "submit_exam_draft"'),'105 legacy submit response changed/missing');

assert(!aiJs.includes('get_planned_generation_input'),'105 current UI must not invoke planned input');
assert(!aiJs.includes('submit_planned_exam_draft'),'105 current UI must not invoke planned submit');
assert(!aiJs.includes('validate_planned_batch'),'105 current UI must not invoke planned batch validator');
assert(!aiHtml.includes('planned_generation_105'),'105 current UI must not expose P3 activation');

assert(probe.includes('feature_gate_default:"OFF"'),'105 runtime probe must declare gate OFF');
assert(probe.includes('rejected_wrong_scope'),'105 runtime probe must test wrong-scope rejection');
assert(probe.includes('batch_count:batches.length'),'105 runtime probe batch assertion missing');

const configPaths=[
  'supabase/config.toml',
  '.github/workflows/submission_safety_ci.yml',
  '.github/workflows/ai_exam_api_mode_ci.yml'
];
for(const path of configPaths){
  if(fs.existsSync(path)){
    const content=fs.readFileSync(path,'utf8');
    assert(!content.includes('DAMSAN_AI_PLANNED_GENERATION_105=enabled'),'105 feature gate must not be enabled in repo config');
    assert(!content.includes('DAMSAN_AI_PLANNED_GENERATION_105 = "enabled"'),'105 feature gate must not be enabled in repo config');
  }
}

console.log('AI_GEOGRAPHY_PLANNED_GENERATION_105_PASS');
