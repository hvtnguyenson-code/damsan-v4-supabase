const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('ai_exam.html','utf8');
const matrix=fs.readFileSync('ai_exam_geography_matrix_111.js','utf8');
const activation=fs.readFileSync('ai_exam_planned_activation_109.js','utf8');

assert(html.includes('ai_exam_geography_matrix_111.js?v=20261105-matrix-resume-116'),'116 matrix cache marker missing');
assert(html.includes('ai_exam_planned_activation_109.js?v=20261105-matrix-resume-116'),'116 activation cache marker missing');

for(const token of [
  'matrixStrictTeacher116',
  'strictTeacherMatrixEnabled',
  'matrix_structure_policy',
  'TNTHPT_18_4_6_TEACHER_LOCKED',
  'Giáo viên khóa ma trận'
]) assert(matrix.includes(token),'116 teacher matrix missing '+token);

assert(matrix.includes("if(strict()&&!strictTeacherMatrixEnabled()) return spec"),'STRICT default behavior must remain unchanged');
assert(matrix.includes("assessment_mode:'FLEX_GEOGRAPHY'"),'teacher matrix must compile through FLEX planner');
assert(matrix.includes("if(syncButton)syncButton.disabled=strict()"),'STRICT must not alter official 18-4-6 counts via sync button');
assert(!/rpc_ai_exam_approve_and_publish|rpc_luu_de_thi_len_phong|SERVICE_ROLE/.test(matrix),'matrix layer must not publish or expose privileged credentials');

for(const token of [
  'renewPlannedCapability116',
  'resumePlannedRequest116',
  'btnResumePlanned116',
  "rpc_ai_exam_reissue_handoff",
  "TIẾP TỤC SINH ĐỀ",
  "Bắt đầu lại từ batch 1"
]) assert(activation.includes(token),'116 planned resume missing '+token);

assert(activation.includes("['AWAITING_AI','AI_WORKING']"),'resume must be limited to unfinished AI requests');
assert(activation.includes("plan?.schema_version === 'DAMSAN_GEO_DESIGN_PLAN_V1'"),'resume must require planned design plan');
assert(activation.includes("state.localSpec = request.exam_spec || null"),'resume must restore immutable request spec');
assert(activation.includes("await fetchBatch(0)"),'resume must rebuild batch 1 prompt');
assert(!/rpc_ai_exam_approve_and_publish|rpc_luu_de_thi_len_phong/.test(activation),'resume layer must not publish');

console.log('AI_GEOGRAPHY_MATRIX_RESUME_116_PASS');
