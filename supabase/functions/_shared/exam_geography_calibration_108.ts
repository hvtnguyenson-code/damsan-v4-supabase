import { maxItemSimilarity106, type CriticValidation106 } from "./exam_independent_critic_106.ts";

export type CalibrationJson108 = Record<string, unknown>;

export function isCalibrationEnabled108(value?: string|null) {
  const raw=(value ?? (typeof Deno!=="undefined" ? Deno.env.get("DAMSAN_AI_CALIBRATION_108") : "") ?? "").trim().toLowerCase();
  return ["1","true","enabled","on"].includes(raw);
}
export function requireCalibrationEnabled108(value?: string|null) {
  if(!isCalibrationEnabled108(value)) throw new Error("calibration_disabled");
}

export type CalibrationResult108 = {
  schema_version: "DAMSAN_GEOGRAPHY_CALIBRATION_RESULT_V1";
  calibration_version: "108";
  benchmark_profile: string;
  scores: Record<string, number>;
  overall_score: number;
  decision: "ACCEPT" | "REVIEW" | "REJECT";
  reasons: string[];
  metrics: Record<string, unknown>;
};

function fail(code:string):never{throw new Error(code);}
function obj(v:unknown,code="calibration_object_invalid"):CalibrationJson108{
  if(!v||typeof v!=="object"||Array.isArray(v))fail(code);return v as CalibrationJson108;
}
function s(v:unknown){return typeof v==="string"?v.trim():"";}
function clamp(n:number){return Math.max(0,Math.min(100,Number(n.toFixed(2))));}
function qs(examValue:unknown){
  const exam=obj(examValue,"calibration_exam_invalid");
  if(!Array.isArray(exam.questions))fail("calibration_questions_missing");
  return exam.questions.map((q)=>obj(q,"calibration_question_invalid"));
}
function part(q:CalibrationJson108){return String(q.phan??q.Phan??"");}
function stimulus(q:CalibrationJson108){
  const design=q.assessment_design&&typeof q.assessment_design==="object"&&!Array.isArray(q.assessment_design)
    ? q.assessment_design as CalibrationJson108:{};
  const explicit=s(design.stimulus_type).toUpperCase();
  if(explicit)return explicit;
  const stim=q.stimulus&&typeof q.stimulus==="object"&&!Array.isArray(q.stimulus)?q.stimulus as CalibrationJson108:{};
  return s(stim.type).toUpperCase()||"NONE";
}
function operationFamily(q:CalibrationJson108){
  const design=q.assessment_design&&typeof q.assessment_design==="object"&&!Array.isArray(q.assessment_design)
    ? q.assessment_design as CalibrationJson108:{};
  return s(design.quantitative_family||design.operation_code).toUpperCase();
}
function visibleChars(q:CalibrationJson108){
  return [q.noi_dung,q.A,q.B,q.C,q.D].map((x)=>typeof x==="string"?x.replace(/<[^>]+>/g," "):"").join(" ").replace(/\s+/g," ").trim().length;
}

export function officialGeographyBenchmarkProfile108(){
  return {
    schema_version:"DAMSAN_GEOGRAPHY_BENCHMARK_PROFILE_V1",
    profile_id:"MOET_GEOGRAPHY_2025_2026_FINGERPRINT_V1",
    calibration_version:"108",
    provenance:[
      "BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY",
      "BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY"
    ],
    reuse_policy:"STYLE_ONLY_NO_COPY",
    structure:{p1:18,p2:4,p3:6,minutes:50,max_print_pages:4},
    observed_patterns:{
      p1:{
        short_stems:true,
        mixed_cognitive:true,
        required_tool_presence:["CHART","TABLE"],
        distractor_family:["HOMOGENEOUS_NEAR_DOMAIN","RELATED_BUT_WRONG_CONDITION"]
      },
      p2:{
        shared_stimulus:true,
        observed_stimulus:["TEXT","CHART"],
        reasoning:["DIRECT","CAUSAL","INFERENCE","APPLICATION","DERIVE_COMPARE_EXPLAIN"]
      },
      p3:{
        observed_stimulus:["TEXT","TABLE"],
        minimum_operation_family_diversity:4,
        operation_families:[
          "AVERAGE","RANGE_DIFFERENCE","RATE_DIFFERENCE","SHARE_PERCENT","PER_CAPITA","SHARE_CHANGE",
          "RATIO_GROWTH","GROWTH_RATE","COMPONENT_FROM_RATE","BALANCE","LAPSE_RATE"
        ],
        authentic_quantitative_evidence:true
      }
    },
    internal_release_thresholds:{
      overall_accept:85,
      overall_review:75,
      critic_mean_min:3,
      critic_dimension_min:2.75,
      max_similarity:0.72
    }
  };
}

