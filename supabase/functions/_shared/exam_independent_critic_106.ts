export type CriticJson106 = Record<string, unknown>;

const DIMENSIONS = [
  "distractor_quality",
  "cognitive_depth",
  "competency_fit",
  "stimulus_use",
  "answer_leakage",
  "real_world_quality",
] as const;

export type CriticDimension106 = typeof DIMENSIONS[number];

export type CriticValidation106 = {
  valid: true;
  schema_version: "DAMSAN_INDEPENDENT_CRITIC_VALIDATION_V1";
  critic_version: "106";
  item_count: number;
  mean_score: number;
  dimension_means: Record<string, number>;
  fail_item_count: number;
  revision_item_count: number;
  similarity_max: number;
  decision: "PASS" | "REVISE";
};

function fail(code: string): never { throw new Error(code); }
function obj(value: unknown, code="critic_object_invalid"): CriticJson106 {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as CriticJson106;
}
function str(value: unknown, max=1000, required=false, code="critic_string_invalid") {
  const out = typeof value === "string" ? value.trim().slice(0,max) : "";
  if (required && !out) fail(code);
  return out;
}
function num(value: unknown, min: number, max: number, code="critic_score_invalid") {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail(code);
  return n;
}
function questions(examValue: unknown) {
  const exam = obj(examValue,"critic_exam_invalid");
  if (!Array.isArray(exam.questions) || !exam.questions.length) fail("critic_questions_missing");
  return exam.questions.map((q)=>obj(q,"critic_question_invalid"));
}
function slotId(q: CriticJson106) {
  return str(q.slot_id,60,true,"critic_slot_id_missing");
}
function visibleText(q: CriticJson106) {
  return [
    q.noi_dung,q.A,q.B,q.C,q.D
  ].map((v)=>typeof v==="string"?v:"").join(" ")
   .replace(/<[^>]+>/g," ")
   .toLowerCase()
   .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
   .replace(/[^a-z0-9\s]/g," ")
   .replace(/\s+/g," ").trim();
}
function tokens(q: CriticJson106) {
  const stop = new Set(["va","la","cua","co","cho","trong","mot","nhung","cac","duoc","theo","ve","voi","tu","den"]);
  return new Set(visibleText(q).split(" ").filter((x)=>x.length>2&&!stop.has(x)));
}
function jaccard(a:Set<string>,b:Set<string>) {
  let inter=0; for(const x of a) if(b.has(x)) inter++;
  const union=a.size+b.size-inter;
  return union ? inter/union : 0;
}
export function maxItemSimilarity106(examValue: unknown) {
  const qs=questions(examValue), sets=qs.map(tokens);
  let max=0;
  let pair:[string,string]=["",""];
  for(let i=0;i<sets.length;i++) for(let j=i+1;j<sets.length;j++) {
    const s=jaccard(sets[i],sets[j]);
    if(s>max){max=s;pair=[slotId(qs[i]),slotId(qs[j])];}
  }
  return { max_similarity:Number(max.toFixed(4)), pair };
}

export function isIndependentCriticEnabled106(value?: string|null) {
  const raw=(value ?? (typeof Deno!=="undefined" ? Deno.env.get("DAMSAN_AI_INDEPENDENT_CRITIC_106") : "") ?? "").trim().toLowerCase();
  return ["1","true","enabled","on"].includes(raw);
}
export function requireIndependentCriticEnabled106(value?: string|null) {
  if(!isIndependentCriticEnabled106(value)) fail("independent_critic_disabled");
}

export function criticInstructions106(examValue: unknown, planValue: unknown) {
  const qs=questions(examValue);
  const plan=obj(planValue,"critic_plan_invalid");
  const slim=qs.map((q)=>({
    slot_id:slotId(q),
    phan:q.phan,
    noi_dung:q.noi_dung,
    A:q.A,B:q.B,C:q.C,D:q.D,
    dap_an_dung:q.dap_an_dung,
    source_refs:q.source_refs,
    assessment_design:q.assessment_design,
    stimulus:q.stimulus ?? null,
  }));
  return {
    schema_version:"DAMSAN_INDEPENDENT_CRITIC_INPUT_V1",
    critic_version:"106",
    role:"INDEPENDENT_GEOGRAPHY_ASSESSMENT_REVIEWER",
    independence_rules:[
      "Do not trust generator self-declared reasoning_steps, evidence_count, rationale or quality labels as proof of cognitive depth.",
      "Judge the student-visible item against the server-owned assessment_design and the supplied plan.",
      "Do not rewrite the item. Diagnose it.",
      "Do not reward complexity of wording; reward geographic reasoning and evidence use.",
      "Return one review for every slot_id and no extras."
    ],
    rubric:{
      scale:"0..4 integer; 4=strong, 3=acceptable, 2=weak/revise, 1=serious defect, 0=invalid",
      dimensions:{
        distractor_quality:"P1/P2 alternatives are plausible geographic near-misses; no obvious positive/negative or length clue. For P3 score 4 unless answer-format choices leak the result.",
        cognitive_depth:"Student-visible task genuinely requires the planned NB/TH/VD reasoning, not metadata claims or arithmetic-step counting.",
        competency_fit:"The task actually elicits the planned Geography competency/operation.",
        stimulus_use:"Required stimulus is necessary, readable and used in reasoning; NONE/TEXT is appropriate when planned.",
        answer_leakage:"No answer is exposed by wording, option asymmetry, extreme terms, duplicated cues or trivial elimination.",
        real_world_quality:"Context is geographically authentic/natural; scenarios and data are meaningful rather than decorative."
      },
      hard_fail_conditions:[
        "Wrong or ambiguous correct answer.",
        "Question cannot be solved from permitted evidence.",
        "Planned competency/cognitive target is materially not assessed.",
        "Required stimulus is decorative, fabricated or unusable.",
        "Answer is directly leaked."
      ]
    },
    required_output:{
      schema_version:"DAMSAN_INDEPENDENT_CRITIC_V1",
      fields:["schema_version","critic_run_id","reviewer","items","exam_summary"],
      item_fields:["slot_id","scores","verdict","issues","rationale"],
      verdicts:["PASS","REVISE","FAIL"]
    },
    exam_plan:plan,
    exam:{questions:slim},
  };
}

