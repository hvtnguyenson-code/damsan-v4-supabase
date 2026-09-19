const fs=require('fs');
const html=fs.readFileSync('ai_exam.html','utf8');
const api=fs.readFileSync('ai_exam_api_mode_065c.js','utf8');
const router=fs.readFileSync('supabase/functions/exam-ai-router/index.ts','utf8');
const orchestrator=fs.readFileSync('supabase/functions/exam-ai-orchestrator/index.ts','utf8');
const targetClassMigration=fs.readFileSync('supabase/migrations/20260919103000_ai_exam_target_class_066b.sql','utf8');
const providerHtml=fs.readFileSync('ai_provider.html','utf8');
const providerJs=fs.readFileSync('ai_provider.js','utf8');
function must(v,msg){if(!v)throw new Error(msg);}

// 067A removes the long nested router->orchestrator wait while preserving the deployed canonical generation worker.
must(/id="provider"/.test(html)&&/CHATGPT_WEB/.test(html)&&/id="resultBox"/.test(html),'067A-01 Web-AI fallback path must remain intact');
must(/TẠO ĐỀ BẰNG AI/.test(api),'067A-02 one-click primary action missing');
must(/cloneNode\(true\)/.test(api)&&/original\.replaceWith\(button\)/.test(api),'067A-03 one-click overlay must replace historical package-only click listener');
must(/await aieCreatePackage\(\)/.test(api),'067A-04 one click must still use canonical Knowledge Pack/prompt construction');
must(/action:\s*'route_plan'/.test(api),'067A-05 one click must request a short route plan');
must(/action:\s*'generate_exam'/.test(api),'067A-06 each attempt must call the deployed orchestrator directly');
must(!/generate_exam_stream/.test(api),'067A-07 normal UI must not depend on an undeployed stream action');
must(/\/functions\/v1\/exam-ai-router/.test(api)&&/\/functions\/v1\/exam-ai-orchestrator/.test(api),'067A-08 router and orchestrator endpoints missing');
must(/generateAutomatically/.test(api)&&/for \(const candidate of candidates\)/.test(api),'067A-09 browser-side bounded candidate loop missing');
must(/aieLoadRequests\(result\.request_id\)/.test(api),'067A-10 validated draft must return to existing teacher review UI');
must(/aieCapability\s*=\s*''/.test(api),'067A-11 browser handoff capability must be cleared after server validation');
must(/response\.status === 546 \? 'WORKER_RESOURCE_LIMIT'/.test(api),'067A-12 worker resource limit must be surfaced explicitly');
must(/shouldRepair/.test(api)&&/\^WORKER_/.test(api),'067A-13 infrastructure worker failure must skip repair retry');

// Provider/model/tuning selection remains invisible to the normal teacher workflow.
must(!/apiProviderSelect|apiModelSelect|apiReasoning|apiTemperature|apiTopP|apiMaxOutput/.test(api),'067A-14 normal authoring UI must not expose provider/model/tuning controls');
must(/Dùng AI Web thủ công/.test(api)&&/Tạo gói cho AI Web/.test(api),'067A-15 manual Web-AI fallback must remain available but secondary');
must(/cardByHeading\('2\. Prompt'\)/.test(api)&&/cardByHeading\('3\. Nhận đề'\)/.test(api),'067A-16 manual prompt/result cards must be hidden from primary workflow');
must(!/api_key\s*:/.test(api),'067A-17 exam UI must never accept provider API keys');
must(!/localStorage\.setItem|sessionStorage\.setItem/.test(api),'067A-18 API overlay must not persist credentials or prompt state');

// Router owns visibility/ranking but only returns opaque execution IDs to the browser.
must(/async function routeCandidates/.test(router),'067A-19 route discovery missing');
must(/owner_scope===\"PERSONAL\"/.test(router)&&/owner_scope===\"SCHOOL\"/.test(router)&&/owner_scope===\"SYSTEM\"/.test(router),'067A-20 route visibility scopes missing');
must(/last_test_status===\"OK\"/.test(router),'067A-21 verified connections should receive routing preference');
must(/MAX_ROUTE_CANDIDATES\s*=\s*6/.test(router),'067A-22 bounded route candidates missing');
must(/function publicCandidate/.test(router)&&/provider_id/.test(router)&&/model_profile_id/.test(router),'067A-23 route plan must expose only opaque execution IDs');
must(/action===\"route_plan\"/.test(router)&&/action===\"route_status\"/.test(router),'067A-24 route-plan actions missing');
must(!/_ai_provider_vault_read_065a|providerSecret/.test(router),'067A-25 router must not read provider secrets directly');

// Canonical orchestrator and validation bridge remain exactly the established execution boundary.
must(/action===\"generate_exam\"/.test(orchestrator),'067A-26 deployed generation action must remain available');
must(/submitToCanonicalBridge/.test(orchestrator)&&/\/functions\/v1\/exam-ai-bridge/.test(orchestrator),'067A-27 canonical validation bridge must remain authoritative');
must(/rpc_ai_exam_issue_handoff_service/.test(orchestrator),'067A-28 canonical handoff capability boundary must remain intact');

// 066B class targeting remains intact.
must(/id=\"targetClass\"/.test(api)&&/Tất cả các lớp/.test(api),'067A-29 target class selector missing');
must(/rpc_ai_exam_class_list/.test(api),'067A-30 class selector must be server-scoped');
must(/spec\.target_class\s*=/.test(api),'067A-31 selected class must enter immutable request exam_spec');
must(/create or replace function public\.rpc_ai_exam_class_list/i.test(targetClassMigration),'067A-32 class-list RPC missing');
must(/v_target_class:=coalesce\(nullif\(btrim\(v_request\.exam_spec->>'target_class'\)/i.test(targetClassMigration),'067A-33 publish must read target class from request spec');
must(/where hs\.truong_id=v_request\.truong_id and btrim\(hs\.lop\)=v_target_class/i.test(targetClassMigration),'067A-34 publish must validate class belongs to request school');
must(/v_result:=public\.rpc_luu_de_thi_len_phong/i.test(targetClassMigration),'067A-35 canonical room-save path must remain authoritative');
must(/update public\.phong_thi[\s\S]*set doi_tuong=v_target_class/i.test(targetClassMigration),'067A-36 class selection must become room eligibility metadata');

// Provider setup remains one-time and the key stays write-only.
must(/id="quickPreset"/.test(providerHtml)&&/id="btnQuickConnect"/.test(providerHtml),'067A-37 guided provider setup missing');
must(/API trung gian \/ OpenAI-compatible/.test(providerHtml),'067A-38 intermediary preset missing');
must(/id="advancedProviderSettings"/.test(providerHtml),'067A-39 advanced provider settings must remain available');
must(!/localStorage\.setItem\([^\n]*(apiKey|api_key)|sessionStorage\.setItem\([^\n]*(apiKey|api_key)/i.test(providerJs),'067A-40 provider key must never be written to browser storage');
must(/type="password"/.test(providerHtml),'067A-41 provider key UI must remain write-only');

console.log('PASS ai_exam_worker_runtime_067a_simulation');