const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ai_exam.html'), 'utf8');
const feedback = fs.readFileSync(path.join(root, 'ai_exam_copy_feedback.js'), 'utf8');

function assert(condition, message) { if (!condition) throw new Error(message); }
function must(source, regex, message) { assert(regex.test(source), message); }

console.log('=== AI-EXAM-035 COPY FEEDBACK ===');

must(html, /ai_exam\.js[^<]*<\/script>[\s\S]*ai_exam_copy_feedback\.js\?v=20260910-ai-exam-copy-feedback-035/i,
  'A035-01 copy feedback script loads after base exam UI');
must(feedback, /btnCopyPrompt/i,
  'A035-02 copy feedback targets the prompt button');
must(feedback, /navigator\.clipboard\.writeText\(text\)/i,
  'A035-03 successful copy still uses Clipboard API');
must(feedback, /✓ Đã sao chép/i,
  'A035-04 success is visible on the button');
must(feedback, /✓ Đã chọn prompt/i,
  'A035-05 clipboard fallback is visible on the button');
must(feedback, /stopImmediatePropagation\(\)/i,
  'A035-06 hardening owns the click without duplicate base-handler feedback');
must(feedback, /\},\s*1800\s*\)/i,
  'A035-07 feedback resets after 1800 ms');
must(feedback, /addEventListener\('click',[\s\S]*,\s*true\s*\)/i,
  'A035-08 capture listener runs before the legacy target listener');

console.log('PASS: AI-EXAM-035 prompt copy feedback');
