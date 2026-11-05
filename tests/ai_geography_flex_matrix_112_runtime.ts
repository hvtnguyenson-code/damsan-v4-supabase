import {
  compileFlexGeographyPlan112,
  normalizeFlexMatrix112,
} from "../supabase/functions/_shared/exam_geography_flex_matrix_112.ts";
import {
  plannedGenerationBatches105,
  validatePlannedExam105,
} from "../supabase/functions/_shared/exam_planned_generation_105.ts";
import {
  calibrateGeographyExam108,
} from "../supabase/functions/_shared/exam_geography_calibration_108.ts";
import type { CriticValidation106 } from "../supabase/functions/_shared/exam_independent_critic_106.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function row(
  id:string, scope:string, lesson:string, competency:string, operation:string,
  allowed:string[], stimuli:string[],
  p1:{KNOW:number;UNDERSTAND:number;APPLY:number}, p2:number, p3:number
){
  return {
    matrix_row_id:id,grade:12,scope_key:scope,lesson_code:lesson,lesson_title:lesson,
    requirement_id:id+"_REQ",requirement_text:"YCCĐ "+id,
    indicator_id:id+"_IND",indicator_text:"Chỉ báo "+id,
    requirement_basis:"CURRICULUM_NORMALIZED",mapping_confidence:0.9,
    competency_code:competency,operation_code:operation,
    allowed_cognitive_levels:allowed,preferred_stimuli:stimuli,
    allocations:{p1,p2,p3}
  };
}

const flexSpec:any={
  assessment_type:"CUSTOM",
  grade:12,
  counts:{p1:12,p2:2,p3:3},
  variant_count:4,
  scoring_config:{p1_weight:4,p2_weight:3,p3_weight:3},
  assessment_matrix:{
    schema_version:"DAMSAN_GEO_ASSESSMENT_MATRIX_V1",
    matrix_version:"111",
    mode:"FLEX_GEOGRAPHY",
    grade:12,
    time_minutes:45,
    rows:[
      row("R1","scope-1","BAI_01","GEO_NK_SPATIAL","SPATIAL_RELATION",
        ["KNOW","UNDERSTAND","APPLY"],["NONE","MAP","TEXT"],
        {KNOW:3,UNDERSTAND:2,APPLY:0},1,1),
      row("R2","scope-2","BAI_02","GEO_TH_TOOL","COMPARE_DATA",
        ["KNOW","UNDERSTAND","APPLY"],["TEXT","TABLE","CHART"],
        {KNOW:2,UNDERSTAND:3,APPLY:1},1,1),
      row("R3","scope-3","BAI_03","GEO_VD_PROBLEM","SCENARIO_APPLICATION",
        ["APPLY"],["TEXT","MULTI_SOURCE"],
        {KNOW:0,UNDERSTAND:0,APPLY:1},0,1),
    ]
  }
};

const normalized=normalizeFlexMatrix112(flexSpec);
assert(normalized.counts.p1===12&&normalized.counts.p2===2&&normalized.counts.p3===3,"FLEX matrix counts normalization failed");

const effective:any=compileFlexGeographyPlan112(flexSpec);
const plan=effective.exam_design_plan;
assert(plan.assessment_mode==="FLEX_GEOGRAPHY","FLEX plan mode");
assert(plan.planner_version==="112-FLEX","FLEX planner version");
assert(plan.slots.part1.length===12,"FLEX P1 slot count");
assert(plan.slots.part2.length===2,"FLEX P2 slot count");
assert(plan.slots.part3.length===3,"FLEX P3 slot count");
assert(plan.coverage_targets.item_slot_count===17,"FLEX total slots");
assert(plan.coverage_targets.answer_command_count===23,"FLEX answer commands");
assert(plan.calibration_policy.structure_basis==="TEACHER_LOCKED_MATRIX","FLEX matrix structure basis");
assert(plan.calibration_policy.quality_benchmark==="MOET_GEOGRAPHY_2025_2026_FINGERPRINT_V1","FLEX quality benchmark");