export function validateIndependentCritic106(
  reportValue: unknown,
  examValue: unknown,
): { report: CriticJson106; validation: CriticValidation106 } {
  const report=obj(reportValue,"critic_report_invalid");
  if(report.schema_version!=="DAMSAN_INDEPENDENT_CRITIC_V1") fail("critic_schema_invalid");
  str(report.critic_run_id,120,true,"critic_run_id_missing");
  const reviewer=obj(report.reviewer,"critic_reviewer_missing");
  str(reviewer.provider,120,true,"critic_reviewer_provider_missing");
  str(reviewer.model,180,true,"critic_reviewer_model_missing");
  if (reviewer.independent_run !== true) fail("critic_reviewer_not_independent");

  const qs=questions(examValue);
  const expected=new Set(qs.map(slotId));
  if(!Array.isArray(report.items) || report.items.length!==expected.size) fail("critic_item_count_mismatch");

  const seen=new Set<string>();
  const dimensionTotals:Record<string,number>=Object.fromEntries(DIMENSIONS.map((d)=>[d,0]));
  let failCount=0, reviseCount=0, total=0;

  for(const raw of report.items){
    const item=obj(raw,"critic_item_invalid");
    const id=str(item.slot_id,60,true,"critic_slot_id_missing");
    if(!expected.has(id)) fail("critic_slot_unknown");
    if(seen.has(id)) fail("critic_slot_duplicate");
    seen.add(id);
    const scores=obj(item.scores,"critic_scores_missing");
    let itemSum=0;
    for(const d of DIMENSIONS){
      const s=num(scores[d],0,4,"critic_score_invalid");
      if(!Number.isInteger(s)) fail("critic_score_not_integer");
      dimensionTotals[d]+=s; itemSum+=s;
    }
    const verdict=str(item.verdict,20,true,"critic_verdict_missing").toUpperCase();
    if(!["PASS","REVISE","FAIL"].includes(verdict)) fail("critic_verdict_invalid");
    if(!Array.isArray(item.issues)) fail("critic_issues_invalid");
    str(item.rationale,3000,true,"critic_rationale_missing");
    const min=Math.min(...DIMENSIONS.map((d)=>Number(scores[d])));
    const mean=itemSum/DIMENSIONS.length;
    if(verdict==="PASS" && (min<2 || mean<3)) fail("critic_pass_score_inconsistent");
    if(verdict==="FAIL") failCount++;
    if(verdict==="REVISE") reviseCount++;
    total+=itemSum;
  }
  if(seen.size!==expected.size) fail("critic_slot_coverage_incomplete");

  const n=expected.size;
  const dimensionMeans:Record<string,number>={};
  for(const d of DIMENSIONS) dimensionMeans[d]=Number((dimensionTotals[d]/n).toFixed(3));
  const mean=Number((total/(n*DIMENSIONS.length)).toFixed(3));
  const sim=maxItemSimilarity106(examValue);
  const decision: "PASS"|"REVISE" =
    failCount===0 && reviseCount===0 && mean>=3 && Object.values(dimensionMeans).every((x)=>x>=2.75) && sim.max_similarity<0.72
      ? "PASS":"REVISE";

  const validation:CriticValidation106={
    valid:true,
    schema_version:"DAMSAN_INDEPENDENT_CRITIC_VALIDATION_V1",
    critic_version:"106",
    item_count:n,
    mean_score:mean,
    dimension_means:dimensionMeans,
    fail_item_count:failCount,
    revision_item_count:reviseCount,
    similarity_max:sim.max_similarity,
    decision
  };
  return {report:{...report,items:report.items},validation};
}

export function assertCriticPass106(reportValue: unknown, examValue: unknown) {
  const checked=validateIndependentCritic106(reportValue,examValue);
  if(checked.validation.decision!=="PASS") fail("independent_critic_not_passed");
  return checked;
}
