const fs=require('fs');
const assert=require('assert');

const migration=fs.readFileSync('supabase/migrations/20261105120000_geography_competency_blueprint_102.sql','utf8');

assert(migration.includes('_ai_exam_geography_competency_blueprint_102'),'102 compiler function missing');
assert(migration.includes("'DAMSAN_GEO_BLUEPRINT_V1'"),'102 blueprint schema missing');
assert(migration.includes("'AUTHORITY_GROUNDED_PREPLAN'"),'102 preplan mode missing');
assert(migration.includes("v_source_state is distinct from 'VERIFIED_SOURCES'"),'102 must require VERIFIED_SOURCES');
assert(migration.includes("'source_snapshot_hash',v_snapshot_hash"),'102 authority snapshot binding missing');
assert(migration.includes("'benchmark_sources'"),'102 benchmark source lineage missing');

for(const code of ['GEO_NK_SPATIAL','GEO_NK_CAUSAL','GEO_TH_TOOL','GEO_VD_PROBLEM']){
  assert(migration.includes("'code','"+code+"'")||migration.includes("'competency_code','"+code+"'"),'102 competency missing '+code);
}
for(const stimulus of ['MAP','TABLE','CHART','SCHEMATIC_MAP','IMAGE','DIAGRAM','CLIMOGRAPH','CROSS_SECTION','MULTI_SOURCE']){
  assert(migration.includes("'"+stimulus+"'"),'102 stimulus taxonomy missing '+stimulus);
}

assert(migration.includes("'muc_do_is_not_competency',true"),'102 must separate cognitive level from competency');
assert(migration.includes("'exact_slot_targets_deferred_to_planner_103',true"),'102 must not invent 28-slot targets');
assert(migration.includes("'part3_primary_competency','GEO_TH_TOOL'"),'102 P3 competency policy missing');
assert(migration.includes("'max_print_pages',4"),'102 page budget missing');
assert(migration.includes("'minutes'"),'102 time budget missing');

assert(migration.includes("u.unit_key='RULE_GEO_COMP_001'"),'102 must read curriculum authority units');
assert(migration.includes("u.unit_key='RULE_FORMAT_2025_001'"),'102 must read format authority units');
assert(migration.includes("d.source_role='ASSESSMENT_BENCHMARK'"),'102 must read benchmark corpus');
assert(migration.includes("d.quality_status in ('AUTO_ACCEPTED','TEACHER_ACCEPTED','ACCEPTED')"),'102 authority unit quality filter missing');

assert(migration.includes("jsonb_build_object('competency_blueprint',v_blueprint)"),'102 request exam_spec attachment missing');
assert(migration.includes("new.exam_spec:=new.exam_spec-'competency_blueprint'"),'102 stale blueprint cleanup missing');
assert(!migration.includes('exam_design_plan'),'102 must not activate planner before 103');

console.log('AI_GEOGRAPHY_COMPETENCY_BLUEPRINT_102_PASS');
