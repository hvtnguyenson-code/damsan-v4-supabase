import {
  filterKnowledgeUnitsForBatch105,
  isPlannedGenerationEnabled105,
  plannedBatchByIndex105,
  plannedBatchInstructions105,
  plannedGenerationBatches105,
  validatePlannedExam105,
} from "../_shared/exam_planned_generation_105.ts";

function target(i:number){
  const lesson=i%2===0?"BAI_01":"BAI_02";
  return {scope_key:`doc-1::${lesson}`,lesson_code:lesson,lesson_title:lesson==="BAI_01"?"Bài 1":"Bài 2"};
}
function p1(i:number){
  const stim=["NONE","TEXT","TABLE","CHART","MAP","TEXT"][i%6];
  return {
    slot_id:`P1-${String(i+1).padStart(2,"0")}`,part:1,item_format:"MCQ_SINGLE",content_target:target(i),
    competency_code:i<5?"GEO_NK_SPATIAL":i<13?"GEO_NK_CAUSAL":"GEO_VD_PROBLEM",
    cognitive_level:i<5?"NB":i<13?"TH":"VD",operation_code:i<5?"LOCATE":i<13?"CAUSE_EFFECT":"SCENARIO_APPLICATION",
    stimulus_type:stim
  };
}
function p2(i:number){
  const stim=["TEXT","CHART","TABLE","MAP"][i];
  return {
    slot_id:`P2-${String(i+1).padStart(2,"0")}`,part:2,item_format:"TRUE_FALSE_CLUSTER",content_target:target(18+i),
    primary_competency_code:i===0?"GEO_NK_CAUSAL":"GEO_TH_TOOL",stimulus_type:stim,
    statements:{
      A:{cognitive_level:"NB",competency_code:stim==="TEXT"?"GEO_NK_CAUSAL":"GEO_TH_TOOL",operation_code:stim==="CHART"?"READ_CHART":stim==="TABLE"?"READ_TABLE":stim==="MAP"?"READ_MAP":"SPATIAL_DISTRIBUTION"},
      B:{cognitive_level:"TH",competency_code:"GEO_NK_CAUSAL",operation_code:"CAUSE_EFFECT"},
      C:{cognitive_level:"TH",competency_code:stim==="TEXT"?"GEO_NK_SPATIAL":"GEO_TH_TOOL",operation_code:stim==="CHART"?"TREND_ANALYSIS":stim==="TABLE"?"COMPARE_DATA":stim==="MAP"?"SPATIAL_COMPARISON":"SPATIAL_RELATION"},
      D:{cognitive_level:"VD",competency_code:"GEO_VD_PROBLEM",operation_code:"SCENARIO_APPLICATION"}
    }
  };
}
function p3(i:number){
  const families=["GROWTH_RATE","SHARE_PERCENT","DENSITY_OR_INVERSE_DENSITY","BALANCE","RANGE_OR_RANGE_DIFFERENCE","PER_CAPITA_OR_SCALED_RATIO"];
  return {
    slot_id:`P3-${String(i+1).padStart(2,"0")}`,part:3,item_format:"SHORT_ANSWER",content_target:target(22+i),
    competency_code:"GEO_TH_TOOL",cognitive_level:"VD",operation_code:"CALCULATE_GEO_INDICATOR",
    quantitative_family:families[i],stimulus_type:[0,1,4].includes(i)?"TABLE":"TEXT"
  };
}

const spec={
  competency_blueprint:{schema_version:"DAMSAN_GEO_BLUEPRINT_V1"},
  exam_design_plan:{
    schema_version:"DAMSAN_GEO_DESIGN_PLAN_V1",status:"PREVIEW_ONLY_NOT_GENERATOR_ACTIVE",plan_hash:"probe-105",
    slots:{part1:Array.from({length:18},(_,i)=>p1(i)),part2:Array.from({length:4},(_,i)=>p2(i)),part3:Array.from({length:6},(_,i)=>p3(i))},
    presentation_budget:{minutes:50,max_print_pages:4}
  }
};

