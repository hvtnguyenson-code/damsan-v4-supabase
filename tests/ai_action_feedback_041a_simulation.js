const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const feedback = fs.readFileSync('ai_action_feedback.js', 'utf8');
const knowledge = fs.readFileSync('knowledge.html', 'utf8');
const knowledgeAi = fs.readFileSync('knowledge_ai.html', 'utf8');
const exam = fs.readFileSync('ai_exam.html', 'utf8');

new vm.Script(feedback, { filename: 'ai_action_feedback.js' });

// 041B must provide an unmistakable tactile acknowledgement for every button on AI/knowledge pages.
assert(feedback.includes("document.addEventListener('click', handleClickCapture, true)"), '041B delegated capture feedback missing');
assert(feedback.includes("closest('button, [role=\"button\"]')"), '041B must cover every button/role-button');
assert(feedback.includes('is-pressed'), '041B pressed-state visual missing');
assert(feedback.includes('scale(.945)'), '041B pressed-state must be visually strong enough to notice');
assert(feedback.includes("content: '✓'"), '041B immediate click acknowledgement icon missing');
assert(feedback.includes('button:not(:disabled):active'), '041B immediate :active state missing');
assert(feedback.includes('is-busy'), '041B busy state missing');
assert(feedback.includes('is-success'), '041B success state missing');
assert(feedback.includes('is-warning'), '041B warning state missing');
assert(feedback.includes('is-error'), '041B error state missing');
assert(feedback.includes("aria-busy"), '041B accessibility busy state missing');
assert(feedback.includes("aria-live"), '041B live status accessibility missing');
assert(feedback.includes('prefers-reduced-motion'), '041B reduced-motion fallback missing');
assert(feedback.includes('RESET_MS = 2200'), '041B success/error acknowledgement must remain visible long enough to notice');

// Every normalized-source action has direct in-button feedback, not only a message below the card.
for (const id of [
  'btnNormalizedPrompt',
  'btnNormalizedCopy',
  'btnNormalizedChatGPT',
  'btnNormalizedGemini',
  'btnNormalizedRefresh',
  'btnNormalizedImport'
]) {
  assert(feedback.includes(id), `041B normalized action feedback missing for ${id}`);
}
assert(feedback.includes('Đang sao chép…') && feedback.includes('✓ Đã sao chép'), '041B copy button must show immediate busy and success states');
assert(feedback.includes('Đang tạo prompt…') && feedback.includes('✓ Prompt sẵn sàng'), '041B normalized prompt button feedback missing');
assert(feedback.includes('Đang kiểm định…') && feedback.includes('✓ Đã nhập JSONL'), '041B JSONL import feedback missing');
assert(feedback.includes('Đang làm mới…') && feedback.includes('✓ Đã làm mới'), '041B refresh feedback missing');

// 042A: every visible long-book action gets in-button busy/result feedback.
for (const id of [
  'btnChunkedStructure',
  'btnChunkedStructureCopy',
  'btnChunkedChatGPT',
  'btnChunkedRefresh',
  'btnChunkedPlanImport',
  'btnChunkedPrompt',
  'btnChunkedCopy',
  'btnChunkedImport',
  'btnChunkedAssemble'
]) {
  assert(feedback.includes(id), `042A chunked action feedback missing for ${id}`);
}
assert(feedback.includes('Đang tạo Scanner…') && feedback.includes('✓ Prompt Scanner sẵn sàng'), '042A Scanner button feedback missing');
assert(feedback.includes('Đang kiểm định kế hoạch…') && feedback.includes('✓ Kế hoạch hợp lệ'), '042A plan-import button feedback missing');
assert(feedback.includes('Đang tạo prompt chunk…') && feedback.includes('✓ Prompt chunk sẵn sàng'), '042A chunk-prompt button feedback missing');
assert(feedback.includes('Đang kiểm định chunk…') && feedback.includes('✓ Đã nhập chunk'), '042A chunk-import button feedback missing');
assert(feedback.includes('Đang ghép nguồn…') && feedback.includes('✓ Đã ghép nguồn'), '042A assembler button feedback missing');
assert(feedback.includes("bindStatusElement('chunkedStatus'"), '042A chunk status observer missing');
assert(feedback.includes("el.classList.contains('warn')"), '042A warning result feedback missing');

// Overlay must never steal or reroute the original business click.
assert(!feedback.includes('preventDefault('), '041B visual feedback must not prevent default action');
assert(!feedback.includes('stopPropagation('), '041B visual feedback must not stop propagation');
assert(!feedback.includes('stopImmediatePropagation('), '041B visual feedback must not stop original listeners');
assert(!/rpc_luu_de_thi_len_phong|rpc_dieu_khien_phong_thi|\bphong_thi\b/i.test(feedback), '041B must remain outside room-exam business logic');

// Shared feedback is enabled on all AI authoring surfaces, not the canonical room UI.
const scriptTag = 'ai_action_feedback.js?v=20260912-ai-action-feedback-041a';
assert(knowledge.includes(scriptTag), '041B feedback loader missing from knowledge.html');
assert(knowledgeAi.includes(scriptTag), '041B feedback loader missing from knowledge_ai.html');
assert(exam.includes(scriptTag), '041B feedback loader missing from ai_exam.html');
assert(knowledge.includes('knowledge_chunked_normalization.js?v=20260912-chunked-normalization-042'), '042 chunked UI loader missing');

console.log('PASS: AI-UX-041B + 042A explicit action feedback and room-boundary isolation');
