const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const teacher = fs.readFileSync(path.join(root, 'giaovien.html'), 'utf8');
const knowledge = fs.readFileSync(path.join(root, 'knowledge.html'), 'utf8');
const examHtml = fs.readFileSync(path.join(root, 'ai_exam.html'), 'utf8');
const resilience = fs.readFileSync(path.join(root, 'ai_exam_resilience.js'), 'utf8');

function assert(condition, message) { if (!condition) throw new Error(message); }
function must(source, regex, message) { assert(regex.test(source), message); }

console.log('=== AI-AUTHORING-031C NAVIGATION & RESILIENCE ===');

must(teacher, /id="btnSubKnowledgeAI"[^>]*knowledge\.html/, 'A031C-01 teacher sidebar exposes Knowledge Library');
must(teacher, /id="btnSubKnowledgeAnalyze"[^>]*knowledge_ai\.html/, 'A031C-02 teacher sidebar exposes semantic AI analysis');
must(teacher, /id="btnSubAiExam"[^>]*ai_exam\.html/, 'A031C-03 teacher sidebar exposes AI exam authoring');
assert((teacher.match(/id="btnSubAiExam"/g) || []).length === 1, 'A031C-04 AI exam sidebar entry is unique');
console.log('A031C-01..04 teacher navigation: PASSED');

must(knowledge, /href="knowledge_ai\.html"/, 'A031C-05 Knowledge Library links to AI analysis');
must(knowledge, /href="ai_exam\.html"/, 'A031C-06 Knowledge Library links to AI exam authoring');
must(knowledge, /href="giaovien\.html"/, 'A031C-07 Knowledge Library preserves teacher return path');
must(knowledge, /chỉ được chuyển sang `EXTRACTED` khi đã có văn bản đủ dùng[\s\S]*AI phân tích nguồn/i, 'A031C-08 pipeline copy preserves usable-source gate before AI analysis');
console.log('A031C-05..08 knowledge workflow navigation: PASSED');

must(examHtml, /ai_exam_resilience\.js\?v=20260910-ai-exam-resilience-031c/, 'A031C-09 resilience script is cache-busted and loaded');
must(examHtml, /request AI đang dở[\s\S]*từ chối để dọn trạng thái/i, 'A031C-10 reload recovery guidance is visible');
must(resilience, /const aieOpenRequest031B2 = aieOpenRequest/, 'A031C-11 existing review behavior is wrapped, not replaced blindly');
must(resilience, /\['AWAITING_AI', 'AI_WORKING', 'FAILED'\]/, 'A031C-12 stale non-published states are recoverable');
must(resilience, /approve\.style\.display = 'none'/, 'A031C-13 stale request cannot expose publish action');
must(resilience, /reject\.disabled = false/, 'A031C-14 stale request exposes reject cleanup');
must(resilience, /Thao tác từ chối không ghi hoặc thay đề trong phòng thi/, 'A031C-15 cleanup semantics are explicit');
assert(!/rpc_ai_exam_approve_and_publish|rpc_luu_de_thi_len_phong/.test(resilience), 'A031C-16 resilience layer has no publication call');
console.log('A031C-09..16 stale-request resilience: PASSED');

console.log('PASS: AI-AUTHORING-031C navigation and resilience structural simulation');
