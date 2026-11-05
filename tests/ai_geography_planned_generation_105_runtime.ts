import {
  filterKnowledgeUnitsForBatch105,
  isPlannedGenerationEnabled105,
  plannedBatchByIndex105,
  plannedBatchInstructions105,
  plannedGenerationBatches105,
  validatePlannedExam105,
} from "../supabase/functions/_shared/exam_planned_generation_105.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function target(i:number){
  const lesson=i%2===0?"BAI_01":"BAI_02";
  return {scope_key:`doc-1::${lesson}`,lesson_code:lesson,lesson_title:lesson};
}

const p1=Array.from({length:18},(_,i)=>({
  slot_id:`P1-${String(i+1).padStart(2,"0")}`,part:1,item_format:"MCQ_SINGLE",content_target:target(i),
  competency_code:i<5?"GEO_NK_SPATIAL":i<13?"GEO_NK_CAUSAL":"GEO_VD_PROBLEM",
  cognitive_level:i<5?"NB":i<13?"TH":"VD",operation_code:i<5?"LOCATE":i<13?"CAUSE_EFFECT":"SCENARIO_APPLICATION",
  stimulus_type:["NONE","TEXT","TABLE","CHART","MAP","TEXT"][i%6]
}));

const p2=Array.from({length:4},(_,i)=>{
  const stimulus_type=["TEXT","CHART","TABLE","MAP"][i];
  return {
    slot_id:`P2-${String(i+1).padStart(2,"0")}`,part:2,item_format:"TRUE_FALSE_CLUSTER",content_target:target(18+i),
    primary_competency_code:i===0?"GEO_NK_CAUSAL":"GEO_TH_TOOL",stimulus_type,
    statements:{
      A:{cognitive_level:"NB",competency_code:stimulus_type==="TEXT"?"GEO_NK_CAUSAL":"GEO_TH_TOOL",operation_code:stimulus_type==="CHART"?"READ_CHART":stimulus_type==="TABLE"?"READ_TABLE":stimulus_type==="MAP"?"READ_MAP":"SPATIAL_DISTRIBUTION"},
      B:{cognitive_level:"TH",competency_code:"GEO_NK_CAUSAL",operation_code:"CAUSE_EFFECT"},
      C:{cognitive_level:"TH",competency_code:stimulus_type==="TEXT"?"GEO_NK_SPATIAL":"GEO_TH_TOOL",operation_code:stimulus_type==="CHART"?"TREND_ANALYSIS":stimulus_type==="TABLE"?"COMPARE_DATA":stimulus_type==="MAP"?"SPATIAL_COMPARISON":"SPATIAL_RELATION"},
      D:{cognitive_level:"VD",competency_code:"GEO_VD_PROBLEM",operation_code:"SCENARIO_APPLICATION"}
    }
  };
});

const families=["GROWTH_RATE","SHARE_PERCENT","DENSITY_OR_INVERSE_DENSITY","BALANCE","RANGE_OR_RANGE_DIFFERENCE","PER_CAPITA_OR_SCALED_RATIO"];
const p3=Array.from({length:6},(_,i)=>({
  slot_id:`P3-${String(i+1).padStart(2,"0")}`,part:3,item_format:"SHORT_ANSWER",content_target:target(22+i),
  competency_code:"GEO_TH_TOOL",cognitive_level:"VD",operation_code:"CALCULATE_GEO_INDICATOR",
  quantitative_family:families[i],stimulus_type:[0,1,4].includes(i)?"TABLE":"TEXT"
}));

const spec={
  competency_blueprint:{schema_version:"DAMSAN_GEO_BLUEPRINT_V1"},
  exam_design_plan:{
    schema_version:"DAMSAN_GEO_DESIGN_PLAN_V1",status:"PREVIEW_ONLY_NOT_GENERATOR_ACTIVE",plan_hash:"runtime-105",
    slots:{part1:p1,part2:p2,part3:p3},presentation_budget:{minutes:50,max_print_pages:4}
  }
};

const units=[
  {unit_key:"U1",scope_key:"doc-1::BAI_01",content:{text:"Bài 1"}},
  {unit_key:"U2",scope_key:"doc-1::BAI_02",content:{text:"Bài 2"}},
];

function structured(type:string){
  return ["TABLE","CHART","MAP","SCHEMATIC_MAP","IMAGE","DIAGRAM","CLIMOGRAPH","CROSS_SECTION","MULTI_SOURCE"].includes(type);
}

function itemFor(slot:any){
  const part=String(slot.part);
  const assessment_design:any={slot_id:slot.slot_id,content_target:slot.content_target,stimulus_type:slot.stimulus_type};
  if(part==="2"){
    assessment_design.primary_competency_code=slot.primary_competency_code;
    assessment_design.statement_design=slot.statements;
  }else{
    assessment_design.competency_code=slot.competency_code;
    assessment_design.cognitive_level=slot.cognitive_level;
    assessment_design.operation_code=slot.operation_code;
    if(part==="3") assessment_design.quantitative_family=slot.quantitative_family;
  }
  const q:any={
    slot_id:slot.slot_id,assessment_design,phan:part,noi_dung:"Runtime item",
    A:part==="3"?"":"A",B:part==="3"?"":"B",C:part==="3"?"":"C",D:part==="3"?"":"D",
    dap_an_dung:part==="1"?"A":part==="2"?"Đ-S-Đ-S":"12,3",loi_giai:"Runtime",
    source_refs:[slot.content_target.scope_key.endsWith("BAI_01")?"U1":"U2"]
  };
  if(part!=="2") q.muc_do=slot.cognitive_level;
  if(structured(slot.stimulus_type)) q.stimulus={type:slot.stimulus_type};
  return q;
}

assert(!isPlannedGenerationEnabled105("off"),"feature gate OFF failed");
assert(isPlannedGenerationEnabled105("enabled"),"feature gate ON failed");

const batches=plannedGenerationBatches105(spec);
assert(batches.length===8,"expected 8 batches");
assert(JSON.stringify(batches.map(b=>b.slot_ids.length))===JSON.stringify([6,6,6,2,2,2,2,2]),"unexpected batch sizes");
assert(batches.flatMap(b=>b.slot_ids).length===28,"expected 28 slots");

const {batch}=plannedBatchByIndex105(spec,0);
const filtered=filterKnowledgeUnitsForBatch105(units,batch);
assert(filtered.length===2,"batch scope filter failed");
const instructions=plannedBatchInstructions105(spec,batch,{schema_version:"DAMSAN_STIMULUS_V1"});
assert(instructions.output_schema.schema_version==="DAMSAN_ITEM_BATCH_V1","batch instruction schema failed");

const all=[...p1,...p2,...p3];
const exam={schema_version:"DAMSAN_EXAM_V1",title:"Runtime 105",assessment_type:"TOT_NGHIEP",scoring_config:{},questions:all.map(itemFor)};
const checked=validatePlannedExam105(exam,spec,units);
assert(checked.validation.question_count===28,"full plan question count failed");
assert(checked.validation.source_scope_verified_count===28,"source scope coverage failed");

const bad=structuredClone(exam);
bad.questions[0].source_refs=["U2"];
let code="";
try{validatePlannedExam105(bad,spec,units);}catch(error){code=error instanceof Error?error.message:"";}
assert(code==="planned_source_ref_outside_slot","wrong lesson source_ref was not rejected");

console.log("AI_GEOGRAPHY_PLANNED_GENERATION_105_RUNTIME_PASS");
