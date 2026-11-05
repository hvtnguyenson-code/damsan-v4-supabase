import {
  criticInstructions106,
  isIndependentCriticEnabled106,
  validateIndependentCritic106,
} from "../supabase/functions/_shared/exam_independent_critic_106.ts";
import {
  geographyAuthoringContract107,
  geographyAuthoringContractText107,
} from "../supabase/functions/_shared/exam_geography_authoring_contract_107.ts";
import {
  calibrateGeographyExam108,
  calibrationSuite108,
  isCalibrationEnabled108,
  officialGeographyBenchmarkProfile108,
} from "../supabase/functions/_shared/exam_geography_calibration_108.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const p1Stim=["NONE","TEXT","TABLE","CHART","NONE","TEXT","NONE","TEXT","TABLE","NONE","CHART","TEXT","NONE","TEXT","NONE","TABLE","TEXT","NONE"];
const p2Stim=["TEXT","CHART","TABLE","TEXT"];
const p3Stim=["TABLE","TEXT","TABLE","TEXT","TABLE","TEXT"];
const p3Fam=["GROWTH_RATE","SHARE_PERCENT","COMPONENT_FROM_RATE","BALANCE","RANGE_DIFFERENCE","PER_CAPITA"];

const themes=[
  "miennui_diahinhtaybac","dongbang_phusa_songhong","venbien_giomua_mientrung","caonguyen_bazan_taynguyen",
  "do_thi_hoa_dongnambo","nongnghiep_luaga_mecong","lamnghiep_rungphongho","thuy_san_vungbien",
  "congnghiep_nangluong","giaothong_cangbien","dichvu_dulich","dansoc_lao_dong",
  "khihau_nhietdoi","songngoi_thuyche","datferalit_sinhvat","khoangsan_nhietdien",
  "kinhtebien_logistics","chuyendich_cocau","vungkinhte_trongdiem","hoinhap_xuatkhau",
  "muabao_thien tai","bien doi_khihau","bangso_lieu_danso","bieudo_cocau",
  "matdo_danso_dientich","cancan_thuongmai","tisuat_tangtruong","binhquan_dau_nguoi"
];

function question(slot:string,part:string,stim:string,index:number,family=""){
  const theme=themes[index%themes.length];
  const q:any={
    slot_id:slot,
    phan:part,
    noi_dung:`${theme} yeuto_${index} quanhe_${index*7+3} bangchung_${index*13+5}`,
    A:part==="3"?"":`${theme}_lua_chon_alpha_${index}`,
    B:part==="3"?"":`${theme}_lua_chon_beta_${index+11}`,
    C:part==="3"?"":`${theme}_lua_chon_gamma_${index+23}`,
    D:part==="3"?"":`${theme}_lua_chon_delta_${index+37}`,
    dap_an_dung:part==="1"?"A":part==="2"?"Đ-S-Đ-S":String((index%80)+10),
    source_refs:[`U${index+1}`],
    assessment_design:{
      slot_id:slot,
      stimulus_type:stim,
      content_target:{scope_key:`scope-${index+1}`},
      competency_code:part==="1"?"GEO_NK_CAUSAL":"GEO_TH_TOOL",
      cognitive_level:part==="1"?(index<5?"NB":index<13?"TH":"VD"):"VD",
      operation_code:part==="3"?"CALCULATE_GEO_INDICATOR":"CAUSE_EFFECT",
      ...(family?{quantitative_family:family}:{})
    }
  };
  if(part==="2"){
    q.assessment_design.primary_competency_code="GEO_TH_TOOL";
    delete q.assessment_design.competency_code;
    delete q.assessment_design.cognitive_level;
    delete q.assessment_design.operation_code;
  }
  if(!["NONE","TEXT"].includes(stim)) q.stimulus={type:stim};
  return q;
}

function makeExam(seed=0){
  const questions:any[]=[];
  for(let i=0;i<18;i++)questions.push(question(`P1-${String(i+1).padStart(2,"0")}`,"1",p1Stim[i],i+seed*100));
  for(let i=0;i<4;i++)questions.push(question(`P2-${String(i+1).padStart(2,"0")}`,"2",p2Stim[i],18+i+seed*100));
  for(let i=0;i<6;i++)questions.push(question(`P3-${String(i+1).padStart(2,"0")}`,"3",p3Stim[i],22+i+seed*100,p3Fam[i]));
  return {schema_version:"DAMSAN_EXAM_V1",title:`Calibration ${seed}`,assessment_type:"TOT_NGHIEP",scoring_config:{},questions};
}
function criticReport(exam:any,score=4,verdict="PASS"){
  return {
    schema_version:"DAMSAN_INDEPENDENT_CRITIC_V1",
    critic_run_id:`critic-${exam.title}`,
    reviewer:{provider:"CRITIC_PROVIDER",model:"critic-model-106",independent_run:true},
    items:exam.questions.map((q:any)=>({
      slot_id:q.slot_id,
      scores:{
        distractor_quality:score,cognitive_depth:score,competency_fit:score,
        stimulus_use:score,answer_leakage:score,real_world_quality:score
      },
      verdict,
      issues:[],
      rationale:`Independent review of ${q.slot_id}: student-visible evidence matches the assigned construct.`
    })),
    exam_summary:{verdict}
  };
}

