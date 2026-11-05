const fs=require('fs');
const assert=require('assert');

const migration=fs.readFileSync('supabase/migrations/20261105124500_geography_exam_design_plan_103.sql','utf8');

assert(migration.includes('_ai_exam_geography_design_plan_103'),'103 planner function missing');
assert(migration.includes("'DAMSAN_GEO_DESIGN_PLAN_V1'"),'103 design plan schema missing');
assert(migration.includes("'PREVIEW_ONLY_NOT_GENERATOR_ACTIVE'"),'103 plan must stay preview-only');
assert(migration.includes("'item_slot_count',28"),'103 must create 28 item slots');
assert(migration.includes("'answer_command_count',40"),'103 must preserve 40 answer commands');
assert(migration.includes("'part1_slots',18"),'103 P1 count missing');
assert(migration.includes("'part2_clusters',4"),'103 P2 cluster count missing');
assert(migration.includes("'part2_commands',16"),'103 P2 command count missing');
assert(migration.includes("'part3_slots',6"),'103 P3 count missing');

for(const comp of ['GEO_NK_SPATIAL','GEO_NK_CAUSAL','GEO_TH_TOOL','GEO_VD_PROBLEM']){
  assert(migration.includes("'"+comp+"'"),'103 competency coverage missing '+comp);
}
for(const stim of ['TEXT','TABLE','CHART','MAP']){
  assert(migration.includes("'"+stim+"'"),'103 required stimulus missing '+stim);
}
for(const family of ['GROWTH_RATE','SHARE_PERCENT','DENSITY_OR_INVERSE_DENSITY','BALANCE','RANGE_OR_RANGE_DIFFERENCE','PER_CAPITA_OR_SCALED_RATIO']){
  assert(migration.includes("'"+family+"'"),'103 P3 quantitative family missing '+family);
}

assert(migration.includes('DETERMINISTIC_ROUND_ROBIN_SELECTED_SCOPE'),'103 selected-scope content balancing missing');
assert(migration.includes('_ai_exam_scope_allows_unit_036'),'103 planner must respect selected lesson scope');
assert(migration.includes('SOFT_PROJECT_CALIBRATION_NOT_OFFICIAL_QUOTA'),'103 P1 cognitive mix must be explicitly non-official');
assert(migration.includes("'no_atlas_dependency',true"),'103 must preserve current no-Atlat policy');
assert(migration.includes("'plan_hash',md5(v_plan::text)"),'103 reproducibility hash missing');

assert(migration.includes("jsonb_build_object('exam_design_plan',v_design_plan)"),'103 plan attachment missing');
assert(migration.includes("-'competency_blueprint'-'exam_design_plan'"),'103 stale plan cleanup missing');
assert(!migration.includes('aieBuildPrompt'),'103 must not activate browser prompt generation');

console.log('AI_GEOGRAPHY_DESIGN_PLAN_103_PASS');