const flexBatches=plannedGenerationBatches105(effective);
assert(flexBatches.length===5,"12-2-3 must compile into five batches");
assert(JSON.stringify(flexBatches.map(b=>b.slot_ids.length))===JSON.stringify([6,6,2,2,1]),"unexpected FLEX batch sizes");

const units=[
  {unit_key:"U1",scope_key:"scope-1"},
  {unit_key:"U2",scope_key:"scope-2"},
  {unit_key:"U3",scope_key:"scope-3"},
];
const unitFor=(scope:string)=>scope==="scope-1"?"U1":scope==="scope-2"?"U2":"U3";
const structured=new Set(["TABLE","CHART","MAP","SCHEMATIC_MAP","IMAGE","DIAGRAM","CLIMOGRAPH","CROSS_SECTION","MULTI_SOURCE"]);

function questionFor(slot:any,index:number){
  const part=String(slot.part);
  const design:any={
    slot_id:slot.slot_id,
    content_target:slot.content_target,
    stimulus_type:slot.stimulus_type,
  };
  if(part==="2"){
    design.primary_competency_code=slot.primary_competency_code;
    design.statement_design=slot.statements;
  }else{
    design.competency_code=slot.competency_code;
    design.cognitive_level=slot.cognitive_level;
    design.operation_code=slot.operation_code;
    if(part==="3") design.quantitative_family=slot.quantitative_family;
  }
  const q:any={
    slot_id:slot.slot_id,
    assessment_design:design,
    phan:part,
    noi_dung:`Nội dung địa lí riêng cho ${slot.slot_id} bằng chứng ${index*17+3} chủ đề ${slot.content_target.lesson_code}.`,
    A:part==="3"?"":`Phương án A ${index}`,
    B:part==="3"?"":`Phương án B ${index+31}`,
    C:part==="3"?"":`Phương án C ${index+47}`,
    D:part==="3"?"":`Phương án D ${index+61}`,
    dap_an_dung:part==="1"?"A":part==="2"?"Đ-S-Đ-S":String(index+10),
    loi_giai:"Kiểm chứng "+slot.slot_id,
    source_refs:[unitFor(slot.content_target.scope_key)]
  };
  if(part!=="2") q.muc_do=slot.cognitive_level;
  if(structured.has(slot.stimulus_type)) q.stimulus={type:slot.stimulus_type};
  return q;
}
const allSlots=[...plan.slots.part1,...plan.slots.part2,...plan.slots.part3];
const exam:any={
  schema_version:"DAMSAN_EXAM_V1",title:"FLEX 12-2-3",assessment_type:"CUSTOM",
  scoring_config:flexSpec.scoring_config,
  questions:allSlots.map(questionFor)
};
const checked=validatePlannedExam105(exam,effective,units);
assert(checked.validation.question_count===17,"FLEX full planned validation question count");
assert(checked.validation.slot_count===17,"FLEX full planned validation slot count");
assert(checked.validation.source_scope_verified_count===17,"FLEX source scope validation");

const critic:CriticValidation106={
  valid:true,schema_version:"DAMSAN_INDEPENDENT_CRITIC_VALIDATION_V1",critic_version:"106",
  item_count:17,mean_score:4,
  dimension_means:{
    distractor_quality:4,cognitive_depth:4,competency_fit:4,
    stimulus_use:4,answer_leakage:4,real_world_quality:4
  },
  fail_item_count:0,revision_item_count:0,similarity_max:0.2,decision:"PASS"
};
const calibration=calibrateGeographyExam108(exam,critic,effective);
assert(calibration.scores.structure===100,"FLEX structure must score against teacher 12-2-3 matrix");
assert(!calibration.reasons.includes("official_structure_mismatch"),"FLEX must not be compared to official 18-4-6 structure");
assert(!calibration.reasons.includes("matrix_structure_mismatch"),"exact FLEX structure should match matrix");
const structure:any=(calibration.metrics as any).structure;
assert(structure.mode==="FLEX_GEOGRAPHY","FLEX calibration mode");
assert(structure.expected.p1===12&&structure.expected.p2===2&&structure.expected.p3===3,"FLEX calibration expected counts");