assert(!isIndependentCriticEnabled106("off"),"critic gate OFF failed");
assert(isIndependentCriticEnabled106("enabled"),"critic gate ON failed");
assert(!isCalibrationEnabled108("off"),"calibration gate OFF failed");
assert(isCalibrationEnabled108("enabled"),"calibration gate ON failed");

const contract=geographyAuthoringContract107();
assert(contract.schema_version==="DAMSAN_GEOGRAPHY_AUTHORING_CONTRACT_V1","107 schema missing");
assert(geographyAuthoringContractText107().includes("STYLE_ONLY_NO_COPY"),"107 benchmark no-copy rule missing");

const exam=makeExam();
const input=criticInstructions106(exam,{schema_version:"DAMSAN_GEO_DESIGN_PLAN_V1"});
assert(input.role==="INDEPENDENT_GEOGRAPHY_ASSESSMENT_REVIEWER","critic role missing");

const report=criticReport(exam);
const checked=validateIndependentCritic106(report,exam);
assert(checked.validation.decision==="PASS","gold critic should pass");
assert(checked.validation.item_count===28,"critic must cover 28 slots");
assert(checked.validation.mean_score===4,"gold critic mean");

const badReviewer=structuredClone(report);
badReviewer.reviewer.independent_run=false;
let rejected="";
try{validateIndependentCritic106(badReviewer,exam);}catch(error){rejected=error instanceof Error?error.message:"";}
assert(rejected==="critic_reviewer_not_independent","self-review must be rejected");

const profile=officialGeographyBenchmarkProfile108();
assert(profile.provenance.includes("BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY"),"2025 benchmark missing");
assert(profile.provenance.includes("BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY"),"2026 benchmark missing");
assert(profile.reuse_policy==="STYLE_ONLY_NO_COPY","benchmark reuse policy invalid");

const gold=calibrateGeographyExam108(exam,checked.validation);
assert(gold.decision==="ACCEPT",`gold calibration must ACCEPT, got ${gold.decision} ${JSON.stringify(gold)}`);
assert(gold.overall_score>=85,"gold calibration threshold");

const weakReport=criticReport(exam,2,"REVISE");
const weakChecked=validateIndependentCritic106(weakReport,exam);
const weak=calibrateGeographyExam108(exam,weakChecked.validation);
assert(weak.decision!=="ACCEPT","weak critic cannot calibrate ACCEPT");

const duplicate=makeExam(50);
for(let i=1;i<duplicate.questions.length;i++){
  duplicate.questions[i].noi_dung=duplicate.questions[0].noi_dung;
  duplicate.questions[i].A=duplicate.questions[0].A;
  duplicate.questions[i].B=duplicate.questions[0].B;
  duplicate.questions[i].C=duplicate.questions[0].C;
  duplicate.questions[i].D=duplicate.questions[0].D;
}
const dupReport=criticReport(duplicate);
const dupChecked=validateIndependentCritic106(dupReport,duplicate);
const dup=calibrateGeographyExam108(duplicate,dupChecked.validation);
assert(dup.decision!=="ACCEPT","high-similarity exam cannot ACCEPT");
assert(dup.reasons.includes("item_similarity_above_internal_threshold"),"similarity reason missing");

const candidates:any[]=[];
for(let i=0;i<6;i++){
  const e=makeExam(i+1), cr=validateIndependentCritic106(criticReport(e),e).validation;
  candidates.push({id:`good-${i+1}`,exam:e,critic:cr});
}
for(let i=0;i<3;i++){
  const e=makeExam(20+i), cr=validateIndependentCritic106(criticReport(e,2,"REVISE"),e).validation;
  candidates.push({id:`weak-${i+1}`,exam:e,critic:cr});
}
for(let i=0;i<3;i++){
  const e=makeExam(40+i);
  for(let j=1;j<e.questions.length;j++) e.questions[j].noi_dung=e.questions[0].noi_dung;
  const cr=validateIndependentCritic106(criticReport(e),e).validation;
  candidates.push({id:`similar-${i+1}`,exam:e,critic:cr});
}
const suite=calibrationSuite108(candidates);
assert(suite.candidate_count===12,"P6 calibration suite must exercise 12 candidates");
assert(suite.accepted===6,"six strong candidates should accept");
assert(suite.rejected+suite.reviewed===6,"six degraded candidates should not accept");

console.log("AI_GEOGRAPHY_P4_P6_RUNTIME_PASS",JSON.stringify({
  gold_score:gold.overall_score,
  weak_decision:weak.decision,
  duplicate_decision:dup.decision,
  suite:{accepted:suite.accepted,reviewed:suite.reviewed,rejected:suite.rejected,mean:suite.mean_score}
}));