function structureScore(questions:CalibrationJson108[]){
  const counts={p1:questions.filter(q=>part(q)==="1").length,p2:questions.filter(q=>part(q)==="2").length,p3:questions.filter(q=>part(q)==="3").length};
  const delta=Math.abs(counts.p1-18)+Math.abs(counts.p2-4)+Math.abs(counts.p3-6);
  return {score:clamp(100-delta*18),counts};
}
function stimulusScore(questions:CalibrationJson108[]){
  const byPart=(p:string)=>questions.filter(q=>part(q)===p).map(stimulus);
  const p1=byPart("1"),p2=byPart("2"),p3=byPart("3");
  let points=0,total=7;
  if(p1.includes("CHART"))points++;
  if(p1.includes("TABLE"))points++;
  if(new Set(p1).size>=3)points++;
  if(p2.some(x=>x==="TEXT"))points++;
  if(p2.some(x=>x==="CHART"||x==="TABLE"||x==="MAP"))points++;
  if(p3.some(x=>x==="TABLE"))points++;
  if(new Set(p3).size>=2)points++;
  return {score:clamp(points/total*100),stimulus_counts:Object.fromEntries([...new Set(questions.map(stimulus))].map(t=>[t,questions.filter(q=>stimulus(q)===t).length]))};
}
function p3DiversityScore(questions:CalibrationJson108[]){
  const p3=questions.filter(q=>part(q)==="3");
  const fam=p3.map(operationFamily).filter(Boolean);
  const distinct=new Set(fam);
  const freq:Record<string,number>={}; for(const x of fam)freq[x]=(freq[x]||0)+1;
  const maxRepeat=Math.max(0,...Object.values(freq));
  let score=100;
  if(distinct.size<4)score-=20*(4-distinct.size);
  if(maxRepeat>2)score-=15*(maxRepeat-2);
  if(fam.length!==6)score-=20*Math.abs(6-fam.length);
  return {score:clamp(score),distinct_families:distinct.size,max_repeat:maxRepeat,families:freq};
}
function presentationScore(questions:CalibrationJson108[]){
  const totalChars=questions.reduce((n,q)=>n+visibleChars(q),0);
  const p1Long=questions.filter(q=>part(q)==="1"&&visibleChars(q)>900).length;
  let score=100;
  if(totalChars>24000)score-=Math.min(45,(totalChars-24000)/300);
  if(p1Long>3)score-=Math.min(25,(p1Long-3)*5);
  return {score:clamp(score),visible_chars:totalChars,p1_overlong_count:p1Long};
}
function criticScore(critic:CriticValidation106){
  const mean=clamp(critic.mean_score/4*100);
  const dimMin=Math.min(...Object.values(critic.dimension_means));
  const dimensionFloor=clamp(dimMin/4*100);
  const penalty=critic.fail_item_count*15+critic.revision_item_count*4;
  return {score:clamp(mean*0.7+dimensionFloor*0.3-penalty),mean:critic.mean_score,dimension_min:dimMin,decision:critic.decision};
}
function similarityScore(examValue:unknown){
  const sim=maxItemSimilarity106(examValue).max_similarity;
  const score=sim<=0.55?100:sim>=0.85?0:clamp((0.85-sim)/0.30*100);
  return {score,maximum:sim};
}

