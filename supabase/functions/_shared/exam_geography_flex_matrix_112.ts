export type FlexJson112 = Record<string, unknown>;

export type FlexMatrixRow112 = {
  matrix_row_id: string;
  grade: number;
  scope_key: string;
  lesson_code: string;
  lesson_title: string;
  requirement_id: string;
  requirement_text: string;
  indicator_id: string;
  indicator_text: string;
  requirement_basis: string;
  mapping_confidence: number;
  competency_code: string;
  operation_code: string;
  allowed_cognitive_levels: string[];
  preferred_stimuli: string[];
  allocations: {
    p1: { KNOW: number; UNDERSTAND: number; APPLY: number };
    p2: number;
    p3: number;
  };
};

const VALID_COMPETENCIES = new Set([
  "GEO_NK_SPATIAL","GEO_NK_CAUSAL","GEO_TH_TOOL","GEO_TH_FIELD","GEO_TH_INFO",
  "GEO_VD_REALITY","GEO_VD_PROBLEM","GEO_VD_RESEARCH"
]);
const VALID_LEVELS = new Set(["KNOW","UNDERSTAND","APPLY"]);
const VALID_STIMULI = new Set([
  "NONE","TEXT","TABLE","CHART","MAP","SCHEMATIC_MAP","IMAGE","DIAGRAM","CLIMOGRAPH","CROSS_SECTION","MULTI_SOURCE"
]);
const P3_FAMILIES = [
  "GROWTH_RATE","SHARE_PERCENT","DENSITY_OR_INVERSE_DENSITY",
  "BALANCE","RANGE_OR_RANGE_DIFFERENCE","PER_CAPITA_OR_SCALED_RATIO"
];

