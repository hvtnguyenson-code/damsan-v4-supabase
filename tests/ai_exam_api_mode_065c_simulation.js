const fs=require('fs');
const html=fs.readFileSync('ai_exam.html','utf8');
const api=fs.readFileSync('ai_exam_api_mode_065c.js','utf8');
const router=fs.readFileSync('supabase/functions/exam-ai-router/index.ts','utf8');
const fragment=fs.readFileSync('supabase/functions/exam-ai-fragment/index.ts','utf8');
const orchestrator=fs.readFileSync('supabase/functions/exam-ai-orchestrator/index.ts','utf8');
const targetClassMigration=fs.readFileSync('supabase/migrations/20260919103000_ai_exam_target_class_066b.sql','utf8');
const providerHtml=fs.readFileSync('ai_provider.html','utf8');
const providerJs=fs.readFileSync('ai_provider.js','utf8');
function must(v,msg){if(!v)throw new Error(msg);}

// 068 keeps the established Knowledge Pack + canonical validator, but no single provider call owns the full 28-question output.
must(/id="provider"/.test(html)&&/CHATGPT_WEB/.test(html)&&/id="resultBox"/.test(html),'068-01 Web-AI fallback path must remain intact');
must(/TẠO ĐỀ BẰNG AI/.test(api),'068-02 one-click primary action missing');
must(/cloneNode\(true\)/.test(api)&&/original\.replaceWith\(button\)/.test(api),'068-03 one-click overlay must replace historical package-only click listener');
must(/await aieCreatePackage\(\)/.test(api),'068-04 one click must still use canonical Knowledge Pack/prompt construction');
must(/action:\s*'route_plan'/.test(api),'068-05 one click must request the server-ranked route plan');
must(/\/functions\/v1\/exam-ai-fragment/.test(api),'068-06 bounded fragment endpoint missing');
must(/PART_CHUNK_SIZE\s*=\s*\{\s*1:\s*6,\s*2:\s*2,\s*3:\s*3\s*\}/.test(api),'068-07 safe part chunk sizes changed unexpectedly');
must(/function chunkPlan/.test(api)&&/function fragmentPrompt/.test(api),'068-08 fragment planning/prompting missing');
must(/action:\s*'generate_fragment'/.test(api),'068-09 fragment action missing from browser flow');
must(/expected_part:\s*chunk\.part/.test(api)&&/expected_count:\s*chunk\.count/.test(api),'068-10 browser must bind each fragment to part/count contract');
must(/for \(const candidate of candidates\)/.test(api),'068-11 per-fragment route fallback missing');
must(/await window\.aieValidateDraft\(\)/.test(api),'068-12 assembled exam must return to existing canonical validator');
must(/schema_version:\s*'DAMSAN_EXAM_V1'/.test(api)&&/questions\s*\n\s*\}/.test(api),'068-13 deterministic full-exam assembly missing');
must(/response\.status === 546 \? 'WORKER_RESOURCE_LIMIT'/.test(api)&&/response\.status === 504 \? 'IDLE_TIMEOUT'/.test(api),'068-14 platform worker/idle failures must stay explicit');
must(!/action:\s*'generate_exam'/.test(api),'068-15 normal UI must no longer ask one worker to generate the entire exam');