const strictP1=Array.from({length:18},(_,i)=>({
  slot_id:`P1-${String(i+1).padStart(2,"0")}`,part:1,content_target:{scope_key:"strict"},
  competency_code:"GEO_NK_SPATIAL",cognitive_level:i<5?"NB":i<13?"TH":"VD",
  operation_code:"SPATIAL_RELATION",stimulus_type:"TEXT"
}));
const strictP2=Array.from({length:4},(_,i)=>({
  slot_id:`P2-${String(i+1).padStart(2,"0")}`,part:2,content_target:{scope_key:"strict"},
  primary_competency_code:"GEO_TH_TOOL",stimulus_type:"TEXT",
  statements:{
    A:{cognitive_level:"NB",competency_code:"GEO_TH_TOOL",operation_code:"READ_TABLE"},
    B:{cognitive_level:"TH",competency_code:"GEO_NK_CAUSAL",operation_code:"CAUSE_EFFECT"},
    C:{cognitive_level:"TH",competency_code:"GEO_TH_TOOL",operation_code:"COMPARE_DATA"},
    D:{cognitive_level:"VD",competency_code:"GEO_VD_PROBLEM",operation_code:"SCENARIO_APPLICATION"}
  }
}));
const strictP3=Array.from({length:6},(_,i)=>({
  slot_id:`P3-${String(i+1).padStart(2,"0")}`,part:3,content_target:{scope_key:"strict"},
  competency_code:"GEO_TH_TOOL",cognitive_level:"VD",operation_code:"CALCULATE_GEO_INDICATOR",
  quantitative_family:["GROWTH_RATE","SHARE_PERCENT","DENSITY_OR_INVERSE_DENSITY","BALANCE","RANGE_OR_RANGE_DIFFERENCE","PER_CAPITA_OR_SCALED_RATIO"][i],
  stimulus_type:"TABLE"
}));
const strictSpec:any={
  assessment_type:"TOT_NGHIEP",grade:12,counts:{p1:18,p2:4,p3:6},
  competency_blueprint:{schema_version:"DAMSAN_GEO_BLUEPRINT_V1"},
  exam_design_plan:{
    schema_version:"DAMSAN_GEO_DESIGN_PLAN_V1",planner_version:"103",status:"PREVIEW_ONLY_NOT_GENERATOR_ACTIVE",
    slots:{part1:strictP1,part2:strictP2,part3:strictP3}
  }
};
const strictBatches=plannedGenerationBatches105(strictSpec);
assert(strictBatches.length===8,"STRICT TNTHPT must remain eight batches");
assert(strictBatches.flatMap(b=>b.slot_ids).length===28,"STRICT TNTHPT must remain 28 slots");
assert(JSON.stringify(strictBatches.map(b=>b.slot_ids.length))===JSON.stringify([6,6,6,2,2,2,2,2]),"STRICT batching changed");

const badCounts=structuredClone(flexSpec);
badCounts.assessment_matrix.rows[0].allocations.p1.KNOW=2;
let badCountCode="";
try{compileFlexGeographyPlan112(badCounts);}catch(error){badCountCode=error instanceof Error?error.message:"";}
assert(badCountCode==="flex_matrix_count_mismatch","bad FLEX matrix totals must be rejected");

const badLevel=structuredClone(flexSpec);
badLevel.assessment_matrix.rows[2].allocations.p1.KNOW=1;
badLevel.assessment_matrix.rows[2].allocations.p1.APPLY=0;
let badLevelCode="";
try{compileFlexGeographyPlan112(badLevel);}catch(error){badLevelCode=error instanceof Error?error.message:"";}
assert(badLevelCode==="flex_cognitive_level_not_allowed","cognitive level outside YCCD indicator must be rejected");

console.log("AI_GEOGRAPHY_FLEX_MATRIX_112_RUNTIME_PASS",JSON.stringify({
  flex:{slots:17,commands:23,batches:flexBatches.length,structure_score:calibration.scores.structure},
  strict:{slots:28,batches:strictBatches.length}
}));
