const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync('ai_exam_validation_architecture_053.js', 'utf8');
const html = fs.readFileSync('ai_exam.html', 'utf8');

assert(js.includes('function recoverCurrentRequest053()'), '073 must recover the active AI_WORKING request when browser state lost currentRequestId');
assert(js.includes("CHƯA GỬI · JSON chưa hợp lệ:"), '073 must surface client-side JSON parse failure beside validation action');
assert(js.includes("CHƯA GỬI · Ô JSON đang trống."), '073 must surface empty JSON locally');
assert(js.includes('ĐANG KIỂM ĐỊNH ·'), '073 must show visible server-validation progress');
assert(js.includes('JSON đã được gửi tới máy chủ'), '073 must distinguish local click feedback from an actual server send');
assert(js.includes('đang cấp lại quyền gửi cho request hiện tại'), '073 must expose capability recovery state');
assert(html.includes('ai_exam_validation_architecture_053.js?v=20261008-validation-feedback-073'), '073 cache marker must force updated validation client');

console.log('AI exam validation feedback 073 simulation: PASS');