function fail(code:string):never{throw new Error(code);}
function obj(v:unknown,code="flex_object_invalid"):FlexJson112{
  if(!v||typeof v!=="object"||Array.isArray(v))fail(code);
  return v as FlexJson112;
}
function str(v:unknown,max=800,required=false,code="flex_string_invalid"){
  const out=typeof v==="string"?v.trim().slice(0,max):"";
  if(required&&!out)fail(code);
  return out;
}
function int(v:unknown,min=0,max=300,code="flex_integer_invalid"){
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n<min||n>max)fail(code);
  return n;
}
function num(v:unknown,min=0,max=1,code="flex_number_invalid"){
  const n=Number(v);
  if(!Number.isFinite(n)||n<min||n>max)fail(code);
  return n;
}
function arr(v:unknown,code="flex_array_invalid"){if(!Array.isArray(v))fail(code);return v;}
function countsFromSpec(spec:FlexJson112){
  const counts=obj(spec.counts,"flex_counts_missing");
  return {
    p1:int(counts.p1,0,300,"flex_p1_count_invalid"),
    p2:int(counts.p2,0,300,"flex_p2_count_invalid"),
    p3:int(counts.p3,0,300,"flex_p3_count_invalid"),
  };
}
function stableHash(value:unknown){
  const text=JSON.stringify(value);
  let hash=2166136261;
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return "flex-"+(hash>>>0).toString(16).padStart(8,"0");
}
function normalizeLevelList(value:unknown){
  const levels=arr(value,"flex_levels_invalid").map(x=>str(x,30,true,"flex_levels_invalid").toUpperCase());
  if(!levels.length||levels.some(x=>!VALID_LEVELS.has(x)))fail("flex_levels_invalid");
  return Array.from(new Set(levels));
}
function normalizeStimuli(value:unknown){
  const stimuli=arr(value,"flex_stimuli_invalid").map(x=>str(x,40,true,"flex_stimuli_invalid").toUpperCase());
  if(!stimuli.length||stimuli.some(x=>!VALID_STIMULI.has(x)))fail("flex_stimuli_invalid");
  return Array.from(new Set(stimuli));
}
function normalizeRow(value:unknown,grade:number):FlexMatrixRow112{
  const row=obj(value,"flex_matrix_row_invalid");
  const rowGrade=int(row.grade,10,12,"flex_matrix_grade_invalid");
  if(rowGrade!==grade)fail("flex_matrix_grade_mismatch");
  const competency=str(row.competency_code,80,true,"flex_competency_missing").toUpperCase();
  if(!VALID_COMPETENCIES.has(competency))fail("flex_competency_invalid");
  const allocations=obj(row.allocations,"flex_allocations_missing");
  const p1=obj(allocations.p1,"flex_p1_allocations_missing");
  const normalized:FlexMatrixRow112={
    matrix_row_id:str(row.matrix_row_id,120,true,"flex_matrix_row_id_missing"),
    grade:rowGrade,
    scope_key:str(row.scope_key,600,true,"flex_scope_key_missing"),
    lesson_code:str(row.lesson_code,120),
    lesson_title:str(row.lesson_title,500,true,"flex_lesson_title_missing"),
    requirement_id:str(row.requirement_id,160,true,"flex_requirement_id_missing"),
    requirement_text:str(row.requirement_text,2000,true,"flex_requirement_text_missing"),
    indicator_id:str(row.indicator_id,180,true,"flex_indicator_id_missing"),
    indicator_text:str(row.indicator_text,2000,true,"flex_indicator_text_missing"),
    requirement_basis:str(row.requirement_basis,80,true,"flex_requirement_basis_missing"),
    mapping_confidence:num(row.mapping_confidence,0,1,"flex_mapping_confidence_invalid"),
    competency_code:competency,
    operation_code:str(row.operation_code,100,true,"flex_operation_missing").toUpperCase(),
    allowed_cognitive_levels:normalizeLevelList(row.allowed_cognitive_levels),
    preferred_stimuli:normalizeStimuli(row.preferred_stimuli),
    allocations:{
      p1:{
        KNOW:int(p1.KNOW,0,300,"flex_p1_know_invalid"),
        UNDERSTAND:int(p1.UNDERSTAND,0,300,"flex_p1_understand_invalid"),
        APPLY:int(p1.APPLY,0,300,"flex_p1_apply_invalid"),
      },
      p2:int(allocations.p2,0,300,"flex_p2_allocation_invalid"),
      p3:int(allocations.p3,0,300,"flex_p3_allocation_invalid"),
    }
  };
  for(const level of ["KNOW","UNDERSTAND","APPLY"] as const){
    if(normalized.allocations.p1[level]>0&&!normalized.allowed_cognitive_levels.includes(level)){
      fail("flex_cognitive_level_not_allowed");
    }
  }
  return normalized;
}
function chooseStimulus(row:FlexMatrixRow112,level:string,part:number,index:number){
  const stimuli=row.preferred_stimuli;
  if(part===3){
    if(stimuli.includes("TABLE"))return "TABLE";
    if(stimuli.includes("CHART"))return "CHART";
    return "TEXT";
  }
  if(part===2){
    const structured=stimuli.filter(x=>!["NONE"].includes(x));
    return structured[index%Math.max(1,structured.length)]||"TEXT";
  }
  if(level==="KNOW"){
    if(stimuli.includes("NONE"))return "NONE";
    if(stimuli.includes("TEXT"))return "TEXT";
  }
  const preferred=stimuli.filter(x=>x!=="NONE");
  return preferred[index%Math.max(1,preferred.length)]||"TEXT";
}
function cognitiveLegacy(level:string){
  if(level==="KNOW")return "NB";
  if(level==="UNDERSTAND")return "TH";
  return "VD";
}
function operationFor(row:FlexMatrixRow112,level:string){
  if(level==="APPLY"&&row.competency_code.startsWith("GEO_VD"))return row.operation_code||"SCENARIO_APPLICATION";
  if(level==="APPLY"&&row.competency_code==="GEO_TH_TOOL")return row.operation_code||"SPATIAL_DATA_ANALYSIS";
  return row.operation_code;
}
function contentTarget(row:FlexMatrixRow112){
  return {
    scope_key:row.scope_key,
    lesson_code:row.lesson_code||null,
    lesson_title:row.lesson_title,
    requirement_id:row.requirement_id,
    requirement_text:row.requirement_text,
    indicator_id:row.indicator_id,
    indicator_text:row.indicator_text,
    requirement_basis:row.requirement_basis,
    mapping_confidence:row.mapping_confidence,
  };
}

