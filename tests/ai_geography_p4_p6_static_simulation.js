const fs=require('fs');
const assert=require('assert');

const bridge=fs.readFileSync('supabase/functions/exam-ai-bridge/index.ts','utf8');
const critic=fs.readFileSync('supabase/functions/_shared/exam_independent_critic_106.ts','utf8');
const contract=fs.readFileSync('supabase/functions/_shared/exam_geography_authoring_contract_107.ts','utf8');
const calibration=fs.readFileSync('supabase/functions/_shared/exam_geography_calibration_108.ts','utf8');
const planned=fs.readFileSync('supabase/functions/_shared/exam_planned_generation_105.ts','utf8');
const ui=fs.readFileSync('ai_exam.js','utf8');
const ref2025=fs.readFileSync('supabase/functions/authority-p0-reference-2025/index.ts','utf8');
const off2026=fs.readFileSync('supabase/functions/authority-p0-official-2026/index.ts','utf8');

assert(critic.includes('DAMSAN_AI_INDEPENDENT_CRITIC_106'),'106 feature flag missing');
assert(critic.includes('INDEPENDENT_GEOGRAPHY_ASSESSMENT_REVIEWER'),'106 reviewer role missing');
assert(critic.includes('Do not trust generator self-declared reasoning_steps'),'106 must reject generator self-certification');
assert(critic.includes('critic_reviewer_not_independent'),'106 independent-run gate missing');
for(const d of ['distractor_quality','cognitive_depth','competency_fit','stimulus_use','answer_leakage','real_world_quality']){
  assert(critic.includes('"'+d+'"'),'106 rubric dimension missing '+d);
}
assert(critic.includes('maxItemSimilarity106'),'106 similarity detector missing');
assert(critic.includes('sim.max_similarity<0.72'),'106 similarity pass threshold missing');

assert(contract.includes('DAMSAN_GEOGRAPHY_AUTHORING_CONTRACT_V1'),'107 contract schema missing');
assert(contract.includes('STYLE_ONLY_NO_COPY'),'107 benchmark reuse rule missing');
assert(contract.includes('The server-owned slot is authoritative'),'107 server-owned design invariant missing');
assert(contract.includes('Geography knowledge'),'107 should use Geography-specific language');
assert(contract.includes('near-misses'),'107 distractor contract missing');
assert(contract.includes('authentic, traceable quantitative evidence'),'107 authentic P3 data rule missing');
assert(planned.includes('authoring_contract: geographyAuthoringContract107()'),'105 must consume the single 107 authoring contract');

assert(calibration.includes('DAMSAN_AI_CALIBRATION_108'),'108 feature flag missing');
assert(calibration.includes('MOET_GEOGRAPHY_2025_2026_FINGERPRINT_V1'),'108 benchmark profile missing');
assert(calibration.includes('BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY'),'108 2025 provenance missing');
assert(calibration.includes('BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY'),'108 2026 provenance missing');
assert(calibration.includes('overall_accept:85'),'108 internal accept threshold missing');
assert(calibration.includes('max_similarity:0.72'),'108 similarity threshold missing');
assert(calibration.includes('calibrationSuite108'),'108 multi-candidate suite missing');

for(const id of ['BENCH_2025_P1_CHART_003','BENCH_2025_P2_CHART_006','BENCH_2025_P3_SERIES_AVG_007','BENCH_2025_P3_SHARE_010']){
  assert(ref2025.includes(id),'108 reference corpus drift: '+id);
}
for(const id of ['BENCH_2026_P1_CHART_003','BENCH_2026_P1_TABLE_004','BENCH_2026_P2_CHART_006','BENCH_2026_P3_SHARE_009','BENCH_2026_P3_BALANCE_011']){
  assert(off2026.includes(id),'108 official corpus drift: '+id);
}

assert(bridge.includes('get_independent_critic_input'),'P4 bridge input action missing');
assert(bridge.includes('validate_independent_critic_report'),'P4 bridge validation action missing');
assert(bridge.includes('requireIndependentCriticEnabled106();'),'P4 gate missing from planned path');
assert(bridge.includes('requireCalibrationEnabled108();'),'P6 gate missing from planned path');
assert(bridge.includes('critic_reviewer_must_differ_from_generator'),'generator/reviewer separation gate missing');
assert(bridge.includes('calibration.decision !== "ACCEPT"'),'planned submission must fail closed on calibration');
assert(bridge.includes('authoring_contract_version: "107"'),'107 telemetry missing');
assert(bridge.includes('calibration_version: "108"'),'108 telemetry missing');

for(const action of ['get_independent_critic_input','validate_independent_critic_report']){
  assert(!ui.includes(action),'current production UI must not invoke '+action);
}
assert(!ui.includes('submit_planned_exam_draft'),'current production UI must not invoke planned submit');
assert(!ui.includes('get_planned_generation_input'),'current production UI must not invoke planned input');

for(const path of ['supabase/config.toml','.github/workflows/submission_safety_ci.yml']){
  if(!fs.existsSync(path)) continue;
  const x=fs.readFileSync(path,'utf8');
  for(const flag of ['DAMSAN_AI_PLANNED_GENERATION_105','DAMSAN_AI_INDEPENDENT_CRITIC_106','DAMSAN_AI_CALIBRATION_108']){
    assert(!x.includes(flag+'=enabled')&&!x.includes(flag+' = "enabled"'),'feature flag must stay OFF: '+flag);
  }
}

console.log('AI_GEOGRAPHY_P4_P6_STATIC_PASS');
