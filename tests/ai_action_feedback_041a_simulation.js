const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const feedback = fs.readFileSync('ai_action_feedback.js', 'utf8');
const knowledge = fs.readFileSync('knowledge.html', 'utf8');
const knowledgeAi = fs.readFileSync('knowledge_ai.html', 'utf8');
const exam = fs.readFileSync('ai_exam.html', 'utf8');

new vm.Script(feedback, { filename: 'ai_action_feedback.js' });

// 041A must provide immediate tactile acknowledgement for every button on AI/knowledge pages.
assert(feedback.includes("document.addEventListener('click', handleClickCapture, true)"), '041A delegated capture feedback missing');
assert(feedback.includes("closest('button, [role=\"button\"]')"), '041A must cover every button/role-button');
assert(feedback.includes('is-pressed'), '041A pressed-state visual missing');
assert(feedback.includes('button:not(:disabled):active'), '041A immediate :active state missing');
assert(feedback.includes('is-busy'), '041A busy state missing');
assert(feedback.includes('is-success'), '041A success state missing');
assert(feedback.includes('is-error'), '041A error state missing');
assert(feedback.includes("aria-busy"), '041A accessibility busy state missing');
assert(feedback.includes("aria-live"), '041A live status accessibility missing');
assert(feedback.includes('prefers-reduced-motion'), '041A reduced-motion fallback missing');

// Every normalized-source action has direct in-button feedback, not only a message below the card.
for (const id of [
  'btnNormalizedPrompt',
  'btnNormalizedCopy',
  'btnNormalizedChatGPT',
  'btnNormalizedGemini',
  'btnNormalizedRefresh',
  'btnNormalizedImport'
]) {
  assert(feedback.includes(id), `041A normalized action feedback missing for ${id}`);
}
assert(feedback.includes('Đang sao chép…') && feedback.includes('✓ Đã sao chép'), '041A copy button must show immediate busy and success states');
assert(feedback.includes('Đang tạo prompt…') && feedback.includes('✓ Prompt sẵn sàng'), '041A prompt button feedback missing');
assert(feedback.includes('Đang kiểm định…') && feedback.includes('✓ Đã nhập JSONL'), '041A JSONL import feedback missing');
assert(feedback.includes('Đang làm mới…') && feedback.includes('✓ Đã làm mới'), '041A refresh feedback missing');

// Overlay must never steal or reroute the original business click.
assert(!feedback.includes('preventDefault('), '041A visual feedback must not prevent default action');
assert(!feedback.includes('stopPropagation('), '041A visual feedback must not stop propagation');
assert(!feedback.includes('stopImmediatePropagation('), '041A visual feedback must not stop original listeners');
assert(!/rpc_luu_de_thi_len_phong|rpc_dieu_khien_phong_thi|\bphong_thi\b/i.test(feedback), '041A must remain outside room-exam business logic');

// Shared feedback is enabled on all AI authoring surfaces, not the canonical room UI.
const scriptTag = 'ai_action_feedback.js?v=20260912-ai-action-feedback-041a';
assert(knowledge.includes(scriptTag), '041A feedback missing from knowledge.html');
assert(knowledgeAi.includes(scriptTag), '041A feedback missing from knowledge_ai.html');
assert(exam.includes(scriptTag), '041A feedback missing from ai_exam.html');
assert(knowledge.includes('knowledge_normalized_source.js?v=20260912-subject-binding-040a'), '040A normalized-source cache bust must be current');

console.log('PASS: AI-UX-041A immediate action feedback and room-boundary isolation');
