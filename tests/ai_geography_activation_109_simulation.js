const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('ai_exam.html','utf8');
const ui=fs.readFileSync('ai_exam_planned_activation_109.js','utf8');
const bridge=fs.readFileSync('supabase/functions/exam-ai-bridge/index.ts','utf8');
const planned=fs.readFileSync('supabase/functions/_shared/exam_planned_generation_105.ts','utf8');
const critic=fs.readFileSync('supabase/functions/_shared/exam_independent_critic_106.ts','utf8');
const calibration=fs.readFileSync('supabase/functions/_shared/exam_geography_calibration_108.ts','utf8');
const rollback=fs.readFileSync('ops/rollback/exam-ai-bridge-v4-20261105.ts','utf8');

function must(v,msg){assert.ok(v,msg);}

must(html.includes('ai_exam_planned_activation_109.js?v=20261105-p0-p6-activation-109'),'109 overlay cache marker missing');
must(html.indexOf('ai_exam_api_mode_065c.js') < html.indexOf('ai_exam_planned_activation_109.js'),'109 must load after Web AI 070');
must(html.indexOf('ai_exam_planned_activation_109.js') < html.indexOf('ai_action_feedback.js'),'109 must load before generic action feedback');

for(const action of [
  'get_planned_generation_input',
  'validate_planned_batch',
  'get_independent_critic_input',
  'validate_independent_critic_report',
  'submit_planned_exam_draft'
]) must(ui.includes(action),'109 action missing '+action);

must(ui.includes("questions.length !== 28"),'109 must require 28 planned slots client-side');
must(ui.includes("state.criticProvider === state.generatorProvider"),'109 must forbid same Web provider for critic');
must(ui.includes("independent_run:true"),'109 must bind critic independence metadata');
must(ui.includes("criticCheck.validation?.decision !== 'PASS'"),'109 must fail closed on critic REVISE/FAIL');
must(ui.includes("result.validation?.calibration?.overall_score"),'109 final UI must surface calibration score');
must(ui.includes("legacyValidateDraft"),'109 must preserve legacy validator fallback');
must(ui.includes("fetchLegacyPack"),'109 must preserve non-blueprint compatibility');
must(ui.includes("DAMSAN_INDEPENDENT_CRITIC_V1"),'109 critic report schema binding missing');
must(!/rpc_ai_exam_approve_and_publish|rpc_luu_de_thi_len_phong|PHÊ DUYỆT/.test(ui),'109 overlay must never publish');
must(!/service_role|SERVICE_ROLE|api[_-]?key\s*[:=]|secret_id/i.test(ui),'109 browser overlay must contain no privileged credential path');

must(bridge.includes('action === "activation_status"'),'109 bridge activation status missing');
for(const key of ['planned_generation_105','independent_critic_106','authoring_contract_107','calibration_108','planned_web_ui_109']){
  must(bridge.includes(key),'109 activation status missing '+key);
}
must(bridge.includes('publish_boundary: "TEACHER_EXPLICIT_APPROVAL"'),'109 explicit teacher publish boundary missing');

must(planned.includes('?? "enabled"'),'109 planned generation default activation missing');
must(critic.includes('?? "enabled"'),'109 independent critic default activation missing');
must(calibration.includes('?? "enabled"'),'109 calibration default activation missing');
must(planned.includes('DAMSAN_AI_PLANNED_GENERATION_105'),'109 planned env override missing');
must(critic.includes('DAMSAN_AI_INDEPENDENT_CRITIC_106'),'109 critic env override missing');
must(calibration.includes('DAMSAN_AI_CALIBRATION_108'),'109 calibration env override missing');

must(rollback.includes('async function getGenerationInput'),'rollback v4 legacy generator input missing');
must(rollback.includes('async function submitExamDraft'),'rollback v4 legacy submit missing');
must(!rollback.includes('get_planned_generation_input'),'rollback snapshot must predate P3 activation');
must(!rollback.includes('submit_planned_exam_draft'),'rollback snapshot must predate P3 activation');

console.log('AI_GEOGRAPHY_ACTIVATION_109_STATIC_PASS');
