const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const overlay = fs.readFileSync('ai_exam_discrimination_quality_062.js', 'utf8');
const html = fs.readFileSync('ai_exam.html', 'utf8');

const basePrompt = [
  'BASE',
  'KHUNG SÁNG TẠO CÓ KIỂM SOÁT — 060:',
  '- KEEP_060_CREATIVITY',
  '',
  'YÊU CẦU ĐẦU RA:',
  'END'
].join('\n');

const context = {
  window: {
    aieBuildPrompt: () => basePrompt,
    aieOpenRequest: () => {}
  },
  document: {
    getElementById: () => null,
    createElement: () => ({ classList:{ add(){}, remove(){} }, insertAdjacentElement(){}, innerHTML:'' }),
    addEventListener: () => {}
  },
  aieRequests: [],
  aieEscape: (value) => String(value),
  setTimeout: (fn) => fn(),
  console
};
vm.createContext(context);
vm.runInContext(overlay, context);

const spec = {
  grade: 12,
  assessment_type: 'TOT_NGHIEP',
  assessment_standard: { id:'DIA_LI_TNTHPT_2025_PLUS_V1', version:'058' }
};
const prompt = context.window.aieBuildPrompt({ request:{ request_id:'r062', exam_spec:spec } }, [], spec);

assert(prompt.includes('KHUNG SÁNG TẠO CÓ KIỂM SOÁT — 060'), '062 must preserve 060 creativity layer');
assert(prompt.includes('CHẤT LƯỢNG PHÂN HÓA — 062'), '062 discrimination block missing');
assert(prompt.includes('SOFT QUALITY ENVELOPE'), '062 must remain advisory/soft rather than becoming a new rigid format gate');
assert(prompt.includes('ít nhất hai distractor kiểu near-miss'), 'competitive near-miss distractor requirement missing');
assert(prompt.includes('từ tuyệt đối/cực đoan'), 'anti-clue language guidance missing');
assert(prompt.includes('tạm giấu đáp án'), 'blind-answer elimination self-test missing');
assert(prompt.includes('ít nhất hai mảnh bằng chứng/quan hệ'), 'Part I VD evidence-depth requirement missing');
assert(prompt.includes('Phần II: nhận định TH/VD sai nên là near-miss'), 'Part II near-miss quality rule missing');
assert(prompt.includes('không dùng cụm mâu thuẫn kiểu “tổng ... trung bình”'), 'Part III operation wording rule missing');
assert(prompt.includes('Chỉ khai báo quantitative.rounding_digits khi thực sự cần làm tròn'), 'rounding metadata/presentation alignment missing');
assert(prompt.includes('rationale nội bộ cho từng distractor TH/VD'), 'private distractor rationale check missing');
assert(prompt.includes('Giữ tự do sáng tạo của 060'), '062 must explicitly preserve the creative envelope');
assert(prompt.indexOf('CHẤT LƯỢNG PHÂN HÓA — 062') < prompt.indexOf('YÊU CẦU ĐẦU RA:'), '062 quality block must precede output contract');

const analyze = context.window.aieAnalyzeDiscrimination062;
assert.strictEqual(typeof analyze, 'function', '062 advisory analyzer missing');

const warnings = analyze([
  {
    phan:1, muc_do:'VD', dap_an_dung:'D',
    A:'chỉ thực hiện một biện pháp duy nhất',
    B:'hoàn toàn không cần phối hợp các điều kiện khác',
    C:'ưu tiên một hướng có vẻ liên quan nhưng thiếu điều kiện then chốt',
    D:'kết hợp các điều kiện phù hợp với yêu cầu của tình huống'
  },
  {
    phan:3, noi_dung:'Tính tổng diện tích rừng trung bình của ba năm.',
    quantitative:{ operation_code:'AVERAGE', inputs:[1,2,3] }
  }
]);
assert(warnings.some((w) => w.code === 'part1_distractor_extreme_clues' && w.question_no === 1), '062 must flag obvious extreme-word distractor shortcuts');
assert(warnings.some((w) => w.code === 'part3_operation_wording_mismatch' && w.question_no === 2), '062 must flag average/sum wording mismatch');

const clean = analyze([
  {
    phan:1, muc_do:'VD', dap_an_dung:'B',
    A:'phương án phù hợp một điều kiện nhưng thiếu điều kiện còn lại',
    B:'phương án phù hợp đồng thời các điều kiện của tình huống',
    C:'phương án phù hợp mục tiêu nhưng sai về phạm vi áp dụng',
    D:'phương án phù hợp phạm vi nhưng sai về quan hệ nguyên nhân'
  },
  {
    phan:3, noi_dung:'Tính diện tích rừng trung bình của ba năm.',
    quantitative:{ operation_code:'AVERAGE', inputs:[1,2,3] }
  }
]);
assert.strictEqual(clean.length, 0, '062 analyzer should not warn on a clean competitive-distractor/operation wording sample');

const otherSpec = { grade:12, assessment_type:'TOT_NGHIEP', assessment_standard:{ id:'OTHER_STANDARD' } };
const untouched = context.window.aieBuildPrompt({ request:{ request_id:'other', exam_spec:otherSpec } }, [], otherSpec);
assert.strictEqual(untouched, basePrompt, '062 must not alter non-target standards');

assert(html.includes('ai_exam_discrimination_quality_062.js?v=20260918-discrimination-quality-062'), '062 cache-busted overlay missing from ai_exam.html');
assert(html.indexOf('ai_exam_creative_envelope_060.js') < html.indexOf('ai_exam_discrimination_quality_062.js'), '062 must wrap the 060 prompt builder');
assert(html.indexOf('ai_exam_quality_review_053.js') < html.indexOf('ai_exam_discrimination_quality_062.js'), '062 review warnings must wrap the existing quality-review open handler');

console.log('PASS ai_geography_discrimination_quality_062_simulation');