// Fragment worker is hard-bounded below the hosted Edge 150-second idle boundary and returns questions only.
must(/FRAGMENT_TIMEOUT_MS\s*=\s*115_000/.test(fragment),'068-16 fragment provider timeout must stay below Edge idle timeout');
must(/MAX_FRAGMENT_QUESTIONS\s*=\s*8/.test(fragment),'068-17 fragment size hard cap missing');
must(/MAX_FRAGMENT_OUTPUT_TOKENS\s*=\s*7_000/.test(fragment),'068-18 fragment output cap missing');
must(/async function readBounded/.test(fragment)&&/MAX_PROVIDER_RESPONSE_BYTES\s*=\s*1_500_000/.test(fragment),'068-19 provider response must be bounded before parse');
must(/function parseFragment/.test(fragment)&&/fragment_question_count_mismatch/.test(fragment)&&/fragment_part_mismatch/.test(fragment),'068-20 fragment contract validation missing');
must(/status:\"PROVIDER_SUCCEEDED\"/.test(fragment),'068-21 successful fragment telemetry must terminate the run');
must(/provider_timeout_fragment/.test(fragment),'068-22 fragment timeout must be distinguishable in telemetry');
must(/action==="generate_fragment"/.test(fragment),'068-23 fragment function action missing');
must(!/submitToCanonicalBridge/.test(fragment),'068-24 fragment worker must not bypass whole-exam canonical validation');

// Provider/model selection remains invisible; route plan exposes opaque IDs only.
must(!/apiProviderSelect|apiModelSelect|apiReasoning|apiTemperature|apiTopP|apiMaxOutput/.test(api),'068-25 normal authoring UI must not expose provider/model/tuning controls');
must(/Dùng AI Web thủ công/.test(api)&&/Tạo gói cho AI Web/.test(api),'068-26 manual Web-AI fallback must remain available but secondary');
must(/cardByHeading\('2\. Prompt'\)/.test(api)&&/cardByHeading\('3\. Nhận đề'\)/.test(api),'068-27 manual prompt/result cards must be hidden from primary workflow');
must(!/api_key\s*:/.test(api),'068-28 exam UI must never accept provider API keys');
must(!/localStorage\.setItem|sessionStorage\.setItem/.test(api),'068-29 API overlay must not persist credentials or prompt state');
must(/async function routeCandidates/.test(router),'068-30 route discovery missing');
must(/function publicCandidate/.test(router)&&/provider_id/.test(router)&&/model_profile_id/.test(router),'068-31 route plan must expose only opaque execution IDs');
must(!/_ai_provider_vault_read_065a|providerSecret/.test(router),'068-32 router must not read provider secrets directly');

// Existing full orchestrator remains available as compatibility/fallback; canonical bridge remains the authority.
must(/action===\"generate_exam\"/.test(orchestrator),'068-33 legacy full generation action must remain available');
must(/submitToCanonicalBridge/.test(orchestrator)&&/\/functions\/v1\/exam-ai-bridge/.test(orchestrator),'068-34 canonical validation bridge must remain authoritative for legacy calls');

// 066B class targeting remains intact.
must(/id=\"targetClass\"/.test(api)&&/Tất cả các lớp/.test(api),'068-35 target class selector missing');
must(/rpc_ai_exam_class_list/.test(api),'068-36 class selector must be server-scoped');
must(/spec\.target_class\s*=/.test(api),'068-37 selected class must enter immutable request exam_spec');
must(/create or replace function public\.rpc_ai_exam_class_list/i.test(targetClassMigration),'068-38 class-list RPC missing');
must(/v_target_class:=coalesce\(nullif\(btrim\(v_request\.exam_spec->>'target_class'\)/i.test(targetClassMigration),'068-39 publish must read target class from request spec');
must(/where hs\.truong_id=v_request\.truong_id and btrim\(hs\.lop\)=v_target_class/i.test(targetClassMigration),'068-40 publish must validate class belongs to request school');
must(/v_result:=public\.rpc_luu_de_thi_len_phong/i.test(targetClassMigration),'068-41 canonical room-save path must remain authoritative');

// Provider setup remains one-time and the key stays write-only.
must(/id="quickPreset"/.test(providerHtml)&&/id="btnQuickConnect"/.test(providerHtml),'068-42 guided provider setup missing');
must(/API trung gian \/ OpenAI-compatible/.test(providerHtml),'068-43 intermediary preset missing');
must(!/localStorage\.setItem\([^\n]*(apiKey|api_key)|sessionStorage\.setItem\([^\n]*(apiKey|api_key)/i.test(providerJs),'068-44 provider key must never be written to browser storage');
must(/type="password"/.test(providerHtml),'068-45 provider key UI must remain write-only');

console.log('PASS ai_exam_chunked_generation_068_simulation');