export function normalizeFlexMatrix112(specValue:unknown){
  const spec=obj(specValue,"flex_spec_invalid");
  const matrix=obj(spec.assessment_matrix,"flex_matrix_missing");
  if(matrix.schema_version!=="DAMSAN_GEO_ASSESSMENT_MATRIX_V1")fail("flex_matrix_schema_invalid");
  if(str(matrix.mode,40,true).toUpperCase()!=="FLEX_GEOGRAPHY")fail("flex_matrix_mode_invalid");
  const grade=int(matrix.grade,10,12,"flex_matrix_grade_invalid");
  if(int(spec.grade,10,12,"flex_spec_grade_invalid")!==grade)fail("flex_matrix_grade_mismatch");
  const rows=arr(matrix.rows,"flex_matrix_rows_missing").map(row=>normalizeRow(row,grade));
  if(!rows.length)fail("flex_matrix_rows_empty");
  if(new Set(rows.map(r=>r.matrix_row_id)).size!==rows.length)fail("flex_matrix_row_duplicate");
  const requested=countsFromSpec(spec);
  const actual=rows.reduce((a,r)=>{
    a.p1+=r.allocations.p1.KNOW+r.allocations.p1.UNDERSTAND+r.allocations.p1.APPLY;
    a.p2+=r.allocations.p2;
    a.p3+=r.allocations.p3;
    return a;
  },{p1:0,p2:0,p3:0});
  if(actual.p1!==requested.p1||actual.p2!==requested.p2||actual.p3!==requested.p3)fail("flex_matrix_count_mismatch");
  const total=requested.p1+requested.p2+requested.p3;
  if(total<1||total>120)fail("flex_matrix_total_count_invalid");
  return {spec,matrix,grade,rows,counts:requested};
}