const units=[
  {unit_key:"U1",scope_key:"doc-1::BAI_01",content:{text:"Kiến thức bài 1"}},
  {unit_key:"U2",scope_key:"doc-1::BAI_02",content:{text:"Kiến thức bài 2"}},
];

function structured(type:string){return ["TABLE","CHART","MAP","SCHEMATIC_MAP","IMAGE","DIAGRAM","CLIMOGRAPH","CROSS_SECTION","MULTI_SOURCE"].includes(type);}
function itemFor(slot:any){
  const part=String(slot.part);
  const design:any={
    slot_id:slot.slot_id,content_target:slot.content_target,stimulus_type:slot.stimulus_type
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
    slot_id:slot.slot_id,assessment_design:design,phan:part,noi_dung:"Câu hỏi probe",
    A:part==="3"?"":"A",B:part==="3"?"":"B",C:part==="3"?"":"C",D:part==="3"?"":"D",
    dap_an_dung:part==="1"?"A":part==="2"?"Đ-S-Đ-S":"12,3",loi_giai:"Probe",
    source_refs:[slot.content_target.scope_key.endsWith("BAI_01")?"U1":"U2"]
  };
  if(part!=="2") q.muc_do=slot.cognitive_level;
  if(structured(slot.stimulus_type)) q.stimulus={type:slot.stimulus_type};
  return q;
}

Deno.serve(()=>{
  try{
    if(isPlannedGenerationEnabled105("off")) throw new Error("gate_off_failed");
    if(!isPlannedGenerationEnabled105("enabled")) throw new Error("gate_on_failed");

    const batches=plannedGenerationBatches105(spec);
    if(batches.length!==8) throw new Error("batch_count_failed");
    if(batches.flatMap(b=>b.slot_ids).length!==28) throw new Error("slot_count_failed");

    const {batch}=plannedBatchByIndex105(spec,0);
    const filtered=filterKnowledgeUnitsForBatch105(units,batch);
    if(filtered.length!==2) throw new Error("batch_filter_failed");
    const instructions=plannedBatchInstructions105(spec,batch,{schema_version:"DAMSAN_STIMULUS_V1"});
    if(instructions.output_schema.schema_version!=="DAMSAN_ITEM_BATCH_V1") throw new Error("instruction_schema_failed");

    const allSlots=[
      ...(spec.exam_design_plan.slots.part1 as any[]),
      ...(spec.exam_design_plan.slots.part2 as any[]),
      ...(spec.exam_design_plan.slots.part3 as any[])
    ];
    const exam={
      schema_version:"DAMSAN_EXAM_V1",title:"Probe 105",assessment_type:"TOT_NGHIEP",scoring_config:{},
      questions:allSlots.map(itemFor)
    };
    const checked=validatePlannedExam105(exam,spec,units);
    if(checked.validation.question_count!==28||checked.validation.source_scope_verified_count!==28) throw new Error("full_validation_failed");

    const bad=structuredClone(exam);
    bad.questions[0].source_refs=["U2"];
    let rejected="";
    try{validatePlannedExam105(bad,spec,units);}catch(error){rejected=error instanceof Error?error.message:"";}
    if(rejected!=="planned_source_ref_outside_slot") throw new Error("scope_rejection_failed");

    return new Response(JSON.stringify({
      status:"success",engine_version:"105",feature_gate_default:"OFF",
      batch_count:batches.length,slot_count:28,
      batch_sizes:batches.map(b=>b.slot_ids.length),
      validation_schema:checked.validation.schema_version,
      source_scope_verified_count:checked.validation.source_scope_verified_count,
      rejected_wrong_scope:rejected
    }),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  }catch(error){
    return new Response(JSON.stringify({status:"error",code:error instanceof Error?error.message:"unexpected_error"}),{status:500,headers:{"Content-Type":"application/json; charset=utf-8"}});
  }
});