export function calibrateGeographyExam108(
  examValue:unknown,
  criticValidation:CriticValidation106,
):CalibrationResult108{
  const questions=qs(examValue);
  const structure=structureScore(questions);
  const stimulus=stimulusScore(questions);
  const p3=p3DiversityScore(questions);
  const presentation=presentationScore(questions);
  const critic=criticScore(criticValidation);
  const similarity=similarityScore(examValue);

  const scores={
    structure:structure.score,
    benchmark_stimulus:stimulus.score,
    p3_geography_skill_diversity:p3.score,
    presentation_budget_proxy:presentation.score,
    independent_critic:critic.score,
    item_similarity:similarity.score,
  };
  const weights={structure:0.20,benchmark_stimulus:0.15,p3_geography_skill_diversity:0.15,presentation_budget_proxy:0.10,independent_critic:0.30,item_similarity:0.10};
  const overall=clamp(Object.entries(scores).reduce((sum,[k,v])=>sum+v*(weights as Record<string,number>)[k],0));

  const reasons:string[]=[];
  if(structure.score<100)reasons.push("official_structure_mismatch");
  if(stimulus.score<70)reasons.push("benchmark_stimulus_mix_weak");
  if(p3.distinct_families<4)reasons.push("p3_geography_skill_diversity_weak");
  if(presentation.score<75)reasons.push("presentation_budget_proxy_exceeded");
  if(criticValidation.decision!=="PASS")reasons.push("independent_critic_not_passed");
  if(criticValidation.mean_score<3)reasons.push("critic_mean_below_internal_threshold");
  if(Math.min(...Object.values(criticValidation.dimension_means))<2.75)reasons.push("critic_dimension_below_internal_threshold");
  if(similarity.maximum>=0.72)reasons.push("item_similarity_above_internal_threshold");

  const critical=[structure.score,critic.score,similarity.score];
  const decision:"ACCEPT"|"REVIEW"|"REJECT" =
    overall>=85 && critical.every(x=>x>=75) && reasons.length===0 ? "ACCEPT"
    : overall>=75 && !reasons.includes("official_structure_mismatch") ? "REVIEW":"REJECT";

  return {
    schema_version:"DAMSAN_GEOGRAPHY_CALIBRATION_RESULT_V1",
    calibration_version:"108",
    benchmark_profile:"MOET_GEOGRAPHY_2025_2026_FINGERPRINT_V1",
    scores,
    overall_score:overall,
    decision,
    reasons,
    metrics:{
      structure:structure.counts,
      stimulus:stimulus.stimulus_counts,
      p3,
      presentation,
      critic,
      similarity
    }
  };
}

export function calibrationSuite108(
  candidates:Array<{id:string;exam:unknown;critic:CriticValidation106}>
){
  if(!Array.isArray(candidates)||candidates.length<1)fail("calibration_candidates_missing");
  const results=candidates.map(c=>({id:c.id,result:calibrateGeographyExam108(c.exam,c.critic)}));
  const accepted=results.filter(x=>x.result.decision==="ACCEPT").length;
  const reviewed=results.filter(x=>x.result.decision==="REVIEW").length;
  const rejected=results.length-accepted-reviewed;
  return {
    schema_version:"DAMSAN_GEOGRAPHY_CALIBRATION_SUITE_V1",
    calibration_version:"108",
    candidate_count:results.length,
    accepted,reviewed,rejected,
    acceptance_rate:Number((accepted/results.length).toFixed(3)),
    mean_score:Number((results.reduce((n,x)=>n+x.result.overall_score,0)/results.length).toFixed(2)),
    results
  };
}