export function compileFlexGeographyPlan112(specValue:unknown){
  const normalized=normalizeFlexMatrix112(specValue);
  const {spec,matrix,grade,rows,counts}=normalized;
  const part1:FlexJson112[]=[];
  const part2:FlexJson112[]=[];
  const part3:FlexJson112[]=[];
  let p1Index=0,p2Index=0,p3Index=0;

  for(const row of rows){
    for(const level of ["KNOW","UNDERSTAND","APPLY"] as const){
      for(let n=0;n<row.allocations.p1[level];n++){
        p1Index++;
        const stimulus=chooseStimulus(row,level,1,p1Index-1);
        part1.push({
          slot_id:`P1-${String(p1Index).padStart(3,"0")}`,
          part:1,item_format:"MCQ_SINGLE",
          content_target:contentTarget(row),
          competency_code:row.competency_code,
          cognitive_level:cognitiveLegacy(level),
          cognitive_standard:level,
          operation_code:operationFor(row,level),
          stimulus_type:stimulus,
          design_constraints:{
            single_key:true,
            distractor_policy:level==="KNOW"?"HOMOGENEOUS_DOMAIN":"NEAR_MISS_GEOGRAPHIC_CONDITION",
            answer_leakage_forbidden:true,
            requirement_alignment_required:true,
          },
          reading_cost:["TABLE","CHART","MAP","MULTI_SOURCE"].includes(stimulus)?"MEDIUM":"LOW"
        });
      }
    }

    for(let n=0;n<row.allocations.p2;n++){
      p2Index++;
      const stimulus=chooseStimulus(row,"APPLY",2,p2Index-1);
      part2.push({
        slot_id:`P2-${String(p2Index).padStart(3,"0")}`,
        part:2,item_format:"TRUE_FALSE_CLUSTER",
        content_target:contentTarget(row),
        primary_competency_code:row.competency_code,
        stimulus_type:stimulus,
        statement_count:4,
        statements:{
          A:{cognitive_level:"NB",competency_code:stimulus==="TABLE"||stimulus==="CHART"||stimulus==="MAP"?"GEO_TH_TOOL":row.competency_code,operation_code:stimulus==="TABLE"?"READ_TABLE":stimulus==="CHART"?"READ_CHART":stimulus==="MAP"?"READ_MAP":row.operation_code},
          B:{cognitive_level:"TH",competency_code:row.competency_code,operation_code:row.operation_code},
          C:{cognitive_level:"TH",competency_code:stimulus==="TABLE"||stimulus==="CHART"||stimulus==="MAP"?"GEO_TH_TOOL":row.competency_code,operation_code:stimulus==="TABLE"?"COMPARE_DATA":stimulus==="CHART"?"TREND_ANALYSIS":stimulus==="MAP"?"SPATIAL_COMPARISON":row.operation_code},
          D:{cognitive_level:"VD",competency_code:"GEO_VD_PROBLEM",operation_code:"SCENARIO_APPLICATION"}
        },
        design_constraints:{
          shared_stimulus_required:true,independent_statements:true,
          at_least_one_th:true,at_least_one_vd:true,all_same_truth_pattern_forbidden:true,
          requirement_alignment_required:true
        },
        reading_cost:"HIGH"
      });
    }

    for(let n=0;n<row.allocations.p3;n++){
      p3Index++;
      const stimulus=chooseStimulus(row,"APPLY",3,p3Index-1);
      part3.push({
        slot_id:`P3-${String(p3Index).padStart(3,"0")}`,
        part:3,item_format:"SHORT_ANSWER",
        content_target:contentTarget(row),
        competency_code:"GEO_TH_TOOL",
        cognitive_level:"VD",
        cognitive_standard:"APPLY",
        operation_code:"CALCULATE_GEO_INDICATOR",
        quantitative_family:P3_FAMILIES[(p3Index-1)%P3_FAMILIES.length],
        stimulus_type:stimulus,
        design_constraints:{
          authentic_data_required:true,single_numeric_result:true,
          student_visible_source_data_required:true,rounding_when_needed:true,
          geographic_reasoning_required:true,requirement_alignment_required:true
        },
        reading_cost:stimulus==="TABLE"||stimulus==="CHART"?"HIGH":"MEDIUM"
      });
    }
  }

  if(part1.length!==counts.p1||part2.length!==counts.p2||part3.length!==counts.p3)fail("flex_plan_internal_count_mismatch");
  const answerCommands=counts.p1+counts.p2*4+counts.p3;
  const timeMinutes=int((matrix.time_minutes??Math.max(15,Math.min(180,Math.ceil(answerCommands*1.25)))),10,240,"flex_time_invalid");
  const lessons=rows.map(r=>contentTarget(r));
  const competencies=Array.from(new Set(rows.map(r=>r.competency_code)));
  const stimuli=Array.from(new Set([...part1,...part2,...part3].map(s=>String(s.stimulus_type||"NONE"))));

  const blueprint={
    schema_version:"DAMSAN_GEO_BLUEPRINT_V1",
    blueprint_version:"112-FLEX",
    assessment_mode:"FLEX_GEOGRAPHY",
    authority_basis:{
      source_state:"CURRICULUM_MATRIX",
      curriculum_authority:"BGDDT_GEOGRAPHY_CURRICULUM_2018",
      current_patch:"TT17_2025_CURRENT",
      benchmark_sources:["BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY","BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY"],
      matrix_schema:"DAMSAN_GEO_ASSESSMENT_MATRIX_V1"
    },
    coverage_constraints:{
      requested_counts:counts,
      requirement_rows:rows.length,
      competency_codes:competencies
    },
    presentation_constraints:{minutes:timeMinutes,max_print_pages:null}
  };

  const planCore={
    schema_version:"DAMSAN_GEO_DESIGN_PLAN_V1",
    planner_version:"112-FLEX",
    status:"PREVIEW_ONLY_NOT_GENERATOR_ACTIVE",
    assessment_mode:"FLEX_GEOGRAPHY",
    assessment_type:str(spec.assessment_type,80)||"CUSTOM",
    matrix_snapshot_hash:stableHash(matrix),
    content_scope:{
      lesson_count:new Set(rows.map(r=>r.scope_key)).size,
      lessons,
      assignment_policy:"TEACHER_MATRIX_REQUIREMENT_ALLOCATION"
    },
    calibration_policy:{
      structure_basis:"TEACHER_LOCKED_MATRIX",
      quality_benchmark:"MOET_GEOGRAPHY_2025_2026_FINGERPRINT_V1",
      cognitive_standard:"KNOW_UNDERSTAND_APPLY",
      benchmark_quality_not_structure:true
    },
    slots:{part1,part2,part3},
    coverage_targets:{
      item_slot_count:counts.p1+counts.p2+counts.p3,
      answer_command_count:answerCommands,
      part1_slots:counts.p1,
      part2_clusters:counts.p2,
      part2_commands:counts.p2*4,
      part3_slots:counts.p3,
      required_competencies:competencies,
      required_stimuli:stimuli,
      no_atlas_dependency:true
    },
    presentation_budget:{minutes:timeMinutes,max_print_pages:null}
  };
  const plan={...planCore,plan_hash:stableHash(planCore)};
  return {...spec,competency_blueprint:blueprint,exam_design_plan:plan};
}

export function effectiveGeographySpec112(specValue:unknown){
  const spec=obj(specValue,"flex_spec_invalid");
  const existing=spec.exam_design_plan&&typeof spec.exam_design_plan==="object"&&!Array.isArray(spec.exam_design_plan)
    ? spec.exam_design_plan as FlexJson112:null;
  if(existing?.schema_version==="DAMSAN_GEO_DESIGN_PLAN_V1")return spec;
  const matrix=spec.assessment_matrix&&typeof spec.assessment_matrix==="object"&&!Array.isArray(spec.assessment_matrix)
    ? spec.assessment_matrix as FlexJson112:null;
  if(matrix?.schema_version==="DAMSAN_GEO_ASSESSMENT_MATRIX_V1"&&str(matrix.mode).toUpperCase()==="FLEX_GEOGRAPHY"){
    return compileFlexGeographyPlan112(spec);
  }
  return spec;
}
