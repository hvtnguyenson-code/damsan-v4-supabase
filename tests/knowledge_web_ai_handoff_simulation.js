const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260910073815_knowledge_web_ai_handoff_031b1.sql'), 'utf8');
const html = fs.readFileSync(path.join(root, 'knowledge_ai.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'knowledge_ai_web.js'), 'utf8');

function assert(condition, message) { if (!condition) throw new Error(message); }
function must(source, regex, message) { assert(regex.test(source), message); }

console.log('=== KNOWLEDGE-031B1 WEB AI HANDOFF ===');

must(migration, /create or replace function public\.rpc_knowledge_analysis_job_read/i, 'K031B1-01 staff job lookup RPC exists');
must(migration, /_staff_session_gv_id\(p_staff_token\)/i, 'K031B1-02 custom staff session is validated');
must(migration, /owner_gv_id is distinct from v_gv_id/i, 'K031B1-03 teacher cannot resolve another owner document');
must(migration, /current_stage = 'ANALYZE'/i, 'K031B1-04 only ANALYZE stage is exposed');
must(migration, /status in \('QUEUED','RUNNING'\)/i, 'K031B1-05 queued/running analysis jobs are eligible');
must(migration, /pipeline_status not in \('EXTRACTED','ANALYZING'\)/i, 'K031B1-06 pipeline state is constrained');
must(migration, /grant execute on function public\.rpc_knowledge_analysis_job_read\(text,text,uuid\) to anon, authenticated/i, 'K031B1-07 only RPC execute is exposed');
console.log('K031B1-01..07 staff-safe job lookup: PASSED');

must(html, /AI phân tích Kho tri thức/i, 'K031B1-08 standalone workspace exists');
must(html, /DAMSAN_KNOWLEDGE_V1/i, 'K031B1-09 canonical output schema is visible');
must(html, /knowledge_ai_web\.js\?v=20260910-knowledge-web-ai-031b1/i, 'K031B1-10 cache-busted UI script is loaded');
must(html, /id="btnChatGPT"/i, 'K031B1-11 ChatGPT launch action exists');
must(html, /id="btnGemini"/i, 'K031B1-12 Gemini launch action exists');
must(html, /id="resultBox"/i, 'K031B1-13 AI JSON paste area exists');
console.log('K031B1-08..13 user workflow surface: PASSED');

must(js, /sessionStorage\.getItem\('damSan_StaffToken'\)/, 'K031B1-14 existing opaque staff session is reused');
must(js, /rpc_knowledge_library_read/, 'K031B1-15 document list uses protected library RPC');
must(js, /rpc_knowledge_analysis_job_read/, 'K031B1-16 analysis job is resolved through staff RPC');
must(js, /action: 'create_analysis_handoff'/, 'K031B1-17 handoff is created through semantic bridge');
must(js, /action: 'get_analysis_input'/, 'K031B1-18 source is streamed through capability');
must(js, /KAI_MAX_CHUNKS = 100/, 'K031B1-19 client source loop is bounded');
must(js, /KAI_MAX_PROMPT_CHARS = 7_500_000/, 'K031B1-20 prompt size is bounded');
must(js, /Không bổ sung kiến thức vốn có của mô hình/, 'K031B1-21 prompt is source-only grounded');
must(js, /action: 'submit_analysis'/, 'K031B1-22 validated AI result returns through bridge');
must(js, /navigator\.clipboard\.writeText/, 'K031B1-23 prompt copy workflow exists');
must(js, /navigator\.clipboard\.readText/, 'K031B1-24 result paste workflow exists');
must(js, /window\.open\('https:\/\/chatgpt\.com\//, 'K031B1-25 ChatGPT web opening is explicit');
must(js, /window\.open\('https:\/\/gemini\.google\.com\/app/, 'K031B1-26 Gemini web opening is explicit');
assert(!/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(js), 'K031B1-27 browser code contains no service-role credential');
assert(!/\.from\(['"]knowledge_(documents|units|ingestion_jobs)['"]\)/.test(js), 'K031B1-28 browser does not query protected knowledge tables directly');
console.log('K031B1-14..28 no-API handoff and credential isolation: PASSED');

console.log('PASS: KNOWLEDGE-031B1 web AI handoff structural simulation');
